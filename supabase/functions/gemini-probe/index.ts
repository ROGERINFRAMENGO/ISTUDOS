// ============================================================
// gemini-probe (FASE 1C.1): DIAGNOSTICO ISOLADO das chaves Gemini.
// ------------------------------------------------------------
// NAO FAZ PARTE DO SITE. NAO SALVA NADA. NAO TOCA PRODUCAO.
// Descobre, SEM expor a chave, para cada secret
// (GEMINI_API_KEY_A / GEMINI_API_KEY_B):
//   - quais modelos a chave pode usar (ListModels);
//   - se gemini-3.8-flash existe e responde;
//   - se ha suporte a structured output (responseSchema);
//   - limites observaveis (429/503, erro de cota);
//   - se A e B sao a MESMA chave (logo, sem quota duplicada).
//
// Seguranca: a chave NUNCA volta na resposta. Devolvemos um
// "fingerprint" (SHA-256 truncado, calculado dentro da funcao) e
// metadados publicos de cota/erro. Todo texto passa por redact(),
// que remove a chave e qualquer padrao tipo AIza...
//
// Body: POST { }
// ============================================================

import { authenticate, handleOptions, json } from "../_shared/http.js";

// Endpoint declarado AQUI, e nao importado de ai_config.js, por um
// motivo concreto: _shared/gemini.js importa GEMINI_BASE_URL de
// ai_config.js, mas esse export NAO existe no fonte (so no bundle
// stale deploy-src/tutor-chat/_ai_config.js). O modulo esta quebrado
// desde a migracao do Tutor para Groq e ninguem notou porque ninguem
// o importa. A probe e isolada: nao mexe na config da producao.
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Fingerprint estavel da chave, sem revelar a chave. */
async function fingerprint(apiKey) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Remove qualquer APARENCIA de chave que possa vazar num body de erro. */
function redact(text, apiKey) {
  let s = String(text ?? "");
  if (apiKey) s = s.split(apiKey).join("[REDACTED_KEY]");
  s = s.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[REDACTED_KEYLIKE]");
  return s.replace(/\s+/g, " ").trim().slice(0, 400);
}

