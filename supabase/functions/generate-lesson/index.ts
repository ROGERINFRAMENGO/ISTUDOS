import { authenticate, handleOptions, json } from "../_shared/http.js";
import { validateLesson } from "../_shared/schemas.js";
import { buildLessonPrompt, buildCustomLessonPrompt } from "../_shared/prompts.js";
import { buildPerformance, createDb, lessonCacheKey } from "../_shared/db.js";
import { AI_PRIMARY_MODEL, AI_FALLBACK_MODEL } from "../_shared/ai_config.js";
import { requestJson, AiError } from "../_shared/nvidia.js";
// FASE D. groqContent.js e separado de _shared/groq.js (que e do
// Tutor) de proposito: nenhum dos dois importa o outro, e a chave
// chega por parametro.
import { gerarConteudoEstruturado } from "../_shared/groqContent.js";

// ============================================================
// generate-lesson
// ------------------------------------------------------------
// Recebe o topico definido pelo CRONOGRAMA, gera a aula com o
// modelo principal rapido, valida o JSON e salva em generated_lessons.
// A chave NVIDIA_API_KEY existe apenas como secret desta funcao.
// ============================================================

// Prioridade 1 (30/09/2026): o prompt passou a pedir uma aula mais
// profunda (3 a 5 secoes, 1 ou 2 exemplos por secao, 3 a 5
// exercicios, 3 a 5 erros comuns, 4 a 6 itens de resumo). Com o
// teto antigo de 2400 o modelo cortava a geracao no MEIO do JSON e a
// aula saia sem guidedPractice, sem commonMistakes e sem summary.
//
// O sintoma nao era "JSON invalido" e sim "JSON valido e incompleto",
// entao o retry de malformed_json nao ajudava. O conserto e orcamento:
// 3600 tokens cabem a aula nova inteira sem estourar o tempo do
// modelo (DiffusionGemma gera ~6,6s para ciencia).
const MAX_TOKENS = 3600;

/** Log estruturado. NUNCA registra chave, token ou conteudo da aula. */
function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }));
}

function statusForError(error) {
  if (error instanceof AiError) {
    if (error.message === "missing_api_key") return 503;
    if (error.message === "ai_timeout") return 504;
    if (error.status === 429) return 429;
    return 502;
  }
  return 500;
}

/**
 * Gera e valida em UM modelo. Nao lanca: devolve o resultado para o
 * chamador decidir se vale tentar o fallback.
 */
async function tryModel(apiKey, model, messages, promptInput) {
  const started = Date.now();

  // DIFFUSIONGEMMA: ele encerra a geracao no meio de uma palavra e ainda
  // reporta finish_reason="stop" (achado em 29/09, 4 de 5 execucoes).
  // Nao ha como "consertar" esse JSON: ele simplesmente nao tem o fim.
  // A unica saida e tentar de novo, entao uma falha de JSON ganha uma
  // segunda tentativa no MESMO modelo antes de partir para o fallback.
  let first;
  let jsonRetries = 0;
  for (let attempt = 1; ; attempt += 1) {
    try {
      first = await requestJson(apiKey, { messages, temperature: 0.55, maxTokens: MAX_TOKENS, model, timeoutMs: NVIDIA_STEP_TIMEOUT_MS });
      break;
    } catch (error) {
      if (error?.message !== "malformed_json" || attempt >= 2) throw error;
      jsonRetries = 1;
      log("ai_json_retry", { model, attempt, detail: String(error?.detail ?? "").slice(0, 200) });
    }
  }

  let validation = validateLesson(first.data, promptInput);

  // Uma unica chamada de correcao quando o JSON veio dentro do formato,
  // mas com campos fora do schema.
  if (!validation.ok) {
    log("ai_validation_retry", {
      model,
      ms: Date.now() - started,
      reason: validation.errors.slice(0, 3).join(" | ").slice(0, 200),
    });
    const correction = [
      messages[1].content, "",
      "SUA RESPOSTA ANTERIOR FOI REJEITADA. Corrija exatamente estes pontos e devolva o JSON inteiro de novo:",
      // 16 e nao 12: a FASE C acrescentou as checagens de conta e de
      // texto corrompido, que rodam por ULTIMO no validateLesson. Com
      // corte em 12, um erro de matematica de verdade podia ficar de
      // fora da lista e a correcao sair sem enxergar o problema.
      validation.errors.slice(0, 16).map((error) => `- ${error}`).join("\n"),
    ].join("\n");
    const second = await requestJson(apiKey, {
      messages: [messages[0], { role: "user", content: correction }],
      temperature: 0.2, maxTokens: MAX_TOKENS, model,
      timeoutMs: NVIDIA_STEP_TIMEOUT_MS,
    });
    validation = validateLesson(second.data, promptInput);
  }

  return {
    ok: validation.ok,
    validation,
    model: first.model ?? model,
    ms: Date.now() - started,
    attempts: (validation.ok ? 1 : 2) + jsonRetries,
  };
}

