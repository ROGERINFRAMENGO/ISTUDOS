// ============================================================
// AVISO — CONTEUDO DE MODELO, NAO CONTEUDO DE PRODUCAO
// ------------------------------------------------------------
// Os objetos `lessonMatematica` e `lessonPortugues` abaixo estao
// CHEIOS de "COLE AQUI": sao um rascunho de autor, nao uma aula.
//
// Eles NAO chegam a estudante — nenhum componente importa estes
// objetos. O que o app importa deste arquivo sao apenas os
// utilitarios do fim (getDateKey, getDayKey, formatDateBR,
// DAY_LABELS), que sao corretos e estao em uso.
//
// Antes existia uma linha no App.jsx que usava `lessons.length`
// (length = 2, o numero deste arquivo) como denominador do
// progresso geral. Com 2 licoes oficiais concluidas de 122, a
// aluna via "100% de progresso". Corrigido: o denominador vem do
// curriculo oficial (src/data/curriculum.js).
//
// NAO use estes objetos como fallback de aula. A fonte de verdade
// do conteudo de uma aula e o generate-lesson, com o texto da IA
// validado. Se uma aula cair no modelo generico, o sintoma e
// "ainda nao carregou" — nao "voltar para este arquivo".
// ============================================================
// COMO MONTAR SEU CRONOGRAMA (SEM REPETIR)
// Cada aula tem "date": 'AAAA-MM-DD' — aparece SÓ naquele dia.
// A MATERIA repete (toda segunda tem matematica), mas o CONTEUDO é novo.
// Ex: 06/10 matematica = fracoes, 13/10 matematica = porcentagem.
// Para esconder sem apagar: tire a linha do export lessons no fim.
// Formato youtube embed: https://www.youtube.com/embed/CODIGO

export const DAY_LABELS = {
  seg: 'Segunda',
  ter: 'Terca',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sabado',
  dom: 'Domingo',
};

export function getDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDayKey(date = new Date()) {
  const map = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  return map[date.getDay()];
}

