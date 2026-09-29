// ============================================================
// CRONOGRAMA MESTRE OFICIAL — 28/09/2026 a 05/12/2026 (10 semanas)
// ------------------------------------------------------------
// Esta é a FONTE DE VERDADE do ISTUDOS. A IA NÃO escolhe o
// currículo: ela recebe o que está escrito aqui.
//
// REGRA DIÁRIA (dias normais):
//   BLOCO 1 = 55 min | INTERVALO = 10 min | BLOCO 2 = 55 min
//   TOTAL = 120 min (2 horas)
// Todos os dias normais têm 2 blocos/matérias. Domingos continuam
// sendo dia de estudo (revisão + questões). As semanas 7, 8, 9 e 10
// usam estrutura especial (prova / reforço / reta final).
//
// NÃO existe `lessonIds` aqui de propósito: o status vem do
// cronograma real (src/data/curriculum.js), não de uma lista fixa.
// ============================================================

export const DAILY_PLAN = {
  blockMinutes: 55,
  breakMinutes: 10,
  totalMinutes: 120,
};

/** Um bloco de estudo. `subtopics` é preservado INTEIRO (nada é cortado). */
function block(subject, subtopics, { minutes = DAILY_PLAN.blockMinutes, kind = 'lesson' } = {}) {
  const list = (Array.isArray(subtopics) ? subtopics : [subtopics])
    .map((item) => String(item).trim())
    .filter(Boolean);
  return { subject, topic: list[0] || subject, subtopics: list, kind, minutes };
}

/** Um dia do cronograma. `content` é derivado dos blocos (fonte única). */
function day(key, weekday, blocks, { focus } = {}) {
  const list = blocks.filter(Boolean);
  return {
    key,
    weekday,
    focus: focus || list.map((item) => item.subject).join(' + '),
    blocks: list,
    breakMinutes: Math.max(0, list.length - 1) * DAILY_PLAN.breakMinutes,
    totalMinutes: list.reduce((sum, item) => sum + item.minutes, 0) + Math.max(0, list.length - 1) * DAILY_PLAN.breakMinutes,
    content: list.map((item) => `${item.subject}: ${item.subtopics.join('; ')}`).join(' + '),
  };
}

