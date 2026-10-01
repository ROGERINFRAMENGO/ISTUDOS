// ============================================================
// groq-bench — benchmark de conteudo (aulas e quizzes) via Groq.
// NAO faz parte do site. NAO entra no bundle do cliente.
//
// REGRA ABSOLUTA DESTA FUNCAO:
// - Usa EXCLUSIVAMENTE o secret GROQ_CONTENT_API_KEY. O GROQ_API_KEY
//   do TutorChat NAO e lido aqui em nenhuma hipotese.
// - Nao grava NADA no banco. Nada em generated_lessons, nada em
//   generated_quizzes, nada em app_state. A resposta volta para o
//   orquestrador, que salva em disco (.tmp-bench/), fora do app.
// - Nao altera o TutorChat, o cronograma nem os quizzes da Anna.
// - Nao devolve a chave em log, resposta ou erro.
//
// Body: { modo: "catalogo" | "aula" | "quiz",
//         modelo: "<id do modelo do catalogo>",
//         schemaEstrito: true|false,
//         input: <payload no mesmo formato que o app envia> }
//
// O PROMPT e o VALIDADOR sao os de producao: buildLessonPrompt(),
// buildQuizPrompt(), validateLesson() e validateQuiz(). Nenhum modelo
// recebe promptMelhor que outro.
// ============================================================

import { authenticate, handleOptions, json } from "./_http.js";
import { validateLesson, validateQuiz } from "./_schemas.js";
import { buildLessonPrompt, buildQuizPrompt } from "./_prompts.js";

// ------------------------------------------------------------
// Endpoint declarado AQUI: ai_config.js nao exporta uma base de
// conteudo, e mexer na configuracao do TutorChat esta fora de
// qualquer discussao nesta etapa.
// ------------------------------------------------------------
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** A credencial de CONTEUDO. Nada mais e lido deste arquivo. */
function contentKey() {
  return Deno.env.get("GROQ_CONTENT_API_KEY") ?? "";
}

/** A chave nunca aparece em resposta nem em log. */
function redact(text, apiKey) {
  let s = String(text ?? "");
  if (apiKey) s = s.split(apiKey).join("[REDACTED_KEY]");
  s = s.replace(/gsk_[0-9A-Za-z]{10,}/g, "[REDACTED_KEYLIKE]");
  return s.replace(/\s+/g, " ").trim().slice(0, 400);
}

/**
 * Cabecalhos de cota. A Groq expoe o que resta no bucket, entao
 * registrar isso e obrigatorio para diferenciar "modelo ruim" de
 * "conta sem cota".
 */
function rateHeaders(res) {
  const pega = (n) => res.headers?.get?.(n) ?? null;
  return {
    limit_req: pega("x-ratelimit-limit-requests"),
    restante_req: pega("x-ratelimit-remaining-requests"),
    limit_tok: pega("x-ratelimit-limit-tokens"),
    restante_tok: pega("x-ratelimit-remaining-tokens"),
    reset_req: pega("x-ratelimit-reset-requests"),
    reset_tok: pega("x-ratelimit-reset-tokens"),
    retry_after: pega("retry-after"),
  };
}
// ------------------------------------------------------------
// SCHEMAS PARA STRUCTURED OUTPUT (adaptador DO BENCHMARK)
// ------------------------------------------------------------
// O schema oficial da aula e um JSON livre: e o que os modelos da
// NVIDIA produzem. O modo estrito da Groq exige outras coisas:
//   * TODAS as propriedades dentro de "required"
//   * "additionalProperties": false em todo objeto
//   * "type" sempre presente
// Entao este e um adaptador: a MESMA estrutura semantica, mais as
// restricoes que o modo estrito cobra. O schema oficial NAO foi
// alterado, e o validateLesson() continua sendo o de producao e
// continua recebendo exatamente o mesmo objeto.
// ------------------------------------------------------------
const STRICT_LESSON = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    introduction: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          examples: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                problem: { type: "string" },
                solution: { type: "string" },
                explanation: { type: "string" },
              },
              required: ["problem", "solution", "explanation"],
            },
          },
        },
        required: ["title", "explanation", "examples"],
      },
    },
    guidedPractice: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          hint: { type: "string" },
          answer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["question", "hint", "answer", "explanation"],
      },
    },
    commonMistakes: { type: "array", items: { type: "string" } },
    summary: { type: "array", items: { type: "string" } },
  },
  required: ["title", "objectives", "introduction", "sections", "guidedPractice", "commonMistakes", "summary"],
};

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
// ------------------------------------------------------------
// CHAMADA (com instrumentacao de cota e de latencia)
// ------------------------------------------------------------
function lerErro(data, bruto) {
  const raw = data?.error?.message ?? data?.message ?? data?.error ?? bruto ?? "";
  return (typeof raw === "string" ? raw : JSON.stringify(raw)).replace(/\s+/g, " ").slice(0, 300);
}