// ============================================================
// FASE D — SCHEMA ESTRITO (dialeto OpenAI / Groq)
// ============================================================
//
// A API OpenAI-compatible da Groq exige JSON Schema padrao: tipos em
// MINUSCULO, todas as propriedades em "required" e
// "additionalProperties": false. O schema da aula e IDENTICO ao do
// cronograma, so que escrito no dialeto que ela aceita.
//
// A forma e a mesma que a interface consome e que o validateLesson
// recebe: nenhuma etapa seguinte precisa saber que a aula nasceu de
// um pedido em linguagem natural.
// ============================================================
const TIPO_TEXTO = { type: "string" };
const objeto = (props) => ({
  type: "object",
  additionalProperties: false,
  properties: props,
  required: Object.keys(props),
});

export const LESSON_SCHEMA_OPENAI = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: TIPO_TEXTO,
    objectives: { type: "array", items: TIPO_TEXTO },
    introduction: TIPO_TEXTO,
    sections: {
      type: "array",
      items: objeto({
        title: TIPO_TEXTO,
        explanation: TIPO_TEXTO,
        examples: {
          type: "array",
          items: objeto({ problem: TIPO_TEXTO, solution: TIPO_TEXTO, explanation: TIPO_TEXTO }),
        },
      }),
    },
    guidedPractice: {
      type: "array",
      items: objeto({ question: TIPO_TEXTO, hint: TIPO_TEXTO, answer: TIPO_TEXTO, explanation: TIPO_TEXTO }),
    },
    commonMistakes: { type: "array", items: TIPO_TEXTO },
    summary: { type: "array", items: TIPO_TEXTO },
  },
  required: ["title", "objectives", "introduction", "sections", "guidedPractice", "commonMistakes", "summary"],
};

/** Limite do pedido da estudante. Acima disso, o front avisa e NAO corta. */
export const CUSTOM_REQUEST_MAX = 2000;

// ============================================================
// FALLBACK DE CONTEUDO (curriculo oficial)
// ============================================================
// Modelo e teto do TERCEIRO passo da cadeia oficial. Medido nos
// benchmarks das fases B e C: 20 de 26 geracoes estritas aprovadas
// (77%) — o mesmo openai/gpt-oss-120b que o generate-quiz ja usa
// com GROQ_CONTENT_API_KEY. Nao e escolha nova: e a mesma
// combinacao de modelo e credencial que ja funciona no projeto.
const GROQ_CONTENT_LESSON_MODEL = "openai/gpt-oss-120b";
const GROQ_CONTENT_MAX_TOKENS = 8192;

// ------------------------------------------------------------
// TIMEOUT POR PASSO (achado da finalizacao)
// ------------------------------------------------------------
// A medicao mostrou que a primaria da NVIDIA responde em 11s quando
// funciona, e TRAVA ate o gateway cortar a funcao em 150s quando
// nao funciona. Com o timeout de 140s por requisicao, uma unica
// travada consumia o orcamento inteiro e o fallback nunca rodava —
// a funcao morria no 504 antes de tentar o modelo 2 e o Groq.
//
// 45s por passo cabem tres tentativas dentro dos 150s do gateway:
//   45 (primaria) + 45 (reserva) + 60 (groq) = 150.
// E quatro vezes o tempo observado de sucesso (11s), entao uma
// geracao legitima nunca e cortada por isso.
const NVIDIA_STEP_TIMEOUT_MS = 45000;
const GROQ_CONTENT_TIMEOUT_MS = 60000;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) {
    return json(
      {
        error: "unauthorized",
        message: "Precisa de uma sessao do Supabase (login anonimo) para usar a IA.",
        hint: "Ative Authentication -> Sign In -> Allow anonymous sign-ins no painel do Supabase.",
      },
      401,
      req,
    );
  }

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, req);
  }
