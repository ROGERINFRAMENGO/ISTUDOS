const data = {
  studentProfile: {
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
    lastTopic: 'Leitura e interpretação de textos',
    generalProgress: 72,
  },
  subjects: [
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
  ],
  missions: [
    { id: 'math-20', label: 'Estudar Matemática por 20 minutos', done: true },
    { id: 'five-questions', label: 'Resolver 5 questões', done: true },
    { id: 'review', label: 'Revisar um assunto', done: false },
    { id: 'etec-question', label: 'Fazer 1 questão da Etec', done: false },
  ],
  achievements: [
    { icon: '🔥', title: 'Primeira Chama', text: 'Primeiro dia de estudo' },
    { icon: '📚', title: 'Primeira Matéria', text: 'Concluir uma matéria' },
    { icon: '🧠', title: 'Cabeça de Matemática', text: 'Dominar 5 conteúdos matemáticos' },
    { icon: '🎯', title: 'Mestre dos Erros', text: 'Revisar 50 questões erradas' },
  ],
  questions: [
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
  ],
  streakCalendar: [
    { day: 'Seg', active: true },
    { day: 'Ter', active: true },
    { day: 'Qua', active: true },
    { day: 'Qui', active: true },
    { day: 'Sex', active: true },
    { day: 'Sáb', active: false },
    { day: 'Dom', active: true },
  ],
  feed: [
    '🔥 Você alcançou 7 dias!',
    '📚 Você concluiu Frações.',
    '🎯 Você acertou 8 de 10 questões.',
    '🧠 Você melhorou em interpretação de texto.',
    '🏆 Nova conquista desbloqueada!',
  ],
  journey: [
    'Começo',
    'Fundamentos',
    'Base construída',
    'Intermediário',
    'Avançado',
    'Questões Etec',
    'Simulados',
    'Preparação final',
  ],
};

const sidebarItems = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'meta', label: 'Minha Meta' },
  { key: 'trilhas', label: 'Trilhas de estudo' },
  { key: 'subjects', label: 'Matérias' },
  { key: 'questions', label: 'Questões' },
  { key: 'etec', label: 'Questões Etec' },
  { key: 'simulados', label: 'Simulados' },
  { key: 'errors', label: 'Caderno de erros' },
  { key: 'revisoes', label: 'Revisões' },
  { key: 'progresso', label: 'Progresso' },
  { key: 'conquistas', label: 'Conquistas' },
  { key: 'config', label: 'Configurações' },
];

const examQuestions = [
  {
    question: 'Qual tema foi central na expansão marítima europeia?',
    options: ['A busca por novas rotas comerciais e riquezas.', 'A defesa da liberdade religiosa universal.', 'A criação de uma moeda única.', 'A unificação dos continentes.'],
    correct: 0,
  },
  {
    question: 'Qual operação resulta em 3/5 + 1/10?',
    options: ['7/10', '4/5', '2/10', '3/10'],
    correct: 0,
  },
  {
    question: 'A fotossíntese depende principalmente de:',
    options: ['Luz solar, água e gás carbônico.', 'Água, sal e vento.', 'Solo, carvão e calor.', 'Oxigênio, argila e sombra.'],
    correct: 0,
  },
  {
    question: 'A principal função de um mapa em escala é:',
    options: ['Representar proporcionalmente a distância real.', 'Mostrar o clima semanal da região.', 'Substituir a leitura de livros.', 'Identificar apenas cidades grandes.'],
    correct: 0,
  },
];

const state = {
  page: 'dashboard',
  selectedSubjectId: data.subjects[0].id,
  xp: data.studentProfile.xp,
  streak: data.studentProfile.streakDays,
  studyMinutes: data.studentProfile.studyMinutes,
  answeredQuestion: false,
  errorLog: [
    { subject: 'Frações', title: 'Frações e decimais', count: 2 },
    { subject: 'Leitura', title: 'Leitura inferencial', count: 1 },
  ],
  exam: {
    active: false,
    completed: false,
    currentIndex: 0,
    score: 0,
    answered: [],
    timeLeft: 300,
    result: null,
  },
};

