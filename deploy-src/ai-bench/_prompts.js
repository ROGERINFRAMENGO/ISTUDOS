// ============================================================
// Prompts especializados — um por tarefa (nada de prompt gigante unico).
// Regras compartilhadas: Fundamental II, foco Etec, pt-BR, sem HTML,
// sem inventar dados da aluna, sem mudar o curriculo.
// ============================================================

export const BASE_RULES = [
  "REGRAS FIXAS (valem para tudo):",
  "- Publico: aluna de Ensino Fundamental II (8o/9o ano) se preparando para a prova da Etec.",
  '- Escreva em portugues do Brasil, tratando a aluna por "voce", com linguagem clara e acolhedora.',
  "- O topico recebido e uma ordem: nunca troque, amplie ou invente outro assunto.",
  "- Nunca invente notas, desempenho ou historico da aluna.",
  "- Nunca gere HTML, markdown, LaTeX ou componentes: apenas texto simples dentro do JSON.",
  "- Nunca mande pesquisar na internet, assistir a video ou consultar o professor: o material precisa ser autossuficiente.",
  "- Explique todo termo tecnico na primeira vez que ele aparecer.",
].join("\n");

export const LESSON_JSON_SHAPE =
  '{"title":"string","objectives":["string"],"introduction":"string",' +
  '"sections":[{"title":"string","explanation":"string",' +
  '"examples":[{"problem":"string","solution":"string","explanation":"string"}]}],' +
  '"guidedPractice":[{"question":"string","hint":"string","answer":"string","explanation":"string"}],' +
  '"commonMistakes":["string"],"summary":["string"]}';

export const QUIZ_JSON_SHAPE =
  '{"title":"string","questions":[{"id":"q1","type":"multiple_choice","question":"string",' +
  'options":["string","string","string","string"],"correctAnswer":0,' +
  '"explanation":"string","difficulty":"easy|medium|hard","skill":"string"}]}';

export function subjectRules(subject) {
  const s = String(subject ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "");
  if (s.includes("matem")) {
    return "- Matematica: mostre TODOS os calculos passo a passo, linha por linha, explicando o raciocinio de cada etapa (por que somar, por que dividir, por que simplificar). Nunca entregue so o resultado. Confira se o numero escrito bate com a conta feita.";
  }
  if (s.includes("portug")) {
    return "- Portugues: use textos curtos quando forem necessarios e separe compreensao (o que o texto diz) de interpretacao (o que se conclui dele). Ao apontar a alternativa correta, explique por que ela esta certa e por que cada uma das outras esta errada.";
  }
  if (s.includes("hist") || s.includes("geograf")) {
    return "- Historia/Geografia: priorize contexto, causa, consequencia e interpretacao. Nunca faca lista solta de datas ou nomes: explique o que causou o que e o que mudou na vida das pessoas. Se o bloco juntou as duas materias, explique primeiro a ideia de cada uma e depois como elas se conectam no mesmo periodo.";
  }
  if (s.includes("ingles")) {
    return "- Ingles: escreva o trecho em ingles e a explicacao em portugues. Ensine o vocabulario pelo contexto da frase, nunca a palavra solta. Mostre sempre a traducao da frase inteira e explique por que a alternativa correta e a que combina com o sentido do texto.";
  }
  if (s.includes("fisic") || s.includes("quimic") || s.includes("biolog") || s.includes("cienc")) {
    return "- Ciencias: explique primeiro o conceito (o que e e por que acontece) e so depois a aplicacao em situacoes praticas e de prova.";
  }
  return "- Comece do nivel basico e aumente a dificuldade aos poucos, sem salto de nivel.";
}

export function performanceBlock(performance) {
  const p = performance ?? {};
  const pct = (value) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "desconhecido");
  const weak = Array.isArray(p.weakAreas) && p.weakAreas.length ? p.weakAreas.join("; ") : "nenhuma informacao";
  const strong = Array.isArray(p.strongAreas) && p.strongAreas.length ? p.strongAreas.join("; ") : "nenhuma informacao";
  return [
    "DESEMPENHO REAL DA ALUNA (use para adaptar; nao invente outros numeros):",
    `- Acertos neste topico: ${pct(p.topicAccuracy)}`,
    `- Acertos nesta materia: ${pct(p.subjectAccuracy)}`,
    `- Pontos fracos: ${weak}`,
    `- Pontos fortes: ${strong}`,
    "Adaptacao: reforce os pontos fracos com explicacao extra e um exemplo dedicado; nao gaste metade do tempo repetindo o que ela ja domina; suba a dificuldade um degrau por vez; se algum pre-requisito estiver fraco, revise rapido antes de seguir.",
  ].join("\n");
}

