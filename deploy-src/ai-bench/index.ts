// ============================================================
// ai-bench — FASE 1: compara modelos NVIDIA com o MESMO prompt.
// ------------------------------------------------------------
// NAO salva nada no banco e NAO faz parte do site: existe so para
// medir latencia, JSON valido e validateLesson por modelo.
// Chama com: { "case": "portugues" | "ciencias", "model": "..." }
// ============================================================

import { authenticate, handleOptions, json } from "./_http.js";
import { validateLesson } from "./_schemas.js";
import { buildLessonPrompt } from "./_prompts.js";
import { BENCH_MODELS, AI_BASE_URL, AI_MAX_TOKENS, AI_TEMPERATURE, AI_REQUEST_TIMEOUT_MS } from "./_ai_config.js";

// Mesmo payload do cronograma real de 29/09/2026 (Semana 1, base).
const CASES = {
  portugues: {
    curriculumVersion: "bench", week: 1, day: 2, dateKey: "2099-01-04",
    weekday: "Ter", phase: "base", phaseLabel: "Base",
    block: 1, blockCount: 2, blockLabel: "Bloco 1 de 2",
    dayTotalMinutes: 120, dayBreakMinutes: 10, breakAfterMinutes: 10,
    kind: "lesson", subject: "Português", topic: "informação explícita",
    subtopics: ["informação explícita", "informação implícita", "compreensão", "interpretação"],
    objectives: ["Português: informação explícita; informação implícita; compreensão; interpretação"],
    durationMinutes: 55, studentLevel: "Fundamental II",
  },
  ciencias: {
    curriculumVersion: "bench", week: 1, day: 2, dateKey: "2099-01-05",
    weekday: "Ter", phase: "base", phaseLabel: "Base",
    block: 2, blockCount: 2, blockLabel: "Bloco 2 de 2",
    dayTotalMinutes: 120, dayBreakMinutes: 10, breakAfterMinutes: 0,
    kind: "lesson", subject: "Ciências", topic: "matéria",
    subtopics: ["matéria", "substância", "mistura", "estados físicos"],
    objectives: ["Ciências: matéria; substância; mistura; estados físicos"],
    durationMinutes: 55, studentLevel: "Fundamental II",
  },
};

function extractJson(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/^[\s`]*```(?:json|javascript)?\s*/i, "")
    .replace(/\s*```[\s`]*$/i, "")
    .trim();
  const candidates = [cleaned];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > -1 && last > first) candidates.push(cleaned.slice(first, last + 1));
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c); } catch {
      try { return JSON.parse(c.replace(/,\s*([}\]])/g, "$1")); } catch { /* proximo */ }
    }
  }
  return null;
}

async function callModel(apiKey, model, messages, { jsonMode = true } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  const body = {
    model, messages, temperature: AI_TEMPERATURE, top_p: 0.9,
    max_tokens: AI_MAX_TOKENS, stream: false,
    chat_template_kwargs: { enable_thinking: false },
  };
  // Alguns modelos (ex.: DiffusionGemma) rejeitam json_object sem schema.
  if (jsonMode) body.response_format = { type: "json_object" };
  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* nao-json */ }
    if (!res.ok) {
      // A NVIDIA devolve {detail:{...}} as vezes: extrai a mensagem real.
      const d = data?.detail ?? data?.error ?? data?.message ?? raw ?? "";
      const detail = typeof d === "string" ? d : JSON.stringify(d);
      return {
        ok: false, model, requestMs: Date.now() - started,
        error: `http_${res.status}`,
        detail: detail.replace(/\s+/g, " ").slice(0, 300),
      };
    }
    const choice = data?.choices?.[0];
    const content = String(choice?.message?.content ?? "").trim();
    return {
      ok: true, model, requestMs: Date.now() - started,
      content, rawLen: raw.length,
      completionTokens: data?.usage?.completion_tokens ?? null,
      promptTokens: data?.usage?.prompt_tokens ?? null,
      finishReason: choice?.finish_reason ?? "",
      reportedModel: data?.model ?? model,
    };
  } catch (error) {
    return {
      ok: false, model, requestMs: Date.now() - started,
      error: error?.name === "AbortError" ? "timeout" : "network_error",
      detail: String(error?.message ?? error).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized" }, 401, req);

  let input = {};
  try { input = await req.json(); } catch { /* body vazio = roda o bench inteiro */ }

  const apiKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!apiKey) return json({ error: "ai_not_configured" }, 503, req);

  const caso = CASES[input.case ?? "portugues"];
  if (!caso) return json({ error: "unknown_case", cases: Object.keys(CASES) }, 400, req);

  const models = input.model ? [input.model] : BENCH_MODELS;
  const repeats = Math.min(3, Math.max(1, Number(input.repeats) || 1));
  // DiffusionGemma exige desligar json_object (rejeita sem schema).
  const jsonMode = input.jsonMode === false ? false : true;

  const { system, user } = buildLessonPrompt(caso);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const results = [];
  for (const model of models) {
    for (let attempt = 1; attempt <= repeats; attempt += 1) {
      const r = await callModel(apiKey, model, messages, { jsonMode });
      if (!r.ok) {
        results.push({ ...r, case: input.case ?? "portugues", attempt });
        continue;
      }
      const parsed = extractJson(r.content);
      const validation = parsed ? validateLesson(parsed, caso) : { ok: false, errors: ["extractJson: nao extraiu objeto"] };
      results.push({
        case: input.case ?? "portugues",
        model: r.model,
        reportedModel: r.reportedModel,
        attempt,
        requestMs: r.requestMs,
        rawLen: r.rawLen,
        completionTokens: r.completionTokens,
        promptTokens: r.promptTokens,
        finishReason: r.finishReason,
        jsonOk: Boolean(parsed),
        validateOk: validation.ok,
        validateErrors: validation.ok ? [] : validation.errors.slice(0, 6),
        rawContent: r.content.slice(0, 1200),
        counts: validation.ok ? {
          objectives: validation.data.objectives.length,
          sections: validation.data.sections.length,
          guidedPractice: validation.data.guidedPractice.length,
          commonMistakes: validation.data.commonMistakes.length,
          summary: validation.data.summary.length,
          chars: JSON.stringify(validation.data).length,
          words: JSON.stringify(validation.data).split(/\s+/).length,
        } : null,
        lesson: validation.ok ? validation.data : null,
      });
    }
  }

  return json({ case: input.case ?? "portugues", promptChars: system.length + user.length, results }, 200, req);
});

    };
  } catch (error) {
    return {
      ok: false, model, requestMs: Date.now() - started,
      error: error?.name === "AbortError" ? "timeout" : "network_error",
      detail: String(error?.message ?? error).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}