/**
 * ============================================================
 * FASE D — gera a aula a partir do pedido em linguagem natural.
 * ============================================================
 *
 * Reaproveita buildCustomLessonPrompt, o MESMO validateLesson (com
 * mathCheck e textCheck dentro) e o MESMO saveLesson. O que muda e a
 * credencial e o provider.
 *
 * Teto de tentativas: 1 geracao + 1 correcao + ate 2 tentativas de
 * provider quando o erro e transitorio. Nao ha laco infinito: toda
 * volta esta contada.
 */
const CUSTOM_MODEL = "openai/gpt-oss-120b";
// Fallback medido: o 120b passa em 20 de 26 geracoes estritas (77%) e
// o 20b em 12 de 17 (71%). Sao amostras diferentes, entao encadear os
// dois como o generate-lesson ja faz com os modelos NVIDIA rende
// 77% + 23% * 71% ~= 93%. Qwen (10/17) fica fora.
const CUSTOM_MODEL_FALLBACK = "openai/gpt-oss-20b";
const CUSTOM_MAX_TOKENS = 8192;
const CUSTOM_TENTATIVAS_TRANSIENT = 2;
const CUSTOM_TEMPO_MAXIMO_MS = 120000;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tempoEsperaQuota(detail, tentativa) {
  const espera = String(detail ?? "").match(/try again in\s+([\d.]+)\s*s/i);
  if (!espera) return 8000 * (tentativa + 1);
  return Math.min(60000, Math.ceil(Number(espera[1]) * 1000) + 1000);
}

const TRANSITORIO = new Set(["timeout", "rede", "provider", "quota_minuto", "json", "vazio"]);

function mensagemDeFalha(kind) {
  if (kind === "quota_diaria") {
    return "O limite diario de uso da IA acabou. Tente de novo mais tarde - seu pedido foi preservado.";
  }
  if (kind === "quota_minuto") {
    return "Muitas aulas seguidas. Espera um pouquinho e tenta de novo - seu pedido foi preservado.";
  }
  if (kind === "timeout") {
    return "A IA demorou demais. Tenta de novo - seu pedido foi preservado.";
  }
  if (kind === "credencial") {
    return "A aula personalizada esta indisponivel agora. Tente mais tarde.";
  }
  return "Nao consegui gerar sua aula agora. Tenta de novo - seu pedido foi preservado.";
}

