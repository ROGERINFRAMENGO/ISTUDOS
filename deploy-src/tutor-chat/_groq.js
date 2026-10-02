// ============================================================
// Cliente GROQ do Tutor IA (FASE 3 - troca de provider).
// ------------------------------------------------------------
// API compativel com OpenAI: POST /chat/completions, com
// stream:true devolvendo SSE (data: {choices:[{delta}]}).
//
// Por que um cliente NOVO em vez de adaptar o gemini.js:
// os dois providers tem formatos de request e de streaming
// diferentes. Adaptar um no outro deixaria condicoes "se for groq..."
// espalhadas. Aqui o cliente fala Groq e o index.ts usa a MESMA
// interface (complete/generateText/streamText + onChunk), entao
// trocar de provider no futuro muda so este arquivo.
//
// A chave vem do parametro e vive somente no secret do Supabase:
// nunca entra em log, resposta ou URL.
// ============================================================

import {
  GROQ_BASE_URL,
  TUTOR_BACKOFF_MS,
  TUTOR_MAX_ATTEMPTS,
  TUTOR_MAX_TOKENS,
  TUTOR_MODELS,
  TUTOR_REASONING_ALTO,
  TUTOR_REASONING_DEFAULT,
  TUTOR_TEMPERATURE,
  TUTOR_TIMEOUT_MS,
} from "./_ai_config.js";

export { GROQ_BASE_URL, TUTOR_MODELS };

export class GroqError extends Error {
  constructor(message, { status = 0, retryable = false, detail = "", retryAfterMs = 0 } = {}) {
    super(message);
    this.name = "GroqError";
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * O que vale a pena repetir:
 *   429 ... a cota do provider estourou (pode liberar em segundos)
 *   408 ... o proprio gateway do provider cortou
 *   5xx ... erro do lado deles
 *   0 .... erro de rede (o fetch lanÃ§ou)
 * O que NUNCA se repete: 400 (payload invalido), 401/403 (chave),
 * 404 (modelo inexistente) e segredo ausente - repetir so gasta cota.
 */
function isRetryable(status) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** Erro do provider em texto curto e sem segredo. */
function readError(data, rawText) {
  const raw = data?.error?.message ?? data?.message ?? data?.error ?? rawText ?? "";
  return (typeof raw === "string" ? raw : JSON.stringify(raw)).replace(/\s+/g, " ").slice(0, 300);
}

/**
 * A Groq expoe quanto falta para o limite liberar. Respeitar isso evita
 * martelar o endpoint e faz a aluna esperar o tempo certo.
 */
function readRetryAfter(headers) {
  const segundos = Number(headers?.get?.("retry-after") ?? 0);
  if (Number.isFinite(segundos) && segundos > 0) return segundos * 1000;
  const reset = headers?.get?.("x-ratelimit-reset-requests");
  // O header vem como "2m52.8s" ou "30ms".
  if (typeof reset === "string" && reset) {
    let total = 0;
    const minutos = reset.match(/([\d.]+)m/);
    const segundosParte = reset.match(/([\d.]+)s/);
    const milissegundos = reset.match(/([\d.]+)ms/);
    if (minutos) total += Number(minutos[1]) * 60000;
    if (segundosParte) total += Number(segundosParte[1]) * 1000;
    if (milissegundos) total += Number(milissegundos[1]);
    if (total > 0) return total;
  }
  return 0;
}

/**
 * Reasoning: baixo por padrao, porque latencia e o que a aluna sente.
 * Sobe para "medium" so quando ela pede para pensar com calma - assim
 * uma duvida simples nao gasta token pensando antes de responder.
 */
function resolveReasoning(messages) {
  const ultima = [...(messages ?? [])].reverse().find((m) => m?.role === "user");
  const texto = String(ultima?.content ?? "").toLowerCase();
  const pediuCalma =
    texto.includes("pense com calma") ||
    texto.includes("pensar com calma") ||
    texto.includes("pense bem");
  return pediuCalma ? TUTOR_REASONING_ALTO : TUTOR_REASONING_DEFAULT;
}


/** Corpo da requisicao no formato da API compativel com OpenAI. */
function buildBody({ model, system, contents, maxTokens, temperature, reasoningEffort, stream }) {
  const mensagens = [];
  if (system) mensagens.push({ role: "system", content: system });
  mensagens.push(...contents);
  const corpo = {
    model,
    messages: mensagens,
    temperature: temperature ?? TUTOR_TEMPERATURE,
    max_tokens: maxTokens ?? TUTOR_MAX_TOKENS,
    stream: Boolean(stream),
  };
  // O gpt-oss-20b aceita reasoning_effort; os outros da lista rejeitam
  // o campo, entao so mandamos no principal.
  if (model.startsWith("openai/gpt-oss")) {
    corpo.reasoning_effort = reasoningEffort ?? TUTOR_REASONING_DEFAULT;
  }
  return corpo;
}

function authHeaders(apiKey) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

/** Resposta sem streaming. */
export async function generateText(apiKey, options) {
  const { model, signal } = options;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TUTOR_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(buildBody({ ...options, model, stream: false })),
      signal: controller.signal,
    });
    const rawText = await response.text();
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      /* nao-JSON */
    }
    if (!response.ok) {
      throw new GroqError(`groq_http_${response.status}`, {
        status: response.status,
        retryable: isRetryable(response.status),
        detail: readError(data, rawText),
        retryAfterMs: readRetryAfter(response.headers),
      });
    }
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) {
      throw new GroqError("groq_empty_reply", {
        status: 200,
        retryable: true,
        detail: `finish=${data?.choices?.[0]?.finish_reason ?? "?"}`,
      });
    }
    return {
      text,
      model: data?.model ?? model,
      streaming: false,
      requestMs: Date.now() - started,
      firstTokenMs: null,
      promptTokens: data?.usage?.prompt_tokens ?? null,
      completionTokens: data?.usage?.completion_tokens ?? null,
    };
  } catch (error) {
    if (error instanceof GroqError) throw error;
    if (error?.name === "AbortError") {
      throw new GroqError("tutor_timeout", {
        status: 504,
        detail: `modelo ${model} passou do timeout`,
      });
    }
    throw new GroqError("tutor_network_error", {
      status: 0,
      retryable: true,
      detail: String(error?.message ?? error),
    });
  } finally {
    clearTimeout(timer);
  }
}


