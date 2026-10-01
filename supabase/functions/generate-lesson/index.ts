import { authenticate, handleOptions, json } from "../_shared/http.js";
import { requestJson, AiError } from "../_shared/nvidia.js";
import { validateLesson } from "../_shared/schemas.js";
import { buildLessonPrompt } from "../_shared/prompts.js";
import { buildPerformance, createDb, lessonCacheKey } from "../_shared/db.js";
import { AI_PRIMARY_MODEL, AI_FALLBACK_MODEL } from "../_shared/ai_config.js";

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
      validation.errors.slice(0, 12).map((error) => `- ${error}`).join("\n"),
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

