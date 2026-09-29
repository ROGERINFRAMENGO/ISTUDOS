// ============================================================
// Camada de acesso ao modelo NVIDIA (API compativel com OpenAI)
// ------------------------------------------------------------
// O MODELO vem da configuracao central (_ai_config.js), nunca
// hardcoded aqui: principal rapido + fallback de qualidade.
// IMPORTANTE: NVIDIA_API_KEY existe SOMENTE como secret das Edge Functions.
// ============================================================

import {
  AI_BASE_URL,
  AI_FALLBACK_MODEL,
  AI_MAX_TOKENS,
  AI_PRIMARY_MODEL,
  AI_REQUEST_TIMEOUT_MS,
  AI_TEMPERATURE,
} from "./ai_config.js";

export { AI_BASE_URL, AI_PRIMARY_MODEL, AI_FALLBACK_MODEL };
const DEFAULT_TEMPERATURE = AI_TEMPERATURE;
const DEFAULT_MAX_TOKENS = AI_MAX_TOKENS;
const DEFAULT_TIMEOUT_MS = AI_REQUEST_TIMEOUT_MS;

export class AiError extends Error {
  constructor(message, { status = 0, retryable = false, detail = "" } = {}) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 = cota por minuto | 5xx = demanda/instabilidade | rede = transitorio.
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Chama o modelo uma vez.
 * @returns {Promise<{content:string, reasoning:string, toolCalls:Array, usage:object, finishReason:string}>}
 */
export async function chatCompletion(apiKey, options = {}) {
  const {
    messages = [],
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    jsonMode = false,
    thinking = false,
    tools = null,
    toolChoice = "auto",
    signal = undefined,
    baseUrl = AI_BASE_URL,
    model = AI_PRIMARY_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    reasoning = undefined,
  } = options;

  if (!apiKey) {
    throw new AiError("missing_api_key", { status: 503, detail: "NVIDIA_API_KEY nao configurada como secret." });
  }

  const body = { model, messages, temperature, top_p: 0.9, max_tokens: maxTokens, stream: false };
  if (jsonMode) body.response_format = { type: "json_object" };
  if (!thinking) body.chat_template_kwargs = { enable_thinking: false };
  // Modelos de raciocinio (gpt-oss) aceitam reasoning_effort. Sem ele o
  // modelo gasta todo o max_tokens pensando e devolve content vazio.
  if (reasoning) body.reasoning_effort = reasoning;
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  // AbortController garante que uma chamada travada vire timeout (e nao
  // fique pendurada ate o limite de 150s do gateway).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  const started = Date.now();
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AiError("ai_timeout", { status: 504, detail: `modelo ${model} passou de ${timeoutMs}ms` });
    }
    throw new AiError("network_error", { status: 0, retryable: true, detail: String(error?.message ?? error) });
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text();
  let data = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    // corpo nao-JSON (gateway, html de erro etc.)
  }

  if (!response.ok) {
    const raw = data?.detail ?? data?.error ?? data?.message ?? rawText ?? "";
    const detail = (typeof raw === "string" ? raw : JSON.stringify(raw)).replace(/\s+/g, " ").slice(0, 300);
    throw new AiError(`nvidia_http_${response.status}`, {
      status: response.status,
      retryable: isRetryableStatus(response.status),
      detail,
    });
  }

  const choice = data?.choices?.[0];
  const message = choice?.message ?? {};
  return {
    content: String(message.content ?? "").trim(),
    reasoning: String(message.reasoning ?? message.reasoning_content ?? ""),
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    finishReason: String(choice?.finish_reason ?? ""),
    usage: data?.usage ?? {},
    model: data?.model ?? model,
    requestMs: Date.now() - started,
  };
}

/**
 * Chama com tentativas curtas (pico de demanda / cota por minuto).
 * Nao faz cascata de modelos: o modelo pedido e o muse-glimmer-30b.
 */
export async function chatCompletionWithRetry(apiKey, options = {}, { attempts = 2, backoffMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await chatCompletion(apiKey, options);
    } catch (error) {
      lastError = error;
      const canRetry = Boolean(error?.retryable) && attempt < attempts;
      if (!canRetry) break;
      const wait = error?.status === 429 ? backoffMs * attempt : backoffMs;
      console.warn(`[ai] tentativa ${attempt} falhou (${error?.message})`, error?.detail ?? "");
      await sleep(wait);
    }
  }
  throw lastError ?? new AiError("ai_failure", { status: 502 });
}

/**
 * Extrai JSON da resposta do modelo (as vezes vem com cerca de markdown,
 * texto antes/depois, virgula sobrando). Nunca confie no JSON cru.
 * @returns {object|null}
 */
export function extractJson(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const stripFences = (value) =>
    value
      .replace(/^\uFEFF/, "")
      .replace(/^[\s`]*```(?:json|javascript)?\s*/i, "")
      .replace(/\s*```[\s`]*$/i, "")
      .trim();

  const cleaned = stripFences(raw);
  const candidates = [cleaned];

  // Primeiro bloco { ... } balanceado (ignora chaves dentro de string).
  const start = cleaned.search(/[{[]/);
  if (start > -1) {
    const open = cleaned[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) {
          candidates.push(cleaned.slice(start, i + 1));
          break;
        }
      }
    }
  }

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > -1 && last > first) candidates.push(cleaned.slice(first, last + 1));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
      } catch {
        // passa para o proximo candidato
      }
    }
  }
  return null;
}

/**
 * Pede JSON ao modelo e devolve o objeto ja parseado.
 *
 * REGRA DA FASE 1: o google/diffusiongemma-26b-a4b-it REJEITA
 * `response_format: {type:"json_object"}` sem um JSON schema (HTTP 400).
 * Nesses modelos desligamos o json_mode e confiamos no extractJson(),
 * que ja remove cercas de markdown e tolera virgula sobrando.
 */
export function supportsJsonMode(model) {
  return !String(model ?? "").toLowerCase().includes("diffusiongemma");
}

/**
 * Pede JSON ao modelo e devolve o objeto ja parseado.
 * Se vier malformado, lanca AiError(malformed_json) para o chamador
 * decidir se vale uma unica chamada de correcao.
 */
export async function requestJson(apiKey, options = {}, retryOptions = {}) {
  const model = options.model ?? AI_PRIMARY_MODEL;
  const jsonMode = options.jsonMode ?? supportsJsonMode(model);
  const result = await chatCompletionWithRetry(apiKey, { ...options, model, jsonMode }, retryOptions);
  const parsed = extractJson(result.content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    // finish_reason = "length" significa que max_tokens cortou a aula no
    // meio: e um problema de orcamento de tokens, nao de JSON invalido.
    // Guardamos os ultimos 900 chars porque e ali que o modelo estraga o JSON.
    // A API devolve o uso em completion_tokens (snake_case); aceitamos os
    // dois nomes para o log de diagnostico nunca sair como "tokens=?".
    const tokens = result.usage?.completion_tokens ?? result.usage?.completionTokens ?? "?";
    const detail =
      `finish=${result.finishReason} chars=${result.content.length} ` +
      `tokens=${tokens} | fim: ${result.content.slice(-900)}`;
    throw new AiError("malformed_json", { status: 502, retryable: true, detail });
  }
  return {
    data: parsed,
    usage: result.usage,
    model: result.model,
    finishReason: result.finishReason,
    requestMs: result.requestMs,
    jsonMode,
  };
}


