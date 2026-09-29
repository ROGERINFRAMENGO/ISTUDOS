// ============================================================
// Validacao das respostas da IA antes de salvar no banco.
// ------------------------------------------------------------
// Regra de ouro: nunca salvar lixo. Se a resposta nao bate com o formato
// esperado, devolve { ok:false, errors } e o conteudo NAO e gravado.
// JS puro (ESM): testavel com "npm test" no Node e importado pelas
// Edge Functions no Deno.
// ============================================================

// Textos que denunciam resposta incompleta / placeholder.
const PLACEHOLDER_PATTERNS = [
  /cole\s+aqui/i,
  /cole\s+o\s+link/i,
  /placeholder/i,
  /lorem\s+ipsum/i,
  /\bTODO\b/,
  /\bTBD\b/,
  /preencher\s+aqui/i,
  /insira\s+aqui/i,
  /x{3,}/i,
];

// A IA gera DADOS, nunca HTML.
const HTML_PATTERN =
  /<\s*\/?\s*(div|span|p|br|img|iframe|script|style|table|tr|td|th|h[1-6]|strong|em|b|i|u|a\s|ul|ol|li|section|article)\b/i;

// A aula precisa ser autossuficiente: nada de "pesquise isso".
const DELEGATING_PATTERN =
  /(pesquise\s+(isso|na\s+internet|no\s+google)|assista\s+(a\s+)?(um\s+)?(video|v[ií]deo)|procure\s+(no|na)\s+(youtube|google|internet))/i;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikePlaceholder(text) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function readString(value, { field, errors, min = 1, max = 4000, required = true }) {
  const text = cleanText(value);
  if (!text) {
    if (required) errors.push(`${field}: texto vazio`);
    return "";
  }
  if (text.length < min) errors.push(`${field}: muito curto (${text.length} caracteres, minimo ${min})`);
  if (text.length > max) errors.push(`${field}: muito longo (${text.length} caracteres, maximo ${max})`);
  if (HTML_PATTERN.test(text)) errors.push(`${field}: contem HTML`);
  if (looksLikePlaceholder(text)) errors.push(`${field}: contem placeholder`);
  return text;
}

function readStringList(value, { field, errors, minItems, maxItems, minChars = 8, maxChars = 600 }) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : [];
  const items = [];
  raw.forEach((entry, index) => {
    const text = readString(entry, { field: `${field}[${index}]`, errors, min: minChars, max: maxChars });
    if (DELEGATING_PATTERN.test(text)) errors.push(`${field}[${index}]: manda pesquisar fora em vez de explicar`);
    if (text) items.push(text);
  });
  if (items.length < minItems) errors.push(`${field}: minimo ${minItems} itens, veio ${items.length}`);
  if (items.length > maxItems) errors.push(`${field}: maximo ${maxItems} itens, veio ${items.length}`);
  return items;
}

function normalizeDifficulty(value, fallback = "medium") {
  const text = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "");
  if (/facil|easy|inicio|basic/.test(text)) return "easy";
  if (/dificil|hard|avancad|etec/.test(text)) return "hard";
  if (/medi|medium|intermedi/.test(text)) return "medium";
  return fallback;
}

export { cleanText, looksLikePlaceholder, normalizeDifficulty, DELEGATING_PATTERN };

// ------------------------------------------------------------
// AULA
// ------------------------------------------------------------
/**
 * Valida e normaliza a aula gerada pela IA.
 * subject/topic vens do CRONOGRAMA (parametros), nunca do modelo:
 * a IA nao pode mudar o curriculo.
 * @returns {{ok:boolean, data?:object, errors:string[]}}
 */