/**
 * Uma chamada a Groq, sem retry: o retry fica no orquestrador, para
 * contar tentativas do mesmo jeito que no benchmark NVIDIA.
 *
 * Com schemaEstrito, usa response_format json_schema strict=true. Sem
 * isso, usa response_format json_object (o mais perto do modo livre).
 */
async function chamar(apiKey, { modelo, system, user, schemaEstrito, schema, temperatura, maxTokens, timeoutMs, reasoning }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body = {
    model: modelo,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: temperatura,
    max_tokens: maxTokens,
    stream: false,
  };
  // RACIONAL: os modelos gpt-oss sao de raciocinio e, sem limite, gastam
  // ~4000 tokens pensando (medido: 4031 de 8994 tokens). A producao
  // desliga o raciocinio das aulas (enable_thinking:false no lado
  // NVIDIA), entao "low" here e o que aproxima o comportamento. E o
  // parametro e por MODELO, nunca uma vantagem no prompt.
  if (reasoning) body.reasoning_effort = reasoning;
  if (schemaEstrito && schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schema === STRICT_QUIZ ? "quiz" : "aula", strict: true, schema },
    };
  } else {
    body.response_format = { type: "json_object" };
  }

  let res;
  try {
    res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      error_kind: error?.name === "AbortError" ? "timeout" : "rede",
      http: 0, ms: Date.now() - started, rate: null,
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
    const msg = lerErro(data, bruto);
    // CLASSIFICACAO IMPORTANTE: nem todo 400 e "schema rejeitado".
    // O modo estrito da Groq devolve 400 tambem quando o modelo ficou
    // sem orçamento antes de fechar o documento:
    //   "max completion tokens reached before generating a valid document"
    // Isso é TRUNCAMENTO, nao incapacidade de schema. Tratar como
    // schema_error esconderia exatamente a causa que importa.
    const semOrcamento = /max completion tokens reached|truncated to fit max_completion_tokens/i.test(msg);
    const kind = semOrcamento ? "truncamento_orcamento"
      : res.status === 429 ? "rate_limit"
        : res.status === 400 ? "schema_error"
          : res.status === 401 || res.status === 403 ? "auth_error"
            : res.status >= 500 ? "provider_error"
              : "http_error";
    return { ok: false, error_kind: kind, http: res.status, ms, rate, erro: redact(msg, apiKey) };
  }

  const choice = data?.choices?.[0];
  const finish = choice?.finish_reason ?? null;
  const texto = String(choice?.message?.content ?? "");
  // O raciocinio de modelos como o gpt-oss vem em campo proprio.
  const raciocinio = String(choice?.message?.reasoning ?? choice?.message?.reasoning_content ?? "");

  return {
    ok: true,
    http: res.status,
    ms,
    rate,
    finish,
    // MAX_TOKENS aqui e truncamento de verdade: o modelo parou porque
    // acabou o orcamento, e nao porque terminou.
    truncado: finish === "length",
    chars: texto.length,
    raciocinio_chars: raciocinio.length,
    usage: {
      prompt: data?.usage?.prompt_tokens ?? null,
      saida: data?.usage?.completion_tokens ?? null,
      total: data?.usage?.total_tokens ?? null,
      raciocinio: data?.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    },
    texto,
  };
}