export const scheduleWeeks = [
  {
    id: 'semana-1',
    number: 1,
    title: 'Semana 1',
    subtitle: 'Base',
    range: '28/09 a 04/10',
    phase: 'base',
    phaseLabel: 'Base — fundamentos de Matemática, Português, Ciências, História e Inglês',
    goal: 'Construir a base: ler uma questão, entender o pedido, separar os dados e tentar resolver. Matemática e Português como pilares; Ciências, História e Inglês entrando de forma recorrente.',
    days: [
      day('2026-09-28', 'Seg 28/09', [
        block('Matemática', ['operações básicas', 'adição', 'subtração', 'multiplicação', 'divisão', 'ordem das operações', 'números naturais']),
        block('Português', ['compreensão', 'interpretação']),
      ]),
      day('2026-09-29', 'Ter 29/09', [
        block('Português', ['informação explícita', 'informação implícita', 'compreensão', 'interpretação']),
        block('Ciências', ['matéria', 'substância', 'mistura', 'estados físicos']),
      ]),
      day('2026-09-30', 'Qua 30/09', [
        block('Matemática', ['números inteiros', 'positivos e negativos', 'divisibilidade']),
        block('História', ['primeiras civilizações', 'Egito']),
      ]),
      day('2026-10-01', 'Qui 01/10', [
        block('Ciências', ['átomos', 'moléculas', 'elementos', 'substâncias']),
        block('Inglês', ['interpretação básica', 'vocabulário pelo contexto']),
      ]),
      day('2026-10-02', 'Sex 02/10', [
        block('Matemática', ['frações', 'equivalência', 'comparação de frações']),
        block('Português', ['ideia principal', 'assunto', 'finalidade']),
      ]),
      day('2026-10-03', 'Sáb 03/10', [
        block('Inglês', ['cognatos', 'contexto', 'compreensão de frases']),
        block('Português', ['gêneros textuais']),
      ]),
      day('2026-10-04', 'Dom 04/10', [
        block('Matemática', ['revisão da Semana 1'], { kind: 'review' }),
        block('Português', ['revisão', 'questões'], { kind: 'review' }),
      ], { focus: 'Revisão da Semana 1 + questões' }),
    ],
  },
  {
    id: 'semana-2',
    number: 2,
    title: 'Semana 2',
    subtitle: 'Matemática aplicada + interpretação',
    range: '05/10 a 11/10',
    phase: 'matematica-aplicada',
    phaseLabel: 'Matemática aplicada + interpretação de textos',
    goal: 'Transformar a base em prática: números decimais, razão, proporção e regra de três, ao lado de vocabulário, pronomes, coesão, átomos e leitura em Inglês.',
    days: [
      day('2026-10-05', 'Seg 05/10', [
        block('Matemática', ['números decimais', 'operações']),
        block('Português', ['vocabulário', 'sinônimos', 'antônimos']),
      ]),
      day('2026-10-06', 'Ter 06/10', [
        block('Ciências', ['estrutura do átomo']),
        block('Inglês', ['leitura', 'interpretação']),
      ]),
      day('2026-10-07', 'Qua 07/10', [
        block('Matemática', ['razão', 'proporção']),
        block('História', ['Antiguidade clássica']),
      ]),
      day('2026-10-08', 'Qui 08/10', [
        block('Português', ['pronomes', 'referência']),
        block('Geografia', ['localização', 'orientação', 'mapas']),
      ]),
      day('2026-10-09', 'Sex 09/10', [
        block('Matemática', ['regra de três simples']),
        block('Ciências', ['moléculas', 'substâncias']),
      ]),
      day('2026-10-10', 'Sáb 10/10', [
        block('Inglês', ['interpretação']),
        block('Português', ['coesão']),
      ]),
      day('2026-10-11', 'Dom 11/10', [
        block('Matemática', ['revisão', 'questões'], { kind: 'review' }),
        block('Português', ['revisão', 'questões'], { kind: 'review' }),
      ], { focus: 'Revisão + questões' }),
    ],
  },
  {
    id: 'semana-3',
    number: 3,
    title: 'Semana 3',
    subtitle: 'Porcentagem + texto + Biologia',
    range: '12/10 a 18/10',
    phase: 'porcentagem-biologia',
    phaseLabel: 'Porcentagem + estrutura textual + Biologia',
    goal: 'Porcentagem de ponta a ponta, relações de causa e consequência no texto, e os fundamentos da Biologia (célula animal e vegetal).',
    days: [
      day('2026-10-12', 'Seg 12/10', [
        block('Matemática', ['conceito de porcentagem', 'cálculo de porcentagem', 'porcentagem de uma quantidade']),
        block('Português', ['compreensão', 'inferência']),
      ]),
      day('2026-10-13', 'Ter 13/10', [
        block('Biologia', ['célula', 'membrana', 'núcleo', 'organelas']),
        block('Inglês', ['interpretação']),
      ]),
      day('2026-10-14', 'Qua 14/10', [
        block('Matemática', ['aumento', 'desconto']),
        block('História', ['Idade Média']),
      ]),
      day('2026-10-15', 'Qui 15/10', [
        block('Português', ['conectivos', 'causa', 'consequência', 'oposição', 'finalidade']),
        block('Geografia', ['paisagem', 'território', 'espaço geográfico']),
      ]),
      day('2026-10-16', 'Sex 16/10', [
        block('Matemática', ['média aritmética', 'interpretação de dados']),
        block('Biologia', ['células animais', 'células vegetais']),
      ]),
      day('2026-10-17', 'Sáb 17/10', [
        block('Inglês', ['vocabulário', 'leitura contextual']),
        block('Português', ['pontuação', 'linguagem formal', 'linguagem informal']),
      ]),
      day('2026-10-18', 'Dom 18/10', [
        block('Matemática', ['revisão de porcentagem'], { kind: 'review' }),
        block('Português', ['revisão de interpretação'], { kind: 'review' }),
      ], { focus: 'Revisão de porcentagem + interpretação' }),
    ],
  },
  {
    id: 'semana-4',
    number: 4,
    title: 'Semana 4',
    subtitle: 'Núcleo forte',
    range: '19/10 a 25/10',
    phase: 'nucleo-forte',
    phaseLabel: 'Núcleo forte da prova',
    goal: 'Entrar no conteúdo que mais cai: potenciação e raízes, equações de 1º grau, expressões algébricas, corpo humano, efeito de sentido e clima.',
    days: [
      day('2026-10-19', 'Seg 19/10', [
        block('Matemática', ['potenciação', 'raízes']),
        block('Português', ['ironia', 'humor']),
      ]),
      day('2026-10-20', 'Ter 20/10', [
        block('Biologia', ['corpo humano', 'sistemas']),
        block('Inglês', ['interpretação']),
      ]),
      day('2026-10-21', 'Qua 21/10', [
        block('Matemática', ['expressões algébricas']),
        block('História', ['feudalismo', 'Igreja']),
      ]),
      day('2026-10-22', 'Qui 22/10', [
        block('Português', ['ambiguidade', 'efeitos de sentido']),
        block('Geografia', ['clima']),
      ]),
      day('2026-10-23', 'Sex 23/10', [
        block('Matemática', ['equação de 1º grau']),
        block('Biologia', ['alimentação', 'nutrientes']),
      ]),
      day('2026-10-24', 'Sáb 24/10', [
        block('Inglês', ['leitura', 'vocabulário']),
        block('Português', ['figuras de linguagem']),
      ]),
      day('2026-10-25', 'Dom 25/10', [
        block('Matemática', ['revisão', 'questões'], { kind: 'review' }),
        block('Português', ['revisão', 'questões'], { kind: 'review' }),
      ], { focus: 'Revisão + questões' }),
    ],
  },
  {
    id: 'semana-5',
    number: 5,
    title: 'Semana 5',
    subtitle: 'Geometria + Ciências + humanas',
    range: '26/10 a 01/11',
    phase: 'geometria-ciencias',
    phaseLabel: 'Geometria + Ciências + História e Geografia',
    goal: 'Geometria prática (área, ângulos, escala, volume), saúde e ambiente, e contexto histórico/geográfico das Grandes Navegações.',
    days: [
      day('2026-10-26', 'Seg 26/10', [
        block('Matemática', ['perímetro', 'área']),
        block('Português', ['interpretação avançada']),
      ]),
      day('2026-10-27', 'Ter 27/10', [
        block('Ciências', ['alimentação', 'vitaminas', 'saúde']),
        block('Inglês', ['interpretação']),
      ]),
      day('2026-10-28', 'Qua 28/10', [
        block('Matemática', ['ângulos', 'escala']),
        block('História', ['Grandes Navegações']),
      ]),
      day('2026-10-29', 'Qui 29/10', [
        block('Português', ['figuras de linguagem']),
        block('Geografia', ['relevo', 'vegetação']),
      ]),
      day('2026-10-30', 'Sex 30/10', [
        block('Matemática', ['volume', 'unidades']),
        block('Ciências', ['Biologia', 'ambiente']),
      ]),
      day('2026-10-31', 'Sáb 31/10', [
        block('Inglês', ['interpretação', 'vocabulário']),
        block('Português', ['coesão', 'conectivos', 'pontuação']),
      ]),
      day('2026-11-01', 'Dom 01/11', [
        block('Matemática', ['revisão geral'], { kind: 'review' }),
        block('Português', ['revisão geral'], { kind: 'review' }),
      ], { focus: 'Revisão geral da semana' }),
    ],
  },
  {
    id: 'semana-6',
    number: 6,
    title: 'Semana 6',
    subtitle: 'Fechamento do conteúdo',
    range: '02/11 a 08/11',
    phase: 'fechamento',
    phaseLabel: 'Fechamento do conteúdo — última semana de teoria',
    goal: 'Fechar todo o conteúdo que ainda falta (Química, Física, biomas, álgebra) e terminar a semana com 25 questões mistas. Depois disso começa só treino de prova.',
    days: [
      day('2026-11-02', 'Seg 02/11', [
        block('Geografia', ['clima', 'relevo', 'vegetação', 'biomas']),
        block('História', ['mercantilismo', 'colonização']),
      ]),
      day('2026-11-03', 'Ter 03/11', [
        block('Biologia', ['fotossíntese', 'plantas']),
        block('Português', ['interpretação']),
      ]),
      day('2026-11-04', 'Qua 04/11', [
        block('Química', ['ácidos', 'bases', 'pH', 'óxidos', 'reações']),
        block('Inglês', ['interpretação']),
      ]),
      day('2026-11-05', 'Qui 05/11', [
        block('Matemática', ['revisão geral de aritmética', 'álgebra'], { kind: 'review' }),
        block('Geografia', ['mapas', 'interpretação de dados']),
      ]),
      day('2026-11-06', 'Sex 06/11', [
        block('Física', ['velocidade', 'distância', 'tempo', 'conversão de unidades']),
        block('Ciências', ['energia', 'calor']),
      ]),
      day('2026-11-07', 'Sáb 07/11', [
        block('Física', ['eletricidade', 'circuitos']),
        block('Português', ['revisão de gramática', 'linguagem'], { kind: 'review' }),
      ]),
      day('2026-11-08', 'Dom 08/11', [
        block('Matemática', ['25 questões mistas'], { kind: 'questions' }),
        block('Português', ['25 questões mistas', 'correção'], { kind: 'questions' }),
      ], { focus: '25 questões mistas + correção' }),
    ],
  },
  {
    id: 'semana-7',
    number: 7,
    title: 'Semana 7',
    subtitle: 'Prova Etec 1º semestre de 2026',
    range: '09/11 a 15/11',
    phase: 'prova-1o-semestre',
    phaseLabel: 'Treinamento — Prova Etec 1º semestre 2026',
    goal: 'Menos teoria, mais questões: a prova é feita em blocos de 10 questões e cada bloco vira uma revisão dos erros na matéria correspondente.',
    days: [
      day('2026-11-09', 'Seg 09/11', [
        block('Prova Etec 2026/1', ['questões 1–10'], { kind: 'questions' }),
        block('Matemática', ['revisão relacionada aos erros'], { kind: 'review' }),
      ]),
      day('2026-11-10', 'Ter 10/11', [
        block('Prova Etec 2026/1', ['questões 11–20'], { kind: 'questions' }),
        block('Português', ['revisão dos erros'], { kind: 'review' }),
      ]),
      day('2026-11-11', 'Qua 11/11', [
        block('Prova Etec 2026/1', ['questões 21–30'], { kind: 'questions' }),
        block('Ciências', ['revisão dos erros'], { kind: 'review' }),
      ]),
      day('2026-11-12', 'Qui 12/11', [
        block('Prova Etec 2026/1', ['questões 31–40'], { kind: 'questions' }),
        block('História e Geografia', ['revisão dos erros'], { kind: 'review' }),
      ]),
      day('2026-11-13', 'Sex 13/11', [
        block('Prova Etec 2026/1', ['questões 41–50'], { kind: 'questions' }),
        block('Inglês', ['revisão dos erros'], { kind: 'review' }),
      ]),
      day('2026-11-14', 'Sáb 14/11', [
        block('Matemática', ['refazer erros'], { kind: 'review' }),
        block('Português', ['refazer erros'], { kind: 'review' }),
      ], { focus: 'Refazer todos os erros' }),
      day('2026-11-15', 'Dom 15/11', [
        block('Ciências', ['erros acumulados'], { kind: 'review' }),
        block('História e Geografia', ['erros acumulados'], { kind: 'review' }),
      ], { focus: 'Erros acumulados' }),
    ],
  },
  {
    id: 'semana-8',
    number: 8,
    title: 'Semana 8',
    subtitle: 'Prova Etec 2º semestre de 2026',
    range: '16/11 a 22/11',
    phase: 'prova-2o-semestre',
    phaseLabel: 'Treinamento — Prova Etec 2º semestre 2026',
    goal: 'Segundo simulado em blocos de 10 questões, revisando por matéria e fechando com os erros acumulados de Ciências, História e Geografia.',
    days: [
      day('2026-11-16', 'Seg 16/11', [
        block('Prova Etec 2026/2', ['questões 1–10'], { kind: 'questions' }),
        block('Matemática', ['revisão'], { kind: 'review' }),
      ]),
      day('2026-11-17', 'Ter 17/11', [
        block('Prova Etec 2026/2', ['questões 11–20'], { kind: 'questions' }),
        block('Português', ['revisão'], { kind: 'review' }),
      ]),
      day('2026-11-18', 'Qua 18/11', [
        block('Prova Etec 2026/2', ['questões 21–30'], { kind: 'questions' }),
        block('Ciências', ['revisão'], { kind: 'review' }),
      ]),
      day('2026-11-19', 'Qui 19/11', [
        block('Prova Etec 2026/2', ['questões 31–40'], { kind: 'questions' }),
        block('História e Geografia', ['revisão'], { kind: 'review' }),
      ]),
      day('2026-11-20', 'Sex 20/11', [
        block('Prova Etec 2026/2', ['questões 41–50'], { kind: 'questions' }),
        block('Inglês', ['revisão'], { kind: 'review' }),
      ]),
      day('2026-11-21', 'Sáb 21/11', [
        block('Matemática', ['erros acumulados'], { kind: 'review' }),
        block('Português', ['erros acumulados'], { kind: 'review' }),
      ]),
      day('2026-11-22', 'Dom 22/11', [
        block('Ciências', ['erros acumulados'], { kind: 'review' }),
        block('História e Geografia', ['erros acumulados'], { kind: 'review' }),
      ]),
    ],
  },
  {
    id: 'semana-9',
    number: 9,
    title: 'Semana 9',
    subtitle: 'Reforço pesado',
    range: '23/11 a 29/11',
    phase: 'reforco',
    phaseLabel: 'Reforço pesado — só os pontos fracos',
    goal: 'Reforçar por questões o que mais errou: porcentagem, razão e proporção, geometria, álgebra, interpretação de texto e as duas humanas. Termina com simulado geral de 50 questões.',
    days: [
      day('2026-11-23', 'Seg 23/11', [
        block('Matemática', ['porcentagem', 'razão', 'proporção'], { kind: 'review' }),
        block('Português', ['interpretação', 'inferência'], { kind: 'review' }),
      ]),
      day('2026-11-24', 'Ter 24/11', [
        block('Ciências', ['Biologia'], { kind: 'review' }),
        block('Inglês', ['interpretação'], { kind: 'review' }),
      ]),
      day('2026-11-25', 'Qua 25/11', [
        block('Matemática', ['geometria', 'área', 'volume'], { kind: 'review' }),
        block('História', ['revisão por questões'], { kind: 'review' }),
      ]),
      day('2026-11-26', 'Qui 26/11', [
        block('Português', ['coesão', 'pontuação', 'figuras', 'efeitos de sentido'], { kind: 'review' }),
        block('Geografia', ['mapas', 'clima', 'relevo', 'biomas'], { kind: 'review' }),
      ]),
      day('2026-11-27', 'Sex 27/11', [
        block('Matemática', ['álgebra', 'equações'], { kind: 'review' }),
        block('Ciências', ['Química', 'Física'], { kind: 'review' }),
      ]),
      day('2026-11-28', 'Sáb 28/11', [
        block('Matemática', ['erros acumulados'], { kind: 'review' }),
        block('Português', ['erros acumulados'], { kind: 'review' }),
      ]),
      day('2026-11-29', 'Dom 29/11', [
        block('Simulado geral', ['50 questões'], { kind: 'questions' }),
        block('Correção completa', ['identificar pontos fracos', 'registrar erros'], { kind: 'questions' }),
      ], { focus: 'Simulado de 50 questões + correção' }),
    ],
  },
  {
    id: 'semana-10',
    number: 10,
    title: 'Semana 10',
    subtitle: 'Reta final',
    range: '30/11 a 05/12',
    phase: 'reta-final',
    phaseLabel: 'Reta final — NÃO introduzir matéria nova',
    goal: 'REGRA: nenhuma matéria nova. Só revisão por questões, os erros mais frequentes, o simulado final de 50 questões em 4h e uma última revisão leve antes da prova.',
    days: [
      day('2026-11-30', 'Seg 30/11', [
        block('Matemática', ['revisão geral', 'questões'], { kind: 'review' }),
        block('Português', ['revisão geral', 'questões'], { kind: 'review' }),
      ]),
      day('2026-12-01', 'Ter 01/12', [
        block('Ciências', ['Biologia', 'Química'], { kind: 'review' }),
        block('Inglês', ['leitura', 'interpretação'], { kind: 'review' }),
      ]),
      day('2026-12-02', 'Qua 02/12', [
        block('Matemática', ['erros mais frequentes'], { kind: 'review' }),
        block('História', ['revisão por questões'], { kind: 'review' }),
      ]),
      day('2026-12-03', 'Qui 03/12', [
        block('Português', ['erros mais frequentes'], { kind: 'review' }),
        block('Geografia', ['revisão por questões'], { kind: 'review' }),
      ]),
      day('2026-12-04', 'Sex 04/12', [
        block('Simulado final', ['50 questões', '4 horas', 'sem consulta'], { kind: 'questions', minutes: 240 }),
      ], { focus: 'SIMULADO FINAL — 50 questões, 4h, sem consulta' }),
      day('2026-12-05', 'Sáb 05/12', [
        block('Matemática', ['fórmulas', 'pontos fracos'], { kind: 'review', minutes: 40 }),
        block('Português', ['revisão extremamente leve', 'preparação para a prova'], { kind: 'review', minutes: 40 }),
      ], { focus: 'Revisão leve + preparação (sem conteúdo novo)' }),
    ],
  },
];