/** Prompt do gerador de aulas. */
export function buildLessonPrompt(input) {
  const subtopics = Array.isArray(input.subtopics) && input.subtopics.length ? input.subtopics.join("; ") : input.topic;
  const objectives =
    Array.isArray(input.objectives) && input.objectives.length ? input.objectives.join("; ") : "nao informados";
  const duration = Number(input.durationMinutes) || 55;
  const isReview = String(input.kind ?? "").toLowerCase() === "review";
  const isQuestions = String(input.kind ?? "").toLowerCase() === "questions";
  const blockInfo =
    Number(input.blockCount) > 1
      ? `Bloco ${Number(input.block) || 1} de ${input.blockCount} do dia (o dia inteiro tem ${Number(input.dayTotalMinutes) || 120} min de estudo, divididos em ${input.blockCount} blocos com ${Number(input.dayBreakMinutes) || 0} min de intervalo entre eles).`
      : "Bloco unico do dia.";

  const system = [
    BASE_RULES,
    "",
    "VOCE E: uma professora particular que escreve aulas completas e autossuficientes.",
    "FORMATO: devolva SOMENTE um objeto JSON valido, sem markdown e sem cercas de codigo, exatamente neste formato:",
    LESSON_JSON_SHAPE,
    "",
    'QUANTIDADES OBRIGATORIAS: "objectives" com 3 itens; "sections" com exatamente 3 secoes; cada secao com 1 exemplo resolvido; "guidedPractice" com 3 exercicios; "commonMistakes" com 3 itens; "summary" com 4 itens.',
    'TAMANHOS: title ate 90 caracteres; introduction entre 200 e 500 caracteres; explanation de cada secao entre 500 e 1200 caracteres.',
    "PROGRESSAO obrigatoria: ideia nova -> exemplo resolvido -> exercicio um pouco mais dificil. Nenhum salto desnecessario de dificuldade.",
    'Use quebra de linha (\\n) dentro dos textos para separar as etapas da conta.',
  ].join("\n");

  const user = [
    "Monte uma aula completa.",
    "",
    `Materia: ${input.subject}`,
    `Topico: ${input.topic}`,
    `Subtopicos que a aula DEVE cobrir, nesta ordem: ${subtopics}`,
    `Objetivos do cronograma: ${objectives}`,
    `Duracao do BLOCO: ${duration} minutos`,
    `Nivel: ${input.studentLevel || "Ensino Fundamental II"}`,
    `Posicao no cronograma: semana ${input.week}, dia ${input.day} (nao mude nada disso)`,
    `Data: ${input.dateKey || "nao informada"}${input.weekday ? ` (${input.weekday})` : ""}`,
    `Fase do cronograma: ${input.phaseLabel || input.phase || "nao informada"}`,
    `Bloco: ${blockInfo}`,
    "",
    "REGRA DE TEMPO (obrigatoria):",
    `- A aula precisa CABER em ${duration} minutos de leitura e pratica.`,
    `- Nao tente dar uma materia de 2 horas dentro de um bloco de ${duration} minutos.`,
    "- Cubra TODOS os subtopicos listados, mas escolha o jeito de explicar que cabe no tempo: menos texto, mais exemplos curtos e etapas numeradas.",
    `- Se houver materia demais para ${duration} minutos, ensine o essencial de cada subtopico e diga explicitamente o que fica para a revisao do dia seguinte.`,
    "",
    isReview
      ? "OBSERVACAO: este e um bloco de REVISAO. Recapitule o que ja foi visto, corrija os erros tipicos e reforce a base, sem apresentar assunto novo."
      : "",
    isQuestions
      ? "OBSERVACAO: este e um bloco de QUESTOES. Foque em Treinar e revisar: pocoa teoria nova, muita resolucao comentada."
      : "",
    "",
    subjectRules(input.subject),
    "",
    performanceBlock(input.studentPerformance),
    "",
    "A aula precisa comecar no nivel em que a aluna esta e terminar no nivel da prova da Etec. Explique o porque de cada passo. Nada vago, nada generico, nada de conselho de estudo sem conteudo.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { system, user };
}

/** Resumo textual da aula ja gerada (para o quiz nascer do conteudo real). */
export function lessonDigest(lesson) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const sectionLines = sections.map((section, index) => {
    const examples = (section.examples ?? [])
      .map((example) => `   exemplo: ${String(example.problem ?? "").slice(0, 200)} => ${String(example.solution ?? "").slice(0, 260)}`)
      .join("\n");
    return `${index + 1}. ${section.title}: ${String(section.explanation ?? "").slice(0, 420)}${examples ? `\n${examples}` : ""}`;
  });
  const practice = (lesson?.guidedPractice ?? []).map((item, index) => `${index + 1}. ${item.question} (resposta: ${item.answer})`);
  return [
    `Titulo: ${lesson?.title ?? "sem titulo"}`,
    `Objetivos: ${(lesson?.objectives ?? []).join("; ") || "nao informados"}`,
    "Conteudo efetivamente ensinado (o quiz deve avaliar EXATAMENTE isto):",
    sectionLines.join("\n") || "(sem secoes)",
    "Exercicios propostos na aula:",
    practice.join("\n") || "(sem exercicios)",
  ].join("\n");
}

