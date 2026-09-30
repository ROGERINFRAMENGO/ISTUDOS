// ============================================================
// Cliente do Gemini (Generative Language API) para o Tutor IA.
// ------------------------------------------------------------
// Separado de nvidia.js de proposito: o chat nao deve herdar nada
// da geracao de aulas. Chave somente via Deno.env (secret).
//
// Mesmo desenho do cliente NVIDIA: timeout real com AbortController,
// retry so para erro TRANSITORIO, logs estruturados sem conteudo de
// conversa.
// ============================================================

import {
  GEMINI_BASE_URL,
  TUTOR_MAX_ATTEMPTS,
  TUTOR_MAX_TOKENS,
  TUTOR_BACKOFF_MS,
  TUTOR_MODELS,
  TUTOR_TEMPERATURE,
  TUTOR_TIMEOUT_MS,
} from "./_ai_config.js";

export { GEMINI_BASE_URL, TUTOR_MODELS };

export class GeminiError extends Error {
  constructor(message, { status = 0, retryable = false, detail = "" } = {}) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 429/5xx/rede sao transitorios (vale repetir ou trocar de modelo).
 * 400/404 sao permanentes (payload/modelo invalido): insistir so
 * gasta chamada, entao o proximo modelo entra na hora.
 */
function isRetryable(status) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function readError(data, rawText) {
  const raw = data?.error?.message ?? data?.message ?? rawText ?? "";
  return (typeof raw === "string" ? raw : JSON.stringify(raw)).replace(/\s+/g, " ").slice(0, 300);
}

/** Texto de um chunk do Gemini (parts[].text). */
function chunkText(json) {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
}

function buildBody({ system, contents, maxTokens, temperature }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: temperature ?? TUTOR_TEMPERATURE,
      maxOutputTokens: maxTokens ?? TUTOR_MAX_TOKENS,
    },
  };
}

/** Chamada sem streaming: devolve o texto completo. */
export async function generateText(apiKey, { model, system, contents, maxTokens, temperature, timeoutMs, signal }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? TUTOR_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody({ system, contents, maxTokens, temperature })),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data = null;
    try { data = JSON.parse(rawText); } catch { /* nao-JSON */ }

    if (!response.ok) {
      throw new GeminiError(`gemini_http_${response.status}`, {
        status: response.status,
        retryable: isRetryable(response.status),
        detail: readError(data, rawText),
      });
    }

    const text = chunkText(data).trim();
    if (!text) {
      // finishReason SAFETY/MAX_TOKENS sem texto nao melhora repetindo igual.
      throw new GeminiError("gemini_empty_reply", {
        status: 200,
        retryable: false,
        detail: `finishReason=${data?.candidates?.[0]?.finishReason ?? "?"}`,
      });
    }

    return {
      text,
      model: data?.modelVersion ?? model,
      requestMs: Date.now() - started,
      promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
      completionTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
    };
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    if (error?.name === "AbortError") {
      throw new GeminiError("tutor_timeout", { status: 504, detail: `modelo ${model} passou do timeout` });
    }
    throw new GeminiError("tutor_network_error", { status: 0, retryable: true, detail: String(error?.message ?? error) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chamada com streaming (SSE): os pedacos vao para onChunk assim que
 * chegam, e o navegador ja pode mostrar o texto.
 *
 * O Gemini separa eventos com \r\n\r\n, por isso o parser normaliza
 * os fins de linha ANTES de quebrar os blocos "data: {...}".
 */
export async function streamText(apiKey, { model, system, contents, maxTokens, temperature, timeoutMs, signal, onChunk }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? TUTOR_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let reader;
  let firstTokenMs = null;
  let full = "";
  let parts = 0;
  let resolvedModel = model;
  let promptTokens = null;
  let completionTokens = null;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody({ system, contents, maxTokens, temperature })),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const rawText = await response.text().catch(() => "");
      let data = null;
      try { data = JSON.parse(rawText); } catch { /* nao-JSON */ }
      throw new GeminiError(`gemini_http_${response.status}`, {
        status: response.status,
        retryable: isRetryable(response.status),
        detail: readError(data, rawText),
      });
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocos = buffer.split(/\r?\n\r?\n/);
      buffer = blocos.pop() ?? "";
      for (const bloco of blocos) {
        for (const linha of bloco.split(/\r?\n/)) {
          if (!linha.startsWith("data:")) continue;
          const bruto = linha.slice(5).trim();
          if (!bruto || bruto === "[DONE]") continue;
          let json;
          try { json = JSON.parse(bruto); } catch { continue; }
          const texto = chunkText(json);
          if (!texto) continue;
          if (firstTokenMs === null) firstTokenMs = Date.now() - started;
          full += texto;
          parts += 1;
          if (json?.modelVersion) resolvedModel = json.modelVersion;
          if (json?.usageMetadata) {
            promptTokens = json.usageMetadata.promptTokenCount ?? promptTokens;
            completionTokens = json.usageMetadata.candidatesTokenCount ?? completionTokens;
          }
          onChunk?.(texto);
          onChunk?.(texto);
        }
      }
    }

    const texto = full.trim();
    if (!texto) {
      throw new GeminiError("gemini_empty_reply", { status: 200, retryable: true, detail: "stream sem texto" });
    }

    return {
      text: texto,
      model: resolvedModel,
      streaming: true,
      parts,
      requestMs: Date.now() - started,
      firstTokenMs,
      promptTokens,
      completionTokens,
    };
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    if (error?.name === "AbortError") {
      throw new GeminiError("tutor_timeout", { status: 504, detail: `modelo ${model} passou do timeout` });
    }
    throw new GeminiError("tutor_network_error", { status: 0, retryable: true, detail: String(error?.message ?? error) });
  } finally {
    clearTimeout(timer);
    // Se a aluna fechou a aba no meio, o corpo SSE e cancelado.
    try { await reader?.cancel(); } catch { /* ja fechado */ }
  }
}