/** Lista os modelos que a chave pode usar. */
async function listModels(apiKey) {
  const started = Date.now();
  try {
    const res = await fetch(`${GEMINI_BASE_URL}?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
    });
    const ms = Date.now() - started;
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* nao-JSON */ }

    if (!res.ok) {
      return { ok: false, http: res.status, ms, erro: redact(data?.error?.message ?? raw, apiKey) };
    }

    const generative = (data?.models ?? [])
      .filter((m) => Array.isArray(m?.supportedGenerationMethods)
        && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m?.name ?? "").replace(/^models\//, ""))
      .sort();

    const familias = [...new Set(
      generative.map((n) => n.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? "?").filter((f) => f !== "?"),
    )].sort();

    return {
      ok: true,
      http: res.status,
      ms,
      total: generative.length,
      familias,
      tem38: generative.includes("gemini-3.8-flash"),
      lista38: generative.filter((n) => n.includes("3.8")),
      amostra: generative.slice(0, 40),
    };
  } catch (error) {
    return { ok: false, http: 0, ms: Date.now() - started, erro: redact(error?.message ?? error, apiKey) };
  }
}

/**
 * generateContent minimo: mede se o modelo existe, se ha cota e se
 * responseSchema (structured output) e aceito.
 *
 * ACHADO DA FASE 1C.1: no Gemini 3.x, maxOutputTokens e um TETO DURO
 * que SOMA tokens de pensamento + tokens de saida. Com maxOutputTokens
 * pequeno o modelo gasta tudo pensando e devolve finishReason=MAX_TOKENS
 * com candidatesTokenCount=null e texto vazio. Por isso o orcamento
 * aqui e alto e o thinking e controlado explicitamente.
 */
async function probeGenerate(apiKey, model, opts = {}) {
  const withSchema = Boolean(opts.withSchema);
  const maxTokens = Number(opts.maxTokens) || 2048;
  const thinking = opts.thinking; // "off" | "low" | undefined(default)
  const started = Date.now();

  const thinkingConfig = thinking === "off"
    ? { thinkingBudget: 0 }
    : thinking === "low"
      ? { thinkingLevel: "LOW" }
      : {};

  const body = {
    contents: [{ role: "user", parts: [{ text: "Responda em JSON com o campo ok=true." }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: maxTokens,
      ...(Object.keys(thinkingConfig).length ? { thinkingConfig } : {}),
      ...(withSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { ok: { type: "BOOLEAN" } },
              required: ["ok"],
            },
          }
        : {}),
    },
  };

  try {
    const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - started;
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* nao-JSON */ }

    if (!res.ok) {
      return {
        ok: false, http: res.status, ms, finish: null,
        erro: redact(data?.error?.message ?? raw, apiKey),
        // 429 traz detalhes de cota: e o que permite identificar
        // projeto/limite quando a chave estoura.
        status: data?.error?.status ?? null,
        quota: data?.error?.details ?? null,
      };
    }

    const cand = data?.candidates?.[0];
    const texto = (cand?.content?.parts ?? []).map((p) => p?.text ?? "").join("");
    let jsonValido = null;
    if (withSchema) {
      try { JSON.parse(texto.trim()); jsonValido = true; } catch { jsonValido = false; }
    }

    return {
      ok: true,
      http: res.status,
      ms,
      modelVersion: data?.modelVersion ?? null,
      finish: cand?.finishReason ?? null,
      chars: texto.length,
      jsonValido,
      preview: redact(texto.slice(0, 120), apiKey),
      usage: {
        prompt: data?.usageMetadata?.promptTokenCount ?? null,
        // thoughtsTokenCount > 0 prova que o modelo gastou orcamento
        // pensando: e a causa do MAX_TOKENS com texto vazio.
        thoughts: data?.usageMetadata?.thoughtsTokenCount ?? null,
        candidates: data?.usageMetadata?.candidatesTokenCount ?? null,
        total: data?.usageMetadata?.totalTokenCount ?? null,
      },
    };
  } catch (error) {
    return { ok: false, http: 0, ms: Date.now() - started, finish: null, erro: redact(error?.message ?? error, apiKey) };
  }
}

/**
 * Schema da aula em responseSchema do Gemini. E a adaptacao MINIMA do
 * schema real (_shared/schemas.js validateLesson): mesmos campos,
 * mesma forma, so convertida para o dialeto do Gemini (type em
 * MAIUSCULAS: OBJECT/ARRAY/STRING/NUMBER, sem $ref, sem minItems).
 *
 * Isto NAO e um schema novo e LIVE em lugar nenhum: e so um teste de
 * compatibilidade para a FASE 1C. Se o Gemini aceitar este formato e
 * devolver JSON valido, o structured output e viavel sem reescrever
 * LessonPage/GeneratedStudy/getLessonDetail/cache/validateLesson.
 */
const LESSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    subject: { type: "STRING" },
    topic: { type: "STRING" },
    introduction: { type: "STRING" },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          explanation: { type: "STRING" },
          examples: {
            type: "ARRAY",
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
    commonMistakes: { type: "ARRAY", items: { type: "STRING" } },
    summary: { type: "STRING" },
  },
  required: [
    "title", "subject", "topic", "introduction",
    "sections", "guidedPractice", "commonMistakes", "summary",
  ],
};

/**
 * Testa o schema REAL da aula contra o Gemini: e a pergunta que
 * decide se o structured output substitui o "faz tudo e reza" do
 * pipeline NVIDIA (causa raiz do truncamento da P1B).
 */
async function probeLessonSchema(apiKey, model) {
  const started = Date.now();
  const body = {
    contents: [{
      role: "user",
      parts: [{ text: "Crie uma aula curtissima sobre materia para o Fundamental II." }],
    }],
    generationConfig: {
      temperature: 0.5,
      // Teto alto: no Gemini 3.x isso cobre pensamento + saida.
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: "LOW" },
      responseMimeType: "application/json",
      responseSchema: LESSON_SCHEMA,
    },
  };

  try {
    const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - started;
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* nao-JSON */ }

    if (!res.ok) {
      return {
        ok: false, http: res.status, ms,
        erro: redact(data?.error?.message ?? raw, apiKey),
        quota: data?.error?.details ?? null,
      };
    }

    const cand = data?.candidates?.[0];
    const texto = (cand?.content?.parts ?? []).map((p) => p?.text ?? "").join("");

    let parsed = null;
    let jsonOk = false;
    try { parsed = JSON.parse(texto.trim()); jsonOk = true; } catch { /* nao-JSON */ }

    // So medimos estrutura; a qualidade pedagogica e leitura humana.
    return {
      ok: true,
      http: res.status,
      ms,
      finish: cand?.finishReason ?? null,
      chars: texto.length,
      jsonOk,
      chaves: parsed ? Object.keys(parsed).sort() : null,
      faltando: parsed
        ? ["title", "subject", "topic", "introduction", "sections", "guidedPractice", "commonMistakes", "summary"]
          .filter((k) => parsed[k] === undefined || parsed[k] === null)
        : null,
      contagens: parsed ? {
        sections: Array.isArray(parsed.sections) ? parsed.sections.length : 0,
        guidedPractice: Array.isArray(parsed.guidedPractice) ? parsed.guidedPractice.length : 0,
        commonMistakes: Array.isArray(parsed.commonMistakes) ? parsed.commonMistakes.length : 0,
        examplesTotal: Array.isArray(parsed.sections)
          ? parsed.sections.reduce((n, s) => n + (Array.isArray(s?.examples) ? s.examples.length : 0), 0)
          : 0,
      } : null,
      usage: {
        prompt: data?.usageMetadata?.promptTokenCount ?? null,
        thoughts: data?.usageMetadata?.thoughtsTokenCount ?? null,
        candidates: data?.usageMetadata?.candidatesTokenCount ?? null,
        total: data?.usageMetadata?.totalTokenCount ?? null,
      },
      preview: redact(texto.slice(0, 200), apiKey),
    };
  } catch (error) {
    return { ok: false, http: 0, ms: Date.now() - started, erro: redact(error?.message ?? error, apiKey) };
  }
}

/** Sonda completa de uma chave. */
async function probeKey(nome, apiKey) {
  if (!apiKey) return { nome, configurada: false };

  const fp = await fingerprint(apiKey);
  const lista = await listModels(apiKey);

  return {
    nome,
    configurada: true,
    fingerprint: fp.slice(0, 16), // 64 bits: compara sem ser reversivel
    comprimento: apiKey.length,
    modelos: lista,
    // Orcamento alto + thinkingLevel LOW: prova que o texto volta.
    gerar38: lista.tem38
      ? await probeGenerate(apiKey, "gemini-3.8-flash", { withSchema: true, maxTokens: 2048, thinking: "low" })
      : null,
    // Teste decisivo: o schema REAL da aula em responseSchema.
    aulaSchema: lista.tem38 ? await probeLessonSchema(apiKey, "gemini-3.8-flash") : null,
  };
}

/**
 * Descobre o TIER (free/pago) e o limite real de UMA chave.
 *
 * Como a documentacao diz que o limite e por PROJETO (nao por chave),
 * nao da para assumir que A e B tem cotas separadas: as duas podem
 * compartilhar o mesmo teto. Este teste dispara uma rajada curta e
 * registra onde aparece o 429 e qual o limite declarado na mensagem.
 *
 * Requer body: { key: "A" | "B", burst: <1..12> }
 */
async function probeLimites(req) {
  const body = await req.json().catch(() => ({}));
  const alvo = String(body.key ?? "A").toUpperCase();
  const rajada = Math.min(12, Math.max(1, Number(body.burst) || 6));
  const apiKey = Deno.env.get(`GEMINI_API_KEY_${alvo}`) ?? "";
  if (!apiKey) return json({ erro: `chave ${alvo} ausente` }, 400, req);

  const registros = [];
  for (let i = 1; i <= rajada; i += 1) {
    const started = Date.now();
    const linha = { n: i, http: null, ms: 0, limite: null, tier: null, retryEm: null, finish: null, erro: null };
    try {
      const res = await fetch(`${GEMINI_BASE_URL}/gemini-3.8-flash:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        // Chamada minima: 1 token de saida, sem schema, sem thinking.
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ok" }] }],
          generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      linha.http = res.status;
      linha.ms = Date.now() - started;
      const raw = await res.text();
      if (!res.ok) {
        const msg = redact(JSON.parse(raw || "{}")?.error?.message ?? raw, apiKey);
        linha.erro = msg.slice(0, 200);
        const lim = msg.match(/limit:\s*(\d+)/i);
        const retry = msg.match(/retry in\s+([\d.]+)/i);
        const metrica = msg.match(/metric:\s*([\w./]+)/i);
        linha.limite = lim ? Number(lim[1]) : null;
        linha.retryEm = retry ? Number(retry[1]) : null;
        // A metrica revela o tier: *_free_tier_* = conta nao paga.
        linha.tier = metrica ? (/free_tier/i.test(metrica[1]) ? "FREE" : "PAGO") : null;
      } else {
        const d = JSON.parse(raw);
        const cand = d?.candidates?.[0];
        linha.finish = cand?.finishReason ?? null;
        // 200 NAO prova tier pago: pode ser folga dentro da free.
        // Quem revela o tier e a metrica do 429 (ver com429).
        linha.tokens = {
          thoughts: d?.usageMetadata?.thoughtsTokenCount ?? null,
          candidates: d?.usageMetadata?.candidatesTokenCount ?? null,
        };
      }
    } catch (error) {
      linha.ms = Date.now() - started;
      linha.erro = redact(error?.message ?? error, apiKey).slice(0, 200);
    }
    registros.push(linha);
  }

  const com429 = registros.find((r) => r.http === 429);
  return json({
    diag: "gemini-probe/limites",
    chave: alvo,
    rajada,
    primeiro429NaTentativa: com429 ? com429.n : null,
    limiteDeclarado: com429?.limite ?? null,
    // Tier so e possivel pela metrica do 429 (free_tier no nome da metrica).
    tier: com429?.tier ?? "indeterminado (nenhum 429 na rajada)",
    retryEmSegundos: com429?.retryEm ?? null,
    metricaCota: com429 ? (com429.erro?.match(/metric:\s*([\w./]+)/i)?.[1] ?? null) : null,
    registros,
  }, 200, req);
}