async function gerarAulaPersonalizada(input, auth, req) {
  const request = String(input?.request ?? "").trim();
  if (!request) {
    return json({ error: "request_required", message: "Escreva o que voce quer aprender." }, 400, req);
  }
  if (request.length > CUSTOM_REQUEST_MAX) {
    // NUNCA corta em silencio: devolve o tamanho e o limite.
    return json({
      error: "request_too_long",
      message: `Seu pedido tem ${request.length} caracteres e o limite e ${CUSTOM_REQUEST_MAX}. Encurte um pouco - nada foi enviado.`,
      limit: CUSTOM_REQUEST_MAX,
      received: request.length,
    }, 400, req);
  }

  const apiKey = Deno.env.get("GROQ_CUSTOM_LESSON_API_KEY") ?? "";
  if (!apiKey) {
    return json({
      error: "custom_ai_not_configured",
      message: "A aula personalizada ainda nao esta disponivel. Seu pedido foi preservado.",
    }, 503, req);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const db = createDb({ url, anonKey, token: auth.token });

  const { system, user } = buildCustomLessonPrompt({
    request,
    subject: input?.subject ?? "",
    topic: input?.topic ?? "",
    level: input?.level ?? "",
    difficulty: input?.difficulty ?? "",
    style: input?.style ?? "",
  });

  const started = Date.now();

  // Mesma ideia do caminho do cronograma: modelo principal, e se a
  // aula nao passar no validador, o segundo modelo tenta. Cada modelo
  // tem UMA geracao e UMA correcao — teto de 4 chamadas, nunca laco.
  const cadeia = [CUSTOM_MODEL, CUSTOM_MODEL_FALLBACK];
  let aulaValida = null;
  let modeloUsado = CUSTOM_MODEL;
  let ultimoErro = null;
  let tentativas = 0;
  let errosValidador = [];

  for (const modelo of cadeia) {
    // Nao comeca o segundo se ja estourou o tempo: melhor erro honesto
    // do que estourar o gateway.
    if (Date.now() - started > CUSTOM_TEMPO_MAXIMO_MS) { ultimoErro = { kind: "timeout" }; break; }
    modeloUsado = modelo;

    const chamar = async (userMensagem) => {
      for (let t = 0; t <= CUSTOM_TENTATIVAS_TRANSIENT; t += 1) {
        if (Date.now() - started > CUSTOM_TEMPO_MAXIMO_MS && t > 0) return null;
        tentativas += 1;
        const r = await gerarConteudoEstruturado({
          apiKey, model: modelo, system, user: userMensagem, schema: LESSON_SCHEMA_OPENAI, maxTokens: CUSTOM_MAX_TOKENS,
          fallbackJsonObject: true,
        });
        if (r.ok) return r;
        ultimoErro = r;
        log("custom_ai_error", { kind: r.kind, status: r.status, tentativa: t + 1, modelo });
        if (!TRANSITORIO.has(r.kind) || t === CUSTOM_TENTATIVAS_TRANSIENT) return null;
        // Espera maior para cota: martelar um limite por minuto
        // esgotado so piora. A espera cresce a cada tentativa.
        await dormir(r.kind === "quota_minuto" ? tempoEsperaQuota(r.detail, t) : 1500 * (t + 1));
      }
      return null;
    };

    const primeira = await chamar(user);
    if (!primeira) continue;
    // Mesma validacao das aulas do cronograma. Sem excecao: nem o
    // mathCheck nem o textCheck nem nenhum limite foram afrouxados.
    let validacao = validateLesson(primeira.data, { subject: "", topic: "" });

    if (!validacao.ok) {
      errosValidador = validacao.errors;
      log("custom_validation_retry", { modelo, reason: validacao.errors.slice(0, 3).join(" | ").slice(0, 200) });
      const ehErroMatematica = validacao.errors.some((e) => /a conta\s+\"|vale\s+[0-9]|resultado.*explicacao|resposta.*explicacao/i.test(e));
      const correcao = [
        user,
        "",
        ehErroMatematica
          ? "SUA RESPOSTA ANTERIOR FOI REJEITADA POR ERRO DE CONTA OU COERENCIA MATEMATICA. Refaça TODAS as contas do texto, aplique a regra correta e devolva o JSON inteiro com exemplos e exercicios coerentes. Nao invente resultado. Veja estes erros e corrija cada um antes de responder:"
          : "SUA RESPOSTA ANTERIOR FOI REJEITADA. Corrija exatamente estes pontos e devolva o JSON inteiro de novo:",
        validacao.errors.slice(0, 16).map((e) => `- ${e}`).join("\n"),
      ].join("\n");
      const segunda = await chamar(correcao);
      if (segunda) validacao = validateLesson(segunda.data, { subject: "", topic: "" });
    }

    if (validacao.ok) { aulaValida = validacao.data; break; }
  }

  if (!aulaValida) {
    // Houve resposta do modelo mas ela nao passou = validacao. Nao
    // houve resposta = provider ou cota. Sao mensagens diferentes.
    const eValidacao = errosValidador.length > 0;
    const kind = ultimoErro?.kind ?? "http";
    return json({
      error: eValidacao ? "custom_invalid_output" : "custom_ai_unavailable",
      kind: eValidacao ? "validation" : kind,
      message: eValidacao
        ? "A IA montou a aula fora do formato. Nada foi salvo - tenta de novo."
        : mensagemDeFalha(kind),
      errors: errosValidador.slice(0, 12),
      ms: Date.now() - started,
    }, 502, req);
  }

  const aula = aulaValida;
  const titulo = String(aula.title ?? "Aula personalizada").trim();
  const materia = String(input?.subject ?? "").trim() || "Personalizada";
  const topico = String(input?.topic ?? "").trim() || titulo;

  // cache_key com prefixo "custom:": nao colide com o cache do
  // cronograma, que comeca pela versao do curriculo.
  const cacheKey = `custom:${crypto.randomUUID()}`;

  let saved = null;
  try {
    saved = await db.saveLesson({
      userId: auth.userId, cacheKey, curriculumVersion: "custom-v1",
      week: null, day: null, dateKey: null,
      subject: materia, topic: topico, lessonData: aula, model: modeloUsado,
      kind: "custom",
      customPrompt: request,
      customSubject: String(input?.subject ?? "").trim() || null,
      customLevel: String(input?.level ?? "").trim() || null,
      customStyle: String(input?.style ?? "").trim() || null,
    });
  } catch (error) {
    log("custom_save_failed", { error_type: String(error?.message ?? error).slice(0, 80) });
  }

  log("custom_lesson_created", {
    model: modeloUsado, ms: Date.now() - started, tentativas, saved: Boolean(saved?.id),
  });

  return json({
    lesson: saved?.lesson_data ?? aula,
    id: saved?.id ?? null,
    kind: "custom",
    saveFailed: !saved?.id,
    model: modeloUsado,
    ms: Date.now() - started,
  }, 200, req);
}


  // ============================================================
  // FASE D — AULA PERSONALIZADA
  // ============================================================
  // Ramo separado e explicito, antes de qualquer coisa do
  // cronograma. A chave de conteudo e a DA FASE D, lida aqui e em
  // lugar nenhum mais: GROQ_CONTENT_API_KEY e GROQ_API_KEY (Tutor)
  // nao sao tocados neste caminho, e este caminho nao os le.
  if (input?.custom === true) {
    return gerarAulaPersonalizada(input, auth, req);
  }

  const subject = String(input?.subject ?? "").trim();
  const topic = String(input?.topic ?? "").trim();
  if (!subject || !topic) return json({ error: "subject_and_topic_required" }, 400, req);

  const apiKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!apiKey) return json({ error: "ai_not_configured", message: "Defina o secret NVIDIA_API_KEY." }, 503, req);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const db = createDb({ url, anonKey, token: auth.token });

  const curriculumVersion = String(input?.curriculumVersion ?? "v1");
  const cacheKey = lessonCacheKey({
    curriculumVersion,
    week: input?.week,
    day: input?.day,
    dateKey: input?.dateKey,
    block: input?.block,
    subject,
    topic,
  });

  // 1. Cache: a mesma aula do cronograma nunca e gerada duas vezes.
  if (!input?.force) {
    try {
      const cached = await db.findLesson(cacheKey);
      if (cached?.lesson_data) {
        log("ai_cache_hit", { model: cached.model, cache_hit: true, ok: true, fallback_used: false });
        return json({ lesson: cached.lesson_data, id: cached.id, cached: true, model: cached.model }, 200, req);
      }
    } catch (error) {
      console.error("[generate-lesson] falha ao ler o cache", error);
      // segue para gerar: cache e aceleracao, nao requisito.
    }
  }

  // 2. Desempenho REAL vindo do banco (o hint do front entra so como reforco).
  let performance = input?.studentPerformance ?? {};
  try {
    const attempts = await db.recentAttempts(400);
    const real = buildPerformance(attempts, { subject, topic });
    performance = {
      ...real,
      weakAreas: [...new Set([...(real.weakAreas ?? []), ...(input?.studentPerformance?.weakAreas ?? [])])],
    };
  } catch (error) {
    console.warn("[generate-lesson] sem desempenho real, gerando sem adaptacao", error);
  }

  const promptInput = { ...input, subject, topic, studentPerformance: performance };
  const { system, user } = buildLessonPrompt(promptInput);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  // ============================================================
  // FASE FINAL — fallback NVIDIA -> Groq Content
  // ============================================================
  // O provider NVIDIA saiu do ar (504 / idle timeout de 150s) e
  // travou a geracao das 122 aulas oficiais.
  //
  // A ordem fica explicita e documentada:
  //   1. NVIDIA principal   (google/diffusiongemma-26b-a4b-it)
  //   2. NVIDIA reserva    (meta/muse-glimmer-30b)
  //   3. Groq CONTEUDO     (openai/gpt-oss-120b, GROQ_CONTENT_API_KEY)
  //
  // O passo 3 so entra em acao com forceGroqFallback ou quando os
  // dois passos da NVIDIA falharem por PROVIDER (timeout, 5xx,
  // cota). Se a NVIDIA respondeu e a aula foi reprovada no
  // VALIDADOR, o erro e de conteudo e nao de infraestrutura: cair
  // para outro modelo ali esconderia um problema de qualidade.
  //
  // Credenciais: este passo le GROQ_CONTENT_API_KEY, que ja e a
  // credencial de conteudo do projeto (a do generate-quiz).
  // NUNCA le GROQ_CUSTOM_LESSON_API_KEY — essa e exclusiva da aula
  // personalizada e nao pode tocar no curriculo. O TutorChat usa
  // GROQ_API_KEY e nao e tocado por este ramo.
  // FORCE_GROQ pula a NVIDIA por completo. Sem ele, a NVIDIA eh
  // tentada primeiro porque continua sendo o caminho normal.
  const FORCE_GROQ = input?.forceGroqFallback === true;
  const NVIDIA_CHAIN = FORCE_GROQ ? [] : [...new Set([AI_PRIMARY_MODEL, AI_FALLBACK_MODEL].filter(Boolean))];

  // Se os dois modelos da NVIDIA falharem por provider, o terceiro
  // passo assume. `fallbackGroq` e ligado aqui e desligado se a
  // NVIDIA tiver respondido (mesmo que a aula nao tenha passado).
  let fallbackGroq = FORCE_GROQ;
  let nvidiaRespondeu = false;

  let validation = null;
  let model = NVIDIA_CHAIN[0] ?? GROQ_CONTENT_LESSON_MODEL;
  let lastError = null;
  let usedFallback = false;
  let lastDetail = { msg: "", detail: "" };
  let providerUsado = NVIDIA_CHAIN.length ? "nvidia" : "groq-content";

  // Orcamento de tempo: o gateway corta em 150s. Nao comecamos o fallback
  // se ja gastamos tempo demais, e assim o principal rapido nunca vira
  // "500 sem corpo" por causa do modelo lento de fallback.
  const TIME_BUDGET_MS = 130000;
  const startedAll = Date.now();

  for (let i = 0; i < NVIDIA_CHAIN.length; i += 1) {
    const candidate = NVIDIA_CHAIN[i];
    const elapsed = Date.now() - startedAll;
    if (i > 0 && elapsed > TIME_BUDGET_MS * 0.55) {
      log("ai_fallback_skipped", { model: candidate, elapsed_ms: elapsed, reason: "orcamento_de_tempo" });
      break;
    }
    if (i > 0) usedFallback = true;
    try {
      const result = await tryModel(apiKey, candidate, messages, promptInput);
      validation = result.validation;
      model = result.model;
      nvidiaRespondeu = true;
      log("ai_generation", {
        model: result.model,
        requested: candidate,
        ms: result.ms,
        attempts: result.attempts,
        ok: result.ok,
        fallback_used: usedFallback,
        cache_hit: false,
        error_type: result.ok ? null : "invalid_lesson",
      });
      if (result.ok) break;
      lastError = new AiError("invalid_ai_output", { status: 502, detail: validation.errors.slice(0, 3).join(" | ") });
    } catch (error) {
      lastError = error;
      lastDetail = { msg: String(error?.message ?? error), detail: String(error?.detail ?? "") };
      log("ai_generation", {
        model: candidate,
        ms: Date.now() - startedAll,
        ok: false,
        fallback_used: usedFallback,
        cache_hit: false,
        error_type: lastDetail.msg.slice(0, 80),
        error_detail: lastDetail.detail.slice(0, 250),
      });
    }
    validation = null;
  }

  // Terceiro elo da cadeia. Entra SEMPRE que os dois modelos da
  // NVIDIA nao entregaram uma aula valida, seja por travamento
  // (timeout) seja por reprovacao no validador.
  //
  // A primeira versao desta regra so entrava quando a NVIDIA nao
  // RESPONDIA. A amostra mostrou que isso nao bastava: a NVIDIA
  // responde rapido, mas entrega aula reprovada, e o fallback nunca
  // era alcancado. A restricao nao acrescentava seguranca nenhuma —
  // a aula do Groq passa pelo MESMO validateLesson, com mathCheck,
  // textCheck, schedule leak e secret leak. Nada afrouxa.
  //
  // forceGroqFallback=true pula a NVIDIA e vai direto ao Groq, o que
  // economiza tempo quando se sabe que ela esta fora.
  if (!validation) {
    const groqKey = Deno.env.get("GROQ_CONTENT_API_KEY") ?? "";
    if (groqKey) {
      usedFallback = true;
      providerUsado = "groq-content";
      model = GROQ_CONTENT_LESSON_MODEL;
      log("groq_content_fallback", { model: GROQ_CONTENT_LESSON_MODEL, forcado: FORCE_GROQ, elapsed_ms: Date.now() - startedAll });

      const r = await gerarConteudoEstruturado({
        apiKey: groqKey,
        model: GROQ_CONTENT_LESSON_MODEL,
        system,
        user,
        schema: LESSON_SCHEMA_OPENAI,
        maxTokens: GROQ_CONTENT_MAX_TOKENS,
        timeoutMs: GROQ_CONTENT_TIMEOUT_MS,
      });
      if (r.ok) {
        validation = validateLesson(r.data, { subject, topic });
        if (validation.ok) {
          log("ai_generation", { model: GROQ_CONTENT_LESSON_MODEL, ok: true, fallback_used: true, provider: "groq-content", cache_hit: false });
        } else {
          lastError = new AiError("invalid_ai_output", { status: 502, detail: validation.errors.slice(0, 3).join(" | ") });
          log("ai_generation", { model: GROQ_CONTENT_LESSON_MODEL, ok: false, fallback_used: true, provider: "groq-content", error_type: "invalid_lesson", error_detail: lastError.detail.slice(0, 200) });
          validation = null;
        }
      } else {
        lastError = new AiError("ai_unavailable", { status: 502, detail: `groq-content ${r.kind}: ${r.detail}` });
        log("ai_generation", { model: GROQ_CONTENT_LESSON_MODEL, ok: false, fallback_used: true, provider: "groq-content", error_type: r.kind });
        validation = null;
      }
    } else {
      log("groq_content_fallback", { reason: "sem_credencial_de_conteudo" });
    }
  }

  if (!validation) {
    return json(
      {
        error: "ai_unavailable",
        message: "A IA nao respondeu agora. Sua aula anterior continua salva.",
        detail: String(lastError?.message ?? "sem resposta"),
        debug_last: String(lastError?.detail ?? "").slice(0, 300),
        chain_tried: [...NVIDIA_CHAIN, ...(providerUsado === "groq-content" ? [GROQ_CONTENT_LESSON_MODEL] : [])],
        provider: providerUsado,
      },
      statusForError(lastError),
      req,
    );
  }

  // 3. Nunca salvar lixo: se continua invalido, nada vai para o banco.
  if (!validation.ok) {
    return json(
      {
        error: "invalid_ai_output",
        message: "A IA mandou uma aula fora do formato. Nada foi salvo.",
        errors: validation.errors.slice(0, 12),
      },
      502,
      req,
    );
  }

  let saved = null;
  try {
    saved = await db.saveLesson({
      userId: auth.userId,
      cacheKey,
      curriculumVersion,
      week: input?.week ?? null,
      day: input?.day ?? null,
      dateKey: input?.dateKey ?? null,
      subject,
      topic,
      lessonData: validation.data,
      model,
    });
  } catch (error) {
    log("ai_save_failed", { model, error_type: String(error?.message ?? error).slice(0, 80) });
    // A aula ainda serve para esta sessao: devolve sem cache.
    return json({ lesson: validation.data, id: null, cached: false, saveFailed: true, model }, 200, req);
  }

  return json({ lesson: saved?.lesson_data ?? validation.data, id: saved?.id ?? null, cached: false, model }, 200, req);
});