const mainPanel = document.getElementById('mainPanel');
const nav = document.getElementById('mainNav');

function syncHeaderStats() {
  const xpProgress = (state.xp / 1000) * 100;
  document.getElementById('xpValue').textContent = `${state.xp} XP`;
  document.getElementById('xpProgress').style.width = `${Math.min(xpProgress, 100)}%`;
  document.getElementById('xpMeta').textContent = `Nível ${Math.floor(state.xp / 250) + 1} · ${state.xp}/1000 XP`;
}

syncHeaderStats();

nav.innerHTML = sidebarItems
  .map(({ key, label }, index) => `
    <button class="nav-item ${index === 0 ? 'active' : ''}" data-page="${key}">
      <span>${label}</span>
    </button>
  `)
  .join('');

nav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (!button) return;

  state.page = button.dataset.page;
  document.querySelectorAll('.nav-item').forEach((node) => node.classList.toggle('active', node === button));
  renderPage();
});

function renderPage() {
  const selectedSubject = data.subjects.find((subject) => subject.id === state.selectedSubjectId) || data.subjects[0];
  const views = {
    dashboard: renderDashboard(selectedSubject),
    subjects: renderSubjects(selectedSubject),
    trilhas: renderTrilhas(selectedSubject),
    questions: renderQuestions(selectedSubject),
    simulados: renderSimulados(selectedSubject),
    meta: renderMeta(selectedSubject),
    etec: renderEtec(selectedSubject),
    errors: renderErrors(selectedSubject),
    revisoes: renderRevisoes(selectedSubject),
    progresso: renderProgresso(selectedSubject),
    conquistas: renderConquistas(selectedSubject),
    config: renderConfig(selectedSubject),
  };

  mainPanel.innerHTML = views[state.page] || views.dashboard;

  bindSubjectSelection();
  bindChallengeButton();
  bindSessionActions();
  bindAnswerButtons();
  bindExamActions();
}

function bindChallengeButton() {
  const button = document.getElementById('completeGoalBtn');
  if (!button) return;

  button.addEventListener('click', () => {
    const banner = document.getElementById('celebrationBanner');
    if (!banner) return;
    state.xp += 35;
    state.streak += 1;
    syncHeaderStats();
    document.getElementById('xpValue').textContent = `${state.xp} XP`;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 2000);
  });
}

function bindSessionActions() {
  const startButton = document.getElementById('startSessionBtn');
  const addButton = document.getElementById('addMinutesBtn');

  if (startButton) {
    startButton.addEventListener('click', () => {
      const timer = document.getElementById('sessionTimer');
      if (!timer) return;
      const minutes = Number(timer.dataset.minutes || 20);
      state.studyMinutes += minutes;
      state.xp += 15;
      syncHeaderStats();
      timer.textContent = `${state.studyMinutes}m`;
      const statMinutes = document.getElementById('studyMinutes');
      if (statMinutes) statMinutes.textContent = `${state.studyMinutes}m`;
      const banner = document.getElementById('celebrationBanner');
      if (banner) {
        banner.textContent = '🔥 Sessão concluída! +15 XP';
        banner.classList.remove('hidden');
        setTimeout(() => banner.classList.add('hidden'), 2000);
      }
    });
  }

  if (addButton) {
    addButton.addEventListener('click', () => {
      state.studyMinutes += 10;
      state.xp += 10;
      syncHeaderStats();
      const statMinutes = document.getElementById('studyMinutes');
      if (statMinutes) statMinutes.textContent = `${state.studyMinutes}m`;
      const timer = document.getElementById('sessionTimer');
      if (timer) timer.textContent = `${state.studyMinutes}m`;
    });
  }
}