/**
 * Teste DECISIVO: A e B dividem a MESMA cota?
 *
 * A documentacao do Gemini diz que os limites sao aplicados por
 * PROJETO, e nao por chave. Se A e B pertencem ao mesmo projeto, uma
 * rajada na A esgota a B: usar B como "failover" nao daria nenhuma
 * resiliencia real, porque as duas cairiam juntas.
 *
 * Procedimento: esgota a A ate dar 429 e, SEM ESPERAR, chama a B.
 * Se a B tambem responder 429, a cota e compartilhada.
 *
 * Body: { modo: "compartilhar" }
 */
async function probeCompartilhado(req) {
  const body = await req.json().catch(() => ({}));
  const esgotar = String(body.esgotar ?? "A").toUpperCase();
  const outra = esgotar === "A" ? "B" : "A";

  const keyA = Deno.env.get("GEMINI_API_KEY_A") ?? "";
  const keyB = Deno.env.get("GEMINI_API_KEY_B") ?? "";
  if (!keyA || !keyB) return { erro: "faltam chaves" };

  const keyAlvo = esgotar === "A" ? keyA : keyB;
  const keyOutra = esgotar === "A" ? keyB : keyA;

  const chamada = async (apiKey) => {
    const t0 = Date.now();
    const res = await fetch(`${GEMINI_BASE_URL}/gemini-3.8-flash:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "ok" }] }],
        generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* nao-JSON */ }
    const msg = data?.error?.message ?? "";
    return {
      http: res.status,
      ms: Date.now() - t0,
      limite: msg.match(/limit:\s*(\d+)/i)?.[1] ?? null,
      metrica: msg.match(/metric:\s*([\w./]+)/i)?.[1] ?? null,
    };
  };

  // 1) Esgota a chave alvo.
  const rajada = [];
  for (let i = 1; i <= 8; i += 1) {
    const r = await chamada(keyAlvo);
    rajada.push(r);
    if (r.http === 429) break;
  }
  const alvo429 = rajada.find((r) => r.http === 429) ?? null;

  // 2) Sem esperar: chama a OUTRA duas vezes.
  const o1 = await chamada(keyOutra);
  const o2 = await chamada(keyOutra);

  const outraTambem429 = o1.http === 429 && o2.http === 429;

  return {
    diag: "gemini-probe/compartilhar",
    esgotar,
    outra,
    rajadaAlvo: rajada,
    alvo_atingiu_429: Boolean(alvo429),
    alvo_limite: alvo429?.limite ?? null,
    outra_imediato_1: o1,
    outra_imediato_2: o2,
    outra_tambem_429: outraTambem429,
    // So da para afirmar cota COMPARTILHADA quando as duas caem juntas.
    leitura: !alvo429
      ? `${esgotar} NAO atingiu 429 nesta rajada: inconclusivo, repetir depois de zerar a janela`
      : outraTambem429
        ? `COTA COMPARTILHADA: ${esgotar} e ${outra} caem juntas. ${outra} nao serve como failover independente.`
        : `COTAS SEPARADAS: ${esgotar} esgotou (limite ${alvo429.limite}) e ${outra} ainda respondeu. ${outra} tem folga propria.`,
  };
}

async function handle(req) {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized" }, 401, req);

  // Modo limites: mede tier/limite de UMA chave, com rajada curta.
  const peek = await req.clone().json().catch(() => ({}));
  if (peek.modo === "limites") return await probeLimites(req);
  if (peek.modo === "compartilhar") return json(await probeCompartilhado(req), 200, req);

  const keyA = Deno.env.get("GEMINI_API_KEY_A") ?? "";
  const keyB = Deno.env.get("GEMINI_API_KEY_B") ?? "";
  const keyAntiga = Deno.env.get("GEMINI_API_KEY") ?? "";

  const [a, b] = await Promise.all([probeKey("A", keyA), probeKey("B", keyB)]);

  // A chave antiga so para COMPARAR fingerprint (a do Tutor). Nao a
  // re-testamos: so queremos provar se B e a mesma que a do Tutor.
  const antiga = keyAntiga
    ? { nome: "LEGACY_TUTOR", fingerprint: (await fingerprint(keyAntiga)).slice(0, 16) }
    : null;

  const mesmaAB = Boolean(a.configurada && b.configurada && a.fingerprint === b.fingerprint);
  const bIgualLegacy = Boolean(b.configurada && antiga?.fingerprint && b.fingerprint === antiga.fingerprint);

  return json({
    diag: "gemini-probe/FASE1C.1",
    ts: new Date().toISOString(),
    A: a,
    B: b,
    legacyTutor: antiga,
    conclusoes: {
      mesmaChaveAB: mesmaAB,
      B_igual_ChaveAntigaDoTutor: bIgualLegacy,
      // Se A e B sao a mesma chave, NAO existe quota duplicada e B
      // NAO serve como failover independente. Isso fica explicito
      // para nao "inventar" resiliencia que nao existe.
      haDoisProjetosIndependentes: Boolean(a.configurada && b.configurada && !mesmaAB),
    },
  }, 200, req);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    console.error("[gemini-probe] erro nao tratado", error);
    return json({ error: "probe_crash", message: String(error?.message ?? error) }, 500, req);
  }
});
