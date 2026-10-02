// ============================================================
// PRE-GERACAO DIARIA — Edge Function
// ------------------------------------------------------------
// Prepara as DUAS aulas oficiais do dia antes de a aluna pedir.
//
// POR QUE EXISTE
//
// Sem isto, a aluna abre a aula e espera a IA gerar na hora: 8 a 60
// segundos olhando "carregando", as vezes com timeout. Com isto, o
// cron roda a cada 15 min, e a aula ja esta no cache quando ela abre.
//
// QUEM CHAMA
//
// O job `pregenerate-daily` do pg_cron, via pg_net, com o segredo
// `CRON_SECRET` no cabecalho Authorization. Ninguem mais: o endpoint
// nao aceita chamada de navegador e nao responde sem o segredo.
//
// PARA ONDE GRAVA
//
// Descobri na auditoria desta adaptacao que o caminho normal do app
// NAO usa a tabela `generated_lessons`: ele usa
// `app_state.sections.aiCache`, a linha compartilhada que os aparelhos
// ja trocam entre si. O job entao escreve no MESMO lugar que o app le.
//
// Isso e o que torna a pre-geracao possivel sem conta permanente: nao
// existe `user_id`, nao existe `owner_id`, nao existe vinculo. O job
// escreve na linha unica e o aparelho da Anna le a aula pronta.
//
// A chave do cache e a mesma de src/services/ai.js (lessonCacheKey),
// byte a byte: se divergir em um campo, o app procura uma chave que
// nao existe e mostra "aula nao disponivel" com o cache cheio.
//
// O QUE ESTE ARQUIVO NAO FAZ
//
// - nao mexe em XP, streak, progresso, tentativas ou quizzes;
// - nao gera quiz (o quiz tem cota e fluxo proprios);
// - nao usa GROQ_CUSTOM_LESSON_API_KEY: o curriculo oficial usa a
//   cadeia NVIDIA (principal + reserva) e a Groq de conteudo;
// - nao cria conta e nao vincula `app_state`.
// ============================================================

import { corsHeaders } from "../_shared/http.js";
import { validateLesson } from "../_shared/schemas.js";
import { buildLessonPrompt } from "../_shared/prompts.js";
import { AI_PRIMARY_MODEL, AI_FALLBACK_MODEL } from "../_shared/ai_config.js";
import { requestJson } from "../_shared/nvidia.js";
import { gerarConteudoEstruturado } from "../_shared/groqContent.js";

import { aulasDoDia, CURRICULUM_VERSION, dateKeyInZone, TIMEZONE_CRONOGRAMA } from "./_shared/planoDias.js";
import { executarJob, chaveCache, VERSAO_CONTEUDO } from "./_shared/dailyJob.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NVIDIA_KEY = Deno.env.get("NVIDIA_API_KEY") ?? "";
const GROQ_CONTENT_KEY = Deno.env.get("GROQ_CONTENT_API_KEY") ?? "";

// Modelo e schema: os MESMOS numeros que o generate-lesson usa para a
// aula oficial. Se o job gerar com outro schema, a aula passa pelo
// validateLesson do job e falha ao abrir no app (ou, pior, passa aqui
// e e revalidada la) -- entao eles andam juntos.
const GROQ_CONTENT_LESSON_MODEL = "openai/gpt-oss-120b";

// Schema OpenAI da aula, espelhando LESSON_SCHEMA_OPENAI do
// generate-lesson. Mantido local de proposito: importar de la
// puxaria o index.ts inteiro da outra funcao para dentro desta.
const LESSON_SCHEMA_OPENAI = {
  type: "object",
  additionalProperties: false,
  required: ["title", "introduction", "objectives", "sections", "exercises", "quiz", "summary"],
  properties: {
    title: { type: "string" },
    introduction: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "explanation", "examples"],
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          examples: { type: "array", items: { type: "string" } },
        },
      },
    },
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer", "explanation"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          explanation: { type: "string" },
        },
      },
    },
    quiz: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "correctIndex", "explanation"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
          explanation: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
};

// ---------------------------------------------------------------
// Log SEMPRE com prefixo: um job que roda sozinho precisa ser
// reconhecivel no meio do log da plataforma. Nenhum campo aqui pode
// carregar chave, token ou o corpo da requisicao.
// ---------------------------------------------------------------
const log = (evento, campos = {}) => {
  console.log(JSON.stringify({ fn: "pregenerate-daily", evento, ...campos }));
};

