import { authenticate, handleOptions, json } from "./_http.js";
import { validateQuiz } from "./_schemas.js";
import { buildQuizPrompt } from "./_prompts.js";
import { buildPerformance, createDb } from "./_db.js";
import {
  QUIZ_API_KEY_SECRET,
  QUIZ_BACKOFF_MS,
  QUIZ_BASE_URL,
  QUIZ_CONTENT_VERSION,
  QUIZ_MAX_ATTEMPTS,
  QUIZ_MAX_BACKOFF_MS,
  QUIZ_MAX_TOKENS,
  QUIZ_MODEL,
  QUIZ_QUESTION_COUNT,
  QUIZ_REASONING,
  QUIZ_TEMPERATURE,
  QUIZ_TIMEOUT_MS,
} from "./_ai_config.js";

// ============================================================
// generate-quiz
// ------------------------------------------------------------
// Gera o quiz a partir da aula REALMENTE gerada (lida do banco pelo
// id, com RLS), valida cada questao e so salva se estiver tudo certo.
//
// FASE A (01/10/2026): este endpoint estava no codigo mas NUNCA foi
// implantado, e o frontend nao o chamava (a aluna caia no quiz local
// de src/data/lessonQuiz.js). Agora ele existe e e o caminho principal,
// com DUAS mudancas em relacao a versao antiga:
//
// 1. PROVIDER: NVIDIA -> GROQ, modelo openai/gpt-oss-120b (vencedor do
//    benchmark FASE 1D, 8/8 no validateQuiz). A chave e a de CONTEUDO
//    (GROQ_CONTENT_API_KEY). A chave do Tutor NAO e lida aqui.
//
// 2. STRUCTURED OUTPUT: response_format json_schema com strict=true,
//    que garante a estrutura das 5 questoes. Estrutura nao e verdade:
//    o validateQuiz() de producao continua rodando em cada resposta.
//
// O que NAO mudou: buildQuizPrompt() e validateQuiz() sao os de
// producao, o cache e por (aula + dificuldade), e nada e gravado se a
// validacao falhar.
//
// REGRA: nao alterar nada do TutorChat aqui.
// ============================================================

// ============================================================
// SCHEMA ESTRITO DO QUIZ
// ------------------------------------------------------------
// O prompt de producao (buildQuizPrompt) descreve o formato em texto
// solto. O modo estrito da Groq exige o mesmo formato em JSON Schema,
// com TODAS as propriedades em "required" e "additionalProperties"
// false em todo objeto. Este e o MESMO formato que a interface consome
// (QUIZ_JSON_SHAPE): id, type, question, options, correctAnswer,
// explanation, difficulty, skill.
//
// Nao e um schema "de benchmark": e o unico caminho do quiz de
// producao. O validateQuiz() continua sendo a authority sobre aceitar
// ou recusar a resposta.
// ============================================================
const STRICT_QUIZ = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctAnswer: { type: "integer" },
          explanation: { type: "string" },
          difficulty: { type: "string" },
          skill: { type: "string" },
        },
        required: ["id", "type", "question", "options", "correctAnswer", "explanation", "difficulty", "skill"],
      },
    },
  },
  required: ["title", "questions"],
};