export function validateLesson(raw, input = {}) {
  const errors = [];
  const source = raw && typeof raw === "object" ? raw : {};

  const title = readString(source.title, { field: "title", errors, min: 5, max: 120 });
  const introduction = readString(source.introduction, { field: "introduction", errors, min: 40, max: 1600 });

  const objectives = readStringList(source.objectives, {
    field: "objectives",
    errors,
    minItems: 1,
    maxItems: 6,
    minChars: 10,
    maxChars: 220,
  });

  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  if (rawSections.length < 2) errors.push(`sections: minimo 2 secoes, veio ${rawSections.length}`);
  if (rawSections.length > 6) errors.push(`sections: maximo 6 secoes, veio ${rawSections.length}`);

  const sections = rawSections.map((section, index) => {
    const sectionTitle = readString(section?.title, { field: `sections[${index}].title`, errors, min: 4, max: 140 });
    const explanation = readString(section?.explanation, {
      field: `sections[${index}].explanation`,
      errors,
      min: 80,
      max: 3500,
    });
    if (DELEGATING_PATTERN.test(explanation)) {
      errors.push(`sections[${index}].explanation: manda pesquisar fora em vez de explicar`);
    }

    const rawExamples = Array.isArray(section?.examples) ? section.examples : [];
    if (index === 0 && rawExamples.length === 0) {
      errors.push("sections[0].examples: a primeira secao precisa de 1 exemplo resolvido");
    }
    if (rawExamples.length > 3) errors.push(`sections[${index}].examples: maximo 3 exemplos`);

    const examples = rawExamples.map((example, exampleIndex) => {
      const at = `sections[${index}].examples[${exampleIndex}]`;
      return {
        problem: readString(example?.problem, { field: `${at}.problem`, errors, min: 15, max: 600 }),
        solution: readString(example?.solution, { field: `${at}.solution`, errors, min: 20, max: 1600 }),
        explanation: readString(example?.explanation ?? example?.why, {
          field: `${at}.explanation`,
          errors,
          min: 15,
          max: 900,
        }),
      };
    });

    return { title: sectionTitle, explanation, examples };
  });

  const rawPractice = Array.isArray(source.guidedPractice) ? source.guidedPractice : [];
  if (rawPractice.length < 2) errors.push(`guidedPractice: minimo 2 exercicios, veio ${rawPractice.length}`);
  if (rawPractice.length > 6) errors.push("guidedPractice: maximo 6 exercicios");

  const guidedPractice = rawPractice.map((item, index) => {
    const at = `guidedPractice[${index}]`;
    return {
      question: readString(item?.question, { field: `${at}.question`, errors, min: 15, max: 600 }),
      hint: readString(item?.hint, { field: `${at}.hint`, errors, min: 8, max: 300 }),
      answer: readString(item?.answer, { field: `${at}.answer`, errors, min: 3, max: 400 }),
      explanation: readString(item?.explanation, { field: `${at}.explanation`, errors, min: 20, max: 1200 }),
    };
  });

  const commonMistakes = readStringList(source.commonMistakes, {
    field: "commonMistakes",
    errors,
    minItems: 2,
    maxItems: 6,
    minChars: 15,
    maxChars: 320,
  });

  const summary = readStringList(source.summary, {
    field: "summary",
    errors,
    minItems: 2,
    maxItems: 8,
    minChars: 10,
    maxChars: 320,
  });

  const requestedMinutes = Number(input.durationMinutes) || 40;
  const generatedMinutes = Number(source.estimatedMinutes);
  const estimatedMinutes = Number.isFinite(generatedMinutes)
    ? Math.min(120, Math.max(10, Math.round(generatedMinutes)))
    : requestedMinutes;

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    data: {
      title,
      // O curriculo vem do cronograma, nunca do modelo.
      subject: cleanText(input.subject) || cleanText(source.subject) || "Estudo",
      topic: cleanText(input.topic) || cleanText(source.topic) || "Aula",
      estimatedMinutes,
      objectives,
      introduction,
      sections,
      guidedPractice,
      commonMistakes,
      summary,
    },
  };
}

// ------------------------------------------------------------
// QUIZ
// ------------------------------------------------------------
const LETTERS = ["a", "b", "c", "d", "e", "f"];

/** Aceita 0, "0", 2, "A"/"a" e devolve o indice 0-based (ou null). */
export function normalizeAnswerIndex(value, optionCount) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 0 && value < optionCount ? value : null;
  }
  const text = String(value ?? "").trim().toLowerCase().replace(/[).,]$|^\(/, "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const index = Number(text);
    return index >= 0 && index < optionCount ? index : null;
  }
  const letterIndex = LETTERS.indexOf(text);
  return letterIndex > -1 && letterIndex < optionCount ? letterIndex : null;
}