/**
 * Retry + troca de modelo. `onChunk` liga o streaming; se ele falhar
 * antes de entregar texto, refaz sem streaming para a resposta chegar
 * inteira. Nunca tentamos dois modelos depois de ja ter mando texto:
 * a aluna veria a mesma resposta duplicada.
 */
export async function complete(apiKey, options, { onChunk, log } = {}) {
  const models = options.models?.length ? options.models : TUTOR_MODELS;
  const wantStream = typeof onChunk === "function";
  const tentados = [];
  const started = Date.now();

  for (const model of models) {
    for (let attempt = 1; attempt <= TUTOR_MAX_ATTEMPTS; attempt += 1) {
      try {
        const r = wantStream
          ? await streamText(apiKey, { ...options, model }, { onChunk })
          : await generateText(apiKey, { ...options, model });

        log?.({
          event: "tutor_reply",
          provider: "gemini",
          model: r.model,
          streaming: Boolean(r.streaming),
          retry_count: tentados.length,
          request_ms: Date.now() - started,
          time_to_first_token_ms: r.firstTokenMs ?? null,
          generation_ms: r.requestMs,
          response_chars: r.text.length,
          prompt_tokens: r.promptTokens ?? null,
          completion_tokens: r.completionTokens ?? null,
          success: true,
        });
        return { ...r, retries: tentados.length };
      } catch (error) {
        tentados.push(`${model}:${error?.message ?? "erro"}`);
        log?.({
          event: "tutor_error",
          provider: "gemini",
          model,
          status: error?.status ?? 0,
          error_type: error?.message ?? "erro",
          retryable: Boolean(error?.retryable),
          retry_count: tentados.length,
          success: false,
        });

        const podeRepetir = error?.retryable && attempt < TUTOR_MAX_ATTEMPTS;
        if (podeRepetir) {
          await sleep(TUTOR_BACKOFF_MS * attempt);
          continue;
        }
        break; // tenta o proximo modelo
      }
    }
  }

  throw new GeminiError("tutor_unavailable", { status: 502, detail: tentados.join(" | ").slice(0, 400) });
}