/**
 * Resposta em streaming (SSE). Chama onChunk a cada pedaco de texto,
 * sem o "raciocinio" do modelo - a aluna nao deve ver o rascunho
 * interno, so a resposta.
 */
export async function streamText(apiKey, options, { onChunk } = {}) {
  const { model, signal } = options;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TUTOR_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let reader;
  let firstTokenMs = null;
  let full = "";
  let parts = 0;
  let resolvedModel = model;
  let promptTokens = null;
  let completionTokens = null;

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(
        buildBody({ ...options, model, reasoningEffort: resolveReasoning(options.contents), stream: true }),
      ),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const rawText = await response.text().catch(() => "");
      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        /* nao-JSON */
      }
      throw new GroqError(`groq_http_${response.status}`, {
        status: response.status,
        retryable: isRetryable(response.status),
        detail: readError(data, rawText),
        retryAfterMs: readRetryAfter(response.headers),
      });
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // A Groq separa os eventos por linha em branco.
      const blocos = buffer.split(/\r?\n\r?\n/);
      buffer = blocos.pop() ?? "";

      for (const bloco of blocos) {
        for (const linha of bloco.split(/\r?\n/)) {
          const limpa = linha.trim();
          if (!limpa.startsWith("data:")) continue;
          const bruto = limpa.slice(5).trim();
          if (!bruto || bruto === "[DONE]") continue;

          let json;
          try {
            json = JSON.parse(bruto);
          } catch {
            continue;
          }

          if (json?.model) resolvedModel = json.model;
          if (json?.usage) {
            promptTokens = json.usage.prompt_tokens ?? promptTokens;
            completionTokens = json.usage.completion_tokens ?? completionTokens;
          }

          // delta.content e a resposta. delta.reasoning e o rascunho
          // interno do modelo e NAO vai para a aluna.
          const texto = json?.choices?.[0]?.delta?.content ?? "";
          if (!texto) continue;
          if (firstTokenMs === null) firstTokenMs = Date.now() - started;
          full += texto;
          parts += 1;
          onChunk?.(texto);
        }
      }
    }

    const texto = full.trim();
    if (!texto) {
      throw new GroqError("groq_empty_reply", {
        status: 200,
        retryable: true,
        detail: "stream sem conteudo",
      });
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
    if (error instanceof GroqError) throw error;
    if (error?.name === "AbortError") {
      throw new GroqError("tutor_timeout", {
        status: 504,
        detail: `modelo ${model} passou do timeout`,
      });
    }
    throw new GroqError("tutor_network_error", {
      status: 0,
      retryable: true,
      detail: String(error?.message ?? error),
    });
  } finally {
    clearTimeout(timer);
    try {
      await reader?.cancel();
    } catch {
      /* ja fechado */
    }
  }
}

/**
 * Ponto de entrada do Tutor: tenta os modelos em ordem, com retry so em
 * erro transitorio. Preserva a MESMA interface do cliente anterior, entao
 * o index.ts so troca o import e o nome da classe de erro.
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
          provider: "groq",
          model: r.model,
          streaming: Boolean(r.streaming),
          stream_chunks: r.parts ?? null,
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
          provider: "groq",
          model,
          status: error?.status ?? 0,
          error_type: error?.message ?? "erro",
          retryable: Boolean(error?.retryable),
          retry_count: tentados.length,
          success: false,
        });

        const podeRepetir = error?.retryable && attempt < TUTOR_MAX_ATTEMPTS;
        if (podeRepetir) {
          // Se o provider disse quanto tempo falta, respeitamos esse valor.
          const espera = error?.retryAfterMs || TUTOR_BACKOFF_MS * attempt;
          await sleep(Math.min(espera, 5000));
          continue;
        }
        break;
      }
    }
  }

  throw new GroqError("tutor_unavailable", {
    status: 502,
    detail: tentados.join(" | ").slice(0, 400),
  });
}
