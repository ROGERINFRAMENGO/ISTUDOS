import { authenticate, handleOptions, corsHeaders, json } from "../_shared/http.js";
import { complete, GroqError } from "../_shared/groq.js";
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
// tutor-chat - a Tutora IA (GROQ) do ISTUDOS.
// ------------------------------------------------------------
// Provider: GROQ (API compativel com OpenAI), modelo
// openai/gpt-oss-20b. Separado da geracao de aulas (que usa
// DiffusionGemma e o Muse Glimmer pela NVIDIA): trocar o modelo da
// aula nunca afeta o chat, e trocar o modelo do chat nunca afeta a
// aula.
//
// Chave: SOMENTE o secret GROQ_API_KEY. Ela nunca volta na resposta
// nem entra no log. A GEMINI_API_KEY continua guardada no Supabase,
// mas o TutorChat nao a utiliza mais.
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
 * Historico -> messages no formato da API da Groq (compativel com
 * OpenAI). Janela deslizante das ultimas TUTOR_HISTORY_LIMIT mensagens:
 * e o que faz "e gene?" continuar a conversa de "nao entendi DNA".
 */
function toChatMessages(mensagens) {
  return mensagens
    .filter((m) => (m.role === "user" || m.role === "assistant") && String(m.content ?? "").trim())
    .slice(-TUTOR_HISTORY_LIMIT)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, TUTOR_MAX_MESSAGE_CHARS),
    }));
}

function mapStatus(error) {
  if (error instanceof GroqError) {
    if (error.status === 429) return 429;
    if (error.status === 504) return 504;
    return 502;
  }
  return 502;
}

/**
 * Mensagens para a aluna. NUNCA vazam stack, URL interna ou detalhe do
 * provider: so a categoria do problema e o que ela pode fazer.
 */
function mensagemAmigavel(error) {
  const tipo = error?.message ?? "";
  const status = error?.status ?? 0;
  if (tipo === "tutor_timeout" || status === 504) {
    return "A resposta demorou demais. Tenta novamente.";
  }
  if (status === 429) {
    return "Tutor temporariamente indisponivel. Tente novamente em instantes.";
  }
  if (status === 401 || status === 403) {
    return "Nao foi possivel autenticar o Tutor.";
  }
  if (status >= 500) {
    return "O Tutor esta temporariamente indisponivel.";
  }
  if (tipo === "tutor_network_error" || status === 0) {
    return "Nao foi possivel conectar ao Tutor.";
  }
  if (tipo === "groq_empty_reply") {
    return "A tutora nao respondeu agora. Tenta de novo em um instante.";
  }
  return "A tutora nao respondeu agora. Tenta de novo em um instante.";
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  // Autenticacao ANTES de checar secret: requisicao sem token sempre
  // recebe 401, nunca 503 por configuracao do servidor.
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized", hint: "Ative o login anonimo no Supabase." }, 401, req);

  const apiKey = Deno.env.get("GROQ_API_KEY") ?? "";
  if (!apiKey) {
    log({ event: "tutor_not_configured" });
    return json({ error: "ai_not_configured", message: "Defina o secret GROQ_API_KEY." }, 503, req);
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, req);
  }

  const querStream = payload?.stream === true;
  const mensagens = Array.isArray(payload?.messages) ? payload.messages : [];
  if (!mensagens.length) return json({ error: "empty_history" }, 400, req);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  // Etapa 13: rate limit ANTES de gastar cota do provider. O contador vive
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
  const ultimaDoCliente = [...mensagens].reverse().find((m) => m?.role === "user");
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
  }

  // A mensagem nova entra no prompt mesmo antes de ir para o banco,
  // para a aluna ver a resposta imediatamente.
  const contents = toChatMessages([...historico, { role: "user", content: textoUsuario }]);
  if (!contents.length) return json({ error: "empty_history" }, 400, req);

  const system = buildTutorSystemPrompt(context);
  const started = Date.now();
  const opcoes = { system, contents, timeoutMs: TUTOR_TIMEOUT_MS, models: TUTOR_MODELS };
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
  //
  // POR QUE NAO USAR ReadableStream COM start() ASSINCRONO:
  // nesse formato o runtime da Edge agrupa as gravacoes e o cliente
  // recebe apenas o ULTIMO evento. Medido no site: o backend via 8
  // chunks do modelo, mas na rede chegavam so "start" e "done", com
  // ZERO eventos delta - a resposta aparecia de uma vez, sem animacao.
  //
  // A CORRECAO: pegamos o writer de um TransformStream e escrevemos
  // fora do fluxo. Cada gravacao vira uma escrita independente, que o
  // runtime repassa na hora.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const enviar = (evento, dados) =>
    writer.write(encoder.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`));

  enviar("start", { conversationId }).catch(() => {});

  complete(apiKey, opcoes, {
    log,
    onChunk: (pedaco) => {
      // Sem await de proposito: nao seguramos a leitura do modelo.
      void enviar("delta", { text: pedaco });
    },
  })
    .then(async (r) => {
      // "done" leva o texto completo: a UI reconcilia por aqui caso
      // algum delta tenha se perdido na rede.
      await enviar("done", {
        reply: r.text,
        model: r.model,
        conversationId,
        retries: r.retries,
        timeToFirstTokenMs: r.firstTokenMs ?? null,
        requestMs: r.requestMs,
      });
      await persistir(db, { auth, conversationId, textoUsuario, r });
    })
    .catch(async (error) => {
      const status = mapStatus(error);
      log({ event: "tutor_stream_failed", status, error_type: error?.message ?? "erro", request_ms: Date.now() - started });
      await enviar("error", {
        error: error?.message ?? "tutor_unavailable",
        message: mensagemAmigavel(error),
      }).catch(() => {});
    })
    .finally(() => {
      writer.close().catch(() => {});
    });

  return new Response(readable, {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

async function persistir(db, { auth, conversationId, textoUsuario, r }) {
  if (!conversationId) return;
  try {
    await db.saveMessage({ userId: auth.userId, conversationId, role: "user", content: textoUsuario });
    await db.saveMessage({ userId: auth.userId, conversationId, role: "assistant", content: r.text, model: r.model });
  } catch (error) {
    log({ event: "tutor_persist_failed", error: String(error?.message ?? error).slice(0, 120) });
  }
}