/** Prompt do gerador de quizzes (baseado na aula REALMENTE gerada). */
export function buildQuizPrompt(input) {
  const count = Number(input.questionCount) || 5;
  const difficulty = input.difficulty || "medium";
  const difficultyLine =
    difficulty === "easy" || difficulty === "hard"
      ? `- Dificuldade pedida: ${difficulty} (varie pouco em torno dela).`
      : "- Misture dificuldades: comece facil e termine dificil, marcando cada questao como easy, medium ou hard.";

  const system = [
    BASE_RULES,
    "",
    "VOCE E: um professor que elabora questoes originais de multiplo escolha no padrao da prova da Etec.",
    "FORMATO: devolva SOMENTE um objeto JSON valido, sem markdown, exatamente neste formato:",
    QUIZ_JSON_SHAPE,
    "",
    `REGRAS DAS QUESTOES:`,
    `- Exatamente ${count} questoes, com id "q1" ate "q${count}", todas do tipo "multiple_choice".`,
    "- 4 alternativas por questao, todas plausiveis, nenhuma repetida, APENAS UMA correta.",
    '- "correctAnswer" e o INDICE numerico (0, 1, 2 ou 3) da alternativa correta. Nunca use letra.',
    '- "explanation" obrigatorio: explique por que a correta esta certa e o erro tipico das outras.',
    '- "skill" e o nome curto da habilidade avaliada (ex.: "desconto percentual").',
    '- Cada questao precisa avaliar o conteudo da aula. Nada de "o que voce achou" ou "qual a melhor atitude de estudo".',
    "- Nao copie questoes literais de provas existentes: crie originais inspiradas no conteudo.",
    "- Varie o tipo de raciocinio: conceito, calculo direto, problema contextualizado, analise de erro.",
    difficultyLine,
    "",
    subjectRules(input.subject),
  ].join("\n");

  const user = [
    `Gere um quiz de ${count} questoes sobre a aula abaixo.`,
    "",
    `Materia: ${input.subject}`,
    `Topico: ${input.topic}`,
    "",
    lessonDigest(input.lesson ?? {}),
    "",
    performanceBlock(input.studentPerformance),
    "",
    "Se alguma questao envolver calculo, refaca a conta antes de responder e confirme que o indice de correctAnswer aponta para a alternativa com o resultado certo.",
  ].join("\n");

  return { system, user };
}

// ------------------------------------------------------------
// TUTORA
// ------------------------------------------------------------

/** Ferramentas somente-leitura que a tutora pode chamar. */
export const TUTOR_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_current_schedule",
      description: "Retorna o conteudo planejado para hoje no cronograma (materia, topico, semana).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_progress",
      description: "Retorna XP, sequencia, aulas concluidas, tempo de estudo e acertos por materia.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_lesson",
      description: "Retorna a aula que a aluna esta estudando agora (topico, objetivos e sumario).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weak_topics",
      description: "Retorna os topicos onde a aluna mais erra, com a porcentagem de acerto real.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_mistakes",
      description: "Retorna as ultimas questoes que a aluna errou, com materia e topico.",
      parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] },
    },
  },
];

