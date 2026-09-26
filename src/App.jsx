import { useMemo, useState } from 'react';
import {
  achievements,
  feed,
  journey,
  missions,
  questions,
  studentProfile,
  streakCalendar,
  subjects,
  weeklyChallenges,
} from './data/mockData';

const sidebarItems = [
  'Dashboard',
  'Minha Meta',
  'Trilhas de estudo',
  'Matérias',
  'Questões',
  'Questões Etec',
  'Simulados',
  'Caderno de erros',
  'Revisões',
  'Progresso',
  'Conquistas',
  'Configurações',
];

function App() {
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]);
  const [countdown, setCountdown] = useState(20);
  const [completedToday, setCompletedToday] = useState(false);

  const selectedQuestion = questions[0];

  const levelProgress = useMemo(() => {
    const currentLevelXp = 1000;
    const progress = Math.min((studentProfile.xp / currentLevelXp) * 100, 100);
    return { progress, current: studentProfile.xp, total: currentLevelXp };
  }, []);

  const finishToday = () => {
    setCompletedToday(true);
    setCountdown(0);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">E</div>
          <div>
            <p className="eyebrow">Preparação</p>
            <h1>Estudo Etec</h1>
          </div>
        </div>

        <nav className="nav">
          {sidebarItems.map((item, index) => (
            <button key={item} className={`nav-item ${index === 0 ? 'active' : ''}`}>
              <span>{item}</span>
            </button>
          ))}
        </nav>

        <div className="mini-card xp-card">
          <p className="eyebrow">XP total</p>
          <h3>{studentProfile.xp} XP</h3>
          <div className="progress-line">
            <span style={{ width: `${levelProgress.progress}%` }} />
          </div>
          <small>
            Nível {studentProfile.level} · {studentProfile.xp}/{levelProgress.total} XP
          </small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Bom dia</p>
            <h2>Olá, {studentProfile.name}</h2>
          </div>

          <div className="topbar-actions">
            <button className="ghost-button">+ Meta</button>
            <button className="primary-button">Continuar estudando</button>
          </div>
        </header>

        <section className="hero-card">
          <div className="hero-copy">
            <span className="tag tag-hot">🔥 12 dias de sequência</span>
            <h3>Você está no caminho certo para a Etec.</h3>
            <p>
              Sua maior sequência foi <strong>18 dias</strong> e você estudou <strong>5 dias</strong> esta semana.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={finishToday}>Concluir meta</button>
              <button className="ghost-button">Ver progresso</button>
            </div>
          </div>

          <div className="streak-panel">
            <div className="streak-highlight">
              <span className="fire-icon">🔥</span>
              <div>
                <p>Meta diária</p>
                <strong>{countdown} min</strong>
              </div>
            </div>
            <div className="sequence-row">
              {streakCalendar.map((item) => (
                <div key={item.day} className={`day-badge ${item.active ? 'active' : ''}`}>
                  <span>{item.day}</span>
                  <b>{item.active ? '🔥' : '○'}</b>
                </div>
              ))}
            </div>
            {completedToday && <div className="celebration-banner">🔥 Sequência mantida!</div>}
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card accent">
            <span className="stat-label">Progresso geral</span>
            <strong>{studentProfile.generalProgress}%</strong>
            <small>Conteúdos em evolução</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Questões resolvidas</span>
            <strong>{studentProfile.totalQuestions}</strong>
            <small>{studentProfile.correctAnswers} acertos</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Taxa de acerto</span>
            <strong>{studentProfile.accuracy}%</strong>
            <small>Boa constância</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tempo estudado</span>
            <strong>{studentProfile.studyMinutes}m</strong>
            <small>Última revisão: {studentProfile.lastTopic}</small>
          </div>
        </section>

        <section className="content-grid two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Trilhas de estudo</h3>
              <button className="link-button">Ver todas</button>
            </div>
            <div className="subject-list">
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  className={`subject-item ${selectedSubject.id === subject.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSubject(subject)}
                >
                  <span className="subject-dot" style={{ background: subject.color }} />
                  <div>
                    <strong>{subject.name}</strong>
                    <small>{subject.modules.length} módulos</small>
                  </div>
                  <b>{subject.progress}%</b>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Missão do dia</h3>
              <span className="tag">+50 XP</span>
            </div>
            <ul className="mission-list">
              {missions.map((mission) => (
                <li key={mission.id} className={mission.done ? 'done' : ''}>
                  <span>{mission.done ? '✓' : '□'}</span>
                  <span>{mission.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="content-grid two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Matéria em foco</h3>
              <span className="tag">{selectedSubject.name}</span>
            </div>

            <div className="subject-card">
              <div className="subject-summary">
                <div className="subject-dot large" style={{ background: selectedSubject.color }} />
                <div>
                  <h4>{selectedSubject.name}</h4>
                  <p>Próximo módulo: {selectedSubject.modules[0].title}</p>
                </div>
              </div>

              <div className="module-list">
                {selectedSubject.modules.map((module) => (
                  <div key={module.id} className="module-row">
                    <div>
                      <strong>{module.title}</strong>
                      <small>{module.level}</small>
                    </div>
                    <div className="progress-block">
                      <span>{module.progress}%</span>
                      <div className="progress-line small">
                        <span style={{ width: `${module.progress}%`, background: selectedSubject.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Questão do dia</h3>
              <span className="tag tag-soft">{selectedQuestion.type}</span>
            </div>

            <div className="question-card">
              <p className="question-meta">
                {selectedQuestion.subject} · {selectedQuestion.topic}
              </p>
              <h4>{selectedQuestion.question}</h4>
              <ol>
                {selectedQuestion.options.map((option, index) => (
                  <li key={option} className={index === selectedQuestion.correct ? 'correct-answer' : ''}>
                    {option}
                  </li>
                ))}
              </ol>
              <div className="explain-box">
                <strong>Por que?</strong>
                <p>{selectedQuestion.explanation}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="content-grid two-col lower-grid">
          <div className="panel">
            <div className="panel-head">
              <h3>Jornada até a Etec</h3>
            </div>
            <div className="journey-row">
              {journey.map((step, index) => (
                <div key={step} className={`journey-step ${index <= 4 ? 'active' : ''}`}>
                  <span>{step}</span>
                  {index < journey.length - 1 && <small>↓</small>}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Conquistas recentes</h3>
            </div>
            <div className="achievement-grid">
              {achievements.map((achievement) => (
                <div key={achievement.title} className="achievement-item">
                  <span>{achievement.icon}</span>
                  <div>
                    <strong>{achievement.title}</strong>
                    <small>{achievement.text}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel feed-panel">
          <div className="panel-head">
            <h3>Feed de progresso</h3>
          </div>
          <div className="feed-list">
            {feed.map((item) => (
              <div key={item} className="feed-item">{item}</div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
