// ai-bench (v2): busca um fallback mais rapido que o Muse Glimmer.
// NAO salva nada no banco e NAO faz parte do site.
// Body: { case, models:[], repeats, jsonMode:true|false|"auto", probe:bool }
import { authenticate, handleOptions, json } from "./_http.js";
import { requestJson, supportsJsonMode, chatCompletion, AiError } from "./_nvidia.js";
import { validateLesson } from "./_schemas.js";
import { buildLessonPrompt } from "./_prompts.js";
import { AI_REQUEST_TIMEOUT_MS } from "./_ai_config.js";

// Usa EXATAMENTE o codigo de producao (_shared/nvidia.js -> requestJson,
// que ja tem extractJson, supportsJsonMode, AbortController e retry HTTP).
const CASES = {
  portugues: {
    curriculumVersion: "bench", week: 1, day: 2, dateKey: "2026-09-29",
    weekday: "Ter 29/09", phase: "base",
    phaseLabel: "Base — fundamentos de Matemática, Português, Ciências, História e Inglês",
    block: 1, blockCount: 2, blockLabel: "Bloco 1 de 2",
    dayTotalMinutes: 120, dayBreakMinutes: 10, breakAfterMinutes: 10,
    kind: "lesson", subject: "Português", topic: "informação explícita",
    subtopics: ["informação explícita", "informação implícita", "compreensão", "interpretação"],
    objectives: ["Português: informação explícita; informação implícita; compreensão; interpretação"],
    durationMinutes: 55, studentLevel: "Fundamental II",
  },
  ciencias: {
    curriculumVersion: "bench", week: 1, day: 2, dateKey: "2026-09-29",
    weekday: "Ter 29/09", phase: "base",
    phaseLabel: "Base — fundamentos de Matemática, Português, Ciências, História e Inglês",
    block: 2, blockCount: 2, blockLabel: "Bloco 2 de 2",
    dayTotalMinutes: 120, dayBreakMinutes: 10, breakAfterMinutes: 0,
    kind: "lesson", subject: "Ciências", topic: "matéria",
    subtopics: ["matéria", "substância", "mistura", "estados físicos"],
    objectives: ["Ciências: matéria; substância; mistura; estados físicos"],
    durationMinutes: 55, studentLevel: "Fundamental II",
  },
};

// Heuristicas de qualidade. Nao substituem a leitura humana da aula.
// Tudo aqui e defensivo: um modelo pode devolver campos fora do formato e
// essa funcao jamais pode lancar (senao mascaramos a falha real).
function quality(lesson, caso) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const practice = Array.isArray(lesson?.guidedPractice) ? lesson.guidedPractice : [];
  const t = JSON.stringify(lesson ?? {});
  const txt = sections
    .map((s) => `${s?.title ?? ""} ${s?.explanation ?? ""} ${(Array.isArray(s?.examples) ? s.examples : []).map((e) => `${e?.problem ?? ""} ${e?.solution ?? ""} ${e?.explanation ?? ""}`).join(" ")}`)
    .join(" ");
  const subs = caso.subtopics ?? [];
  const achados = subs.filter((s) => txt.toLowerCase().includes(String(s).toLowerCase().split(" ")[0]));
  return {
    subtopicos: `${achados.length}/${subs.length}`,
    placeholders: /\b(TODO|TBD|xxx|placeholder|cole aqui)\b/i.test(t),
    inventou_nota: /\b(sua nota|voc\u00ea tirou|sua m\u00e9dia \u00e9|nota \d)/i.test(t),
    delegou_pesquisa: /(pesquise no google|assista (a|um) v\u00eddeo|procure no youtube)/i.test(t),
    com_exemplo: sections.length > 0 && sections.every((s) => (Array.isArray(s?.examples) ? s.examples.length : 0) >= 1),
    exercicio_completo: practice.length > 0 && practice.every((g) => g?.question && g?.hint && g?.answer && g?.explanation),
    resposta_explicada: practice.every((g) => !g?.answer || String(g?.explanation ?? "").includes(String(g.answer).slice(0, 18))),
    markdown: /\*\*|^#{1,6}\s/m.test(t),
    html: /<\s*\/?\s*(div|span|p|br|img|table)\b/i.test(t),
    acentos_ok: /[\u00e1\u00e0\u00e2\u00e3\u00e9\u00ea\u00ed\u00f3\u00f4\u00f5\u00fa\u00e7]/i.test(t),
  };
}

// Contagem segura: um modelo pode devolver string onde esperamos array.
const len = (value) => (Array.isArray(value) ? value.length : 0);

// Descobre se o modelo aceita response_format json_object.
async function probeJsonMode(apiKey, model) {
  try {
    const r = await chatCompletion(apiKey, {
      model, jsonMode: true, maxTokens: 200, timeoutMs: 45000,
      messages: [
        { role: "system", content: "Responda SOMENTE com JSON valido." },
        { role: "user", content: 'Responda apenas: {"ok":true}' },
      ],
    });
    return { suporta: true, detail: `aceitou (finish=${r.finishReason})` };
  } catch (error) {
    return {
      suporta: false,
      detail: `${error?.message ?? "erro"}: ${String(error?.detail ?? "").slice(0, 160)}`,
    };
  }
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    // Sem isto, um erro de codigo vira "500 sem corpo" e parece falha
    // de modelo. Devolvemos a pilha para o diagnostico local.
    console.error("[bench] erro nao tratado", error);
    return json({
      error: "bench_crash",
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? "").split("\n").slice(0, 6),
    }, 500, req);
  }
});

