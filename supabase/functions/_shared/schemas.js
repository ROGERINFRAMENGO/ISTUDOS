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

// ------------------------------------------------------------
// METADADO DO CRONOGRAMA (Prioridade 1)
// ------------------------------------------------------------
// O bug: o prompt mandava o modelo citar "semana 1, dia 3", "bloco",
// "55 minutos" e "fica para revisao amanha", e 12 de 25 aulasJacaram
// esse log de agendamento para a aluna ler. O cronograma controla a
// GERACAO; nunca pode aparecer no TEXTO da aula.
//
// Cada padrao aqui apareceu de fato em alguma aula gerada, nao e
// especulativo.
const SCHEDULE_LEAK_PATTERNS = [
  /\bsemana\s+\d+/i,
  /\bbloco\s+\d+/i,
  /\bfase\s+(base|intermediaria|final|avancada|intensiva|critica)\b/i,
  /\b(dia|bloco)\s+(de|do)\s+\d+/i,
  /\b\d+\s*(min|minutos)\b/i,
  /\brevisao\s+(de|para)\s+amanha\b/i,
  /\b(o|que)\s+nao\s+couber\b/i,
  /\bfica\s+para\s+(a\s+)?(revisao|proxim[ao])\b/i,
  /\bhoje\s+(vamos|voc[eê])\s+(estudar|trabalhar)/i,
  /\baula\s+(anterior|passada)\b/i,
  /\bcronograma\b/i,
  /\bposicao\s+no\s+cronograma\b/i,
  /\broteiro\s+de\s+estudo\b/i,
  /\bplano\s+de\s+estudos?\b/i,
];

// Frases de preenchimento: a IA "esqueceu" de responder e devolveu
// isto no lugar do conteudo.
const HOLLOW_PHRASES = [
  /a\s+continuar/i,
  /conforme\s+explicado/i,
  /como\s+visto\s+anteriormente/i,
  /veja\s+(o|as)\s+(exemplo|exercicio)/i,
  /^\s*n\/?a\s*$/i,
  /^\s*tbd\s*$/i,
];

// Frases cortadas no meio (o modelo parou antes do fim).
const TRUNCATED_TAIL = /[,:;\-–—]\s*$/;

/** Normaliza para comparar repeticao (minusculas, sem acento, sem pontuacao). */
function fingerprint(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Números de uma conta: "48/4=12" e "4*12=48" tem os mesmos numeros. */
function numerosDe(text) {
  return (String(text ?? "").match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b).join(",");
}

/**
 * Metadado do cronograma vazado no TEXTO que a aluna le.
 * @returns {string|null} o trecho proibido, ou null se estiver limpo
 */
function findScheduleLeak(...texts) {
  for (const text of texts) {
    const value = String(text ?? "");
    for (const pattern of SCHEDULE_LEAK_PATTERNS) {
      const hit = value.match(pattern);
      if (hit) return hit[0];
    }
  }
  return null;
}

/**
 * Frase de preenchimento no lugar do conteudo real.
 * @returns {string|null}
 */
function findHollow(...texts) {
  for (const text of texts) {
    const value = String(text ?? "");
    for (const pattern of HOLLOW_PHRASES) {
      if (pattern.test(value)) return value.trim().slice(0, 60);
    }
  }
  return null;
}

/**
 * Repeticao artificial: a mesma frase devolvida duas vezes.
 * Compara por "impressao digital" do texto normalizado.
 * @returns {string[]} as frases duplicadas (para o log de erro)
 */
function findRepetitions(items) {
  const vistas = new Map();
  const duplicadas = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const chave = fingerprint(item);
    // Texto muito curto repete sem ser erro.
    if (chave.length < 40) return;
    if (vistas.has(chave)) duplicadas.push(chave.slice(0, 80));
    else vistas.set(chave, true);
  });
  return duplicadas;
}

