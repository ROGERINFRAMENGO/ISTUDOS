export const studentProfile = {
  name: 'Anna',
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

export const STUDY_START_DATE = '2026-09-28';
export const STUDY_END_DATE = '2026-12-06';

const weekBlueprint = [
  {
    week: 1,
    objective: 'Construir fundamentos',
    days: [
      { date: '2026-09-28', weekday: 'Segunda', focus: 'Matemática + Português', activities: [
        { id: 'w1-seg-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Operações e números', objective: 'Revisar operações básicas e divisibilidade', explanation: 'Reforce cálculos mentais, sinais, divisibilidade e números primos para ganhar velocidade e segurança.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
        { id: 'w1-seg-port', subject: 'Português', color: '#9c5de5', time: '10:00 - 10:40', topic: 'Leitura e compreensão', objective: 'Ler com atenção e localizar informações', explanation: 'Entenda a ideia principal, detalhes explícitos e conflitos de sentido em textos curtos.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
      ] },
      { date: '2026-09-29', weekday: 'Terça', focus: 'Português + Matemática', activities: [
        { id: 'w1-ter-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Compreensão textual', objective: 'Identificar inferências e ideias centrais', explanation: 'Treine a leitura rápida e a separação entre o que está explícito e o que precisa ser inferido.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
        { id: 'w1-ter-math', subject: 'Matemática', color: '#a377ff', time: '10:15 - 10:55', topic: 'Cálculo básico', objective: 'Resolver operações com segurança', explanation: 'Reconheça padrões em contas de adição, subtração, multiplicação e divisão.', duration: 40, type: 'exercicio', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-09-30', weekday: 'Quarta', focus: 'Ciências', activities: [
        { id: 'w1-qua-ciencia', subject: 'Ciências', color: '#8fd3a4', time: '09:00 - 09:50', topic: 'Matéria, substância e misturas', objective: 'Entender a diferença entre substância e mistura', explanation: 'A aula mostra como separar misturas e perceber propriedades das substâncias.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/ICJZ1eO9s8Y?si=O0VySJST0fO3mI7C' },
        { id: 'w1-qua-bio', subject: 'Biologia', color: '#65c38b', time: '10:15 - 10:55', topic: 'Células e noções básicas', objective: 'Compreender a unidade básica da vida', explanation: 'Vamos revisar organelas, estrutura celular e a função dos componentes básicos.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/YG7tM6G0-6A?si=E2fCj7wthRuh6iDq' },
      ] },
      { date: '2026-10-01', weekday: 'Quinta', focus: 'Matemática', activities: [
        { id: 'w1-qui-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Frações e decimais', objective: 'Converter e comparar frações, decimais e porcentagem', explanation: 'Entenda a equivalência entre frações e decimais e como isso entra em questões do vestibulinho.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/pGz5Dk1j7YQ?si=0M1n8D9tGg4R3s2Q' },
      ] },
      { date: '2026-10-02', weekday: 'Sexta', focus: 'História + Geografia', activities: [
        { id: 'w1-sex-hist', subject: 'História', color: '#e9a87a', time: '09:00 - 09:45', topic: 'Tempo histórico e Antiguidade', objective: 'Entender noções de tempo e civilizações', explanation: 'A aula contextualiza noções de tempo histórico e a importância do Egito e de outras civilizações antigas.', duration: 45, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/OWki77wA4e8?si=MtP6qYH2ZqL8hJjA' },
        { id: 'w1-sex-geo', subject: 'Geografia', color: '#7ec8ff', time: '10:00 - 10:40', topic: 'Mapas e localização', objective: 'Ler mapas e identificar localizações', explanation: 'Você vai trabalhar escala, coordenadas e o uso de mapas para localizar pontos no espaço.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/HwP64QqScQ0?si=5y5J6jVop_9f5PqN' },
      ] },
      { date: '2026-10-03', weekday: 'Sábado', focus: 'Português + Biologia', activities: [
        { id: 'w1-sab-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Gênero textual e objetivo comunicativo', objective: 'Reconhecer a intenção do texto', explanation: 'Os gêneros textuais ajudam a entender o motivo da comunicação e o público-alvo.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
        { id: 'w1-sab-bio', subject: 'Biologia', color: '#65c38b', time: '10:15 - 10:55', topic: 'Seres vivos e ecossistemas', objective: 'Relacionar os elementos de um ecossistema', explanation: 'Entenda a interação entre seres vivos, ambiente e cadeia alimentar.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/YG7tM6G0-6A?si=E2fCj7wthRuh6iDq' },
      ] },
      { date: '2026-10-04', weekday: 'Domingo', focus: 'Revisão leve', activities: [
        { id: 'w1-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas fáceis', objective: 'Revisar o que foi aprendido na semana', explanation: 'Tome uma sessão leve com questões mistas, corrija erros e prepare a semana seguinte.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' },
      ] },
    ],
  },
  {
    week: 2,
    objective: 'Razão, proporção, interpretação e Ciências',
    days: [
      { date: '2026-10-05', weekday: 'Segunda', focus: 'Matemática', activities: [
        { id: 'w2-seg-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Razão e proporção', objective: 'Comparar grandezas e resolver proporcionalidade', explanation: 'Entenda como razão e proporção aparecem em problemas de velocidade, escala e comparação.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-10-06', weekday: 'Terça', focus: 'Português', activities: [
        { id: 'w2-ter-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Pronomes e referência textual', objective: 'Entender quem é quem no texto', explanation: 'Veja como os pronomes substituem termos e como isso mantém a coesão.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
      ] },
      { date: '2026-10-07', weekday: 'Quarta', focus: 'Ciências', activities: [
        { id: 'w2-qua-ciencia', subject: 'Ciências', color: '#8fd3a4', time: '09:00 - 09:50', topic: 'Corpo humano e sistemas', objective: 'Entender a organização do corpo humano', explanation: 'Relembre os principais sistemas, como digestório, respiratório e cardiovascular.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/ICJZ1eO9s8Y?si=O0VySJST0fO3mI7C' },
      ] },
      { date: '2026-10-08', weekday: 'Quinta', focus: 'Matemática', activities: [
        { id: 'w2-qui-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Porcentagem e média', objective: 'Calcular aumentos, descontos e médias', explanation: 'A porcentagem entra em compras, dados e comparação de valores; a média ajuda na interpretação de gráficos.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/pGz5Dk1j7YQ?si=0M1n8D9tGg4R3s2Q' },
      ] },
      { date: '2026-10-09', weekday: 'Sexta', focus: 'História + Geografia', activities: [
        { id: 'w2-sex-hist', subject: 'História', color: '#e9a87a', time: '09:00 - 09:45', topic: 'Idade Média e feudalismo', objective: 'Relacionar estrutura social e poder', explanation: 'Compreenda a organização feudal e o papel da Igreja na vida medieval.', duration: 45, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/OWki77wA4e8?si=MtP6qYH2ZqL8hJjA' },
        { id: 'w2-sex-geo', subject: 'Geografia', color: '#7ec8ff', time: '10:00 - 10:40', topic: 'Clima e vegetação', objective: 'Mapear elementos naturais do espaço', explanation: 'Relembre como clima, vegetação e relevo se conectam na paisagem.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/HwP64QqScQ0?si=5y5J6jVop_9f5PqN' },
      ] },
      { date: '2026-10-10', weekday: 'Sábado', focus: 'Português + Ciências', activities: [
        { id: 'w2-sab-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Conectivos e argumentação', objective: 'Reconhecer causa, consequência e oposição', explanation: 'Os conectivos ajudam a entender a lógica do texto e a ordem dos argumentos.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
        { id: 'w2-sab-ciencia', subject: 'Ciências', color: '#8fd3a4', time: '10:15 - 10:55', topic: 'Átomos', objective: 'Entender a base da matéria', explanation: 'A aula revisa átomos, partículas e suas propriedades básicas.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/ICJZ1eO9s8Y?si=O0VySJST0fO3mI7C' },
      ] },
      { date: '2026-10-11', weekday: 'Domingo', focus: 'Revisão', activities: [
        { id: 'w2-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas', objective: 'Reforçar a leitura e a lógica de cálculo', explanation: 'Faça um treino leve de revisão e corrija os erros da semana.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' },
      ] },
    ],
  },
  {
    week: 3,
    objective: 'Álgebra básica e Ciências',
    days: [
      { date: '2026-10-12', weekday: 'Segunda', focus: 'Matemática', activities: [
        { id: 'w3-seg-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Potenciação e raízes', objective: 'Resolver potências e raízes com segurança', explanation: 'Entenda a lógica da multiplicação repetida e das raízes.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-10-13', weekday: 'Terça', focus: 'Português', activities: [
        { id: 'w3-ter-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Linguagem formal e informal', objective: 'Distinguir registro e nível de linguagem', explanation: 'A aula ensina a identificar contexto, público e intenção na linguagem.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
      ] },
      { date: '2026-10-14', weekday: 'Quarta', focus: 'Biologia', activities: [
        { id: 'w3-qua-bio', subject: 'Biologia', color: '#65c38b', time: '09:00 - 09:50', topic: 'Plantas, fotossíntese e classificação', objective: 'Relacionar plantas e produção de energia', explanation: 'Estude a função da fotossíntese e a classificação vegetal.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/YG7tM6G0-6A?si=E2fCj7wthRuh6iDq' },
      ] },
      { date: '2026-10-15', weekday: 'Quinta', focus: 'Matemática', activities: [
        { id: 'w3-qui-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Expressões algébricas e equações de 1º grau', objective: 'Transformar e calcular expressões simples', explanation: 'A equação de 1º grau é uma base essencial para várias questões da Etec.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-10-16', weekday: 'Sexta', focus: 'História + Geografia', activities: [
        { id: 'w3-sex-hist', subject: 'História', color: '#e9a87a', time: '09:00 - 09:45', topic: 'Grandes Navegações e mercantilismo', objective: 'Compreender expansão marítima e economia', explanation: 'Hoje o foco é o ciclo comercial europeu e o papel da colonização.', duration: 45, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/OWki77wA4e8?si=MtP6qYH2ZqL8hJjA' },
        { id: 'w3-sex-geo', subject: 'Geografia', color: '#7ec8ff', time: '10:00 - 10:40', topic: 'Amazônia', objective: 'Relacionar relevo e bioma', explanation: 'Entenda a riqueza ambiental, a vegetação e a importância da Amazônia.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/HwP64QqScQ0?si=5y5J6jVop_9f5PqN' },
      ] },
      { date: '2026-10-17', weekday: 'Sábado', focus: 'Português + Química', activities: [
        { id: 'w3-sab-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Pontuação e poemas', objective: 'Reforçar leitura e interpretação de textos literários', explanation: 'Treine pontuação, leitura e identificação de sentidos em poemas e tirinhas.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
        { id: 'w3-sab-quim', subject: 'Química', color: '#7cc5b3', time: '10:15 - 10:55', topic: 'Ácidos, bases e pH', objective: 'Compreender reações e escala de pH', explanation: 'Reveja a classificação de substâncias e o que significa pH.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/ICJZ1eO9s8Y?si=O0VySJST0fO3mI7C' },
      ] },
      { date: '2026-10-18', weekday: 'Domingo', focus: 'Revisão', activities: [
        { id: 'w3-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas', objective: 'Identificar lacunas da semana', explanation: 'Resolva 18 questões mistas e corrija erros antes de avançar.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' },
      ] },
    ],
  },
  {
    week: 4,
    objective: 'Geometria, interpretação avançada e Ciências',
    days: [
      { date: '2026-10-19', weekday: 'Segunda', focus: 'Matemática', activities: [
        { id: 'w4-seg-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Perímetro e área', objective: 'Aplicar medidas em figuras planas', explanation: 'Calcule área e perímetro com atenção às unidades e ao contexto dos problemas.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-10-20', weekday: 'Terça', focus: 'Português', activities: [
        { id: 'w4-ter-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Ironia, humor e ambiguidade', objective: 'Interpretar sentidos ocultos', explanation: 'A aula ajuda a distinguir o que é literal e o que é figurado ou irônico.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
      ] },
      { date: '2026-10-21', weekday: 'Quarta', focus: 'Biologia', activities: [
        { id: 'w4-qua-bio', subject: 'Biologia', color: '#65c38b', time: '09:00 - 09:50', topic: 'Genética e evolução', objective: 'Relacionar características e hereditariedade', explanation: 'Reveja genes, hereditariedade e processo evolutivo básico.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/YG7tM6G0-6A?si=E2fCj7wthRuh6iDq' },
      ] },
      { date: '2026-10-22', weekday: 'Quinta', focus: 'Matemática', activities: [
        { id: 'w4-qui-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Volume, cilindro e ângulos', objective: 'Resolver problemas com medidas espaciais', explanation: 'Você vai aplicar fórmulas e raciocínio geométrico.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-10-23', weekday: 'Sexta', focus: 'História', activities: [
        { id: 'w4-sex-hist', subject: 'História', color: '#e9a87a', time: '09:00 - 10:00', topic: 'Brasil Colonial, Império e República', objective: 'Conectar os grandes períodos históricos do Brasil', explanation: 'Relacione a formação do Brasil, as mudanças de governo e a industrialização.', duration: 60, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/OWki77wA4e8?si=MtP6qYH2ZqL8hJjA' },
      ] },
      { date: '2026-10-24', weekday: 'Sábado', focus: 'Português + Física', activities: [
        { id: 'w4-sab-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Gramática em contexto', objective: 'Reconhecer regras de uso no texto', explanation: 'A gramática deixa de ser abstrata quando aplicada a textos reais.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
        { id: 'w4-sab-fis', subject: 'Física', color: '#ffb703', time: '10:15 - 10:55', topic: 'Eletricidade e circuitos', objective: 'Entender circuito e energia elétrica', explanation: 'A aula mostra a lógica de corrente e resistência em circuitos simples.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/1_QY_HVNTq0?si=2WJVR3q82FHYpxzV' },
      ] },
      { date: '2026-10-25', weekday: 'Domingo', focus: 'Revisão', activities: [
        { id: 'w4-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas', objective: 'Treinar leitura e cálculo', explanation: 'Uma revisão leve com foco em interpretação e geometria.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' },
      ] },
    ],
  },
  {
    week: 5,
    objective: 'Completar a base mais importante',
    days: [
      { date: '2026-10-26', weekday: 'Segunda', focus: 'Matemática', activities: [
        { id: 'w5-seg-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Gráficos, tabelas e média', objective: 'Interpretar dados e cálculos estatísticos', explanation: 'Leitura de gráficos e compreensão de dados são muito exigidos na Etec.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-10-27', weekday: 'Terça', focus: 'Português', activities: [
        { id: 'w5-ter-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 09:50', topic: 'Coesão e retomada de informações', objective: 'Entender como o texto se conecta', explanation: 'Relembre como o texto organiza ideias para evitar confusão de sentido.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' },
      ] },
      { date: '2026-10-28', weekday: 'Quarta', focus: 'Biologia', activities: [
        { id: 'w5-qua-bio', subject: 'Biologia', color: '#65c38b', time: '09:00 - 09:50', topic: 'Ecologia e biodiversidade', objective: 'Relacionar seres vivos e ambiente', explanation: 'Toda relação ecológica exige atenção à cadeia alimentar e ao equilíbrio do ecossistema.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/YG7tM6G0-6A?si=E2fCj7wthRuh6iDq' },
      ] },
      { date: '2026-10-29', weekday: 'Quinta', focus: 'Matemática', activities: [
        { id: 'w5-qui-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Probabilidade e análise combinatória', objective: 'Entender possibilidades e contagem', explanation: 'A análise combinatória ajuda a interpretar situações de escolha e organização.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' },
      ] },
      { date: '2026-10-30', weekday: 'Sexta', focus: 'Geografia', activities: [
        { id: 'w5-sex-geo', subject: 'Geografia', color: '#7ec8ff', time: '09:00 - 09:50', topic: 'Urbanização e infraestrutura', objective: 'Relacionar cidade, população e logística', explanation: 'A aula conecta crescimento urbano, mobilidade e infraestrutura.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/HwP64QqScQ0?si=5y5J6jVop_9f5PqN' },
      ] },
      { date: '2026-10-31', weekday: 'Sábado', focus: 'Química + Física', activities: [
        { id: 'w5-sab-quim', subject: 'Química', color: '#7cc5b3', time: '09:00 - 09:50', topic: 'Reações químicas e misturas', objective: 'Reconhecer processos e separações', explanation: 'Reveja óxidos e a separação de misturas em situações cotidianas.', duration: 50, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/ICJZ1eO9s8Y?si=O0VySJST0fO3mI7C' },
        { id: 'w5-sab-fis', subject: 'Física', color: '#ffb703', time: '10:15 - 10:55', topic: 'Calor e energia', objective: 'Relacionar energia térmica ao cotidiano', explanation: 'Estude transferência de calor e energia em situações simples.', duration: 40, type: 'conteudo', videoUrl: 'https://www.youtube.com/embed/1_QY_HVNTq0?si=2WJVR3q82FHYpxzV' },
      ] },
      { date: '2026-11-01', weekday: 'Domingo', focus: 'Revisão', activities: [
        { id: 'w5-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas', objective: 'Reforçar competência geral', explanation: 'Faça revisão leve e no final classifique os temas em fraco, em desenvolvimento e dominado.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' },
      ] },
    ],
  },
  {
    week: 6,
    objective: 'Revisão geral',
    days: [
      { date: '2026-11-02', weekday: 'Segunda', focus: 'Revisão de Matemática', activities: [{ id: 'w6-seg-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 10:00', topic: 'Revisão geral de matemática', objective: 'Reforçar operações, frações e geometria', explanation: 'Reveja tudo que foi mais exigido da base até aqui.', duration: 60, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' }] },
      { date: '2026-11-03', weekday: 'Terça', focus: 'Revisão de Português', activities: [{ id: 'w6-ter-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 10:00', topic: 'Revisão geral de português', objective: 'Reforçar leitura e interpretação', explanation: 'Concentre-se em coesão, inferência e vocabulação em contexto.', duration: 60, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/5d0pWvGzkuA?si=OZK6eYJDUtJ04v4R' }] },
      { date: '2026-11-04', weekday: 'Quarta', focus: 'Biologia + Química', activities: [{ id: 'w6-qua-ciencia', subject: 'Ciências', color: '#8fd3a4', time: '09:00 - 10:00', topic: 'Revisão de Biologia e Química', objective: 'Consolidar conceitos essenciais', explanation: 'Reforço em células, fotossíntese, ácidos e bases.', duration: 60, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/ICJZ1eO9s8Y?si=O0VySJST0fO3mI7C' }] },
      { date: '2026-11-05', weekday: 'Quinta', focus: 'Matemática aplicada', activities: [{ id: 'w6-qui-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 09:50', topic: 'Geometria, porcentagem e álgebra', objective: 'Revisar temas mais recorrentes', explanation: 'Este é um dia de consolidação dos assuntos mais cobrados em provas.', duration: 50, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/7k4rD7MZy4I?si=YxXw4f4L52QX7C9K' }] },
      { date: '2026-11-06', weekday: 'Sexta', focus: 'História + Geografia', activities: [{ id: 'w6-sex-histgeo', subject: 'História e Geografia', color: '#d19472', time: '09:00 - 10:00', topic: 'Revisão de história e geografia', objective: 'Fixar conteúdos mais relevantes', explanation: 'Hoje é hora de consolidar contexto histórico e espacial.', duration: 60, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/OWki77wA4e8?si=MtP6qYH2ZqL8hJjA' }] },
      { date: '2026-11-07', weekday: 'Sábado', focus: 'Física + temas interdisciplinares', activities: [{ id: 'w6-sab-fis', subject: 'Física', color: '#ffb703', time: '09:00 - 09:50', topic: 'Física e temas interdisciplinares', objective: 'Reforçar leitura e interpretação contextualizada', explanation: 'Trabalhe energia, calor e meio ambiente em situações interdisciplinares.', duration: 50, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/1_QY_HVNTq0?si=2WJVR3q82FHYpxzV' }] },
      { date: '2026-11-08', weekday: 'Domingo', focus: '18 questões mistas', activities: [{ id: 'w6-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas', objective: 'Classificar temas em fraco, em desenvolvimento e dominado', explanation: 'A revisão final da semana deve apontar exatamente o que precisa voltar em foco.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
    ],
  },
  {
    week: 7,
    objective: 'Primeiro treino completo com prova Etec',
    days: [
      { date: '2026-11-09', weekday: 'Segunda', focus: 'Questões 1-10', activities: [{ id: 'w7-seg-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 1-10', objective: 'Simular a prova e identificar padrões', explanation: 'Faça as questões de forma cronometrada e anote erros para revisão.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-10', weekday: 'Terça', focus: 'Questões 11-20', activities: [{ id: 'w7-ter-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 11-20', objective: 'Continuar simulado', explanation: 'Continue com a bateria do simulado e registre dúvidas', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-11', weekday: 'Quarta', focus: 'Questões 21-30', activities: [{ id: 'w7-qua-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 21-30', objective: 'Manter ritmo de prova', explanation: 'Atenção para tempo e leitura em textos longos.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-12', weekday: 'Quinta', focus: 'Questões 31-40', activities: [{ id: 'w7-qui-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 31-40', objective: 'Treinar leitura rápida e acurácia', explanation: 'Aproveite para revisar erros e focar em tópicos prioritários.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-13', weekday: 'Sexta', focus: 'Questões 41-50', activities: [{ id: 'w7-sex-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 41-50', objective: 'Fechar o simulado completo', explanation: 'Reforce decisões rápidas e controle emocional.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-14', weekday: 'Sábado', focus: 'Refazer erros', activities: [{ id: 'w7-sab-erro', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: 'Revisão de erros da prova', objective: 'Mapear e corrigir falhas', explanation: 'Cada erro deve virar uma revisão clara e objetiva.', duration: 60, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-15', weekday: 'Domingo', focus: '18 questões mistas', activities: [{ id: 'w7-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas', objective: 'Reforçar a base e manter a constância', explanation: 'O domingo segue leve e de revisão, sem sobrecarregar.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
    ],
  },
  {
    week: 8,
    objective: 'Segundo treino completo com prova Etec',
    days: [
      { date: '2026-11-16', weekday: 'Segunda', focus: 'Questões 1-10', activities: [{ id: 'w8-seg-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 1-10', objective: 'Segundo ciclo de simulado', explanation: 'Faça a prova em um ritmo realista e anote os erros.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-17', weekday: 'Terça', focus: 'Questões 11-20', activities: [{ id: 'w8-ter-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 11-20', objective: 'Ajustar ritmo e estratégia', explanation: 'Aplique o mesmo método de prova da semana anterior.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-18', weekday: 'Quarta', focus: 'Questões 21-30', activities: [{ id: 'w8-qua-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 21-30', objective: 'Acelerar leitura e melhora de acerto', explanation: 'Atenção a interpretação e cálculo em provas mais longas.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-19', weekday: 'Quinta', focus: 'Questões 31-40', activities: [{ id: 'w8-qui-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 31-40', objective: 'Aumentar produtividade', explanation: 'Priorize acertos e utilize revisão imediata dos erros.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-20', weekday: 'Sexta', focus: 'Questões 41-50', activities: [{ id: 'w8-sex-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões 41-50', objective: 'Finalizar o simulado', explanation: 'O foco agora é concluir bem e preencher lacunas de tempo.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-21', weekday: 'Sábado', focus: 'Revisão de erros', activities: [{ id: 'w8-sab-erro', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: 'Refazer erros', objective: 'Revisar sem repetir falhas', explanation: 'Cada erro precisa virar um passo explícito de revisão.', duration: 60, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-22', weekday: 'Domingo', focus: '18 questões mistas', activities: [{ id: 'w8-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas', objective: 'Manter ritmo e confiança', explanation: 'Revisão leve para descansar a mente e reforçar a base.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
    ],
  },
  {
    week: 9,
    objective: 'Aumentar dificuldade',
    days: [
      { date: '2026-11-23', weekday: 'Segunda', focus: 'Questões difíceis', activities: [{ id: 'w9-seg-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões difíceis mistas', objective: 'Fortalecer interpretação e cálculo em contexto', explanation: 'Trabalhe com múltiplas etapas, gráficos e textos complexos.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-24', weekday: 'Terça', focus: 'Questões misturadas', activities: [{ id: 'w9-ter-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões misturadas', objective: 'Combinar estratégias em diferentes áreas', explanation: 'Esforce a leitura em contextos mistos e aumente a rapidez.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-25', weekday: 'Quarta', focus: 'Questões de alta exigência', activities: [{ id: 'w9-qua-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões de alta exigência', objective: 'Aumentar resolução em tempo', explanation: 'Foco em interpretação, matemática aplicada e dados.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-26', weekday: 'Quinta', focus: 'Questões contextuais', activities: [{ id: 'w9-qui-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões contextualizadas', objective: 'Aplicar conteúdo em situações reais', explanation: 'Trabalhe temas interdisciplinares e leitura crítica.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-27', weekday: 'Sexta', focus: 'Questões difíceis', activities: [{ id: 'w9-sex-questoes', subject: 'Prova Etec', color: '#ef476f', time: '09:00 - 10:00', topic: 'Questões mais difíceis', objective: 'Travar o método de prova', explanation: 'A dureza aumenta, mas o objetivo é manter estratégia e controle emocional.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-28', weekday: 'Sábado', focus: 'Revisão de erros acumulados', activities: [{ id: 'w9-sab-erro', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: 'Revisão de erros acumulados', objective: 'Fechar falhas e reforçar explicações', explanation: 'Revise tudo que passou por dificuldades durante a semana.', duration: 60, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-11-29', weekday: 'Domingo', focus: '18 questões mistas', activities: [{ id: 'w9-dom-revisao', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 10:00', topic: '18 questões mistas cronometradas', objective: 'Ajustar ritmo e confiança', explanation: 'Revisão leve despertando foco para a reta final.', duration: 60, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
    ],
  },
  {
    week: 10,
    objective: 'Modo prova',
    days: [
      { date: '2026-11-30', weekday: 'Segunda', focus: 'Matemática + Etec', activities: [{ id: 'w10-seg-math', subject: 'Matemática', color: '#a377ff', time: '09:00 - 10:00', topic: '10 questões Etec + Matemática fraca', objective: 'Consolidar o que ainda precisa de reforço', explanation: 'Trabalhe uma mistura de questões Etec com matemática fortalece a base final.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-12-01', weekday: 'Terça', focus: 'Português + Etec', activities: [{ id: 'w10-ter-port', subject: 'Português', color: '#9c5de5', time: '09:00 - 10:00', topic: '10 questões Etec + Português fraco', objective: 'Reforçar leitura e interpretação', explanation: 'Questões de texto e inferência precisam voltar ao radar na reta final.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-12-02', weekday: 'Quarta', focus: 'Ciências + Etec', activities: [{ id: 'w10-qua-ciencia', subject: 'Ciências', color: '#8fd3a4', time: '09:00 - 10:00', topic: '10 questões Etec + Ciências fracas', objective: 'Consolidar conteúdos do exame', explanation: 'É o momento de revisar conceitos e responder em contexto.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-12-03', weekday: 'Quinta', focus: 'História/Geografia + Etec', activities: [{ id: 'w10-qui-histgeo', subject: 'História e Geografia', color: '#d19472', time: '09:00 - 10:00', topic: '10 questões Etec + áreas fracas', objective: 'Reducionar lacunas de contexto', explanation: 'Estude em blocos curtos e focados.', duration: 60, type: 'etec', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-12-04', weekday: 'Sexta', focus: '20 questões mistas', activities: [{ id: 'w10-sex-simul', subject: 'Simulado', color: '#ef476f', time: '09:00 - 10:30', topic: '20 questões mistas cronometradas', objective: 'Treinar resistência mental e ritmo de prova', explanation: 'Reduza ansiedade e aumente controle de tempo.', duration: 90, type: 'simulado', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-12-05', weekday: 'Sábado', focus: 'Revisão leve', activities: [{ id: 'w10-sab-leve', subject: 'Revisão', color: '#8b5cf6', time: '09:00 - 09:45', topic: 'Revisão leve final', objective: 'Fechar com segurança', explanation: 'Reveja fórmulas, gráficos, erros e conceitos-chave.', duration: 45, type: 'revisao', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
      { date: '2026-12-06', weekday: 'Domingo', focus: 'Dia da prova', activities: [{ id: 'w10-dom-prova', subject: 'Prova', color: '#22c55e', time: 'Manhã', topic: 'Revisão breve e descanso', objective: 'Entrar na prova tranquila', explanation: 'Revisar somente fórmulas essenciais, mapas, gráficos e caderno de erros. Depois, descansar.', duration: 30, type: 'prova', videoUrl: 'https://www.youtube.com/embed/3DeP32qM4mM?si=8YB2y9mVn0lA_2k9N' }] },
    ],
  },
];

export const studyPlan = [
  ...weekBlueprint[0].days[0].activities,
];

export function getScheduleForDate(dateInput) {
  const targetDate = new Date(dateInput);
  const dateKey = new Date(targetDate.getTime() - targetDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  for (const week of weekBlueprint) {
    const match = week.days.find((day) => day.date === dateKey);
    if (match) {
      return {
        weekNumber: week.week,
        objective: week.objective,
        ...match,
      };
    }
  }

  return {
    weekNumber: 1,
    objective: 'Construir fundamentos',
    date: dateKey,
    weekday: 'Segunda',
    focus: 'Matemática + Português',
    activities: studyPlan,
  };
}

export function getTodayStudySchedule() {
  return getScheduleForDate(new Date());
}

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