// Extrai JSON de uma resposta possivelmente cercada de cercas de codigo.
function extrairJson(texto) {
  const limpo = String(texto ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return { ok: true, data: JSON.parse(limpo) }; } catch { /* tenta o bloco */ }
  const i = limpo.indexOf("{");
  const j = limpo.lastIndexOf("}");
  if (i > -1 && j > i) {
    try { return { ok: true, data: JSON.parse(limpo.slice(i, j + 1)) }; } catch { /* falha mesmo */ }
  }
  return { ok: false, data: null };
}
const len = (v) => (Array.isArray(v) ? v.length : 0);

function metricasAula(a) {
  const secs = Array.isArray(a?.sections) ? a.sections : [];
  const chars = secs.map((s) => String(s?.explanation ?? "").length);
  return {
    secoes: secs.length,
    exemplos: secs.reduce((n, s) => n + len(s?.examples), 0),
    exercicios: len(a?.guidedPractice),
    errosComuns: len(a?.commonMistakes),
    resumo: len(a?.summary),
    objetivos: len(a?.objectives),
    mediaExplicacao: chars.length ? Math.round(chars.reduce((x, y) => x + y, 0) / chars.length) : 0,
    menorExplicacao: chars.length ? Math.min(...chars) : 0,
    charsTotal: JSON.stringify(a ?? {}).length,
  };
}

function metricasQuiz(q) {
  const qs = Array.isArray(q?.questions) ? q.questions : [];
  return {
    questoes: qs.length,
    alternativasMedias: qs.length
      ? Math.round(qs.reduce((n, x) => n + len(x?.options), 0) / qs.length) : 0,
    comExplicacao: qs.filter((x) => String(x?.explanation ?? "").trim().length >= 20).length,
    comSkill: qs.filter((x) => String(x?.skill ?? "").trim().length > 0).length,
    niveis: [...new Set(qs.map((x) => String(x?.difficulty ?? "-").toLowerCase()))].sort(),
    charsTotal: JSON.stringify(q ?? {}).length,
  };
}