async function handle(req) {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized" }, 401, req);

  let input = {};
  try { input = await req.json(); } catch { /* body vazio */ }

  const apiKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!apiKey) return json({ error: "ai_not_configured" }, 503, req);

  const caso = CASES[input.case ?? "portugues"];
  if (!caso) return json({ error: "unknown_case", cases: Object.keys(CASES) }, 400, req);

  const models = Array.isArray(input.models) && input.models.length
    ? input.models
    : ["openai/gpt-oss-20b", "google/gemma-4-31b-it", "meta/muse-glimmer-30b"];
  const repeats = Math.min(4, Math.max(1, Number(input.repeats) || 1));

  const { system, user } = buildLessonPrompt(caso);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const results = [];
  for (const model of models) {
    // "auto" = deixa supportsJsonMode() decidir, igual a producao.
    const jsonModeWanted = input.jsonMode === undefined || input.jsonMode === "auto"
      ? supportsJsonMode(model)
      : Boolean(input.jsonMode);

    const probe = input.probe === false ? null : await probeJsonMode(apiKey, model);

    for (let attempt = 1; attempt <= repeats; attempt += 1) {
      const started = Date.now();
      const row = { case: input.case ?? "portugues", model, attempt, jsonModeWanted, probeJsonMode: probe };

      try {
        // gpt-oss e um modelo de raciocinio: sem reasoning_effort=low ele
        // gasta os 2400 tokens pensando e devolve content vazio. Com ele,
        // escreve curto demais e a aula sai truncada (sections vazias).
        // Por isso o bench aceita maxTokens e reasoning por request.
        const r = await requestJson(apiKey, {
          messages, model, temperature: 0.55,
          maxTokens: Number(input.maxTokens) || 2400,
          jsonMode: jsonModeWanted, timeoutMs: AI_REQUEST_TIMEOUT_MS,
          reasoning: input.reasoning === "low" ? "low" : undefined,
        }, { attempts: 1 }); // 1 tentativa: mede o modelo, nao a resiliencia

        const validation = validateLesson(r.data, caso);
        // A medicao nunca pode derrubar o resultado: se a propria
        // instrumentacao falhar, registramos o erro dela e NAO o do modelo.
        let counts = null;
        let q = null;
        try {
          counts = {
            objectives: len(validation.data?.objectives),
            sections: len(validation.data?.sections),
            guidedPractice: len(validation.data?.guidedPractice),
            commonMistakes: len(validation.data?.commonMistakes),
            summary: len(validation.data?.summary),
            chars: JSON.stringify(validation.data ?? {}).length,
            words: JSON.stringify(validation.data ?? {}).split(/\s+/).length,
          };
          q = quality(validation.data, caso);
        } catch (measurementError) {
          console.warn("[bench] falha na medicao", measurementError);
        }
        // Guardamos o bruto quando a validacao falha: sem isso nao da para
        // dizer SE o modelo errou o conteudo ou so a forma.
        const rawPreview = validation.ok ? null : JSON.stringify(r.data).slice(0, 700);
        Object.assign(row, {
          ok: validation.ok,
          totalMs: Date.now() - started,
          requestMs: r.requestMs,
          jsonOk: true,
          extractOk: true,
          validateOk: validation.ok,
          validateErrors: validation.ok ? [] : validation.errors.slice(0, 6),
          completionTokens: r.usage?.completion_tokens ?? null,
          promptTokens: r.usage?.prompt_tokens ?? null,
          finishReason: r.finishReason,
          usedJsonMode: r.jsonMode,
          // requestJson NAO devolve o texto bruto (so o objeto parseado),
          // entao medimos o tamanho pela aula ja validada.
          rawChars: JSON.stringify(validation.data ?? {}).length,
          rawPreview,
          counts,
          quality: q,
          lesson: validation.ok ? validation.data : null,
        });
      } catch (error) {
        Object.assign(row, {
          ok: false,
          totalMs: Date.now() - started,
          error: error?.message ?? String(error),
          isAiError: error instanceof AiError,
          status: error?.status ?? 0,
          detail: String(error?.detail ?? error?.message ?? "").slice(0, 300),
          // Pilha em erros de codigo (nao de modelo): sem isso um bug de
          // instrumentacao aparece como se fosse falha do modelo.
          stack: error instanceof AiError ? null : String(error?.stack ?? "").split("\n").slice(0, 4).join(" <- "),
        });
      }
      results.push(row);
    }
  }

  return json({
    case: input.case ?? "portugues",
    promptChars: String(system ?? "").length + String(user ?? "").length,
    models, repeats, results,
  }, 200, req);
}

