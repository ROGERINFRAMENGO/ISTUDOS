import { authenticate, handleOptions, json } from "./_http.js";
import { validateLesson } from "./_schemas.js";
import { buildLessonPrompt, buildCustomLessonPrompt } from "./_prompts.js";
import { buildPerformance, createDb, lessonCacheKey } from "./_db.js";
import { AI_PRIMARY_MODEL, AI_FALLBACK_MODEL } from "./_ai_config.js";
import { requestJson, AiError } from "./_nvidia.js";
// FASE D. groqContent.js e separado de _shared/groq.js (que e do
// Tutor) de proposito: nenhum dos dois importa o outro, e a chave
// chega por parametro.
import { gerarConteudoEstruturado } from "./_groqContent.js";

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
      first = await requestJson(apiKey, { messages, temperature: 0.55, maxTokens: MAX_TOKENS, model });
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
        });
        if (r.ok) return r;
        ultimoErro = r;
        log("custom_ai_error", { kind: r.kind, status: r.status, tentativa: t + 1, modelo });
        if (!TRANSITORIO.has(r.kind) || t === CUSTOM_TENTATIVAS_TRANSIENT) return null;
        // Espera maior para cota: martelar um limite por minuto
        // esgotado so piora. A espera cresce a cada tentativa.
        await dormir(r.kind === "quota_minuto" ? 8000 * (t + 1) : 1500 * (t + 1));
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
      const correcao = [
        user, "",
        "SUA RESPOSTA ANTERIOR FOI REJEITADA. Corrija exatamente estes pontos e devolva o JSON inteiro de novo:",
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

  // Modelo principal (rapido) e, se falhar, o fallback de qualidade.
  // So cai no fallback quando faz sentido: erro do provider/timeout ou
  // aula que nao passou no schema depois da correcao.
  const chain = input?.forceModel
    ? [String(input.forceModel)]
    : input?.noFallback
      ? [AI_PRIMARY_MODEL]
      : [...new Set([AI_PRIMARY_MODEL, AI_FALLBACK_MODEL].filter(Boolean))];

  let validation = null;
  let model = chain[0];
  let lastError = null;
  let usedFallback = false;
  let lastDetail = { msg: "", detail: "" };

  // Orcamento de tempo: o gateway corta em 150s. Nao comecamos o fallback
  // se ja gastamos tempo demais, e assim o principal rapido nunca vira
  // "500 sem corpo" por causa do modelo lento de fallback.
  const TIME_BUDGET_MS = 130000;
  const startedAll = Date.now();

  for (let i = 0; i < chain.length; i += 1) {
    const candidate = chain[i];
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

  if (!validation) {
    return json(
      {
        error: "ai_unavailable",
        message: "A IA nao respondeu agora. Sua aula anterior continua salva.",
        detail: String(lastError?.message ?? "sem resposta"),
        debug_last: String(lastError?.detail ?? "").slice(0, 300),
        chain_tried: chain,
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

