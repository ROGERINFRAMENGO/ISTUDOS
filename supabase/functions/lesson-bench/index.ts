// ============================================================
// lesson-bench — FASE 1C.2: benchmark de qualidade de geracao de aula.
// NAO faz parte do site. NAO entra no bundle do cliente.
//
// REGRA ABSOLUTA: esta funcao nao pode alterar a producao.
// - Nao grava em app_state.sections.aiCache (o cache que a Anna ve).
// - Quando grava em generated_lessons, so grava linhas com cache_key e
//   date_key prefixados em "bench-1c2-", removidas no fim da fase.
// - Nao mexe em cronograma, quiz, simulado nem frontend.
//
// Body: { config: "nvidia-diffusion" | "nvidia-muse" | "gemini-low"
//                 | "gemini-medium",
//         input: <payload do mesmo formato que o app envia> }
//
// As duas regras que sustentam o benchmark:
// 1. O PROMPT e o mesmo para todos: buildLessonPrompt() de producao,
//    sem acrescimo nenhum e sem privilegio para o Gemini.
// 2. O VALIDADOR e o mesmo para todos: validateLesson() de producao,
//    sem nenhuma adaptacao por modelo.
// Só a camada de chamada muda.
// ============================================================

import { authenticate, handleOptions, json } from "../_shared/http.js";
import { requestJson } from "../_shared/nvidia.js";
import { validateLesson } from "../_shared/schemas.js";
import { buildLessonPrompt } from "../_shared/prompts.js";
import { AI_REQUEST_TIMEOUT_MS } from "../_shared/ai_config.js";

// Rotulos internos desta funcao. Nenhum altera producao.
const CONFIGS = {
  "nvidia-diffusion": { provider: "nvidia", model: "google/diffusiongemma-26b-a4b-it", thinking: null },
  "nvidia-muse": { provider: "nvidia", model: "meta/muse-glimmer-30b", thinking: null },
  "gemini-low": { provider: "gemini", model: "gemini-3.8-flash", thinking: "LOW" },
  "gemini-medium": { provider: "gemini", model: "gemini-3.8-flash", thinking: "MEDIUM" },
};

// Prefixo de isolamento: nenhuma chave real de producao começa assim.
const BENCH_PREFIX = "bench-1c2-";

// Declarado AQUI de proposito: ai_config.js nao exporta a base do Gemini e
// o objetivo da fase e nao mexer na configuracao compartilhada.
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** As chaves vivem so em secrets e nunca podem voltar na resposta. */
function redact(text, apiKey) {
  let s = String(text ?? "");
  if (apiKey) s = s.split(apiKey).join("[REDACTED_KEY]");
  s = s.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[REDACTED_KEYLIKE]");
  return s.replace(/\s+/g, " ").trim().slice(0, 400);
}

// ------------------------------------------------------------
// SCHEMA DA AULA PARA O structured OUTPUT DO GEMINI
// ------------------------------------------------------------
// Traducao EXATA do formato canonico LESSON_JSON_SHAPE (title,
// objectives[], introduction, sections[].examples[], guidedPractice[],
// commonMistakes[], summary[]). A unica diferenca em relacao ao JSON
// livre sao os TIPOS em caixa alta, dialeto exigido pela API do Gemini.
// Nenhum campo foi acrescentado nem retirado: o validateLesson() recebe
// exatamente o mesmo objeto que receberia do modelo da NVIDIA.
const LESSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Titulo curto e direto, sem citar semana, dia ou bloco." },
    objectives: {
      type: "ARRAY",
      description: "De 3 a 4 objetivos de aprendizagem.",
      items: { type: "STRING" },
    },
    introduction: {
      type: "STRING",
      description: "Abertura de 250 a 600 caracteres, como um professor apresentando o tema.",
    },
    sections: {
      type: "ARRAY",
      description: "De 3 a 5 secoes, cada uma com explicacao profunda e exemplos resolvidos.",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          explanation: {
            type: "STRING",
            description: "De 600 a 1400 caracteres: o que e, por que funciona e como aparece na prova.",
          },
          examples: {
            type: "ARRAY",
            description: "De 1 a 2 exemplos resolvidos, com enunciado cientificamente correto.",
            items: {
              type: "OBJECT",
              properties: {
                problem: { type: "STRING" },
                solution: { type: "STRING" },
                explanation: { type: "STRING" },
              },
              required: ["problem", "solution", "explanation"],
            },
          },
        },
        required: ["title", "explanation", "examples"],
      },
    },
    guidedPractice: {
      type: "ARRAY",
      description: "De 3 a 5 exercicios com pista, resposta e explicacao.",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          hint: { type: "STRING" },
          answer: { type: "STRING" },
          explanation: { type: "STRING" },
        },
        required: ["question", "hint", "answer", "explanation"],
      },
    },
    commonMistakes: {
      type: "ARRAY",
      description: "De 3 a 5 erros tipicos, cada um apontando o ponto exato do erro.",
      items: { type: "STRING" },
    },
    summary: { type: "ARRAY", description: "De 4 a 6 itens de resumo.", items: { type: "STRING" } },
  },
  required: ["title", "objectives", "introduction", "sections", "guidedPractice", "commonMistakes", "summary"],
};
// ------------------------------------------------------------
// CAMADA GEMINI (structured output nativo)
// ------------------------------------------------------------
/**
 * Gera a aula com responseSchema.
 *
 * ORCAMENTO DE TOKENS: no Gemini 3.x, maxOutputTokens e um teto DURO que
 * SOMA os tokens de pensamento com os de saida. Com teto pequeno o modelo
 * gasta tudo pensando e devolve HTTP 200 com finish=MAX_TOKENS e ZERO texto.
 * Isso NAO e cota, NAO e "modelo ruim" e NAO e falha de JSON: e orcamento.
 * Da vem o teto folgado (16384) e o thinking explicitamente controlado.
 */