/** A chave nunca sai do servidor: nem no log, nem na resposta. */
function redact(text, apiKey) {
  let s = String(text ?? "");
  if (apiKey) s = s.split(apiKey).join("[REDACTED_KEY]");
  s = s.replace(/gsk_[0-9A-Za-z]{10,}/g, "[REDACTED_KEYLIKE]");
  return s.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Cabecalhos de cota: registrar o que resta e o que separa "cota" de
 * "o modelo respondeu mal". */
function rateHeaders(res) {
  const pega = (n) => res?.headers?.get?.(n) ?? null;
  return {
    limite_req: pega("x-ratelimit-limit-requests"),
    restante_req: pega("x-ratelimit-remaining-requests"),
    limite_tok: pega("x-ratelimit-limit-tokens"),
    restante_tok: pega("x-ratelimit-remaining-tokens"),
    retry_after: pega("retry-after"),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uma chamada a Groq. Nao repete: o retry fica no laco de cima, para
 * contar tentativas do mesmo jeito em toda a funcao.
 */
async function chamarGroq(apiKey, { system, user }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUIZ_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${QUIZ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: QUIZ_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: QUIZ_TEMPERATURE,
        max_tokens: QUIZ_MAX_TOKENS,
        reasoning_effort: QUIZ_REASONING,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: { name: "quiz", strict: true, schema: STRICT_QUIZ },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      kind: error?.name === "AbortError" ? "timeout" : "rede",
      status: 0,
      ms: Date.now() - started,
      erro: redact(error?.message ?? error, apiKey),
    };
  }
  clearTimeout(timer);

  const ms = Date.now() - started;
  const rate = rateHeaders(res);
  const bruto = await res.text();
  let data = null;
  try { data = JSON.parse(bruto); } catch { /* corpo nao-JSON */ }

  if (!res.ok) {
    const msg = String(data?.error?.message ?? data?.message ?? bruto ?? "");
    // Nem todo 400 e schema rejeitado: com teto curto o modelo fecha o
    // JSON pela metade e a API responde "max completion tokens reached".
    const semOrcamento = /max completion tokens reached|truncated to fit/i.test(msg);
    const kind = semOrcamento ? "truncamento_orcamento"
      : res.status === 429 ? "cota_429"
        : res.status === 400 ? "schema_error"
          : res.status === 401 || res.status === 403 ? "auth_error"
            : res.status >= 500 ? "provider_error"
              : "http_error";
    return { ok: false, kind, status: res.status, ms, rate, erro: redact(msg, apiKey) };
  }

  const choice = data?.choices?.[0];
  const texto = String(choice?.message?.content ?? "");
  let parsed = null;
  if (texto.trim()) {
    try { parsed = JSON.parse(texto.trim()); } catch { /* quebra no JSON */ }
  }
  if (!parsed) {
    return {
      ok: false,
      kind: texto.trim() ? "json_error" : "vazio",
      status: res.status, ms, rate,
      finish: choice?.finish_reason ?? null,
      truncado: choice?.finish_reason === "length",
      erro: texto.trim() ? redact(texto.slice(-250), apiKey) : "resposta sem conteudo",
    };
  }

  return {
    ok: true,
    data: parsed,
    status: res.status,
    ms,
    rate,
    finish: choice?.finish_reason ?? null,
    truncado: choice?.finish_reason === "length",
    usage: {
      prompt: data?.usage?.prompt_tokens ?? null,
      saida: data?.usage?.completion_tokens ?? null,
      total: data?.usage?.total_tokens ?? null,
    },
  };
}

/**
 * Pergunta GENERICA de habito ou tecnica de estudo.
 *
 * O validateQuiz() de producao NAO pega isso: ele so olha formato, nao
 * conteudo. E era exatamente o defeito do quiz local antigo, que
 * respondia "qual e a melhor estrategia de revisao?" para qualquer
 * materia. Este padrao barra o retorno desse defeito, e barra SO ele:
 * nao e regra de estilo, e regra de conteudo.
 */
const GENERIC_PATTERNS = [
  /melhor estrat[eé]gia de (revis|estud|trein)/i,
  /melhor (primeiro )?passo .*(dificil|quando n[aã]o sabe|nao entendo)/i,
  /qual atitude (mant[eé]m|melhora|ajuda)/i,
  /como (voc[eê]|voce) (deve|precisa) (estudar|revisar|organizar)/i,
  /o que (voc[eê]|voce) achou da aula/i,
  /qual a melhor forma de (fixar|reter|memorizar)/i,
];

/** Quais questoes exatamente cairam no padrao generico. */
function questoesGenericas(quiz) {
  const qs = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const achadas = [];
  for (const [i, q] of qs.entries()) {
    const texto = String(q?.question ?? "");
    if (GENERIC_PATTERNS.some((p) => p.test(texto))) achadas.push(`questions[${i}]: "${texto.slice(0, 70)}"`);
  }
  return achadas;
}

/** Log estruturado. NUNCA registra chave, token ou conteudo da aula. */
function log(event, fields = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) {
    return json({ error: "unauthorized", hint: "Ative o login anonimo no Supabase." }, 401, req);
  }

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, req);
  }

  // A credencial de CONTEUDO. A do Tutor (GROQ_API_KEY) nao e lida aqui.
  const apiKey = Deno.env.get(QUIZ_API_KEY_SECRET) ?? "";
  if (!apiKey) {
    return json({
      error: "quiz_key_missing",
      message: `Defina o secret ${QUIZ_API_KEY_SECRET}.`,
    }, 503, req);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const db = createDb({ url, anonKey, token: auth.token });

  const difficulty = String(input?.difficulty ?? "medium").toLowerCase();
  const lessonId = input?.lessonId ? String(input.lessonId) : null;

  // 1. A base do quiz e a aula salva no banco (nunca um texto solto do front).
  let lesson = null;
  let subject = String(input?.subject ?? "").trim();
  let topic = String(input?.topic ?? "").trim();
  try {
    const row = lessonId ? await db.findLessonById(lessonId) : null;
    if (row?.lesson_data) {
      lesson = row.lesson_data;
      subject = subject || row.subject;
      topic = topic || row.topic;
    }
  } catch (error) {
    console.warn("[generate-quiz] nao consegui carregar a aula salva", error);
  }
  if (!lesson && input?.lesson && typeof input.lesson === "object") {
    lesson = input.lesson;
    subject = subject || String(input.lesson.subject ?? "");
    topic = topic || String(input.lesson.topic ?? "");
  }
  if (!subject || !topic) return json({ error: "subject_and_topic_required" }, 400, req);

  // 2. Cache: mesma aula + mesma dificuldade = mesmo quiz.
  //
  // A VERSAO do conteudo entra no filtro. A tabela generated_quizzes nao
  // tem coluna de versao (evita migracao), entao a versao viaja dentro do
  // campo "model", que ja existe e e texto. Um quiz gravado por outra
  // versao conta como cache miss e e regerado; as tentativas antigas da
  // aluna NAO sao tocadas, porque vivem em question_attempts.
  const modelTag = `${QUIZ_CONTENT_VERSION}:${QUIZ_MODEL}`;
  if (lessonId && !input?.force) {
    try {
      const cached = await db.findQuiz(lessonId, difficulty);
      if (cached?.quiz_data && String(cached.model ?? "").startsWith(QUIZ_CONTENT_VERSION)) {
        return json({
          quiz: cached.quiz_data,
          id: cached.id,
          cached: true,
          model: cached.model,
          version: QUIZ_CONTENT_VERSION,
        }, 200, req);
      }
      if (cached?.quiz_data) {
        log("quiz_cache_de_outra_versao", {
          lesson_id: lessonId, difficulty,
          modelo_guardado: String(cached.model ?? "").slice(0, 60),
        });
      }
    } catch (error) {
      console.warn("[generate-quiz] falha ao ler o cache", error);
    }
  }

  // 3. Desempenho real para calibrar a dificuldade.
  let performance = input?.studentPerformance ?? {};
  try {
    const attempts = await db.recentAttempts(400);
    const real = buildPerformance(attempts, { subject, topic });
    performance = {
      ...real,
      weakAreas: [...new Set([...(real.weakAreas ?? []), ...(input?.studentPerformance?.weakAreas ?? [])])],
    };
  } catch (error) {
    console.warn("[generate-quiz] sem desempenho real", error);
  }

  const promptInput = {
    ...input,
    subject,
    topic,
    difficulty,
    lesson,
    studentPerformance: performance,
    questionCount: Number(input?.questionCount) || QUIZ_QUESTION_COUNT,
  };
  const { system, user } = buildQuizPrompt(promptInput);

  /**
   * Uma tentativa = chamar + validar. Erro TRANSITORIO (cota, 5xx,
   * timeout, rede) volta; erro permanente (schema, auth) sai na hora,
   * porque repetir so gasta cota para provar a mesma coisa.
   */
  const transitorio = (r) =>
    r.kind === "cota_429" || r.kind === "provider_error"
    || r.kind === "timeout" || r.kind === "rede"
    || r.kind === "json_error" || r.kind === "vazio";

  let parsed = null;
  let validation = null;
  let ultima = null;
  let tentativas = 0;
  const inicioGeracao = Date.now();

  for (let tentativa = 1; tentativa <= QUIZ_MAX_ATTEMPTS; tentativa += 1) {
    tentativas = tentativa;
    const r = await chamarGroq(apiKey, { system, user });
    ultima = r;

    if (!r.ok) {
      log("quiz_call_failed", {
        tentativa, kind: r.kind, http: r.status, ms: r.ms,
        resto_req: r.rate?.restante_req ?? null,
        resto_tok: r.rate?.restante_tok ?? null,
      });
      if (!transitorio(r) || tentativa >= QUIZ_MAX_ATTEMPTS) break;
      // No 429 o retry-after do Groq manda; respeitar evita martelar.
      const espera = Math.min(
        QUIZ_MAX_BACKOFF_MS,
        Math.max(QUIZ_BACKOFF_MS, Number(r.rate?.retry_after ?? 0) * 1000 || QUIZ_BACKOFF_MS * tentativa),
      );
      await sleep(espera);
      continue;
    }

    // Estrutura garantida pelo schema estrito; conteudo garantido pelo
    // validateQuiz() de producao, que roda igual para qualquer provider.
    validation = validateQuiz(r.data, promptInput);

    if (!validation.ok) {
      const genericas = questoesGenericas(r.data);
      log("quiz_validation_failed", {
        tentativa, ms: r.ms, tokens: r.usage?.total ?? null,
        finish: r.finish, truncado: r.truncado,
        errors: validation.errors.slice(0, 4),
        genericas,
      });
      if (tentativa >= QUIZ_MAX_ATTEMPTS) break;
      // Uma unica rodada de correcao, como a producao fazia com a NVIDIA:
      // o modelo recebe os erros exatos e devolve o JSON inteiro.
      const correcao = [
        user,
        "",
        "SUA RESPOSTA ANTERIOR FOI REJEITADA. Corrija exatamente estes pontos e devolva o JSON inteiro de novo:",
        ...validation.errors.slice(0, 12).map((error) => `- ${error}`),
      ].join("\n");
      const segunda = await chamarGroq(apiKey, { system, user: correcao });
      if (segunda.ok) {
        validation = validateQuiz(segunda.data, promptInput);
        if (validation.ok) {
          parsed = segunda.data;
          break;
        }
      }
      await sleep(QUIZ_BACKOFF_MS);
      continue;
    }

    parsed = r.data;
    break;
  }

  log("quiz_result", {
    modelo: QUIZ_MODEL, versao: QUIZ_CONTENT_VERSION, tentativas,
    ok: Boolean(validation?.ok),
    kind_final: ultima?.kind ?? null,
    ms_total: Date.now() - inicioGeracao,
    tokens: ultima?.usage?.total ?? null,
    finish: ultima?.finish ?? null,
    truncado: ultima?.truncado ?? false,
  });

  if (!validation?.ok) {
    const kind = ultima?.kind;
    // O frontend tem fallback LOCAL (getFullLessonQuiz), entao respondemos
    // com um erro claro em vez de inventar quiz: quem decide o fallback e
    // o cliente, e ele nunca fica sem questoes.
    const status = kind === "cota_429" ? 429
      : kind === "auth_error" ? 503
        : 502;
    return json({
      error: "quiz_unavailable",
      message: "O questionario nao pôde ser gerado agora.",
      kind: kind ?? "validacao",
      errors: validation?.errors?.slice(0, 12) ?? null,
    }, status, req);
  }

  if (validation.warnings?.length) console.warn("[generate-quiz]", validation.warnings.join(" | "));

  let saved = null;
  if (lessonId) {
    try {
      saved = await db.saveQuiz({
        userId: auth.userId,
        lessonId,
        subject,
        topic,
        difficulty,
        quizData: validation.data,
        // A versao entra aqui de proposito: e o filtro de cache.
        model: modelTag,
      });
    } catch (error) {
      console.error("[generate-quiz] falha ao salvar", error);
      // A aula ainda serve nesta sessao: devolve sem gravar.
      return json({
        quiz: validation.data, id: null, cached: false, saveFailed: true,
        model: modelTag, version: QUIZ_CONTENT_VERSION,
      }, 200, req);
    }
  }

  return json({
    quiz: saved?.quiz_data ?? validation.data,
    id: saved?.id ?? null,
    cached: false,
    model: modelTag,
    version: QUIZ_CONTENT_VERSION,
  }, 200, req);
});