function bindAnswerButtons() {
  const buttons = document.querySelectorAll('.answer-option');
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.answered === 'true') return;
      const selectedIndex = Number(button.dataset.index);
      const isCorrect = selectedIndex === 0;

      buttons.forEach((option) => {
        option.dataset.answered = 'true';
        option.classList.remove('selected', 'correct', 'wrong');
        if (Number(option.dataset.index) === 0) {
          option.classList.add('correct');
        }
        if (Number(option.dataset.index) === selectedIndex && selectedIndex !== 0) {
          option.classList.add('wrong');
        }
      });

      button.classList.add('selected');
      const feedback = document.getElementById('answerFeedback');
      if (feedback) {
        feedback.textContent = isCorrect ? 'Resposta correta! Você ganhou +25 XP.' : 'Quase lá! A resposta certa é a primeira opção.';
        feedback.classList.add(isCorrect ? 'success' : 'warn');
      }

      if (isCorrect && !state.answeredQuestion) {
        state.answeredQuestion = true;
        state.xp += 25;
        syncHeaderStats();
      }
    });
  });
}

function bindExamActions() {
  const startButton = document.getElementById('startExamBtn');
  const answerButtons = document.querySelectorAll('.exam-option');
  const restartButton = document.getElementById('restartExamBtn');
  const dashboardButton = document.getElementById('backToDashboardBtn');
  const retryErrorButtons = document.querySelectorAll('[data-error-action="retry"]');

  if (startButton) {
    startButton.addEventListener('click', () => {
      state.exam = {
        active: true,
        completed: false,
        currentIndex: 0,
        score: 0,
        answered: [],
        timeLeft: 300,
        result: null,
      };
      renderPage();
    });
  }

  if (answerButtons.length) {
    answerButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const selectedIndex = Number(button.dataset.index);
        const current = examQuestions[state.exam.currentIndex];
        const isCorrect = selectedIndex === current.correct;

        state.exam.answered.push({ selectedIndex, isCorrect });
        if (isCorrect) state.exam.score += 1;

        if (!isCorrect) {
          const fallbackSubject = current.question.includes('mapa') || current.question.includes('escala') ? 'Geografia' :
            current.question.includes('fotoss') ? 'Ciências' :
            current.question.includes('3/5') ? 'Matemática' : 'História';
          const existingError = state.errorLog.find((item) => item.subject === fallbackSubject);
          if (existingError) {
            existingError.count += 1;
          } else {
            state.errorLog.unshift({ subject: fallbackSubject, title: 'Simulado em revisão', count: 1 });
          }
        }

        if (state.exam.currentIndex < examQuestions.length - 1) {
          state.exam.currentIndex += 1;
          renderPage();
          return;
        }

        const accuracy = Math.round((state.exam.score / examQuestions.length) * 100);
        const xpEarned = state.exam.score * 30;

        state.exam.completed = true;
        state.exam.active = false;
        state.exam.result = {
          accuracy,
          xpEarned,
          score: state.exam.score,
          total: examQuestions.length,
        };
        state.xp += xpEarned;
        syncHeaderStats();
        renderPage();
      });
    });
  }

  if (restartButton) {
    restartButton.addEventListener('click', () => {
      state.exam = {
        active: true,
        completed: false,
        currentIndex: 0,
        score: 0,
        answered: [],
        timeLeft: 300,
        result: null,
      };
      renderPage();
    });
  }

  if (dashboardButton) {
    dashboardButton.addEventListener('click', () => {
      state.page = 'dashboard';
      renderPage();
    });
  }

  if (retryErrorButtons.length) {
    retryErrorButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.page = 'questions';
        renderPage();
      });
    });
  }
}

function bindSubjectSelection() {
  document.querySelectorAll('[data-subject-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSubjectId = button.dataset.subjectId;
      if (state.page === 'subjects' || state.page === 'trilhas' || state.page === 'questions' || state.page === 'simulados') {
        renderPage();
      }
    });
  });
}