async function gerarGemini(apiKey, model, thinking, system, user, maxTokens) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150000);

  const body = {
    // O prompt de producao vai inteiro em "user": a API do Gemini trata o
    // system como instrucao, nao como papel separado. O TEXTO e o mesmo.
    contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
    generationConfig: {
      temperature: 0.55,
      topP: 0.9,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingLevel: thinking },
      responseMimeType: "application/json",
      responseSchema: LESSON_SCHEMA,
    },
  };

  let response;
  try {
    response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      provider_error: error?.name === "AbortError" ? "timeout" : "rede",
      status: 0,
      ms: Date.now() - started,
      erro: redact(error?.message ?? error, apiKey),
    };
  }
  clearTimeout(timer);

  const ms = Date.now() - started;
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* corpo nao-JSON */ }

  if (!response.ok) {
    // 429 = cota do free tier (20/min, achado da 1C.1).
    // 503 = "high demand", transitorio e independente da chave.
    // Os dois sao provider_error: nao dizem nada sobre a qualidade da aula.
    const kind = response.status === 429 ? "cota_429"
      : response.status === 503 ? "demanda_503"
        : "http";
    return {
      ok: false,
      provider_error: kind,
      status: response.status,
      ms,
      retry_em_s: raw.match(/retry in\s+([\d.]+)/i)?.[1] ?? null,
      erro: redact(data?.error?.message ?? raw, apiKey),
    };
  }

  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  const texto = (candidate?.content?.parts ?? []).map((p) => p?.text ?? "").join("");

  if (!texto.trim()) {
    return {
      ok: false,
      model_output_error: "vazio",
      status: response.status,
      ms,
      finishReason,
      truncado: finishReason === "MAX_TOKENS",
      erro: `resposta sem texto (finish=${finishReason})`,
    };
  }

  let parsed = null;
  try { parsed = JSON.parse(texto.trim()); } catch { /* JSON quebrado */ }
  if (!parsed) {
    return {
      ok: false,
      model_output_error: "json_invalido",
      status: response.status,
      ms,
      finishReason,
      truncado: finishReason === "MAX_TOKENS",
      erro: redact(texto.slice(-300), apiKey),
    };
  }

  return {
    ok: true,
    data: parsed,
    // JSON com schema NUNCA chega truncado ao meio: ou o objeto fecha, ou a
    // chamada falhou. finish=STOP aqui e a prova de que a aula inteira saiu.
    status: response.status,
    ms,
    finishReason,
    truncado: finishReason === "MAX_TOKENS",
    usage: {
      prompt: data?.usageMetadata?.promptTokenCount ?? null,
      thoughts: data?.usageMetadata?.thoughtsTokenCount ?? null,
      saida: data?.usageMetadata?.candidatesTokenCount ?? null,
      total: data?.usageMetadata?.totalTokenCount ?? null,
    },
  };
}