function responder(req, status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------
// O SEGREDO VEM DO VAULT, e nao do ambiente
//
// O CRON_SECRET tem UM lugar so: o Vault. A funcao le a la pela RPC
// `cron_secret`, que so responde para service_role.
//
// Por que nao Deno.env: com o valor nos dois lados, cada rotacao
// exigia copiar a credencial de um lugar para o outro -- e foi
// exatamente numa copia dessas que o valor apareceu no output de uma
// sessao anterior. Agora ele nasce no Vault e nao e transmitido.
//
// SEM MEMORIZACAO -- e isso e uma correcao, nao uma escolha.
//
// A versao anterior guardava o segredo em memoria no cold start da
// instancia. Ela funcionou... ate o dia em que o segredo foi rotacionado:
// as instancias ja vivas continuavam com o valor antigo e passavam a
// recusar o cron legitimo, que ja mandava o valor novo. O sintoma era
// um 401 sem causa aparente, com Vault e cron usando a mesma senha.
//
// Uma credencial memorizada dentro de um processo de vida longa e uma
// janela de falha garantida em cada rotacao. Ler uma linha do Vault a
// cada chamada custa uma query leve e acontece 4x por hora -- nao ha
// o que ganhar memoizando.
async function lerSegredo(): Promise<string> {
  const data = await postgrest<string | { cron_secret: string } | { cron_secret: string }[]>(
    'rpc/cron_secret',
    { method: 'POST', body: JSON.stringify({}) },
  );
  if (typeof data === "string") return data;
    // A RPC retorna texto escalar; a forma objeto/array permanece aceita
    // para compatibilidade caso o contrato da funcao mude para setof.
  const linha = Array.isArray(data) ? data[0] : data;
  return linha?.cron_secret ?? '';
}

async function autorizado(req: Request): Promise<boolean> {
  // Falha ao ler o segredo e 'nao autorizado', nunca 500: um erro de
  // infraestrutura viraria 'erro interno' e esconderia a causa real.
  let segredo = '';
  try {
    segredo = await lerSegredo();
  } catch (erro) {
    log("segredo_indisponivel", { erro: String((erro as Error)?.message ?? erro).slice(0, 80) });
    return false;
  }
    if (!segredo) {
      log("credencial_rejeitada", { motivo: "vault_vazio" });
      return false;
    }

  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!recebido) {
      log("credencial_rejeitada", { motivo: "header_ausente" });
      return false;
    }
    if (recebido.length !== segredo.length) {
      log("credencial_rejeitada", { motivo: "tamanho_divergente" });
      return false;
    }

  // Comparacao de tempo constante: sem isso, da para adivinhar o
  // segredo medindo quanto tempo a funcao leva para recusar.
  let diff = 0;
  for (let i = 0; i < segredo.length; i += 1) diff |= segredo.charCodeAt(i) ^ recebido.charCodeAt(i);
  if (diff !== 0) log("credencial_rejeitada", { motivo: "valor_divergente" });
  return diff === 0;
}

// ---------------------------------------------------------------
// BANCO (service_role, so no servidor)
// ---------------------------------------------------------------
//
// Aqui o job NAO usa o JWT de uma aluna: nao existe sessao. E usa
// service_role porque precisa ler e gravar a aula de um usuario
// especifico (o dono do app_state) -- o RLS so permitiria mexer na
// propria linha, e aqui o dono pode ser outra pessoa.
//
// A chave vive no ambiente da funcao. Nao entra no log nem no corpo.
async function postgrest<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const texto = await resposta.text();
  let corpo: unknown = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  }
  if (!resposta.ok) {
    // Guarda so o status: a mensagem do PostgREST pode echoing de valor.
    const codigo = (corpo as { code?: unknown } | null)?.code;
    const seguro = typeof codigo === "string" && /^[A-Z0-9]+$/.test(codigo) ? `_${codigo}` : "";
    throw new Error(`postgrest_${resposta.status}${seguro}`);
  }
  return corpo as T;
}

// O CACHE REAL DE AULAS NAO E `generated_lessons`
// ------------------------------------------------------------
// discovered na auditoria desta adaptacao: o caminho normal do app
// NAO usa a tabela `generated_lessons`. Ele usa
// `app_state.sections.aiCache`, que ja e a linha compartilhada entre
// os aparelhos -- e o proprio mergeSharedCache() do app junta o
// aiCache remoto no local.
//
// Consequencia: `generated_lessons` e `user_id NOT NULL` nao atrapalham,
// porque o job nao precisa escrever la. Ele escreve no MESMO lugar que
// o app le, e a aula pre-gerada aparece na tela sem nenhuma chamada
// extra, sem user_id e sem conta.
//
// Chave do cache (ai.js lessonCacheKey) -- mesma ordem, mesmos campos:
//   curriculumVersion | versaoConteudo | week | dateKey | b<bloco> | materia | topico
// Se divergir em um unico campo, o app procura uma chave que nao
// existe e mostra "aula nao disponivel" com o cache cheio.
// ---------------------------------------------------------------
type EntradaCache = {
  lesson: unknown;
  lessonId: string | null;
  quiz?: unknown;
  quizId?: string | null;
  model?: string | null;
  updatedAt: number;
};