/**
 * COERENCIA INTERNA (Prioridade 1) — deterministico, sem IA.
 *
 * NÃO e um verificador de verdade cientifica: nao descobre se uma
 * formula esta certa. Ele pega o erro mais perigoso e mais comum,
 * que ja aconteceu aqui: o enunciado mente e a resposta segue a
 * mentira, teachando a aluna o conteudo errado com toda confiança.
 *
 * Os quatro casos que ele pega:
 *   1. problema e solution-aboutadas a numeros diferentes, sem
 *      relacao entre elas (conta nao confere);
 *   2. explanation contradiz a solution (explica uma coisa, faz outra);
 *   3. answer que nao aparece nem na solution nem na explanation;
 *   4. enunciado com premissa que a propria resposta desmente
 *      (ex.: "CO2 formado de N2" + resposta "substancia simples").
 *
 * Heuristica, com folga proposital: preferimos deixar passar uma aula
 * estranha do que reprovar uma aula boa. Nenhum item aqui reprova a
 * aula sozinho sem peso; use-os como sinais.
 */
function findCoherenceIssues({ sections = [], guidedPractice = [] }) {
  const problemas = [];

  sections.forEach((section, si) => {
    (section.examples ?? []).forEach((ex, ei) => {
      const at = `sections[${si}].examples[${ei}]`;
      const { problem = "", solution = "", explanation = "" } = ex;

      // (1) conta nao confere: o problema traz uma conta (>=2 numeros
      // E sinal de operacao) e NENHUM deles reaparece na solucao. Enunciado
      // textual (mesmo com horarios) nao e conta — nao reprovar.
      const temOperacao = /[+\-*/×÷=]|dobro|terco|vezes|divi/gi.test(problem);
      const pNums = [...new Set(problem.match(/\d+/g) ?? [])];
      if (temOperacao && pNums.length >= 2) {
        // Compara sem fronteira de palavra: em "7h" o digito esta
        // grudado numa letra, e \b7\b nao casaria. Busca o numero como
        // qualquer substring solta ("18" casa dentro de "18h").
        const solucaoTem = pNums.filter((n) => solution.includes(n)).length;
        if (solucaoTem === 0) {
          problemas.push(`${at}: os numeros da conta do enunciado (${pNums.join(", ")}) nao aparecem na solucao`);
        }
      }

      // (2) explicacao contradiz solucao: a solucao entrega um numero
      // que a explicacao nunca menciona E a explicacao traz numeros
      // totalmente diferentes. Sinais de conta refeita errada.
      const sNums = solution.match(/\d+/g) ?? [];
      const eNums = explanation.match(/\d+/g) ?? [];
      if (sNums.length && eNums.length && numerosDe(solution) !== numerosDe(explanation)) {
        const algumEmComum = sNums.some((n) => explanation.includes(n));
        if (!algumEmComum) {
          problemas.push(`${at}: explicacao usa numeros diferentes dos da solucao`);
        }
      }
      // (4) mesma defesa de premissa, aplicada aos exemplos tambem.
      // O erro do CO2 real estava num EXEMPLO, nao num exercicio.
      problemas.push(...checarPremissaContradita({ at, problem, solution, explanation }));
    });
  });

  guidedPractice.forEach((item, i) => {
    const at = `guidedPractice[${i}]`;
    const { question = "", answer = "", explanation = "" } = item;
    // (3) answer nao combina com a explicacao: a resposta tem um numero
    // que a explicacao contradiz. Pega "answer: 12 / explanation: o
    // resultado e 15".
    const aNums = (answer.match(/\d+/g) ?? []).filter((n) => n.length > 0);
    if (aNums.length && explanation) {
      const naoBate = aNums.every((n) => !explanation.includes(n));
      if (naoBate && explanation.match(/\d+/g)?.length) {
        problemas.push(`${at}: a resposta (${aNums.join(", ")}) nao aparece na explicacao`);
      }
    }
    // (4) mesma defesa nos exercicios.
    problemas.push(...checarPremissaContradita({
      at, problem: question, solution: answer, explanation,
    }));
  });

  return problemas;
}

