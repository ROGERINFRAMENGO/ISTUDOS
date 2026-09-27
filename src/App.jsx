import { useEffect, useMemo, useState } from 'react';
import {
  achievements,
  feed,
  journey,
  missions,
  questions,
  studentProfile,
  streakCalendar,
  studyPlan,
  subjects,
  weeklyChallenges,
} from './data/mockData';
import { getSession, onAuthStateChange, resetPassword, signIn, signOut, signUp } from './services/auth';
import {
  EMPTY_PROGRESS,
  ensureStudentProfile,
  hydrateStudentState,
  recordStudySession,
  resetStudentData,
  upsertStudyDay,
} from './services/database';
import { isSupabaseConfigured } from './lib/supabase';

const sidebarItems = [
  'Estudo de hoje',
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

const APP_PASSWORD = 'teamo';
const DEVICE_UNLOCK_KEY = 'istudos_device_unlocked';

function App() {
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]);
  const [countdown, setCountdown] = useState(20);
  const [completedToday, setCompletedToday] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isDeviceUnlocked, setIsDeviceUnlocked] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return localStorage.getItem(DEVICE_UNLOCK_KEY) === 'true';
  });
  const [studentState, setStudentState] = useState({
    ...studentProfile,
    ...EMPTY_PROGRESS,
    name: studentProfile.name,
  });
  const [activeUser, setActiveUser] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadUserData = async () => {
      const { data } = await getSession();
      const user = data?.session?.user ?? null;

      if (!isMounted) return;

      setActiveUser(user);

      if (!user) {
        setStudentState({ ...studentProfile, ...EMPTY_PROGRESS, name: studentProfile.name });
        return;
      }

      await ensureStudentProfile(user);
      const hydrated = await hydrateStudentState(user.id);

      if (!isMounted) return;

      setStudentState({
        ...studentProfile,
        ...EMPTY_PROGRESS,
        ...hydrated,
        name: hydrated.name || studentProfile.name,
      });
    };

    loadUserData();

    const { data } = onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setActiveUser(nextUser);

      if (!nextUser) {
        setStudentState({ ...studentProfile, ...EMPTY_PROGRESS, name: studentProfile.name });
        return;
      }

      await ensureStudentProfile(nextUser);
      const hydrated = await hydrateStudentState(nextUser.id);
      setStudentState({
        ...studentProfile,
        ...EMPTY_PROGRESS,
        ...hydrated,
        name: hydrated.name || studentProfile.name,
      });
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const selectedQuestion = questions[0];

  const levelProgress = useMemo(() => {
    const currentLevelXp = 1000;
    const progress = Math.min((studentState.xp / currentLevelXp) * 100, 100);
    return { progress, current: studentState.xp, total: currentLevelXp };
  }, [studentState.xp]);

  const unlockApp = (event) => {
    event.preventDefault();

    const typedPassword = passwordInput.trim().toLowerCase();

    if (typedPassword === APP_PASSWORD) {
      localStorage.setItem(DEVICE_UNLOCK_KEY, 'true');
      setIsDeviceUnlocked(true);
      setPasswordInput('');
      setAuthError('');
      return;
    }

    setAuthError('Senha incorreta. Tente novamente.');
  };

  const handleLogout = async () => {
    localStorage.removeItem(DEVICE_UNLOCK_KEY);
    setIsDeviceUnlocked(false);
    setPasswordInput('');
    setAuthError('');

    if (isSupabaseConfigured) {
      await signOut();
    }

    setActiveUser(null);
    setStudentState({ ...studentProfile, ...EMPTY_PROGRESS, name: studentProfile.name });
  };

  const finishToday = async () => {
    setCompletedToday(true);
    setCountdown(0);

    const nextXp = (studentState.xp || 0) + 20;
    const nextStudyMinutes = (studentState.study_minutes || 0) + 20;

    setStudentState((prev) => ({
      ...prev,
      current_streak: (prev.current_streak || 0) + 1,
      longest_streak: Math.max(prev.longest_streak || 0, (prev.current_streak || 0) + 1),
      xp: nextXp,
      study_minutes: nextStudyMinutes,
    }));

    if (activeUser?.id && isSupabaseConfigured) {
      await recordStudySession({
        userId: activeUser.id,
        subject: selectedSubject.name,
        minutes: 20,
        studyDate: new Date().toISOString(),
      });

      const hydrated = await hydrateStudentState(activeUser.id);
      setStudentState({
        ...studentProfile,
        ...EMPTY_PROGRESS,
        ...hydrated,
        name: hydrated.name || studentProfile.name,
      });
    }
  };

  if (!isDeviceUnlocked) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-block auth-brand">
            <div className="brand-mark">💗</div>
            <div>
              <h1>ISTUDOS</h1>
            </div>
          </div>

          <h2>Entre para continuar seus estudos</h2>

          <form className="auth-form" onSubmit={unlockApp}>
            <label>
              Senha do app
              <input
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="Digite a senha"
                autoFocus
                required
              />
            </label>

            {authError && <p className="auth-message error">{authError}</p>}

            <button type="submit" className="primary-button auth-submit">
              Entrar
            </button>

            <p className="auth-hint">Essa senha fica salva neste dispositivo e só precisa ser digitada uma vez.</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">💗</div>
          <div>
            <h1>ISTUDOS</h1>
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
          <h3>{studentState.xp} XP</h3>
          <div className="progress-line">
            <span style={{ width: `${levelProgress.progress}%` }} />
          </div>
          <small>
            Nível {studentState.level} · {studentState.xp}/{levelProgress.total} XP
          </small>
        </div>

        <button className="ghost-button auth-logout" onClick={handleLogout}>Sair</button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>Olá, {studentState.name}</h2>
          </div>

          <div className="topbar-actions">
            <button className="primary-button">Continuar estudando</button>
          </div>
        </header>

        <section className="hero-card">
          <div className="hero-copy">
            <span className="tag tag-hot">🔥 {studentState.current_streak || 0} dias de sequência</span>
            <h3>Você está no caminho certo para a Etec.</h3>
            <p>
              Sua maior sequência foi <strong>{studentState.longest_streak || 0} dias</strong> e você estudou <strong>{studentState.study_minutes || 0} minutos</strong> esta semana.
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

        <section className="panel study-today-panel">
          <div className="panel-head">
            <h3>Estudo de hoje</h3>
            <span className="tag">Cronograma do dia</span>
          </div>

          <div className="study-plan-grid">
            {studyPlan.map((item) => (
              <article key={item.id} className="study-plan-item" style={{ borderLeft: `4px solid ${item.color}` }}>
                <div className="study-plan-header">
                  <span className="study-dot" style={{ background: item.color }} />
                  <div>
                    <strong>{item.subject}</strong>
                    <small>{item.time}</small>
                  </div>
                </div>

                <h4>{item.topic}</h4>
                <p>{item.explanation}</p>

                <div className="study-plan-meta">
                  <span>🎯 {item.objective}</span>
                </div>

                <div className="study-plan-actions">
                  <button className="ghost-button small-button">Explicação</button>
                  <a href={item.videoUrl} target="_blank" rel="noreferrer" className="video-link">Vídeo</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card accent">
            <span className="stat-label">Progresso geral</span>
            <strong>{studentState.overall_progress || studentProfile.generalProgress}%</strong>
            <small>Conteúdos em evolução</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Questões resolvidas</span>
            <strong>{studentState.questions_answered || studentProfile.totalQuestions}</strong>
            <small>{studentState.questions_correct || studentProfile.correctAnswers} acertos</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Taxa de acerto</span>
            <strong>{Math.max(0, Math.round((studentState.questions_correct / Math.max(studentState.questions_answered, 1)) * 100)) || studentProfile.accuracy}%</strong>
            <small>Boa constância</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tempo estudado</span>
            <strong>{studentState.study_minutes || studentProfile.studyMinutes}m</strong>
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
