import { authenticate, handleOptions, json } from "../_shared/http.js";
import { chatCompletionWithRetry, extractJson, AiError } from "../_shared/nvidia.js";
import { buildTutorPrompt, TUTOR_TOOLS } from "../_shared/prompts.js";
import { buildPerformance, createDb } from "../_shared/db.js";

// ============================================================
// tutor — a Tutora IA do ISTUDOS
// ------------------------------------------------------------
// A pessoa do chat continua a mesma, mas agora quem responde e o
// meta/muse-glimmer-30b, com contexto REAL da aluna lido do banco
// (desempenho, erros recentes, progresso) + o cronograma/aula que o
// app esta mostrando. As ferramentas sao SOMENTE LEITURA: a IA nao
// escreve nada no banco.
// ============================================================

const HISTORY_LIMIT = 12;
const MAX_MESSAGE_CHARS = 1500;
const MAX_TOOL_ROUNDS = 2;

function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message === "object" && (message.role === "user" || message.role === "assistant"))
    .slice(-HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? "").slice(0, MAX_MESSAGE_CHARS),
    }));
}

/** { reply, action } quando a tutora quer abrir um simulado; senao null. */
function parseAction(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed.startsWith("{")) return null;
  const parsed = extractJson(trimmed);
  if (!parsed || !(parsed.reply || parsed.message)) return null;
  return { reply: String(parsed.reply ?? parsed.message), action: parsed.action ?? null };
}

/** Executa uma ferramenta somente-leitura. Nunca escreve no banco. */
async function runTool(name, args, { db, context }) {
  try {
    if (name === "get_current_schedule") {
      return JSON.stringify({
        today: context?.today ?? null,
        schedule: (context?.schedule ?? []).slice(0, 8),
      });
    }
    if (name === "get_student_progress") {
      const row = await db.progressRow();
      return JSON.stringify(row ?? context?.student ?? {});
    }
    if (name === "get_current_lesson") {
      return JSON.stringify(context?.lesson ?? null);
    }
    if (name === "get_weak_topics") {
      const attempts = await db.recentAttempts(400);
      return JSON.stringify(buildPerformance(attempts, {}).weakTopics ?? []);
    }
    if (name === "get_recent_mistakes") {
      const limit = Math.min(20, Number(args?.limit) || 10);
      const attempts = await db.recentAttempts(120);
      return JSON.stringify(
        attempts
          .filter((attempt) => !attempt.correct)
          .slice(0, limit)
          .map((attempt) => ({ subject: attempt.subject, topic: attempt.topic, questionId: attempt.question_id })),
      );
    }
    return JSON.stringify({ error: `ferramenta_desconhecida: ${name}` });
  } catch (error) {
    console.warn(`[tutor] ferramenta ${name} falhou`, error);
    return JSON.stringify({ error: "dados_indisponiveis" });
  }
}

/** Junta o contexto do app com os numeros reais do banco. */
async function enrichContext(context, db) {
  const enriched = { ...context };
  try {
    const [attempts, progress] = await Promise.all([db.recentAttempts(400), db.progressRow()]);
    const performance = buildPerformance(attempts, {
      subject: context?.lesson?.subject,
      topic: context?.lesson?.topic,
    });
    enriched.subjectPerformance = performance.subjectPerformance;
    enriched.weakTopics = performance.weakTopics;
    enriched.recentMistakes = performance.recentMistakes;
    enriched.student = {
      ...(context?.student ?? {}),
      ...(progress
        ? {
            xp: progress.xp ?? context?.student?.xp ?? 0,
            level: progress.level ?? context?.student?.level ?? 1,
            streak: progress.current_streak ?? context?.student?.streak ?? 0,
            longestStreak: progress.longest_streak ?? context?.student?.longestStreak ?? 0,
            lessonsCompleted: progress.lessons_completed ?? context?.student?.lessonsCompleted ?? 0,
            questionsAnswered: progress.questions_answered ?? context?.student?.questionsAnswered ?? 0,
            questionsCorrect: progress.questions_correct ?? context?.student?.questionsCorrect ?? 0,
            studyMinutes: Math.round((progress.study_seconds ?? 0) / 60) || context?.student?.studyMinutes || 0,
          }
        : {}),
    };
  } catch (error) {
    console.warn("[tutor] sem contexto do banco (seguindo com o contexto do app)", error);
  }
  return enriched;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) {
    return json({ error: "unauthorized", hint: "Ative o login anonimo no Supabase." }, 401, req);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, req);
  }

  const apiKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!apiKey) return json({ error: "ai_not_configured", message: "Defina o secret NVIDIA_API_KEY." }, 503, req);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const db = createDb({ url, anonKey, token: auth.token });

  const context = await enrichContext(payload?.context ?? {}, db);
  const history = sanitizeHistory(payload?.messages);
  if (!history.length) return json({ error: "empty_history" }, 400, req);

  const { system } = buildTutorPrompt(context);
  const messages = [{ role: "system", content: system }, ...history];

  try {
    let result = await chatCompletionWithRetry(
      apiKey,
      { messages, temperature: 0.6, maxTokens: 800, tools: TUTOR_TOOLS },
      { attempts: 2 },
    );

    // Loop de ferramentas (somente leitura): ate MAX_TOOL_ROUNDS rodadas.
    for (let round = 0; round < MAX_TOOL_ROUNDS && result.toolCalls?.length; round += 1) {
      const toolMessages = [...messages];
      toolMessages.push({
        role: "assistant",
        content: result.content ?? "",
        tool_calls: result.toolCalls,
      });
      for (const call of result.toolCalls) {
        let args = {};
        try {
          args = JSON.parse(call?.function?.arguments || "{}");
        } catch {
          args = {};
        }
        const output = await runTool(call?.function?.name, args, { db, context });
        toolMessages.push({
          role: "tool",
          tool_call_id: call?.id,
          content: output.slice(0, 3000),
        });
      }
      result = await chatCompletionWithRetry(
        apiKey,
        { messages: toolMessages, temperature: 0.6, maxTokens: 800 },
        { attempts: 1 },
      );
    }

    const text = String(result.content ?? "").trim();
    if (!text) {
      return json({ error: "empty_reply", message: "A tutora nao respondeu." }, 502, req);
    }

    const action = parseAction(text);
    return json({
      reply: action?.reply ?? text,
      action: action?.action ?? null,
      model: result.model,
    }, 200, req);
  } catch (error) {
    console.error("[tutor] IA indisponivel", error);
    const status = error instanceof AiError && error.status === 429 ? 429 : 502;
    return json(
      { error: "ai_unavailable", message: "A tutora nao respondeu agora.", detail: String(error?.message ?? error) },
      status,
      req,
    );
  }
});