/** O id do plano de uma aula, a partir da chave de cache. */
function aulaIdDe(planejadas: { chave: string; id: string }[], chave: string): string | null {
  return planejadas.find((a) => a.chave === chave)?.id ?? null;
}

/** Le o aiCache da linha compartilhada. */
async function lerCacheCompartilhado(): Promise<Record<string, EntradaCache>> {
  const linhas = await postgrest<{ data: unknown }[]>("app_state?select=data&id=eq.principal&limit=1");
  const bruto = (linhas?.[0]?.data ?? {}) as { sections?: { aiCache?: Record<string, EntradaCache> } };
  return bruto?.sections?.aiCache ?? {};
}

/**
 * Grava a aula no aiCache.
 *
 * Concorrencia: o `aiCache` e um objeto JSON dentro de uma coluna, e
 * nao uma tabela com indice unico. Um `PATCH` cego sobrescreveria o
 * objeto inteiro e perderia o que a Anna gerou no celular. Por isso o
 * read-modify-write acontece AQUI, com a linha relida antes de
 * gravar: se o cache ja tem a aula valida (a Anna abriu e gerou
 * enquanto o job rodava), o job nao sobrescreve nada.
 */
async function salvarCacheCompartilhado(
  chave: string,
  entrada: EntradaCache,
  jaExistentes: Record<string, EntradaCache>,
): Promise<void> {
  const linhas = await postgrest<{ data: unknown }[]>("app_state?select=data&id=eq.principal&limit=1");
  const data = ((linhas?.[0]?.data ?? {}) as { sections?: Record<string, unknown>; meta?: Record<string, unknown> });

  const secoes = (data.sections ?? {}) as Record<string, unknown>;
  const cacheAtual = (secoes.aiCache ?? {}) as Record<string, EntradaCache>;

  // Releitura: se a aula ja foi gerada por alguem entre a checagem e
  // agora, respeita. O job nao e dono da aula dela.
  const existente = cacheAtual[chave];
  if (existente?.lesson && !jaExistentes[chave]) return;

  await postgrest("app_state?id=eq.principal", {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        ...data,
        sections: { ...secoes, aiCache: { ...cacheAtual, [chave]: entrada } },
      },
      updated_at: new Date().toISOString(),
    }),
  });
}

// ---------------------------------------------------------------
// GERACAO — a mesma cadeia oficial de generate-lesson
//
// Ordem: NVIDIA principal -> NVIDIA reserva -> Groq de conteudo.
// A chave de aula personalizada (GROQ_CUSTOM_LESSON_API_KEY) NAO entra
// aqui: o curriculo oficial nunca usa a cota das aulas personalizadas.
//
// O validateLesson() e obrigatorio: conteudo que ele recusa nao vai
// para o banco. E o que garante que nunca exista aula falsa no cache
// -- se o provider devolver algo ruim, o job registra ai_unavailable
// e tenta de novo em 15 minutos.
// ---------------------------------------------------------------
type AulaPlanejada = {
  id: string; week: number; block: number; kind: string;
  subject: string; topic: string; subtopics: string[];
  content: string; objective: string; durationMinutes: number;
};