/**
 * (4) PREMISSA CONTRADITA — o caso mais grave que ja aconteceu aqui.
 *
 * A aula de Ciencias affirmou "o gas carbonico e formado de N2" e
 * respondeu "substancia simples", confirmando a premissa falsa. A
 * aluna saia de la com a coisa errada decorada.
 *
 * Sem dicionario cientifico nao da para provar que um enunciado e
 * falso. O que da para ver sao DUAS ASSIMETRIAS que apareceram
 * justamente no erro real:
 *
 *   a) a resposta copia uma das CLASSIFICACOES do enunciado
 *      (simples/composta) sem dizer por que a OUTRA esta errada;
 *   b) a explicacao introduz um elemento ou formula que o enunciado
 *      NAO cita (o enunciado dizia N2, a explicacao puxou outra
 *      coisa), sinal de que o exemplo se contradiz.
 *
 * Heuristica com folga: so dispara quando a explicacao e curta e
 * nao questiona nada. Uma aula boa que ensina as duas opcoes passa.
 */
function checarPremissaContradita({ at, problem = "", solution = "", explanation = "" }) {
  const problemas = [];
  const CLASSIFICACOES =
    /\b(simples|composta|homogenea|heterogenea|substancia simples|substancia composta)\b/gi;
  const QUIMICOS = /\b(carbono|oxigenio|nitrogenio|hidrogenio|CO2|H2O|N2|O2|CO)\b/gi;

  const noEnunciado = new Set((problem.match(CLASSIFICACOES) ?? []).map((s) => s.toLowerCase()));
  const naResposta = new Set((solution.match(CLASSIFICACOES) ?? []).map((s) => s.toLowerCase()));
  const ecoou = [...naResposta].filter((c) => noEnunciado.has(c));

  const enunciadoTem = new Set((problem.match(QUIMICOS) ?? []).map((s) => s.toLowerCase()));
  const outros = new Set(
    [...(solution.match(QUIMICOS) ?? []), ...(explanation.match(QUIMICOS) ?? [])]
      .map((s) => s.toLowerCase()),
  );
  const quimicoNovo = [...outros].some((q) => !enunciadoTem.has(q));

  // (a) resposta ecoa a classificacao, sem justificar a alternativa.
  const explicaAlternativa = explanation.includes("?") || explanation.length >= 300;
  if (ecoou.length >= 1 && !explicaAlternativa) {
    problemas.push(
      `${at}: a resposta ecoa "${ecoou[0]}" do enunciado sem explicar por que a outra opcao esta errada`,
    );
  }
  // (b) a explicacao introduz termo quimico ausente do enunciado.
  if (quimicoNovo && enunciadoTem.size > 0 && explanation.length < 420) {
    problemas.push(`${at}: a explicacao introduz termo ausente do enunciado (premissa possivelmente contraditoria)`);
  }
  return problemas;
}



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
// Prioridade 1: helpers deterministicos de auditoria pedagogica.
export {
  findScheduleLeak,
  findHollow,
  findRepetitions,
  findCoherenceIssues,
  SCHEDULE_LEAK_PATTERNS,
};

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
  if (rawSections.length < 3) errors.push(`sections: minimo 3 secoes, veio ${rawSections.length}`);
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
  if (rawPractice.length < 3) errors.push(`guidedPractice: minimo 3 exercicios, veio ${rawPractice.length}`);
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

  // ------------------------------------------------------------
  // VERIFICACOES PEDAGOGICAS (Prioridade 1)
  // ------------------------------------------------------------
  // Estas rodam DEPOIS do formato: a aula ja e um JSON valido e
  // completo, e agora verificamos se ela presta. Nenhuma delas exige
  // IA — sao heuristicas deterministicas, feitas para reprovar a aula
  // OBVIAMENTE quebrada, nunca a aula apenas diferente.

  // (A) O cronograma nao pode aparecer no texto que a aluna le.
  const introductionLeak = findScheduleLeak(introduction);
  if (introductionLeak) {
    errors.push(`introduction: vazou metadado do cronograma ("${introductionLeak}")`);
  }

  const todoTexto = [introduction, ...objectives, ...commonMistakes, ...summary];
  sections.forEach((section, i) => {
    const leak = findScheduleLeak(section.explanation, section.title);
    if (leak) errors.push(`sections[${i}]: vazou metadado do cronograma ("${leak}")`);
    (section.examples ?? []).forEach((ex, j) => {
      const exLeak = findScheduleLeak(ex.problem, ex.solution, ex.explanation);
      if (exLeak) errors.push(`sections[${i}].examples[${j}]: vazou metadado ("${exLeak}")`);
    });
  });
  guidedPractice.forEach((item, i) => {
    const pLeak = findScheduleLeak(item.question, item.explanation);
    if (pLeak) errors.push(`guidedPractice[${i}]: vazou metadado ("${pLeak}")`);
  });

  // (B) Frase de preenchimento no lugar do conteudo.
  const hollow = findHollow(introduction, ...sections.map((s) => s.explanation), ...summary);
  if (hollow) errors.push(`conteudo generico: "${hollow}"`);

  // (C) Frase cortada no meio (o modelo parou antes do fim).
  [...sections.map((s) => s.explanation), introduction].forEach((text, i) => {
    if (String(text ?? "").length > 120 && TRUNCATED_TAIL.test(String(text).trim())) {
      errors.push(`texto cortado no fim: "${String(text).trim().slice(-40)}"`);
    }
  });

  // (D) Repeticao artificial entre campos de lista.
  // Uma unica frase repetida ja e erro: significa que o modelo
  // devolveu o mesmo item duas vezes em slots diferentes.
  const repetidos = findRepetitions([...commonMistakes, ...summary, ...objectives]);
  if (repetidos.length >= 1) {
    errors.push(`repeticao artificial: "${repetidos[0].slice(0, 60)}..."`);
  }

  // (E) Coerencia interna entre enunciado, solucao e explicacao.
  findCoherenceIssues({ sections, guidedPractice }).forEach((issue) => errors.push(issue));

  // (F) Topic alignment: os subtopicos do cronograma precisam aparecer.
  const subtopics = Array.isArray(input.subtopics) ? input.subtopics.filter(Boolean) : [];
  const corpus = JSON.stringify({ introduction, objectives, sections, guidedPractice, summary })
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const faltando = subtopics.filter((subtopic) => {
    const alvo = fingerprint(subtopic);
    if (!alvo) return false;
    // Compara a palavra mais significativa do subtopico (ignora
    // preposicao e artigo). "números inteiros" -> "inteiros".
    const palavras = alvo.split(" ").filter((p) => p.length > 3);
    return palavras.length ? !palavras.some((p) => corpus.includes(p)) : false;
  });
  if (faltando.length > Math.ceil(subtopics.length / 2)) {
    errors.push(`fora do tema: a aula nao cobre ${faltando.length} de ${subtopics.length} subtopicos do cronograma`);
  }

  // (G) Profundidade: o piso subiu (o prompt pede 600+ por secao).
  const explicacoesCurtas = sections.filter((s) => (s.explanation?.length ?? 0) < 260);
  if (sections.length && explicacoesCurtas.length > Math.ceil(sections.length / 2)) {
    errors.push(`profundidade insuficiente: ${explicacoesCurtas.length} de ${sections.length} secoes com menos de 260 caracteres de explicacao`);
  }

  // (H) Markdown residual: o backend limpa ** e #, mas o modelo pode
  // reintroduzir outros marcadores.
  const markdownRestante = [...todoTexto, ...sections.map((s) => s.explanation)].find((t) =>
    /(\*\*|^#{1,6}\s|^\s*[-*]\s|```|\\frac|\\times)/m.test(String(t ?? "")),
  );
  if (markdownRestante) {
    errors.push("contem markdown que nao foi limpo");
  }

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