// ------------------------------------------------------------
// CAMADA NVIDIA (o mesmo requestJson() que a producao usa)
// ------------------------------------------------------------
async function gerarNvidia(apiKey, model, system, user, temperature = 0.55) {
  const started = Date.now();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    const r = await requestJson(apiKey, {
      messages, model, temperature, maxTokens: 3600, timeoutMs: AI_REQUEST_TIMEOUT_MS,
    }, { attempts: 1 }); // 1 tentativa: aqui medimos o MODELO, nao o retry.

    return {
      ok: true,
      data: r.data,
      status: 200,
      ms: Date.now() - started,
      finishReason: r.finishReason,
      // O DiffusionGemma encerra no meio de uma palavra e AINDA reporta
      // "stop" (achado de 29/09). Por isso o truncamento e medido pelo
      // FORMATO (metrics), e nunca pelo finishReason.
      truncado: false,
      usage: {
        prompt: r.usage?.prompt_tokens ?? null,
        thoughts: null,
        saida: r.usage?.completion_tokens ?? null,
        total: r.usage?.total_tokens ?? null,
      },
    };
  } catch (error) {
    const ms = Date.now() - started;
    const status = error?.status ?? 0;
    if (error?.message === "ai_timeout") {
      return { ok: false, provider_error: "timeout", model_output_error: null, status: 504, ms };
    }
    if (error?.message === "malformed_json") {
      return {
        ok: false,
        model_output_error: "json_invalido",
        status: 502,
        ms,
        // O fim do texto e onde o modelo estraga o JSON; sem isso nao da
        // para dizer SE foi corte ou besteira.
        erro: redact(error?.detail, apiKey),
      };
    }
    return {
      ok: false,
      provider_error: `http_${status || "erro"}`,
      model_output_error: null,
      status,
      ms,
      erro: redact(error?.detail ?? error?.message, apiKey),
    };
  }
}
// ------------------------------------------------------------
// METRICAS (mesmo codigo para qualquer gerador)
// ------------------------------------------------------------
const len = (value) => (Array.isArray(value) ? value.length : 0);

function metricas(aula) {
  const sections = Array.isArray(aula?.sections) ? aula.sections : [];
  const chars = sections.map((s) => String(s?.explanation ?? "").length);
  const completa = len(aula?.summary) > 0 && len(aula?.commonMistakes) > 0 && len(aula?.guidedPractice) >= 3;
  return {
    secoes: sections.length,
    exemplos: sections.reduce((n, s) => n + len(s?.examples), 0),
    exercicios: len(aula?.guidedPractice),
    errosComuns: len(aula?.commonMistakes),
    resumo: len(aula?.summary),
    objetivos: len(aula?.objectives),
    mediaExplicacao: chars.length ? Math.round(chars.reduce((a, b) => a + b, 0) / chars.length) : 0,
    menorExplicacao: chars.length ? Math.min(...chars) : 0,
    charsTotal: JSON.stringify(aula ?? {}).length,
    // Truncamento REAL: a aula prometeu campos e veio sem eles. Esta e a
    // metrica que pegava o DiffusionGemma, apesar do finish="stop".
    truncado: !completa,
  };
}

// ------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------
// ------------------------------------------------------------
// MODO DIAGNOSTICO "carga": isola QUAL parte da requisicao o
// free tier esta recusando com 503 "high demand".
//
// Variando uma coisa por vez:
//   A  prompt curto  + schema pequeno + 2048   (controle, sabemos que responde)
//   B  prompt curto  + schema completo + 8192
//   C  prompt completo + schema completo + 8192  (o que esta falhando)
//   D  prompt completo + schema pequeno + 8192
//   E  prompt completo + sem schema  + 8192
//   F  prompt completo + schema completo + 2048
//
// Se so C e E falharem, o problema e o schema grande. Se so C e F
// falharem, e o teto. Se A falhar tambem, e congestao geral do modelo.
// Uma chamada, seis subtestes, sem rajada (3s entre eles).
// ------------------------------------------------------------
const SCHEMA_MINIMO = {
  type: "OBJECT",
  properties: { ok: { type: "BOOLEAN" } },
  required: ["ok"],
};

