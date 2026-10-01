function mathFractionQuiz(lesson) {
  return [
    { id: `${lesson.id}-q1`, question: `Em "${lesson.topic}", qual é o resultado de 3/4 + 1/8?`, options: ['4/8', '7/8', '5/8', '1/2'], correct: 1, explanation: 'Transforme 3/4 em 6/8 e some 1/8. 6/8 + 1/8 = 7/8. Sempre iguale os denominadores antes de somar.' },
    { id: `${lesson.id}-q2`, question: 'Qual fração representa metade de 3/4?', options: ['3/8', '3/2', '1/4', '2/4'], correct: 0, explanation: 'Metade de 3/4 é (3/4) ÷ 2 = 3/8. Dividir por 2 é o mesmo que multiplicar o denominador por 2.' },
    { id: `${lesson.id}-q3`, question: '2/5 dos alunos gostam de matemática e 1/5 de português. Qual fração representa os dois grupos juntos?', options: ['3/5', '2/10', '3/10', '1/5'], correct: 0, explanation: 'Denominadores iguais: some os numeradores. 2/5 + 1/5 = 3/5.' },
    { id: `${lesson.id}-q4`, question: 'Qual número decimal corresponde a 3/4?', options: ['0,34', '0,75', '0,43', '7,5'], correct: 1, explanation: '3 ÷ 4 = 0,75. Fração é uma divisão: numerador dividido pelo denominador.' },
    { id: `${lesson.id}-q5`, question: 'Qual é a melhor estratégia de revisão após a aula?', options: ['Refazer um exemplo passo a passo e conferir cada etapa', 'Decorar o resultado sem entender', 'Pular a revisão', 'Ler só o gabarito'], correct: 0, explanation: 'Refazer com calma fixa o método e revela onde ainda há dúvida antes da prova.' },
  ];
}

function buildThematicQuiz(lesson, fallbackQuestions) {
  const thematic = (fallbackQuestions || []).slice(0, 2).map((q, index) => ({
    id: `${lesson.id}-base-${q.id ?? index}`,
    question: q.question,
    options: q.options,
    correct: q.correct,
    explanation: q.explanation,
  }));

  // BUG REAL, medido no site em 01/10/2026 (FASE C): a alternativa
  // "A) undefined" aparecia quando `lesson.objective` nao existia.
  // Acontece sempre que o quiz cai no fallback local com uma aula de
  // IA: a aula gerada tem `objectives` (plural, lista), nunca
  // `objective` (singular), entao o template interpolava undefined.
  //
  // Aqui nao inventamos conteudo: usamos o primeiro objetivo da lista
  // quando existir, e so quando NAO existir usamos o topico, que
  // sempre esta presente. O quiz segue com 4 alternativas corretas e
  // nunca mostra "undefined" para a estudante.
  const objetivo = firstText([lesson.objective, ...(lesson.objectives ?? [])]);
  const tema = `${lesson.topic ?? ''}`.trim();
  const foco = objetivo || `o conteudo de "${tema}"`;

  const extras = [
    { id: `${lesson.id}-extra-1`, question: `Qual é a ideia principal ao estudar "${tema}"?`, options: [foco, 'Decorar sem entender o contexto', 'Pular exemplos e ir direto ao gabarito', 'Evitar qualquer revisão'], correct: 0, explanation: `O objetivo da aula é: ${foco}. Todo o resto existe para sustentar essa meta.` },
    { id: `${lesson.id}-extra-2`, question: `Diante de uma questão difícil sobre "${tema}", qual é o melhor primeiro passo?`, options: ['Ler o enunciado até o fim e sublinhar o que foi pedido', 'Marcar a primeira alternativa que parece certa', 'Chutar sem ler o texto', 'Trocar de questão sem tentar'], correct: 0, explanation: 'Ler tudo e sublinhar a pergunta evita pegadinhas com "exceto", "incorreto" ou dados escondidos.' },
    { id: `${lesson.id}-extra-3`, question: 'Qual atitude mantém o aprendizado após a explicação e o vídeo?', options: ['Resumir com suas palavras e refazer um exemplo', 'Fechar o material e nunca revisar', 'Só ler o gabarito', 'Estudar outro assunto no meio da aula'], correct: 0, explanation: 'Explicar com suas palavras transfere o conteúdo da memória curta para a memória longa.' },
  ];

  return [...thematic, ...extras].slice(0, 5);
}

/** Primeiro texto nao vazio de uma lista de candidatos. */
function firstText(valores) {
  for (const valor of [].concat(valores ?? [])) {
    const texto = `${valor ?? ''}`.trim();
    if (texto) return texto;
  }
  return '';
}

export function getFullLessonQuiz(lesson) {
  if (!lesson) return [];
  // 1. Se você cadastrou o quiz manual na aula, usa ele (5 questões).
  if (lesson.quiz?.length) return lesson.quiz.slice(0, 5);
  // 2. Senão, gera modelo automático para não quebrar.
  const topic = (lesson.topic || '').toLowerCase();
  const subject = (lesson.subject || '').toLowerCase();
  if (subject.includes('matem') && (topic.includes('fra') || topic.includes('decim'))) {
    return mathFractionQuiz(lesson);
  }
  return buildThematicQuiz(lesson, []);
}