// ============================================================
// MODO 1: CATALOGO REAL de modelos desta credencial
// ============================================================
async function catalogo(apiKey) {
  const started = Date.now();
  const res = await fetch(`${GROQ_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const ms = Date.now() - started;
  const rate = rateHeaders(res);
  const bruto = await res.text();
  let data = null;
  try { data = JSON.parse(bruto); } catch { /* nao-JSON */ }

  if (!res.ok) {
    return { ok: false, http: res.status, ms, rate, erro: redact(lerErro(data, bruto), apiKey) };
  }
  const modelos = (data?.data ?? []).map((m) => ({
    id: m.id,
    contexto: m.context_window ?? null,
    max_saida: m.max_completion_tokens ?? null,
    ativo: m.active ?? null,
    dono: m.owned_by ?? null,
    criado: m.created ?? null,
  }));
  return {
    ok: true,
    http: res.status,
    ms,
    rate,
    total: modelos.length,
    familias: [...new Set(modelos.map((m) => String(m.id).split("/")[0] ?? "?"))].sort(),
    modelos: modelos.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
// ============================================================
// MODOS 2 e 3: AULA e QUIZ
// ============================================================
Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized" }, 401, req);

  const body = await req.json().catch(() => ({}));
  const apiKey = contentKey();
  if (!apiKey) return json({ error: "sem_credencial_conteudo" }, 503, req);

  const modo = String(body.modo ?? "catalogo");
  if (modo === "catalogo") return json(await catalogo(apiKey), 200, req);

  const modelo = String(body.modelo ?? "").trim();
  if (!modelo) return json({ error: "modelo_obrigatorio" }, 400, req);

  const input = body.input ?? {};
  const schemaEstrito = body.schemaEstrito !== false;
  const ehQuiz = modo === "quiz";
  // "low" e o padrao: medido, o gpt-oss gasta ~4000 tokens raciocinando
  // sem limite, e a cota e de 8000 TPM. O valor pode ser trocado pelo
  // orquestrador para medir outros niveis.
  const reasoning = body.reasoning === null ? null : (body.reasoning ?? "low");

  // Prompt e VALIDADOR sao os de producao, sem adaptacao por modelo.
  const { system, user } = ehQuiz ? buildQuizPrompt(input) : buildLessonPrompt(input);
  const schema = ehQuiz ? STRICT_QUIZ : STRICT_LESSON;
  // ORCAMENTO: a P1C.2 (Gemini) ja mostrou que teto pequeno produz
  // "vazio" com HTTP 200; aqui o mesmo efeito aparece como HTTP 400 com
  // "max completion tokens reached". Os modelos gpt-oss gastam tokens
  // raciocinando e isso conta no mesmo teto, entao a aula precisa de
  // folga real. 16384 e o menor valor que comfortably cabe a P1A.
  const teto = Number(body.maxTokens) || (ehQuiz ? 8192 : 16384);

  const base = { modo, modelo, schemaEstrito, maxTokens: teto, reasoning: reasoning ?? null, promptChars: String(system).length + String(user).length };

  const primeira = await chamar(apiKey, {
    modelo, system, user, schemaEstrito, schema, reasoning,
    temperatura: ehQuiz ? 0.5 : 0.55, maxTokens: teto, timeoutMs: 120000,
  });

  if (!primeira.ok) {
    return json({ ...base, ok: false, json_ok: false, validate_ok: false, ...primeira }, 200, req);
  }

  const parse = extrairJson(primeira.texto);
  if (!parse.ok) {
    return json({
      ...base, ok: true, json_ok: false, validate_ok: false, error_kind: "json_error",
      http: primeira.http, ms: primeira.ms, rate: primeira.rate,
      finish: primeira.finish, truncado: primeira.truncado,
      usage: primeira.usage, chars: primeira.chars,
      erro: redact(primeira.texto.slice(-400), apiKey),
    }, 200, req);
  }

  // O MESMO validador de producao, sem adaptacao por modelo.
  const valida = (d) => (ehQuiz ? validateQuiz(d, input) : validateLesson(d, input));
  const primeiraValid = valida(parse.data);

  // Mesma rodada de correcao que generate-lesson e generate-quiz fazem
  // em producao. Vale para todos os modelos, sem excecao.
  let valid = primeiraValid;
  let correcao = null;
  if (!primeiraValid.ok) {
    const promptCorrecao = [
      user, "",
      "SUA RESPOSTA ANTERIOR FOI REJEITADA. Corrija exatamente estes pontos e devolva o JSON inteiro de novo:",
      primeiraValid.errors.slice(0, 12).map((e) => `- ${e}`).join("\n"),
    ].join("\n");
    const segunda = await chamar(apiKey, {
      modelo, system, user: promptCorrecao, schemaEstrito, schema, reasoning,
      temperatura: 0.2, maxTokens: teto, timeoutMs: 120000,
    });
    correcao = {
      tentou: true, ok: segunda.ok, error_kind: segunda.error_kind ?? null,
      http: segunda.http ?? 0, ms: segunda.ms ?? null,
    };
    if (segunda.ok) {
      const p2 = extrairJson(segunda.texto);
      if (p2.ok) {
        const v2 = valida(p2.data);
        valid = v2;
        correcao.validate_ok = v2.ok;
        correcao.errors = v2.ok ? [] : v2.errors.slice(0, 12);
      } else {
        correcao.json_ok = false;
      }
    }
  }

  const saida = valid.ok ? valid.data : parse.data;

  return json({
    ...base,
    ok: true,
    json_ok: true,
    validate_ok: valid.ok,
    validate_errors: valid.ok ? [] : valid.errors.slice(0, 12),
    validate_ok_1a: primeiraValid.ok,
    validate_errors_1a: primeiraValid.ok ? [] : primeiraValid.errors.slice(0, 6),
    correcao,
    http: primeira.http,
    ms: primeira.ms,
    rate: primeira.rate,
    finish: primeira.finish,
    truncado: primeira.truncado,
    usage: primeira.usage,
    raciocinio_chars: primeira.raciocinio_chars,
    metricas: ehQuiz ? metricasQuiz(saida) : metricasAula(saida),
    content: valid.ok ? saida : null,
    bruto_quando_invalido: valid.ok ? null : JSON.stringify(saida).slice(0, 1500),
  }, 200, req);
});