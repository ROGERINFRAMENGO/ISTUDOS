import { authenticate, handleOptions, corsHeaders, json } from "../_shared/http.js";
import { complete, GeminiError } from "../_shared/gemini.js";
import { buildTutorSystemPrompt } from "../_shared/prompts.js";
import { createDb } from "../_shared/db.js";
import { consumir } from "../_shared/rateLimit.js";
import {
  TUTOR_HISTORY_LIMIT,
  TUTOR_MAX_MESSAGE_CHARS,
  TUTOR_MODELS,
  TUTOR_TIMEOUT_MS,
} from "../_shared/ai_config.js";

// ============================================================
// tutor-chat â€” a Tutora IA (Gemini) do ISTUDOS.
// ------------------------------------------------------------
// Provider: GEMINI. Separado da geracao de aulas (que usa DiffusionGemma
// e o Muse Glimmer pela NVIDIA): trocar o modelo da aula nunca afeta o
// chat, e trocar o modelo do chat nunca afeta a aula.
//
// Chave: SOMENTE o secret GEMINI_API_KEY. Ela nunca volta na resposta
// nem entra no log.
//
// Dois modos: { stream: true } devolve SSE pedaco a pedaco;
// { stream: false } devolve JSON de uma vez. O historico fica no
// Postgres com RLS por auth.uid(); o user_id vem SEMPRE do token.
// ============================================================

/** Log estruturado. Nunca loga conteudo de conversa nem a chave. */
function log(dados) {
  const campos = Object.entries(dados)
    .map(([k, v]) => `${k}=${v === null || v === undefined ? "-" : v}`)
    .join(" ");
  console.log(`[tutor-chat] ${campos}`);
}

/**
 * Historico -> contents do Gemini. Janela deslizante das ultimas
 * TUTOR_HISTORY_LIMIT mensagens: e o que faz "e gene?" continuar a
 * conversa de "nao entendi DNA".
 */
function toGeminiContents(mensagens) {
  return mensagens
    .filter((m) => (m.role === "user" || m.role === "assistant") && String(m.content ?? "").trim())
    .slice(-TUTOR_HISTORY_LIMIT)
    .map((m) => ({
      // No Gemini o papel do tutor e "model", nao "assistant".
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, TUTOR_MAX_MESSAGE_CHARS) }],
    }));
}

function mapStatus(error) {
  if (error instanceof GeminiError) {
    if (error.status === 429) return 429;
    if (error.status === 504) return 504;
    return 502;
  }
  return 502;
}

function mensagemAmigavel(error) {
  const tipo = error?.message ?? "";
  if (tipo === "tutor_timeout") return "Demorei demais para responder. Tenta de novo?";
  if (tipo === "gemini_http_429") return "Mandei mensagens demais pro servidor. Espera alguns segundos.";
  if (tipo === "tutor_network_error") return "Nao consegui falar com a IA agora. Verifica sua conexao.";
  return "A tutora nao respondeu agora. Tenta de novo em um instante.";
}