async function gerarAula(aula: AulaPlanejada, dateKey: string) {
  // Mesmo formato que o generate-lesson monta para a aula oficial:
  // campos achatados no prompt, e o retorno e {system, user}.
  const entrada = {
    subject: aula.subject,
    topic: aula.topic,
    subtopics: aula.subtopics,
    objectives: [aula.objective],
    kind: aula.kind,
    durationMinutes: aula.durationMinutes,
  };
  const { system, user } = buildLessonPrompt(entrada);
  const mensagens = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const tentativas: { nome: string; chamar: () => Promise<{ data: unknown }> }[] = [
    {
      nome: AI_PRIMARY_MODEL,
      chamar: () => requestJson(NVIDIA_KEY, {
        model: AI_PRIMARY_MODEL,
        messages: mensagens,
        temperature: 0.55,
        max_tokens: 3600,
        response_format: { type: "json_object" },
      }),
    },
    {
      nome: AI_FALLBACK_MODEL,
      chamar: () => requestJson(NVIDIA_KEY, {
        model: AI_FALLBACK_MODEL,
        messages: mensagens,
        temperature: 0.55,
        max_tokens: 3600,
        response_format: { type: "json_object" },
      }),
    },
    {
      nome: GROQ_CONTENT_LESSON_MODEL,
      chamar: () => gerarConteudoEstruturado({
        apiKey: GROQ_CONTENT_KEY,
        model: GROQ_CONTENT_LESSON_MODEL,
        system,
        user,
        schema: LESSON_SCHEMA_OPENAI,
        maxTokens: 3600,
        temperature: 0.55,
      }),
    },
  ];

  let ultimo: string | null = null;
  for (const tentativa of tentativas) {
    try {
      const bruto = await tentativa.chamar();
      const validado = validateLesson(bruto?.data, { subject: aula.subject, topic: aula.topic });
      if (!validado.ok) {
        ultimo = `invalido:${(validado.errors ?? []).slice(0, 2).join(' | ').slice(0, 120)}`;
        log("aula_rejeitada", { id: aula.id, modelo: tentativa.nome, motivo: ultimo });
        continue;
      }
      log("aula_gerada", { id: aula.id, modelo: tentativa.nome });
      return { dados: validado.data, modelo: tentativa.nome };
    } catch (erro) {
      ultimo = String((erro as Error)?.message ?? erro).slice(0, 120);
      log("provider_falhou", { id: aula.id, modelo: tentativa.nome, erro: ultimo });
    }
  }

  // Nenhum provider entregou conteudo aproveitavel. NAO salva nada:
  // sem save, a proxima rodada tenta de novo em vez de a aluna abrir
  // uma aula vazia.
  return { erro: ultimo ?? "ai_unavailable" };
}

// ---------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  if (!(await autorizado(req))) {
    log("negado", { motivo: 'sem CRON_SECRET valido' });
    return responder(req, 401, { error: 'nao_autorizado' });
  }

  if (!SERVICE_ROLE || !NVIDIA_KEY) {
    log("sem_config", { temServiceRole: Boolean(SERVICE_ROLE), temNvidia: Boolean(NVIDIA_KEY) });
    return responder(req, 500, { error: 'sem_config' });
  }

  // O dia e do fuso do cronograma, e nao de UTC: as 23:30 de Sao
  // Paulo ainda sao o dia 02, e o cron tem que preparar o dia 02.
  const dateKey = dateKeyInZone(new Date());

  try {
    // Sem `owner_id`: no modelo de senha unica nao existe conta, e o cache
    // de aulas e a propria linha compartilhada do app_state. O job le e
    // escreve la -- exatamente onde o app le -- entao a aula pre-gerada
    // aparece na tela sem nenhuma chamada extra e sem conta.
    const cache = await lerCacheCompartilhado();

    const planejadas = (aulasDoDia(dateKey) as AulaPlanejada[]).map((aula) => ({
      ...aula,
      dateKey,
      curriculumVersion: CURRICULUM_VERSION,
      versao: VERSAO_CONTEUDO,
      chave: chaveCache({
        curriculumVersion: CURRICULUM_VERSION,
        versao: VERSAO_CONTEUDO,
        week: aula.week,
        dateKey,
        block: aula.block,
        subject: aula.subject,
        topic: aula.topic,
      }),
    }));

    if (!planejadas.length) {
      log('fora_do_cronograma', { dateKey });
      return responder(req, 200, { ok: true, dateKey, situacao: 'fora_do_cronograma', planejadas: 0 });
    }

    log('inicio', { dateKey, plano: planejadas.length, timezone: TIMEZONE_CRONOGRAMA });

    const relatorio = await executarJob({
      dateKey,
      aulas: planejadas,
      // O `cache` foi lido UMA vez no inicio: e a foto do que ja
      // existia. O job decide a lista de chamadas a partir dessa foto,
      // e a releitura dentro de salvarCacheCompartilhado() protege o
      // dado novo da aluna.
      lerCache: async (chave) => cache[chave] ?? null,
      gerar: (aula) => gerarAula(aula as AulaPlanejada, dateKey),
      salvar: async (chave, entrada) => {
        await salvarCacheCompartilhado(chave, {
          lesson: entrada.dados,
          lessonId: aulaIdDe(planejadas, chave),
          model: entrada.modelo,
          updatedAt: Date.now(),
        }, cache);
      },
    });

    log('fim', {
      dateKey,
      planejadas: relatorio.planejadas,
      geradas: relatorio.geradas.length,
      existentes: relatorio.existentes.length,
      falhas: relatorio.falhas.length,
      chamadas: relatorio.chamadas,
    });

    // O relatorio devolve ids e situacao, nunca conteudo nem chave.
    return responder(req, 200, { ok: true, ...relatorio });
  } catch (erro) {
    log('erro', { dateKey, erro: String((erro as Error)?.message ?? erro).slice(0, 160) });
    return responder(req, 500, { ok: false, dateKey, error: 'erro_interno' });
  }
});