function renderDashboard(selectedSubject) {
  const currentQuestion = data.questions[0];

  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Bom dia</p>
        <h2>Olá, ${data.studentProfile.name}</h2>
      </div>
      <div class="topbar-actions">
        <button class="ghost-button">+ Meta</button>
        <button class="primary-button">Continuar estudando</button>
      </div>
    </header>

    <section class="hero-card">
      <div class="hero-copy">
        <span class="tag tag-hot">🔥 ${data.studentProfile.streakDays} dias de sequência</span>
        <h3>Você está no caminho certo para a Etec.</h3>
        <p>Sua maior sequência foi ${data.studentProfile.maxStreak} dias e você estudou ${data.studentProfile.weeklyStudyDays} dias esta semana.</p>
        <div class="hero-actions">
          <button class="primary-button" id="completeGoalBtn">Concluir meta</button>
          <button class="ghost-button">Ver progresso</button>
        </div>
      </div>

      <div class="streak-panel">
        <div class="streak-highlight">
          <span class="fire-icon">🔥</span>
          <div>
            <p>Meta diária</p>
            <strong>${data.studentProfile.metaDiaria} min</strong>
          </div>
        </div>
        <div class="sequence-row">
          ${data.streakCalendar.map((day) => `<div class="day-badge ${day.active ? 'active' : ''}"><span>${day.day}</span><b>${day.active ? '🔥' : '○'}</b></div>`).join('')}
        </div>
        <div class="celebration-banner hidden" id="celebrationBanner">🔥 Sequência mantida!</div>
      </div>
    </section>

    <section class="stats-grid">
      <article class="stat-card accent">
        <span class="stat-label">Progresso geral</span>
        <strong>${data.studentProfile.generalProgress}%</strong>
        <small>Conteúdos em evolução</small>
      </article>
      <article class="stat-card">
        <span class="stat-label">Questões resolvidas</span>
        <strong>${data.studentProfile.totalQuestions}</strong>
        <small>${data.studentProfile.correctAnswers} acertos</small>
      </article>
      <article class="stat-card">
        <span class="stat-label">Taxa de acerto</span>
        <strong>${data.studentProfile.accuracy}%</strong>
        <small>Boa constância</small>
      </article>
      <article class="stat-card">
        <span class="stat-label">Tempo estudado</span>
        <strong id="studyMinutes">${state.studyMinutes}m</strong>
        <small>Última revisão: ${data.studentProfile.lastTopic}</small>
      </article>
    </section>

    <section class="panel session-panel">
      <div class="panel-head">
        <h3>Sessão de estudo</h3>
        <span class="tag">${state.streak} dias</span>
      </div>
      <div class="session-body">
        <div class="session-timer">
          <span>Tempo</span>
          <strong id="sessionTimer" data-minutes="20">${state.studyMinutes}m</strong>
        </div>
        <div class="session-actions">
          <button class="primary-button" id="startSessionBtn">Iniciar sessão</button>
          <button class="ghost-button" id="addMinutesBtn">+10 min</button>
        </div>
      </div>
    </section>

    <section class="content-grid two-col">
      <div class="panel">
        <div class="panel-head">
          <h3>Trilhas de estudo</h3>
          <button class="link-button">Ver todas</button>
        </div>
        <div class="subject-list">
          ${data.subjects.map((subject) => `
            <button class="subject-item ${subject.id === selectedSubject.id ? 'selected' : ''}" data-subject-id="${subject.id}">
              <span class="subject-dot" style="background:${subject.color};"></span>
              <div>
                <strong>${subject.name}</strong>
                <small>${subject.modules.length} módulos</small>
              </div>
              <b>${subject.progress}%</b>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>Missão do dia</h3>
          <span class="tag">+50 XP</span>
        </div>
        <ul class="mission-list">
          ${data.missions.map((mission) => `<li class="${mission.done ? 'done' : ''}"><span>${mission.done ? '✓' : '□'}</span><span>${mission.label}</span></li>`).join('')}
        </ul>
      </div>
    </section>

    <section class="content-grid two-col">
      <div class="panel">
        <div class="panel-head">
          <h3>Matéria em foco</h3>
          <span class="tag">${selectedSubject.name}</span>
        </div>
        <div class="subject-card">
          <div class="subject-summary">
            <div class="subject-dot large" style="background:${selectedSubject.color};"></div>
            <div>
              <h4>${selectedSubject.name}</h4>
              <p>Próximo módulo: ${selectedSubject.modules[0].title}</p>
            </div>
          </div>
          <div class="module-list">
            ${selectedSubject.modules.map((module) => `
              <div class="module-row">
                <div>
                  <strong>${module.title}</strong>
                  <small>${module.level}</small>
                </div>
                <div class="progress-block">
                  <span>${module.progress}%</span>
                  <div class="progress-line small"><span style="width:${module.progress}%; background:${selectedSubject.color};"></span></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>Questão do dia</h3>
          <span class="tag tag-soft">${currentQuestion.type}</span>
        </div>
        <div class="question-card">
          <p class="question-meta">${currentQuestion.subject} · ${currentQuestion.topic}</p>
          <h4>${currentQuestion.question}</h4>
          <div class="answer-list">
            ${currentQuestion.options.map((option, index) => `
              <button class="answer-option ${index === currentQuestion.correct ? 'correct-answer' : ''}" data-index="${index}">
                ${option}
              </button>
            `).join('')}
          </div>
          <div class="explain-box" id="answerFeedback">
            <strong>Feedback</strong>
            <p>Escolha uma resposta para receber o retorno.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="content-grid two-col lower-grid">
      <div class="panel">
        <div class="panel-head">
          <h3>Jornada até a Etec</h3>
        </div>
        <div class="journey-row">
          ${data.journey.map((step, index) => `
            <div class="journey-step ${index <= 4 ? 'active' : ''}">
              <span>${step}</span>
              ${index < data.journey.length - 1 ? '<small>↓</small>' : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>Conquistas recentes</h3>
        </div>
        <div class="achievement-grid">
          ${data.achievements.map((item) => `
            <div class="achievement-item">
              <span>${item.icon}</span>
              <div>
                <strong>${item.title}</strong>
                <small>${item.text}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <section class="panel feed-panel">
      <div class="panel-head">
        <h3>Feed de progresso</h3>
      </div>
      <div class="feed-list">
        ${data.feed.map((item) => `<div class="feed-item">${item}</div>`).join('')}
      </div>
    </section>
  `;
}

function renderSubjects(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Conteúdo</p>
        <h2>Matérias</h2>
      </div>
      <button class="primary-button">Continuar aprendizagem</button>
    </header>
    <section class="subject-grid">
      ${data.subjects.map((subject) => `
        <article class="subject-page-card ${subject.id === selectedSubject.id ? 'selected-card' : ''}" data-subject-id="${subject.id}">
          <div class="subject-hero">
            <span class="subject-dot large" style="background:${subject.color};"></span>
            <div>
              <p class="eyebrow">Matéria</p>
              <h3>${subject.name}</h3>
            </div>
          </div>
          <div class="progress-line"><span style="width:${subject.progress}%"></span></div>
          <div class="card-meta">
            <span>${subject.progress}% concluído</span>
            <strong>${subject.modules.length} módulos</strong>
          </div>
          <ul>
            ${subject.modules.map((module) => `<li>${module.title}</li>`).join('')}
          </ul>
        </article>
      `).join('')}
    </section>
  `;
}

function renderTrilhas(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Jornada</p>
        <h2>Trilhas de estudo</h2>
      </div>
    </header>
    <section class="panel tutorial-panel">
      <div class="panel-head">
        <h3>${selectedSubject.name}</h3>
        <span class="tag">${selectedSubject.progress}%</span>
      </div>
      <div class="module-track">
        ${selectedSubject.modules.map((module) => `
          <div class="module-step">
            <div class="step-dot" style="background:${selectedSubject.color};"></div>
            <div>
              <strong>${module.title}</strong>
              <small>${module.level}</small>
            </div>
            <span>${module.progress}%</span>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderQuestions(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Banco</p>
        <h2>Questões</h2>
      </div>
    </header>
    <section class="question-bank">
      ${data.questions.map((question, index) => `
        <article class="question-card-box">
          <div class="question-head">
            <span class="tag">${question.subject}</span>
            <span class="type-pill">${question.type}</span>
          </div>
          <h3>${index + 1}. ${question.question}</h3>
          <ul>
            ${question.options.map((option) => `<li>${option}</li>`).join('')}
          </ul>
          <div class="explain-box small-box">
            <strong>Resposta correta:</strong>
            <p>${question.options[question.correct]}</p>
          </div>
        </article>
      `).join('')}
    </section>
  `;
}

function renderSimulados(selectedSubject) {
  const currentQuestion = examQuestions[state.exam.currentIndex];
  const examPercentage = state.exam.completed && state.exam.result ? state.exam.result.accuracy : 0;

  if (state.exam.active && currentQuestion) {
    return `
      <header class="page-header">
        <div>
          <p class="eyebrow">Prova</p>
          <h2>Simulado ativo</h2>
        </div>
        <span class="tag">${state.exam.timeLeft}s</span>
      </header>
      <section class="panel exam-panel">
        <div class="exam-header">
          <span class="tag">Questão ${state.exam.currentIndex + 1}/${examQuestions.length}</span>
          <strong>${selectedSubject.name}</strong>
        </div>
        <h3>${currentQuestion.question}</h3>
        <div class="exam-options">
          ${currentQuestion.options.map((option, index) => `
            <button class="exam-option" data-index="${index}">${option}</button>
          `).join('')}
        </div>
      </section>
    `;
  }

  if (state.exam.completed && state.exam.result) {
    const recommendation = state.exam.result.accuracy >= 75
      ? 'Ótimo desempenho. Sua base está sólida para o vestibulinho.'
      : state.exam.result.accuracy >= 50
        ? 'Boa evolução. Refaça os pontos fracos e mantenha a consistência.'
        : 'Você está no caminho certo. Foque em revisão e repetição ativa.';

    return `
      <header class="page-header">
        <div>
          <p class="eyebrow">Prova</p>
          <h2>Resultado do simulado</h2>
        </div>
      </header>
      <section class="simulator-grid">
        <article class="panel simulator-panel exam-result-card">
          <div class="result-header">
            <span class="tag tag-hot">Simulado concluído</span>
          </div>
          <div class="result-score">
            <strong>${state.exam.result.score}/${examQuestions.length}</strong>
            <span>${state.exam.result.accuracy}% de acerto</span>
          </div>
          <div class="result-badges">
            <span>+${state.exam.result.xpEarned} XP</span>
            <span>${state.exam.result.accuracy >= 75 ? 'Excelente' : state.exam.result.accuracy >= 50 ? 'Bom' : 'Em evolução'}</span>
          </div>
          <p>${recommendation}</p>
          <div class="exam-result-actions">
            <button class="primary-button" id="restartExamBtn">Refazer simulado</button>
            <button class="ghost-button" id="backToDashboardBtn">Voltar ao dashboard</button>
          </div>
        </article>
        <article class="panel simulator-panel">
          <h3>Desempenho</h3>
          <div class="score-line"><strong>${state.exam.result.accuracy}%</strong><span>Acerto geral</span></div>
          <div class="score-line"><strong>${state.exam.result.score}/${examQuestions.length}</strong><span>Questões certas</span></div>
          <div class="score-line"><strong>+${state.exam.result.xpEarned} XP</strong><span>Recompensa</span></div>
          <div class="score-line"><strong>${state.exam.result.accuracy >= 75 ? 'Alta' : state.exam.result.accuracy >= 50 ? 'Média' : 'Baixa'}</strong><span>Nível de domínio</span></div>
        </article>
      </section>
    `;
  }

  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Prova</p>
        <h2>Simulados</h2>
      </div>
    </header>
    <section class="simulator-grid">
      <article class="panel simulator-panel">
        <h3>Simulado misto</h3>
        <p>4 questões · 5 minutos · mistura de áreas</p>
        <div class="simulator-stats">
          <span>Português</span>
          <span>Matemática</span>
          <span>História</span>
          <span>Geografia</span>
          <span>Ciências</span>
        </div>
        <button class="primary-button" id="startExamBtn">Iniciar simulado</button>
      </article>
      <article class="panel simulator-panel">
        <h3>Desempenho</h3>
        <div class="score-line"><strong>${examPercentage}%</strong><span>Acerto geral</span></div>
        <div class="score-line"><strong>${state.exam.completed ? `${state.exam.score}/${examQuestions.length}` : '18/25'}</strong><span>Questões revisadas</span></div>
        <div class="score-line"><strong>${state.exam.completed ? 'Finalizado' : '48 min'}</strong><span>Tempo médio</span></div>
      </article>
    </section>
  `;
}

function renderMeta(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Planejamento</p>
        <h2>Minha Meta</h2>
      </div>
    </header>
    <section class="panel meta-panel">
      <h3>Meta diária</h3>
      <div class="meta-steps">
        <div class="meta-step active"><span>10 min</span></div>
        <div class="meta-step active"><span>20 min</span></div>
        <div class="meta-step"><span>30 min</span></div>
        <div class="meta-step"><span>45 min</span></div>
        <div class="meta-step"><span>60 min</span></div>
      </div>
      <p>Você está em ${data.studentProfile.metaDiaria} minutos diários e mantém uma sequência consistente.</p>
    </section>
  `;
}

function renderEtec(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Prova</p>
        <h2>Questões Etec</h2>
      </div>
    </header>
    <section class="panel">
      <div class="question-card-box">
        <div class="question-head">
          <span class="tag">Etec</span>
          <span class="type-pill">História</span>
        </div>
        <h3>Qual foi o principal objetivo da expansão marítima europeia?</h3>
        <ul>
          <li>Buscar novas terras para a agricultura.</li>
          <li>Expandir rotas comerciais e lucros.</li>
          <li>Difundir o socialismo.</li>
          <li>Promover a igualdade entre os povos.</li>
        </ul>
        <div class="explain-box small-box">
          <strong>Por que?</strong>
          <p>O período das Grandes Navegações foi movido pela busca de novas rotas e pelo comércio lucrativo com a Ásia e a África.</p>
        </div>
      </div>
    </section>
  `;
}

function renderErrors(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Revisão</p>
        <h2>Caderno de erros</h2>
      </div>
    </header>
    <section class="panel">
      <div class="error-list">
        ${state.errorLog.length ? state.errorLog.map((error) => `
          <div class="error-item">
            <div class="error-copy">
              <strong>${error.title}</strong>
              <span>${error.count} ${error.count === 1 ? 'erro' : 'erros'}</span>
            </div>
            <button class="ghost-button" data-error-action="retry">Refazer</button>
          </div>
        `).join('') : `
          <div class="error-item empty-state">
            <div class="error-copy">
              <strong>Nenhum erro por enquanto</strong>
              <span>Seu caderno vai aparecer aqui conforme você treina.</span>
            </div>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderRevisoes(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Recuperação</p>
        <h2>Revisões</h2>
      </div>
    </header>
    <section class="panel">
      <div class="review-list">
        <div class="review-item">
          <strong>Revisar frações</strong>
          <span>5 minutos</span>
        </div>
        <div class="review-item">
          <strong>Leitura e inferência</strong>
          <span>8 minutos</span>
        </div>
      </div>
    </section>
  `;
}

function renderProgresso(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Acompanhamento</p>
        <h2>Progresso</h2>
      </div>
    </header>
    <section class="panel">
      <div class="progress-grid">
        ${data.subjects.map((subject) => `
          <div class="mini-progress">
            <div class="mini-label"><span>${subject.name}</span><strong>${subject.progress}%</strong></div>
            <div class="progress-line"><span style="width:${subject.progress}%"></span></div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderConquistas(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Badges</p>
        <h2>Conquistas</h2>
      </div>
    </header>
    <section class="achievement-grid page-achievements">
      ${data.achievements.map((item) => `
        <div class="achievement-item">
          <span>${item.icon}</span>
          <div>
            <strong>${item.title}</strong>
            <small>${item.text}</small>
          </div>
        </div>
      `).join('')}
    </section>
  `;
}

function renderConfig(selectedSubject) {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Ajustes</p>
        <h2>Configurações</h2>
      </div>
    </header>
    <section class="panel config-panel">
      <div class="config-row"><span>Meta diária</span><strong>20 min</strong></div>
      <div class="config-row"><span>Notificações</span><strong>Ativadas</strong></div>
      <div class="config-row"><span>Tema</span><strong>Lilás</strong></div>
      <div class="config-row"><span>Avatar</span><strong>Estudante</strong></div>
    </section>
  `;
}

renderPage();