/** Grava a pergunta e a resposta. Falha aqui nunca quebra o chat. */
async function persistir(db, { auth, conversationId, textoUsuario, r }) {

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  // Ordem importa: autenticacao ANTES de qualquer checagem de secret, para
  // que uma requisicao sem token sempre receba 401 (e nao 503 por falta de
  // configuracao do servidor).
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized", hint: "Ative o login anonimo no Supabase." }, 401, req);

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) {
    log({ event: "tutor_not_configured" });
    return json({ error: "ai_not_configured", message: "Defina o secret GEMINI_API_KEY." }, 503, req);
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, req);
  }

  const querStream = payload?.stream === "true" || payload?.stream === true;

  // Etapa 13: rate limit ANTES de gastar cota do Gemini. O pedido invalido
  // e barrado antes para nao gastar uma cota que a aluna nem usou.
  const temMensagem = Array.isArray(payload?.messages) && payload.messages.length > 0;
  if (!temMensagem) return json({ error: "empty_history" }, 400, req);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  // Etapa 13: rate limit ANTES de gastar cota do Gemini. O contador vive
  // no Postgres: as Edge Functions rodam em varias instancias e um Map em
  // memoria nunca acumularia entre elas (medido: nao bloqueava nunca).
  const limite = await consumir(auth.userId, { url, anonKey, token: auth.token });
  if (!limite.ok) {
    log({ event: "tutor_rate_limited", user: auth.userId.slice(0, 8), retry_after_ms: limite.retryAfterMs, via: limite.via });
    return json(
      {
        error: "rate_limited",
        message: "Voce mandou varias mensagens muito rapido. Espera um pouquinho e tenta de novo.",
        retryAfterMs: limite.retryAfterMs,
      },
      429,
      req,
    );
  }

  const db = createDb({ url, anonKey, token: auth.token });

  const context = payload?.context ?? {};
  const incoming = Array.isArray(payload?.messages) ? payload.messages : [];
  const ultimaDoCliente = [...incoming].reverse().find((m) => m?.role === "user");
  const textoUsuario = String(ultimaDoCliente?.content ?? "").trim();

  if (!textoUsuario) {
    return json({ error: "empty_message", message: "Escreva sua pergunta antes de enviar." }, 400, req);
  }
  if (textoUsuario.length > TUTOR_MAX_MESSAGE_CHARS * 4) {
    return json({ error: "message_too_long", message: "Essa mensagem esta longa demais. Resuma um pouco." }, 400, req);
  }

  // ---- Conversa e historico (Etapas 6 e 7) ----
  let conversationId = payload?.conversationId ?? null;
  let historico = [];
  try {
    if (!conversationId) {
      const conversa = await db.findOrCreateConversation({
        userId: auth.userId,
        subject: context.subject ?? "",
        topic: context.topic ?? "",
        lessonId: context.lessonId ?? null,
      });
      conversationId = conversa?.id ?? null;
    }
    if (conversationId) {
      const salvas = await db.recentMessages(conversationId, 40);
      historico = salvas.map((m) => ({ role: m.role, content: m.content }));
    }
  } catch (error) {
    // Historico e conforto, nao requisito: o chat continua sem ele.
    log({ event: "tutor_history_unavailable", error: String(error?.message ?? error).slice(0, 120) });

  // ---- Resposta sem streaming ----
  if (!querStream) {
    try {
      const r = await complete(apiKey, opcoes, { log });
      await persistir(db, { auth, conversationId, textoUsuario, r });
      return json(
        {
          reply: r.text,
          model: r.model,
          conversationId,
          streaming: false,
          retries: r.retries,
          requestMs: r.requestMs,
        },
        200,
        req,
      );
    } catch (error) {
      const status = mapStatus(error);
      log({ event: "tutor_failed", status, error_type: error?.message ?? "erro", request_ms: Date.now() - started });
      return json(
        { error: error?.message ?? "tutor_unavailable", message: mensagemAmigavel(error), retryable: status >= 500 },
        status,
        req,
      );
    }
  }

  // ---- Resposta com streaming (SSE) ----
  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const enviar = (evento, dados) => {
        controller.enqueue(encoder.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`));
      };
      try {
        enviar("start", { conversationId });

        const r = await complete(apiKey, opcoes, {
          log,
          onChunk: (pedaco) => enviar("delta", { text: pedaco }),
        });

        // "done" leva o texto completo: a UI reconcilia por aqui caso
        // algum delta tenha se perdido na rede.
        enviar("done", {
          reply: r.text,
          model: r.model,
          conversationId,
          retries: r.retries,
          timeToFirstTokenMs: r.firstTokenMs ?? null,
          requestMs: r.requestMs,
        });

        await persistir(db, { auth, conversationId, textoUsuario, r });
      } catch (error) {
        const status = mapStatus(error);
        log({ event: "tutor_stream_failed", status, error_type: error?.message ?? "erro", request_ms: Date.now() - started });
        enviar("error", { error: error?.message ?? "tutor_unavailable", message: mensagemAmigavel(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Sem isso o proxy segura o buffering e o streaming chega tudo de
      // uma vez, o que mata a sensacao de texto crescendo.
      "X-Accel-Buffering": "no",
    },
  });
});

  }

  // A mensagem nova entra no prompt mesmo antes de ir para o banco,
  // para a aluna ver a resposta imediatamente.
  const contents = toGeminiContents([...historico, { role: "user", content: textoUsuario }]);
  if (!contents.length) return json({ error: "empty_history" }, 400, req);

  const system = buildTutorSystemPrompt(context);
  const started = Date.now();
  const opcoes = { system, contents, timeoutMs: TUTOR_TIMEOUT_MS, models: TUTOR_MODELS };

  if (!conversationId) return;
  try {
    await db.saveMessage({ userId: auth.userId, conversationId, role: "user", content: textoUsuario });
    await db.saveMessage({
      userId: auth.userId, conversationId, role: "assistant", content: r.text, model: r.model,
    });
  } catch (error) {
    log({ event: "tutor_persist_failed", error: String(error?.message ?? error).slice(0, 120) });
  }
}

