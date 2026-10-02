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
// PARA QUEM GERA
//
// `generated_lessons.user_id` e NOT NULL e tem FK para auth.users, e
// o indice unico e (user_id, cache_key): as aulas sao POR USUARIO.
// O job entao usa o dono do `app_state` -- a mesma conta que a aluna
// usa no aparelho. Sem dono, o job nao gera nada e diz por que: e
// melhor do dia sem aula pronta do que uma aula gerada para a conta
// errada, que a aluna nunca veria.
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
// AUTORIZACAO
//
// O unico chamador legitimo e o pg_cron, com CRON_SECRET.
//
// `verify_jwt` fica DESLIGADO de proposito: o cron manda o segredo no
// cabecalho Authorization, e nao um JWT de usuario -- nao existe
// sessao de aluna nenhuma atras dessa chamada. Desligar o verify_jwt
// sem este passo seria deixar a funcao aberta; com ele, quem nao tem
// o segredo leva 401 e nada acontece.
//
// O segredo vive no Vault e no ambiente da funcao. Ele nunca vai para
// o bundle, nunca aparece no log e nunca volta na resposta: o
// compare e de tempo constante, para nao dar palpite por diferenca
// de tempo.
// ---------------------------------------------------------------
function autorizado(req: Request): boolean {
  const segredo = Deno.env.get("CRON_SECRET") ?? "";
  if (!segredo) return false;

  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!recebido || recebido.length !== segredo.length) return false;

  let diff = 0;
  for (let i = 0; i < segredo.length; i += 1) diff |= segredo.charCodeAt(i) ^ recebido.charCodeAt(i);
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
    throw new Error(`postgrest_${resposta.status}`);
  }
  return corpo as T;
}

/** O dono do app_state: e para essa conta que o job prepara as aulas. */
async function donoDoEstado(): Promise<string | null> {
  const linhas = await postgrest<{ owner_id: string | null }[]>(
    "app_state?select=owner_id&id=eq.principal&limit=1",
  );
  return linhas?.[0]?.owner_id ?? null;
}

const LESSONS = "generated_lessons";

type LinhaAula = { cache_key: string; lesson_data: unknown };

/** Le as aulas do usuario nas chaves pedidas (PostgREST: cache_key=in.(...)). */
async function lerCache(userId: string, chaves: string[]): Promise<Record<string, LinhaAula>> {
  if (!chaves.length) return {};
  const filtro = chaves.map((c) => `"${c}"`).join(',');
  const linhas = await postgrest<LinhaAula[]>(
    `${LESSONS}?select=cache_key,lesson_data&user_id=eq.${userId}&cache_key=in.(${filtro})`,
  );
  const mapa: Record<string, LinhaAula> = {};
  for (const linha of linhas ?? []) mapa[linha.cache_key] = linha;
  return mapa;
}

/**
 * Grava a aula.
 *
 * `on_conflict=user_id,cache_key` casa com o indice unico real da
 * tabela. E o que torna a gravacao ATOMICA contra execucoes
 * concorrentes: se duas rodarem juntas e chegarem ao mesmo save, uma
 * faz upsert e a outra atualiza a MESMA linha. Nao nasce duplicata,
 * que era o risco da checagem "ler de novo antes de gravar".
 */
async function salvarCache(userId: string, chave: string, entrada: { dados: unknown; modelo: string | null; criadoEm: string }) {
  await postgrest(LESSONS, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      cache_key: chave,
      curriculum_version: CURRICULUM_VERSION,
      kind: "curriculum",
      subject: (entrada.dados as { subject?: string })?.subject ?? "Matematica",
      topic: (entrada.dados as { topic?: string })?.topic ?? "",
      lesson_data: entrada.dados,
      model: entrada.modelo,
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

  if (!autorizado(req)) {
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
    const dono = await donoDoEstado();
    if (!dono) {
      // app_state ainda sem dono: nao existe conta para quem preparar.
      // Sair assim e o comportamento certo -- gerar para uma conta
      // presumida deixaria a aula orphan no cache.
      log("sem_dono", { dateKey, situacao: 'app_state sem owner_id' });
      return responder(req, 200, {
        ok: true, dateKey, situacao: 'sem_dono',
        mensagem: 'app_state ainda nao tem dono; nenhuma aula foi gerada',
      });
    }

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
      lerCache: async (chave) => (await lerCache(dono, [chave]))[chave] ?? null,
      gerar: (aula) => gerarAula(aula as AulaPlanejada, dateKey),
      salvar: (chave, entrada) => salvarCache(dono, chave, entrada),
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