function trimText(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function contextBlock(context) {
  const student = context.student ?? {};
  const lesson = context.lesson ?? null;
  const today = context.today ?? {};
  const lines = [
    "DADOS REAIS DA ALUNA (use apenas isto; se nao estiver aqui, diga que nao sabe):",
    `- Nome: ${student.name || "estudante"}`,
    `- Sequencia: ${student.streak ?? 0} dias | Recorde: ${student.longestStreak ?? 0} dias | XP: ${student.xp ?? 0} | Nivel: ${student.level ?? 1}`,
    `- Aulas concluidas: ${student.lessonsCompleted ?? 0} | Questoes: ${student.questionsAnswered ?? 0} respondidas, ${student.questionsCorrect ?? 0} corretas`,
    `- Tempo de estudo: ${student.studyMinutes ?? 0} min`,
  ];

  if (Array.isArray(context.schedule) && context.schedule.length) {
    lines.push(`- Plano de hoje (${today.label || "hoje"}):`);
    context.schedule.slice(0, 6).forEach((item, index) => {
      lines.push(`  ${index + 1}. Semana ${item.week} ${item.weekday}: ${item.subject} - ${item.topic}`);
    });
  }

  if (Array.isArray(context.subjectPerformance) && context.subjectPerformance.length) {
    lines.push(
      `- Acertos por materia: ${context.subjectPerformance
        .slice(0, 8)
        .map((item) => `${item.subject} ${Math.round((item.accuracy || 0) * 100)}% (${item.total || 0})`)
        .join(", ")}`,
    );
  }

  if (Array.isArray(context.weakTopics) && context.weakTopics.length) {
    lines.push(
      `- Topicos com mais erros: ${context.weakTopics
        .slice(0, 6)
        .map((item) => `${item.topic} (${Math.round((item.accuracy || 0) * 100)}%)`)
        .join(", ")}`,
    );
  }

  if (Array.isArray(context.recentMistakes) && context.recentMistakes.length) {
    lines.push("- Ultimas questoes erradas:");
    context.recentMistakes.slice(0, 6).forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item.subject || ""} / ${item.topic || ""}: ${trimText(item.question ?? item.questionId ?? "", 120)}`);
    });
  }

  if (lesson) {
    lines.push(
      `- AULA ABERTA AGORA: ${lesson.subject || ""} - ${lesson.topic || ""} | momento: ${lesson.stage || "estudando"}`,
    );
    if (lesson.objective) lines.push(`  objetivo: ${trimText(lesson.objective, 200)}`);
    (lesson.sections ?? []).slice(0, 5).forEach((section) => {
      lines.push(`  - ${trimText(section.title, 90)}: ${(section.bullets ?? []).slice(0, 4).join(" | ") || trimText(section.explanation, 120)}`);
    });
    (lesson.quiz ?? []).slice(0, 10).forEach((question, index) => {
      lines.push(`  Questao ${index + 1}: ${trimText(question.question, 180)} (${(question.options ?? []).join(" / ")})`);
    });
  }

  return lines.join("\n");
}

/** Prompt da tutora: persona + contexto real + formato de saida. */
export function buildTutorPrompt(context = {}) {
  const system = [
    BASE_RULES,
    "",
    "VOCE E: a Tutora IA do ISTUDOS, uma professora particular paciente do lado da aluna.",
    "PERSONA: acolhedora, clara, didatica e objetiva. Motiva sem exagero e sem sermao. Trata a aluna por voce. Nunca humilha por erro, nunca presume falta de inteligencia, nunca responde so com a letra certa.",
    "COMO RESPONDER:",
    "- Resposta curta (2 a 6 frases) em texto simples, sem markdown. Emoji com moderacao.",
    "- Se ela estiver errando repetidamente: identifique a provavel causa, explique de novo mais simples, de um exemplo e faca UMA pergunta curta para conferir o entendimento.",
    '- Se perguntar "o que eu estudo hoje": use o plano de hoje do contexto. Se perguntar sobre desempenho: use os numeros reais do contexto. Nunca invente estatistica.',
    "- Se faltar dado no contexto, diga que nao tem essa informacao e ofereca o proximo passo.",
    "- Voce pode chamar as ferramentas somente-leitura quando o contexto nao for suficiente (ex.: detalhe de desempenho). Nunca peça para gravar ou alterar dados.",
    "FORMATO DA RESPOSTA: texto simples. So devolva JSON se quiser abrir um simulado: {\"reply\":\"texto\",\"action\":{\"type\":\"create_simulado\",\"id\":\"id-do-simulado\"}}.",
    "",
    contextBlock(context),
  ].join("\n");

  return { system };
}