async function cargaGemini(apiKey, system, user) {
  const curto = "Responda em JSON com o campo ok=true.";
  const casos = [
    { nome: "A curto+schema pequeno+2048", p: curto, s: SCHEMA_MINIMO, t: 2048 },
    { nome: "B curto+schema completo+8192", p: curto, s: LESSON_SCHEMA, t: 8192 },
    { nome: "C completo+schema completo+8192", p: `${system}\n\n${user}`, s: LESSON_SCHEMA, t: 8192 },
    { nome: "D completo+schema pequeno+8192", p: `${system}\n\n${user}`, s: SCHEMA_MINIMO, t: 8192 },
    { nome: "E completo+sem schema+8192", p: `${system}\n\n${user}`, s: null, t: 8192 },
    { nome: "F completo+schema completo+2048", p: `${system}\n\n${user}`, s: LESSON_SCHEMA, t: 2048 },
  ];

  const resultados = [];
  for (const c of casos) {
    if (resultados.length) await new Promise((r) => setTimeout(r, 3000));
    const gen = {
      temperature: 0.55,
      maxOutputTokens: c.t,
      thinkingConfig: { thinkingLevel: "LOW" },
    };
    if (c.s) {
      gen.responseMimeType = "application/json";
      gen.responseSchema = c.s;
    }
    const t0 = Date.now();
    try {
      const r = await fetch(`${GEMINI_BASE_URL}/gemini-3.8-flash:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: c.p }] }],
          generationConfig: gen,
        }),
      });
      const raw = await r.text();
      let d = null;
      try { d = JSON.parse(raw); } catch { /* nao-JSON */ }
      const texto = (d?.candidates?.[0]?.content?.parts ?? []).map((x) => x?.text ?? "").join("");
      resultados.push({
        caso: c.nome,
        http: r.status,
        ms: Date.now() - t0,
        ok: r.ok,
        finish: d?.candidates?.[0]?.finishReason ?? null,
        chars: texto.length,
        erro: r.ok ? null : redact(d?.error?.message ?? raw, apiKey).slice(0, 160),
        // Com schema+8192 a resposta e uma aula enorme: nao guardamos o texto.
        amostra: r.ok ? texto.slice(0, 90) : null,
      });
    } catch (error) {
      resultados.push({ caso: c.nome, http: 0, ms: Date.now() - t0, ok: false, erro: redact(error?.message, apiKey).slice(0, 160) });
    }
  }
  return resultados;
}

/**
 * Rodada de CORRECAO — mesma logica do generate-lesson de producao.
 *
 * A producao, quando o JSON vem dentro do formato mas reprova no
 * validateLesson(), manda UMA chamada extra listando os erros. Medir sem
 * essa rodada mede o modelo nu e nao o gerador: a correcao existe no
 * fluxo real e ela se aplica igual a qualquer provider.
 *
 * Aplica-se a TODOS sem excecao: nenhum config ganha nem perde.
 */
function montarCorrecao(userOriginal, errors) {
  return [
    userOriginal,
    "",
    "SUA RESPOSTA ANTERIOR FOI REJEITADA. Corrija exatamente estes pontos e devolva o JSON inteiro de novo:",
    errors.slice(0, 12).map((e) => `- ${e}`).join("\n"),
  ].join("\n");
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized" }, 401, req);

  const body = await req.json().catch(() => ({}));
  const configName = String(body.config ?? "");
  const config = CONFIGS[configName];
  if (!config) return json({ error: "config_desconhecida", configs: Object.keys(CONFIGS) }, 400, req);

  const input = body.input ?? {};
  const { system, user } = buildLessonPrompt(input);

  const apiKeyGemini = () => {
  // A e B sao CREDENCIAIS do mesmo modelo, nao modelos diferentes: a
  // 1C.1 comprovou que elas tem cotas independentes. Como a qualidade
  // depende do modelo e nao da chave, o benchmark pode usar qualquer
  // delas. O parametro existe porque a chave A pode estar com a cota
  // DIARIA esgotada (RPD, que so reseta a meia-noite do Pacifico).
  const nome = String(body.chave ?? "A").toUpperCase();
  return nome === "B"
    ? (Deno.env.get("GEMINI_API_KEY_B") ?? "")
    : (Deno.env.get("GEMINI_API_KEY_A") ?? "");
};

const apiKey = config.provider === "gemini"
  ? apiKeyGemini()
  : (Deno.env.get("NVIDIA_API_KEY") ?? "");
  if (!apiKey) return json({ error: "provider_sem_chave", provider: config.provider }, 503, req);

  // Modo diagnostico: nao gera aula, so mede o que o free tier aceita.
  if (body.modo === "carga") {
    const keyGemini = Deno.env.get("GEMINI_API_KEY_A") ?? "";
    if (!keyGemini) return json({ error: "sem_chave_gemini" }, 503, req);
    return json({ modo: "carga", resultados: await cargaGemini(keyGemini, system, user) }, 200, req);
  }

  const GEMINI_MAX_TOKENS = 8192;
  const TETO_MIN = 2048;
  const TETO_MAX = 65536;

  const started = Date.now();
  // O teto e parametrizado porque o free tier pode nao ter capacidade para
  // o teto maximo (achado: 16384 deu 503 em 5 de 5 chamadas, enquanto
  // 8192 respondeu). O valor padrao ja cabe a aula inteira com folga.
  const teto = Math.min(TETO_MAX, Math.max(TETO_MIN, Number(body.maxTokens) || GEMINI_MAX_TOKENS));
  const gerado = config.provider === "gemini"
    ? await gerarGemini(apiKey, config.model, config.thinking, system, user, teto)
    : await gerarNvidia(apiKey, config.model, system, user);

  const base = {
    config: configName,
    provider: config.provider,
    model: config.model,
    thinking: config.thinking,
    subject: input.subject ?? null,
    topic: input.topic ?? null,
    promptChars: String(system).length + String(user).length,
    maxTokens: config.provider === "gemini" ? teto : 3600,
    totalMs: Date.now() - started,
  };

  // --- Falha de provider: nada a dizer sobre a qualidade da aula.
  if (!gerado.ok) {
    return json({
      ...base,
      ok: false,
      json_ok: false,
      validate_ok: false,
      provider_error: gerado.provider_error ?? null,
      model_output_error: gerado.model_output_error ?? null,
      http: gerado.status ?? 0,
      truncado: gerado.truncado ?? false,
      finish: gerado.finishReason ?? null,
      usage: gerado.usage ?? null,
      erro: gerado.erro ?? null,
      retry_em_s: gerado.retry_em_s ?? null,
    }, 200, req);
  }

  // --- O MESMO validateLesson() de producao, sem nenhuma adaptacao.
  const primeira = validateLesson(gerado.data, input);

  // --- Rodada de correcao (identica em producao, identica para todos).
  let validation = primeira;
  let correcao = null;
  if (!primeira.ok) {
    const promptCorrecao = montarCorrecao(user, primeira.errors);
    const segunda = config.provider === "gemini"
      ? await gerarGemini(apiKey, config.model, config.thinking, system, promptCorrecao, teto)
      : await gerarNvidia(apiKey, config.model, system, promptCorrecao, 0.2);
    correcao = {
      tentou: true,
      ok: segunda.ok,
      provider_error: segunda.provider_error ?? null,
      model_output_error: segunda.model_output_error ?? null,
      http: segunda.status ?? 0,
      ms: segunda.ms ?? null,
      finish: segunda.finishReason ?? null,
    };
    if (segunda.ok) {
      validation = validateLesson(segunda.data, input);
      correcao.validate_ok = validation.ok;
      correcao.errors = validation.ok ? [] : validation.errors.slice(0, 12);
    }
  }

  const aulaFinal = validation.ok ? validation.data : gerado.data;

  // Grava em generated_lessons SO com o prefixo de isolamento. Esta funcao
  // nao le nem escreve no cache que a aluna ve (app_state.sections.aiCache).
  let salvoId = null;
  let saveFailed = false;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const resposta = await fetch(`${url}/rest/v1/generated_lessons`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: auth.userId,
        cache_key: [input.curriculumVersion || "v1", BENCH_PREFIX, input.dateKey ?? "x", configName, input.subject, input.topic].join("|").toLowerCase(),
        curriculum_version: input.curriculumVersion ?? "v1",
        week: input.week ?? null,
        day: input.day ?? null,
        // dateKey isolado: e ele que impede qualquer colisao com o app real.
        date_key: `${BENCH_PREFIX}${input.dateKey ?? "x"}`,
        subject: input.subject ?? null,
        topic: input.topic ?? null,
        lesson_data: validation.data ?? gerado.data,
        model: `${configName}:${config.model}`,
      }),
    });
    if (!resposta.ok) saveFailed = true;
    else salvoId = (await resposta.json())?.[0]?.id ?? null;
  } catch {
    saveFailed = true;
  }

  return json({
    ...base,
    ok: true,
    json_ok: true,
    validate_ok: validation.ok,
    validate_errors: validation.ok ? [] : validation.errors.slice(0, 12),
    // A primeira tentativa separada da correcao: sem isso nao da para
    // dizer se o modelo acerta sozinho ou se so acerta depois de ser
    // corrigido. Os dois numeros interessam e contam coisas diferentes.
    validate_ok_1a: primeira.ok,
    validate_errors_1a: primeira.ok ? [] : primeira.errors.slice(0, 6),
    correcao,
    http: gerado.status ?? 200,
    truncado: gerado.truncado ?? false,
    finish: gerado.finishReason ?? null,
    usage: gerado.usage ?? null,
    metricas: metricas(aulaFinal),
    // Guarda o bruto quando reprova: sem isso nao da para dizer se o
    // modelo errou o CONTEUDO ou so a FORMA.
    bruto_quando_invalido: validation.ok ? null : JSON.stringify(gerado.data).slice(0, 1500),
    lesson: validation.ok ? validation.data : null,
    salvoId,
    saveFailed,
  }, 200, req);
});