/** Primeiro e último dia do cronograma. */
export const SCHEDULE_START = scheduleWeeks[0].days[0].key;
export const SCHEDULE_END = scheduleWeeks[scheduleWeeks.length - 1].days[scheduleWeeks[scheduleWeeks.length - 1].days.length - 1].key;
export const TOTAL_WEEKS = scheduleWeeks.length;

/**
 * Semana (1..10) de uma data. NÃO faz conta de dias/diferença de datas:
 * procura a data dentro da lista, então 29/09/2026 é SEMANA 1 sempre.
 */
export function getWeekNumberByDate(dateKey) {
  for (let index = 0; index < scheduleWeeks.length; index += 1) {
    if ((scheduleWeeks[index].days ?? []).some((item) => item.key === dateKey)) return index + 1;
  }
  return null;
}

/** O dia do cronograma (com seus blocos) que cai em `dateKey`. */
export function getScheduleDay(dateKey) {
  for (const week of scheduleWeeks) {
    const found = (week.days ?? []).find((item) => item.key === dateKey);
    if (found) {
      return {
        ...found,
        week: week.number,
        weekTitle: week.title,
        weekRange: week.range,
        weekGoal: week.goal,
        phase: week.phase,
        phaseLabel: week.phaseLabel,
      };
    }
  }
  return null;
}
