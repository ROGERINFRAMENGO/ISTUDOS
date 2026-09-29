import { authenticate, handleOptions, json } from "../_shared/http.js";
import { requestJson, AiError } from "../_shared/nvidia.js";
import { validateQuiz } from "../_shared/schemas.js";
import { buildQuizPrompt } from "../_shared/prompts.js";
import { buildPerformance, createDb } from "../_shared/db.js";

// ============================================================
// generate-quiz
// ------------------------------------------------------------
// Gera o quiz a partir da aula REALMENTE gerada (lida do banco pelo id,
// com RLS). Valida cada questao e so salva se estiver tudo certo.
// ============================================================

function statusForError(error) {
  if (error instanceof AiError) {
    if (error.message === "missing_api_key") return 503;
    if (error.status === 429) return 429;
    return 502;
  }
  return 500;
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

  const apiKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!apiKey) return json({ error: "ai_not_configured", message: "Defina o secret NVIDIA_API_KEY." }, 503, req);

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

  // 2. Cache: mesmo aula + mesma dificuldade = mesmo quiz (nada de recomecar).
  if (lessonId && !input?.force) {
    try {
      const cached = await db.findQuiz(lessonId, difficulty);
      if (cached?.quiz_data) {
        return json({ quiz: cached.quiz_data, id: cached.id, cached: true, model: cached.model }, 200, req);
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

  const promptInput = { ...input, subject, topic, difficulty, lesson, studentPerformance: performance };
  const { system, user } = buildQuizPrompt(promptInput);

  let validation;
  let model = "meta/muse-glimmer-30b";
  try {
    const first = await requestJson(apiKey, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.5,
      maxTokens: 2600,
    });
    model = first.model ?? model;
    validation = validateQuiz(first.data, promptInput);

    if (!validation.ok) {
      console.warn("[generate-quiz] JSON invalido, refazendo:", validation.errors.slice(0, 6).join(" | "));
      const correction = [
        user,
        "",
        "SUA RESPOSTA ANTERIOR FOI REJEITADA. Corrija exatamente estes pontos e devolva o JSON inteiro de novo:",
        validation.errors.slice(0, 12).map((error) => `- ${error}`).join("\n"),
      ].join("\n");
      const second = await requestJson(apiKey, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: correction },
        ],
        temperature: 0.1,
        maxTokens: 2600,
      });
      validation = validateQuiz(second.data, promptInput);
    }
  } catch (error) {
    console.error("[generate-quiz] IA indisponivel", error);
    return json(
      { error: "ai_unavailable", message: "A IA nao respondeu agora. Tente de novo em instantes.", detail: String(error?.message ?? error) },
      statusForError(error),
      req,
    );
  }

  if (!validation.ok) {
    return json(
      { error: "invalid_ai_output", message: "O quiz veio fora do formato. Nada foi salvo.", errors: validation.errors.slice(0, 12) },
      502,
      req,
    );
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
        model,
      });
    } catch (error) {
      console.error("[generate-quiz] falha ao salvar", error);
      return json({ quiz: validation.data, id: null, cached: false, saveFailed: true, model }, 200, req);
    }
  }

  return json({ quiz: saved?.quiz_data ?? validation.data, id: saved?.id ?? null, cached: false, model }, 200, req);
});