export function formatDateBR(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

export function getLessonsForDate(dateKey, allLessons) {
  return (allLessons || []).filter((l) => l.date === dateKey);
}

// Mantido para compatibilidade: se a aula só tem days, usa como fallback.
export function getLessonsForDay(dayKey, allLessons) {
  return (allLessons || []).filter((l) => (l.days || []).includes(dayKey));
}


// AULA 1 — 28/09 MATEMATICA (edite tudo; NAO repete em outra segunda)
export const lessonMatematica = {
  id: 'fracoes-decimais',
  subject: 'Matematica',
  color: '#a377ff',
  time: '09:00 - 10:00',
  duration: 60,
  date: '2026-09-28',
  days: ['seg'],
  topic: 'Fracoes e decimais',
  objective: 'Somar fracoes e converter para decimais sem errar',
  explanation: 'Aula completa de fracoes: soma com denominadores diferentes e conversao para decimais.',
  videoUrl: 'COLE_AQUI_O_LINK_EMBED_DO_YOUTUBE',
  images: [
    { src: 'COLE_AQUI_LINK_IMAGEM_1', caption: 'Visao geral: fracoes e decimais' },
    { src: 'COLE_AQUI_LINK_IMAGEM_2', caption: 'Exemplo visual passo a passo' },
    { src: 'COLE_AQUI_LINK_IMAGEM_3', caption: 'Resumo ilustrado para revisar' },
  ],
  sections: [
    {
      title: '1. Para comecar: o que voce vai aprender',
      paragraphs: [
        'COLE AQUI sua explicacao longa — paragrafo 1. Fale como aula particular: o que e o tema e por que cai na Etec.',
        'COLE AQUI paragrafo 2. Explique como assistir ao video e ler o texto juntos.',
      ],
      bullets: ['Ponto principal 1', 'Ponto principal 2', 'Ponto principal 3'],
    },
    {
      title: '2. Explicacao completa do tema',
      paragraphs: [
        'COLE AQUI a explicacao completa — conceito, aplicacao e como a banca cobra.',
        'COLE AQUI mais detalhes e exemplos do dia a dia.',
      ],
      bullets: ['Dica de prova 1', 'Dica de prova 2', 'Dica de prova 3'],
    },
    {
      title: '3. Passo a passo com exemplos',
      paragraphs: [
        'COLE AQUI exemplo 1 basico resolvido passo a passo.',
        'COLE AQUI exemplo 2 intermediario.',
      ],
      bullets: ['Basico', 'Intermediario', 'Etec'],
    },
    {
      title: '4. Erros mais comuns',
      paragraphs: ['COLE AQUI os erros que os alunos mais cometem neste tema.'],
      bullets: ['Erro 1 e como evitar', 'Erro 2 e como evitar'],
    },
    {
      title: '5. Resumo relampago',
      paragraphs: ['COLE AQUI o resumo de 2 minutos para revisar antes do questionario.'],
      bullets: ['Lembrete 1', 'Lembrete 2'],
    },
  ],
  quiz: [
    {
      id: 'fracoes-q1',
      question: 'COLE AQUI a pergunta 1 — Ex: Quanto e 3/4 + 1/8?',
      options: ['Opcao A', 'Opcao B (correta)', 'Opcao C', 'Opcao D'],
      correct: 1,
      explanation: 'COLE AQUI o PORQUE: por que a B esta certa e as outras erradas.',
    },
    {
      id: 'fracoes-q2',
      question: 'COLE AQUI a pergunta 2',
      options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'],
      correct: 0,
      explanation: 'COLE AQUI o porque da resposta 2.',
    },
    {
      id: 'fracoes-q3',
      question: 'COLE AQUI a pergunta 3',
      options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'],
      correct: 0,
      explanation: 'COLE AQUI o porque da resposta 3.',
    },
    {
      id: 'fracoes-q4',
      question: 'COLE AQUI a pergunta 4',
      options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'],
      correct: 0,
      explanation: 'COLE AQUI o porque da resposta 4.',
    },
    {
      id: 'fracoes-q5',
      question: 'COLE AQUI a pergunta 5',
      options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'],
      correct: 0,
      explanation: 'COLE AQUI o porque da resposta 5.',
    },
  ],
};

// AULA 2 — 28/09 PORTUGUES (edite tudo; NAO repete)
export const lessonPortugues = {
  id: 'interpretacao-texto',
  subject: 'Portugues',
  color: '#9c5de5',
  time: '10:15 - 11:15',
  duration: 60,
  date: '2026-09-28',
  days: ['seg'],
  topic: 'Leitura e interpretacao de textos',
  objective: 'Achar a ideia central e fazer inferencias',
  explanation: 'Aula completa de interpretacao: ideia central, inferencia e pegadinhas da Etec.',
  videoUrl: 'COLE_AQUI_O_LINK_EMBED_DO_YOUTUBE',
  images: [
    { src: 'COLE_AQUI_LINK_IMAGEM_1', caption: 'Visao geral: interpretacao' },
    { src: 'COLE_AQUI_LINK_IMAGEM_2', caption: 'Como inferir sem chutar' },
    { src: 'COLE_AQUI_LINK_IMAGEM_3', caption: 'Resumo para a prova' },
  ],
  sections: [
    { title: '1. Para comecar', paragraphs: ['COLE AQUI sua aula — paragrafo 1.', 'COLE AQUI paragrafo 2.'], bullets: ['Ideia central', 'Inferencia', 'Vocabulario'] },
    { title: '2. Explicacao completa', paragraphs: ['COLE AQUI explicacao completa.', 'COLE AQUI como a Etec cobra.'], bullets: ['Leia tudo antes', 'Sublinhe a pergunta', 'Elimine absurdos'] },
    { title: '3. Passo a passo', paragraphs: ['COLE AQUI exemplo 1.', 'COLE AQUI exemplo 2.'], bullets: ['Basico', 'Intermediario', 'Etec'] },
    { title: '4. Erros comuns', paragraphs: ['COLE AQUI erros comuns.'], bullets: ['Erro 1', 'Erro 2'] },
    { title: '5. Resumo', paragraphs: ['COLE AQUI resumo final.'], bullets: ['Lembrete 1', 'Lembrete 2'] },
  ],
  quiz: [
    { id: 'port-q1', question: 'COLE AQUI a pergunta 1', options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'], correct: 0, explanation: 'COLE AQUI o porque da 1.' },
    { id: 'port-q2', question: 'COLE AQUI a pergunta 2', options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'], correct: 0, explanation: 'COLE AQUI o porque da 2.' },
    { id: 'port-q3', question: 'COLE AQUI a pergunta 3', options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'], correct: 0, explanation: 'COLE AQUI o porque da 3.' },
    { id: 'port-q4', question: 'COLE AQUI a pergunta 4', options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'], correct: 0, explanation: 'COLE AQUI o porque da 4.' },
    { id: 'port-q5', question: 'COLE AQUI a pergunta 5', options: ['Opcao A', 'Opcao B', 'Opcao C', 'Opcao D'], correct: 0, explanation: 'COLE AQUI o porque da 5.' },
  ],
};

// Para criar a proxima segunda (ex 05/10): copie um bloco, mude id,
// topic, date: '2026-10-05'. Mesma materia, conteudo NOVO. Nao repete.
export const lessons = [lessonMatematica, lessonPortugues];

