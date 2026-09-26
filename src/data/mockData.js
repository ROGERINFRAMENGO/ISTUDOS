export const studentProfile = {
  name: 'Maria Clara',
  streakDays: 12,
  maxStreak: 18,
  weeklyStudyDays: 5,
  metaDiaria: 20,
  xp: 820,
  level: 4,
  totalQuestions: 132,
  correctAnswers: 96,
  accuracy: 73,
  studyMinutes: 460,
  nextActivity: 'Revisar frações e interpretar gráficos',
  lastTopic: 'Leitura e interpretação de textos',
  generalProgress: 72,
  matterProgress: {
    Português: 78,
    Matemática: 71,
    Ciências: 68,
    História: 64,
    Geografia: 61,
    Cidadania: 74,
  },
};

export const subjects = [
  {
    id: 'portugues',
    name: 'Português',
    color: '#9c5de5',
    progress: 78,
    modules: [
      { id: 'leitura', title: 'Leitura e compreensão', level: 'Básico', progress: 100 },
      { id: 'inferencia', title: 'Inferência e vocabulário', level: 'Básico', progress: 85 },
      { id: 'generos', title: 'Gêneros textuais', level: 'Intermediário', progress: 70 },
      { id: 'analise', title: 'Interpretação crítica', level: 'Avançado', progress: 52 },
    ],
  },
  {
    id: 'matematica',
    name: 'Matemática',
    color: '#a377ff',
    progress: 71,
    modules: [
      { id: 'operacoes', title: 'Operações e números', level: 'Básico', progress: 88 },
      { id: 'fracoes', title: 'Frações e decimais', level: 'Básico', progress: 76 },
      { id: 'porcentagem', title: 'Porcentagem e regra de três', level: 'Intermediário', progress: 69 },
      { id: 'geometria', title: 'Geometria e grandezas', level: 'Avançado', progress: 58 },
    ],
  },
  {
    id: 'ciencias',
    name: 'Ciências',
    color: '#8fd3a4',
    progress: 68,
    modules: [
      { id: 'biologia', title: 'Biologia', level: 'Intermediário', progress: 73 },
      { id: 'quimica', title: 'Química', level: 'Intermediário', progress: 65 },
      { id: 'fisica', title: 'Física', level: 'Intermediário', progress: 62 },
    ],
  },
  {
    id: 'historia',
    name: 'História',
    color: '#e9a87a',
    progress: 64,
    modules: [
      { id: 'antiga', title: 'Civilizações antigas', level: 'Básico', progress: 74 },
      { id: 'medieval', title: 'Idade Média', level: 'Intermediário', progress: 62 },
      { id: 'moderna', title: 'Era moderna e industrial', level: 'Avançado', progress: 52 },
    ],
  },
  {
    id: 'geografia',
    name: 'Geografia',
    color: '#7ec8ff',
    progress: 61,
    modules: [
      { id: 'mapas', title: 'Mapas e localização', level: 'Básico', progress: 79 },
      { id: 'brasil', title: 'Brasil e regiões', level: 'Intermediário', progress: 63 },
      { id: 'meio', title: 'Meio ambiente e cidades', level: 'Avançado', progress: 48 },
    ],
  },
  {
    id: 'cidadania',
    name: 'Cidadania',
    color: '#f2a6c6',
    progress: 74,
    modules: [
      { id: 'sustentabilidade', title: 'Sustentabilidade', level: 'Básico', progress: 80 },
      { id: 'cidadania', title: 'Direitos e participação', level: 'Intermediário', progress: 70 },
      { id: 'trabalho', title: 'Mundo do trabalho', level: 'Intermediário', progress: 73 },
    ],
  },
];

export const missions = [
  { id: 'math-20', label: 'Estudar Matemática por 20 minutos', done: true },
  { id: 'five-questions', label: 'Resolver 5 questões', done: true },
  { id: 'review', label: 'Revisar um assunto', done: false },
  { id: 'etec-question', label: 'Fazer 1 questão da Etec', done: false },
];

export const weeklyChallenges = [
  'Resolver 30 questões',
  'Estudar 4 dias',
  'Completar 2 módulos',
  'Fazer 1 simulado',
];

export const achievements = [
  { icon: '🔥', title: 'Primeira Chama', text: 'Primeiro dia de estudo' },
  { icon: '📚', title: 'Primeira Matéria', text: 'Concluir uma matéria' },
  { icon: '🧠', title: 'Cabeça de Matemática', text: 'Dominar 5 conteúdos matemáticos' },
  { icon: '🎯', title: 'Mestre dos Erros', text: 'Revisar 50 questões erradas' },
];

export const questions = [
  {
    id: 1,
    subject: 'Português',
    topic: 'Interpretação de texto',
    difficulty: 'Básica',
    type: 'treino',
    question: 'Qual a ideia central do texto?',
    options: ['A importância do estudo diário.', 'O valor da tecnologia.', 'O uso de roupas elegantes.', 'A necessidade de sempre viajar.'],
    correct: 0,
    explanation: 'O texto destaca como a constância nos estudos melhora a aprendizagem e a confiança da estudante.',
  },
  {
    id: 2,
    subject: 'Matemática',
    topic: 'Frações',
    difficulty: 'Básica',
    type: 'treino',
    question: 'Qual é o resultado de 3/4 + 1/8?',
    options: ['4/8', '7/8', '5/8', '1/2'],
    correct: 1,
    explanation: 'Transforme 3/4 em 6/8 e some 1/8, resultando em 7/8.',
  },
  {
    id: 3,
    subject: 'História',
    topic: 'Brasil Colonial',
    difficulty: 'Intermediária',
    type: 'Etec',
    question: 'A produção de açúcar no Brasil Colonial estava ligada principalmente a:',
    options: ['À indústria metalúrgica.', 'À plantation e ao latifúndio.', 'À mineração urbana.', 'À navegação de cabotagem.'],
    correct: 1,
    explanation: 'A economia açucareira foi baseada na monocultura e na grande propriedade rural.',
  },
  {
    id: 4,
    subject: 'Geografia',
    topic: 'Mapas',
    difficulty: 'Básica',
    type: 'simulado',
    question: 'A escala de um mapa indica:',
    options: ['A direção do vento.', 'A relação entre distância real e distância no mapa.', 'A tênue de um rio.', 'A formação do relevo.'],
    correct: 1,
    explanation: 'Escala é a proporção entre o desenho e o espaço real representado.',
  },
  {
    id: 5,
    subject: 'Ciências',
    topic: 'Fotossíntese',
    difficulty: 'Intermediária',
    type: 'revisão',
    question: 'Qual processo permite as plantas produzirem seu próprio alimento?',
    options: ['Respiração celular', 'Fotossíntese', 'Digestão', 'Fermentação'],
    correct: 1,
    explanation: 'As plantas usam luz solar, água e gás carbônico para produzir glicose.',
  },
];

export const streakCalendar = [
  { day: 'Seg', active: true },
  { day: 'Ter', active: true },
  { day: 'Qua', active: true },
  { day: 'Qui', active: true },
  { day: 'Sex', active: true },
  { day: 'Sáb', active: false },
  { day: 'Dom', active: true },
];

export const feed = [
  '🔥 Você alcançou 7 dias!',
  '📚 Você concluiu Frações.',
  '🎯 Você acertou 8 de 10 questões.',
  '🧠 Você melhorou em interpretação de texto.',
  '🏆 Nova conquista desbloqueada!',
];

export const journey = [
  'Começo',
  'Fundamentos',
  'Base construída',
  'Intermediário',
  'Avançado',
  'Questões Etec',
  'Simulados',
  'Preparação final',
];