/**
 * Valida e normaliza o quiz gerado pela IA.
 * So aceita multiple_choice (unico tipo que a interface corrige hoje).
 * @returns {{ok:boolean, data?:object, errors:string[], warnings:string[]}}
 */
export function validateQuiz(raw, input = {}) {
  const errors = [];
  const warnings = [];
  const source = raw && typeof raw === "object" ? raw : {};
  const requested = Math.min(15, Math.max(3, Number(input.questionCount) || 5));
  const difficulty = normalizeDifficulty(input.difficulty, "medium");

  const rawQuestions = Array.isArray(source.questions)
    ? source.questions
    : Array.isArray(source.items)
      ? source.items
      : Array.isArray(source.quiz)
        ? source.quiz
        : [];

  if (!rawQuestions.length) return { ok: false, errors: ["questions: nenhuma questao encontrada na resposta"], warnings };
  if (rawQuestions.length > requested) {
    warnings.push(`questions: vieram ${rawQuestions.length}, truncando para ${requested}`);
  }
  const minAccepted = Math.min(requested, Math.max(3, requested - 1));
  if (rawQuestions.length < minAccepted) {
    errors.push(`questions: pedido ${requested}, vieram apenas ${rawQuestions.length}`);
  }

  const title = readString(source.title, { field: "title", errors, min: 5, max: 120, required: false })
    || `Quiz de ${cleanText(input.topic) || "Estudo"}`;

  const seen = new Set();
  const questions = rawQuestions.slice(0, requested).map((item, index) => {
    const at = `questions[${index}]`;
    const question = readString(item?.question ?? item?.statement, { field: `${at}.question`, errors, min: 12, max: 700 });

    const rawOptions = Array.isArray(item?.options) ? item.options : Array.isArray(item?.alternatives) ? item.alternatives : [];
    if (rawOptions.length < 2) errors.push(`${at}.options: minimo 2 alternativas, veio ${rawOptions.length}`);
    if (rawOptions.length > 6) errors.push(`${at}.options: maximo 6 alternativas`);

    const options = [];
    rawOptions.forEach((option, optionIndex) => {
      const text = readString(option, { field: `${at}.options[${optionIndex}]`, errors, min: 1, max: 300 });
      const normalized = text.toLowerCase().replace(/\s+/g, " ");
      if (options.some((existing) => existing.toLowerCase().replace(/\s+/g, " ") === normalized)) {
        errors.push(`${at}.options[${optionIndex}]: alternativa repetida (resposta ambigua)`);
      }
      if (text) options.push(text);
    });

    const correctAnswer = normalizeAnswerIndex(
      item?.correctAnswer ?? item?.correct ?? item?.answerIndex ?? item?.answer,
      options.length,
    );
    if (correctAnswer === null) errors.push(`${at}.correctAnswer: indice invalido ou faltando`);

    const explanation = readString(item?.explanation, { field: `${at}.explanation`, errors, min: 12, max: 900 });
    if (DELEGATING_PATTERN.test(question)) errors.push(`${at}.question: manda pesquisar fora em vez de responder`);
    if (question) {
      const key = question.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) errors.push(`${at}.question: questao duplicada`);
      seen.add(key);
    }

    const type = cleanText(item?.type || "multiple_choice").toLowerCase();
    if (type !== "multiple_choice") {
      errors.push(`${at}.type: tipo "${type}" ainda nao e corrigido pela interface (use multiple_choice)`);
    }

    return {
      id: `q${index + 1}`,
      type: "multiple_choice",
      question,
      options,
      correctAnswer: correctAnswer ?? 0,
      // "correct" e o nome que o LessonPage ja usa para corrigir.
      correct: correctAnswer ?? 0,
      explanation,
      difficulty: normalizeDifficulty(item?.difficulty, difficulty),
      skill: cleanText(item?.skill) || cleanText(input.topic) || "geral",
    };
  });

  if (errors.length) return { ok: false, errors, warnings };

  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      title: title || `Quiz de ${cleanText(input.topic) || "Estudo"}`,
      subject: cleanText(input.subject) || "Estudo",
      topic: cleanText(input.topic) || "Aula",
      difficulty,
      questions,
    },
  };
}



