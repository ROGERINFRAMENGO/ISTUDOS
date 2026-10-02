import { useEffect, useMemo, useRef, useState } from 'react';
import {
  achievements,
  feed,
  journey,
  missions,
  studentProfile,
  subjects,
  weeklyChallenges,
} from './data/mockData';
import { DAY_LABELS, formatDateBR, getDateKey, getDayKey, getLessonsForDay, getLessonsForDate, lessons } from './data/lessons';
import { getSession, onAuthStateChange, resetPassword, signIn, signOut, signUp } from './services/auth';
import {
  EMPTY_PROGRESS,
  countTotalLessons,
  ensureStudentProfile,
  getCompletedLessonIds,
  getStudentProgress,
  getStudyDates,
  getStudyTotals,
  hydrateStudentState,
  normalizeDateKey,
  recordQuestionAttempt,
  recordStudySession,
  resetStudentData,
  upsertStudyDay,
} from './services/database';
import { isSupabaseConfigured } from './lib/supabase';
import {
  isSyncConfigured,
  loadLocalMeta,
  mergeShared,
  nowIso,
  pickSections,
  pullShared,
  pushShared,
  saveLocalMeta,
} from './services/sync';
import { getLessonDetail } from './data/lessonContent';
import { getFullLessonQuiz } from './data/lessonQuiz';
import CustomLessonsPage from './components/CustomLessonsPage';
import { THEMES, applyTheme, loadTheme } from './data/themes';
import { scheduleWeeks } from './data/schedule';
import { getPlanDayById, isGeneratedDay, planDayToLesson, planLessonsForDate, totalGeneratedBlocks, curriculumDays } from './data/curriculum';
import { computeStreak, officialProgress, accuracyPercent } from './services/metrics';
import {
  AI_MESSAGES,
  getCachedLesson,
  getSharedCachePayload,
  isQuizAtual,
  loadLessonForPlan,
  loadQuizForLesson,
  mergeSharedCache,
} from './services/ai';
import { prewarmProximasAulas } from './services/prewarm';
import SchedulePage, { SettingsPage } from './components/SchedulePage';
import LessonPage from './components/LessonPage';
import AiChatPage from './components/AiChatPage';
import SimuladosPage from './components/SimuladosPage';

const sidebarItems = [
  'Estudo de hoje',
  'Cronograma',
  // FASE D: a tela de aulas personalizadas. Fica separada do
  // cronograma de proposito — uma aula criada aqui nao entra no
  // plano oficial nem no progresso.
  'Minhas aulas',
  'Tutor IA',
  'Simulados',
  'Configurações',
];

const APP_PASSWORD = 'teamo';
const DEVICE_UNLOCK_KEY = 'istudos_device_unlocked';
const COMPLETED_LESSONS_KEY = 'istudos_completed_lessons';
const STUDY_DATES_KEY = 'istudos_study_dates';
const RESUME_LESSON_KEY = 'istudos_resume_lesson';
const STUDENT_PROGRESS_LOCAL_KEY = 'istudos_student_progress';
const LESSON_MIN_SECONDS = 10;

function loadLocalStudentProgress() {
  if (typeof window === 'undefined') return EMPTY_PROGRESS;
  try {
    const raw = localStorage.getItem(STUDENT_PROGRESS_LOCAL_KEY);
    return raw ? JSON.parse(raw) : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

function saveLocalStudentProgress(progress) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STUDENT_PROGRESS_LOCAL_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

function loadLocalCompletedLessons() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(COMPLETED_LESSONS_KEY) || '[]');
  } catch {
    return [];
  }
}

function loadLocalStudyDates() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STUDY_DATES_KEY) || '[]');
  } catch {
    return [];
  }
}

const TODAY_DONE_KEY = 'istudos_today_done';

// Meta diaria guardada junto com a data: ontem nao vale, hoje conta.
function loadTodayDoneCount() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(TODAY_DONE_KEY) || 'null');
    if (!raw || raw.date !== dateKeyLocal(new Date())) return 0;
    return Number(raw.count) || 0;
  } catch {
    return 0;
  }
}

// dateKeyLocal local, equivalente a de metrics.js. Fica aqui porque
// ja era usada por varias partes do arquivo; o metrics.js exporta a
// sua propria copia para os testes, e as duas produzem o mesmo
// resultado para a mesma data (meio-dia local, sem UTC).
// dateKeyLocal local, equivalente a de metrics.js. Fica aqui porque
// ja era usada por varias partes do arquivo; o metrics.js exporta a
// sua propria copia para os testes, e as duas produzem o mesmo
// resultado para a mesma data (meio-dia local, sem UTC).
// dateKeyLocal local, equivalente a de metrics.js. Fica aqui porque
// ja era usada por varias partes do arquivo; o metrics.js exporta a
// sua propria copia para os testes, e as duas produzem o mesmo
// resultado para a mesma data (meio-dia local, sem UTC).
function dateKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDays(aKey, bKey) {
  const a = new Date(`${aKey}T12:00:00`);
  const b = new Date(`${bKey}T12:00:00`);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function formatStudyTime(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}min ${rest}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}min` : `${h}h`;
}

// FINAL POLISH: os IDs oficiais saem do CURRICULO, nao de um arquivo
// de modelo antigo. Uma "aula personalizada" (prefixo custom:) e um
// simulado nao entram nesta lista e, portanto, nunca entram no
// denominador nem no numerador do progresso.
const OFFICIAL_LESSON_IDS = curriculumDays
  .filter((d) => d.kind === 'lesson' || d.kind === 'review')
  .map((d) => d.id);

// A sequencia agora vem de metrics.js: uma unica funcao para a tela e
// para a regra de negocio. Enquanto as duas copias existissem, a
// interface podia mostrar um numero que o dado nao sustentava.

function weekDaysFromToday(todayKey) {
  const out = [];
  const base = new Date(`${todayKey}T12:00:00`);
  const dow = base.getDay(); // 0 dom ... 6 sab
  const monday = new Date(base);
  const offset = dow === 0 ? -6 : 1 - dow;
  monday.setDate(base.getDate() + offset);
  const labels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push({ key: dateKeyLocal(d), label: labels[i], name: names[i], num: d.getDate() });
  }
  return out;
}

// Quantas lições concluídas hoje (para a meta diária persistir no reload).
async function countTodayLessons(userId) {
  if (!userId || !isSupabaseConfigured) return 0;
  try {
    const { supabase } = await import('./lib/supabase');
    if (!supabase) return 0;
    const today = dateKeyLocal(new Date());
    const start = new Date(`${today}T00:00:00`).toISOString();
    const end = new Date(`${today}T23:59:59.999`).toISOString();
    const { data, error } = await supabase
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('completed_at', start)
      .lte('completed_at', end);
    if (error) return 0;
    return (data || []).length;
  } catch {
    return 0;
  }
}

function App() {
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]);
  const [completedToday, setCompletedToday] = useState(() => loadLocalStudyDates().includes(getDateKey(new Date())));
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isDeviceUnlocked, setIsDeviceUnlocked] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return localStorage.getItem(DEVICE_UNLOCK_KEY) === 'true';
  });
  // Estado local salvo tem prioridade — senao XP/progresso zeram no refresh.
  const [studentState, setStudentState] = useState(() => ({
    ...studentProfile,
    ...EMPTY_PROGRESS,
    name: studentProfile.name,
    ...loadLocalStudentProgress(),
  }));
  const [activeUser, setActiveUser] = useState(null);
  const todayDateKey = useMemo(() => getDateKey(new Date()), []);
  const todayKey = useMemo(() => getDayKey(new Date()), []);
  const todayLessons = useMemo(() => {
    // O CRONOGRAMA manda: cada bloco do dia vira aula da IA (generate-lesson).
    const planCards = planLessonsForDate(todayDateKey);
    if (planCards.length) return planCards;
    // Fora do período do cronograma (ou em dia sem bloco) cai nas aulas fixas.
    const byDate = getLessonsForDate(todayDateKey, lessons);
    return byDate.length ? byDate : getLessonsForDay(todayKey, lessons);
  }, [todayDateKey, todayKey]);
  const [selectedStudyLesson, setSelectedStudyLesson] = useState(() => {
    const plans = planLessonsForDate(getDateKey(new Date()));
    if (plans.length) return plans[0];
    const byDate = getLessonsForDate(getDateKey(new Date()), lessons);
    if (byDate.length) return byDate[0];
    return getLessonsForDay(getDayKey(new Date()), lessons)[0] || null;
  });
  const [lessonFlow, setLessonFlow] = useState('list');
  const [completedLessonIds, setCompletedLessonIds] = useState(() => loadLocalCompletedLessons());
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResults, setQuizResults] = useState(null);
  const [quizError, setQuizError] = useState('');
  const [lessonSeconds, setLessonSeconds] = useState(0);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [lessonView, setLessonView] = useState('home');
  const [activePage, setActivePage] = useState('Estudo de hoje');
  const [openSimuladoId, setOpenSimuladoId] = useState(null);
  // FASE D: aula personalizada aberta. Guarda { lesson, id } e nada
  // mais — nao entra em completedLessonIds, nem em XP, nem em streak.
  const [customLesson, setCustomLesson] = useState(null);
  const [themeName, setThemeName] = useState(() => loadTheme());
  // Meta diaria agora e por licao, nao por minuto.
  const [dailyGoal] = useState(1);
  const [todayDoneCount, setTodayDoneCount] = useState(() => loadTodayDoneCount());
  const [studyDates, setStudyDates] = useState(() => loadLocalStudyDates());
  const [resumeLesson, setResumeLesson] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(localStorage.getItem(RESUME_LESSON_KEY) || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    applyTheme(themeName);
  }, [themeName]);

  // ---------- Sincronização celular <-> computador ----------
  // O site é de um único usuário: o estado compartilhado fica em uma linha da
  // tabela public.app_state (regras de merge em src/services/sync.js).
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | offline
  const [syncAt, setSyncAt] = useState(null);
  const [syncReady, setSyncReady] = useState(!isSyncConfigured);
  const syncMetaRef = useRef(loadLocalMeta());
  const snapshotRef = useRef({});
  const lastSnapshotRef = useRef({});
  const lastPushedRef = useRef('');

  // Seções que ESTA tela cuida (chat e simulados cuidam das deles).
  const buildLocalSnapshot = () => ({
    progress: studentState,
    completedLessonIds,
    studyDates,
    todayDone: { date: todayDateKey, count: todayDoneCount },
    theme: themeName,
    resumeLesson: resumeLesson || null,
    // Aulas ja geradas: o outro aparelho reaproveita em vez de pagar IA de novo.
    aiCache: getSharedCachePayload(),
  });

  // Aplica no site o resultado do merge vindo do servidor.
  const applySharedData = (data = {}) => {
    if (data.progress) {
      setStudentState((prev) => ({ ...prev, ...data.progress }));
      saveLocalStudentProgress({ ...loadLocalStudentProgress(), ...data.progress });
    }
    if (Array.isArray(data.completedLessonIds)) setCompletedLessonIds(data.completedLessonIds);
    if (Array.isArray(data.studyDates)) setStudyDates(data.studyDates);
    if (data.todayDone && data.todayDone.date === todayDateKey) setTodayDoneCount(Number(data.todayDone.count) || 0);
    if (data.theme && THEMES[data.theme]) setThemeName(data.theme);
    if (data.aiCache) mergeSharedCache(data.aiCache);
    if (data.resumeLesson !== undefined) {
      setResumeLesson(data.resumeLesson || null);
      if (typeof window !== 'undefined') {
        if (data.resumeLesson) localStorage.setItem(RESUME_LESSON_KEY, JSON.stringify(data.resumeLesson));
        else localStorage.removeItem(RESUME_LESSON_KEY);
      }
    }
  };

  // Junta o local com o servidor (usado ao abrir o site e no refresh periódico).
  const mergeWithServer = (remote) =>
    mergeShared({
      local: Object.keys(snapshotRef.current).length ? snapshotRef.current : buildLocalSnapshot(),
      localMeta: syncMetaRef.current,
      remote: remote.data,
      remoteMeta: remote.meta,
    });

  const markSynced = () => {
    setSyncStatus('synced');
    setSyncAt(Date.now());
  };

  useEffect(() => {
    let isMounted = true;

    const loadUserData = async () => {
      const { data } = await getSession();
      const user = data?.session?.user ?? null;

      if (!isMounted) return;

      setActiveUser(user);

      if (!user) {
        // Sem login: recupera o progresso local em vez de zerar tudo.
        setStudentState({
          ...studentProfile,
          ...EMPTY_PROGRESS,
          name: studentProfile.name,
          ...loadLocalStudentProgress(),
        });
        return;
      }

      await ensureStudentProfile(user);
      const [hydrated, totals, totalLessons] = await Promise.all([
        hydrateStudentState(user.id),
        getStudyTotals(user.id),
        countTotalLessons(),
      ]);

      if (!isMounted) return;

      const totalSeconds = Number(totals?.totalSeconds || hydrated.study_seconds || 0);
      const doneToday = await countTodayLessons(user.id);
      setTodayDoneCount(doneToday);
      setStudentState({
        ...studentProfile,
        ...EMPTY_PROGRESS,
        ...hydrated,
        name: hydrated.name || studentProfile.name,
        study_seconds: totalSeconds,
        study_minutes: totalSeconds > 0 ? Math.max(1, Math.ceil(totalSeconds / 60)) : (hydrated.study_minutes || 0),
        overall_progress: totalLessons > 0 ? Math.min(100, Math.round(((hydrated.lessons_completed || 0) / totalLessons) * 100)) : 0,
      });
    };

    loadUserData();

    const { data } = onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setActiveUser(nextUser);

      if (!nextUser) {
        // Sessao encerrada: mantem o progresso local do dispositivo.
        setStudentState({
          ...studentProfile,
          ...EMPTY_PROGRESS,
          name: studentProfile.name,
          ...loadLocalStudentProgress(),
        });
        return;
      }

      await ensureStudentProfile(nextUser);
      const [hydratedNext, totalsNext, totalLessonsNext] = await Promise.all([
        hydrateStudentState(nextUser.id),
        getStudyTotals(nextUser.id),
        countTotalLessons(),
      ]);
      const totalSecondsNext = Number(totalsNext?.totalSeconds || hydratedNext.study_seconds || 0);
      setTodayDoneCount(await countTodayLessons(nextUser.id));
      setStudentState({
        ...studentProfile,
        ...EMPTY_PROGRESS,
        ...hydratedNext,
        name: hydratedNext.name || studentProfile.name,
        study_seconds: totalSecondsNext,
        study_minutes: totalSecondsNext > 0 ? Math.max(1, Math.ceil(totalSecondsNext / 60)) : (hydratedNext.study_minutes || 0),
        overall_progress: totalLessonsNext > 0 ? Math.min(100, Math.round(((hydratedNext.lessons_completed || 0) / totalLessonsNext) * 100)) : 0,
      });
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Ao abrir o site: puxa o estado do servidor e junta com o deste aparelho.
  useEffect(() => {
    if (!isSyncConfigured) return undefined;
    let cancelled = false;

    const boot = async () => {
      setSyncStatus('syncing');
      const remote = await pullShared();
      if (cancelled) return;

      if (!remote) {
        setSyncStatus('offline');
        setSyncReady(true);
        return;
      }

      const merged = mergeWithServer(remote);
      applySharedData(merged.data);
      syncMetaRef.current = { ...syncMetaRef.current, ...merged.meta };
      saveLocalMeta(syncMetaRef.current);
      snapshotRef.current = merged.data;
      lastSnapshotRef.current = merged.data;
      setSyncReady(true);
      markSynced();
    };

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A cada mudança, envia para o servidor (com uma espera curta para não
  // disparar dezenas de gravações enquanto a aula está rolando).
  useEffect(() => {
    if (!isSyncConfigured || !syncReady) return undefined;

    const snapshot = buildLocalSnapshot();
    snapshotRef.current = snapshot;
    const sending = pickSections(snapshot);
    const serialized = JSON.stringify(sending);

    if (serialized === lastPushedRef.current) {
      lastSnapshotRef.current = snapshot;
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSyncStatus('syncing');
      const previous = lastSnapshotRef.current || {};
      const stamp = nowIso();
      const meta = {};
      for (const key of Object.keys(sending)) {
        // Só renova o horário das seções que realmente mudaram.
        meta[key] =
          JSON.stringify(previous[key]) === JSON.stringify(sending[key])
            ? syncMetaRef.current[key] || stamp
            : stamp;
      }

      const result = await pushShared(sending, meta);
      lastSnapshotRef.current = snapshot;

      if (!result) {
        setSyncStatus('offline');
        return;
      }

      lastPushedRef.current = serialized;
      syncMetaRef.current = { ...syncMetaRef.current, ...meta };
      saveLocalMeta(syncMetaRef.current);
      markSynced();
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncReady, studentState, completedLessonIds, studyDates, todayDoneCount, themeName, resumeLesson]);

  // De minuto em minuto (e ao voltar para a aba) busca novidades do outro aparelho.
  useEffect(() => {
    if (!isSyncConfigured || !syncReady) return undefined;

    const refresh = async () => {
      const remote = await pullShared();
      if (!remote) {
        setSyncStatus('offline');
        return;
      }

      const merged = mergeWithServer(remote);
      applySharedData(merged.data);
      syncMetaRef.current = { ...syncMetaRef.current, ...merged.meta };
      saveLocalMeta(syncMetaRef.current);
      snapshotRef.current = { ...snapshotRef.current, ...merged.data };
      markSynced();
    };

    const interval = setInterval(refresh, 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncReady]);

  const currentStudyPlan = todayLessons;
  const currentStudyLesson = selectedStudyLesson || currentStudyPlan[0] || null;
  const currentLessonId = currentStudyLesson?.id;

  // ---------- IA: a aula do TOPOICO DO CRONOGRAMA (generate-lesson/quiz) ----------
  const [aiLesson, setAiLesson] = useState(null); // { lesson, lessonId, model }
  const [aiQuiz, setAiQuiz] = useState(null);
  const [aiStatus, setAiStatus] = useState('');
  // true enquanto o questionario e gerado a pedido do botao. Separa
  // "preparando quiz" de "gerando aula" para o botao poder mostrar
  // "Preparando questionario..." e travar so essa acao.
  const [isPreparingQuiz, setIsPreparingQuiz] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiNonce, setAiNonce] = useState(0);
  const openPlan = selectedStudyLesson?.plan ?? null;

  useEffect(() => {
    if (!openPlan) {
      setAiLesson(null);
      setAiQuiz(null);
      setAiStatus('');
      setAiError('');
      return undefined;
    }

    // 1. Ja gerada neste aparelho (ou vinda do outro): nao paga IA de novo.
    const cached = getCachedLesson(openPlan);
    if (cached?.lesson) {
      setAiLesson({ lesson: cached.lesson, lessonId: cached.lessonId ?? null, model: cached.model ?? null });
      // FASE A: so reaproveita o quiz guardado se ele for da versao
      // atual. Servir `cached.quiz` sem checar a versao prendia a
      // aluna no quiz antigo de 3 perguntas de habito de estudo para
      // sempre, porque este caminho retorna sem passar por
      // loadQuizForLesson. Deixar aiQuiz vazio faz o efeito logo abaixo
      // ("!lessonQuiz.length") chamar loadQuizForLesson, que regera
      // respeitando a versao e o cache do servidor.
      setAiQuiz(isQuizAtual(cached) ? cached.quiz : null);
      setAiStatus('');
      setAiError('');
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setAiLesson(null);
      setAiQuiz(null);
      setAiError('');
      setAiStatus(AI_MESSAGES.generatingLesson);
      try {
        const result = await loadLessonForPlan(openPlan, { onStatus: setAiStatus });
        if (cancelled) return;
        setAiLesson({ lesson: result.lesson, lessonId: result.lessonId, model: result.model });
        // O quiz vem na sequencia: quando ela clicar em "continuar" ja esta na tela.
        setAiStatus(AI_MESSAGES.generatingQuiz);
        const quizResult = await loadQuizForLesson(openPlan, result.lessonId, { lesson: result.lesson });
        if (cancelled) return;
        setAiQuiz(quizResult.quiz);
        setAiStatus('');
      } catch (error) {
        if (cancelled) return;
        console.warn('[ai] a aula do cronograma nao veio', error);
        setAiStatus('');
        setAiError(error?.message || AI_MESSAGES.offline);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPlan?.id, aiNonce]);

  // Aula realmente exibida: cartao do cronograma + conteudo escrito pela IA.
  //
  // FASE D: quando existe uma aula personalizada aberta, ela tem
  // prioridade e NAO depende de currentStudyLesson. O wrapper
  // customLessonShape da a ela a MESMA forma de uma aula do
  // cronograma, para LessonPage, getLessonDetail e o quiz
  // funcionarem sem nenhum renderer novo.
  const generatedStudyLesson = useMemo(() => {
    if (customLesson?.lesson) {
      // O CONTEUDO da aula vem primeiro. Sem o spread, o
      // customLessonShape devolvia so os rotulos e o getLessonDetail
      // caia no modelo estatico generico — a aluna lia um texto que
      // nao tinha nada a ver com o que ela pediu.
      return {
        ...customLesson.lesson,
        ...customLessonShape(customLesson.lesson),
        generated: true,
        lessonId: customLesson.id ?? null,
      };
    }
    const base = currentStudyLesson;
    if (!base?.plan || !aiLesson?.lesson) return base;
    return {
      ...base,
      ...aiLesson.lesson,
      id: base.id,
      subject: base.subject,
      topic: base.topic,
      time: base.time,
      color: base.color,
      objective: base.objective,
      duration: aiLesson.lesson.estimatedMinutes || base.duration,
      videoUrl: '',
      generated: true,
      lessonId: aiLesson.lessonId,
      model: aiLesson.model,
    };
  }, [currentStudyLesson, aiLesson, customLesson]);

  // A aula personalizada nao entra no fluxo do cronograma: quem sabe
  // disto e este booleano, usado no quiz e no envio.
  const isCustomLessonOpen = Boolean(customLesson?.lesson);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(COMPLETED_LESSONS_KEY, JSON.stringify(completedLessonIds));
  }, [completedLessonIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STUDY_DATES_KEY, JSON.stringify(studyDates));
  }, [studyDates]);

  // Persiste XP/progresso/tempo a cada atualizacao — evita zerar no refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    saveLocalStudentProgress(studentState);
  }, [studentState]);

  // Persiste a meta diaria com a data (reinicia sozinha no dia seguinte).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TODAY_DONE_KEY, JSON.stringify({ date: todayDateKey, count: todayDoneCount }));
  }, [todayDoneCount, todayDateKey]);

  // Detecta licao interrompida: se fechar a aba no meio da aula/quiz,
  // salva para oferecer "voltar a licao" na proxima abertura.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lessonView !== 'home' && currentStudyLesson) {
      const payload = {
        lessonId: currentStudyLesson.id,
        subject: currentStudyLesson.subject,
        topic: currentStudyLesson.topic,
        lessonView,
        lessonFlow,
        savedAt: new Date().toISOString(),
      };
      const current = localStorage.getItem(RESUME_LESSON_KEY);
      if (current !== JSON.stringify(payload)) {
        localStorage.setItem(RESUME_LESSON_KEY, JSON.stringify(payload));
      }
      setResumeLesson((prev) => (prev?.lessonId === payload.lessonId ? prev : payload));
    }
  }, [lessonView, lessonFlow, currentStudyLesson]);

  // Sincroniza datas de estudo do Supabase + local e recalcula quebra.
  // Se ficou 1 dia sem licao, computeStreak retorna 0 (quebrou, estilo Duolingo).
  const syncStudyDates = async (userId, localDates = []) => {
    if (!userId || !isSupabaseConfigured) {
      const streak = computeStreak(localDates, todayDateKey);
      setStudentState((prev) => ({
        ...prev,
        current_streak: streak,
        longest_streak: Math.max(prev.longest_streak || 0, streak),
      }));
      return localDates;
    }
    const remote = await getStudyDates(userId);
    const remoteKeys = (remote || []).map((d) => normalizeDateKey(d));
    const merged = [...new Set([...(localDates || []), ...remoteKeys])];
    setStudyDates(merged);
    const streak = computeStreak(merged, todayDateKey);
    setStudentState((prev) => ({
      ...prev,
      current_streak: streak,
      longest_streak: Math.max(prev.longest_streak || 0, streak),
    }));
    return merged;
  };

  useEffect(() => {
    syncStudyDates(activeUser?.id, loadLocalStudyDates());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser?.id]);

  // ---- Pre-geracao das aulas ----
  // A aluna nao deve esperar a IA ao clicar. Assim que o app abre,
  // ja pedimos em segundo plano as proximas aulas que faltam.
  // Nao bloqueia nada: e um fetch solto, sem await na renderizacao, e o
  // proprio servico se limita (2 por ciclo, cooldown, sem duplicar).
  useEffect(() => {
    const timer = setTimeout(() => {
      prewarmProximasAulas();
    }, 4000);
    return () => clearTimeout(timer);
  }, [activeUser?.id]);

  // Depois de concluir uma aula ou um quiz, ja prepara a seguinte.
  useEffect(() => {
    if (quizResults) prewarmProximasAulas();
  }, [quizResults]);

  const [lessonStartedAt, setLessonStartedAt] = useState(null);

  useEffect(() => {
    if (lessonView === 'home' || lessonFlow === 'list') return;
    const timer = setInterval(() => {
      setLessonSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [lessonView, lessonFlow, currentLessonId]);

  const syncCompletedLessons = async (userId, localIds = []) => {
    if (!userId || !isSupabaseConfigured) return localIds;
    const remoteIds = await getCompletedLessonIds(userId);
    const merged = [...new Set([...(localIds || []), ...(remoteIds || [])])];
    setCompletedLessonIds(merged);
    return merged;
  };

  useEffect(() => {
    if (activeUser?.id && isSupabaseConfigured) {
      syncCompletedLessons(activeUser.id, loadLocalCompletedLessons());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser?.id]);

  const getLessonQuiz = (lesson) => getFullLessonQuiz(lesson);

  // Aula da IA e aula cadastrada: o quiz vem da mesma implementacao
  // local (src/data/lessonQuiz.js). Antes as aulas da IA tentavam a Edge
  // Function "generate-quiz", que nao existe e respondia 404.
  const lessonQuiz = useMemo(() => {
    if (generatedStudyLesson?.generated) return aiQuiz?.questions ?? [];
    return generatedStudyLesson ? getLessonQuiz(generatedStudyLesson) : [];
  }, [generatedStudyLesson, aiQuiz]);
  const lessonDetail = generatedStudyLesson ? getLessonDetail(generatedStudyLesson) : null;
  // A regra de liberacao e SO o timer: 10 segundos na aula.
  //
  // Antes exigia tambem o quiz pronto, e isso criava um deadlock:
  //   quiz inexistente -> botao desabilitado -> aluna nao clica
  //   -> quiz nunca e gerado -> botao continua desabilitado.
  // O proprio handleGoToQuiz() sabe gerar o quiz ao clicar, entao
  // exigir o quiz aqui era o que prendia a aluna na aula.
  const canShowQuiz = lessonSeconds >= LESSON_MIN_SECONDS;

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
    resetAiSession();

    setActiveUser(null);
    // Sair nao apaga o progresso salvo neste dispositivo.
    setStudentState({
      ...studentProfile,
      ...EMPTY_PROGRESS,
      name: studentProfile.name,
      ...loadLocalStudentProgress(),
    });
  };

  const finishLessonFlow = async () => {
    if (!currentStudyLesson || !quizResults?.length) return;
    if (isSavingLesson) return;

    // A sequência só é mantida se chegar até o fim do questionário.
    const lessonAlreadyCompleted = completedLessonIds.includes(currentStudyLesson.id);
    if (lessonAlreadyCompleted) {
      setLessonFlow('list');
      setLessonView('home');
      if (typeof window !== 'undefined') {
        localStorage.removeItem(RESUME_LESSON_KEY);
        setResumeLesson(null);
      }
      return;
    }

    setIsSavingLesson(true);

    const hits = quizResults.filter((item) => item.isCorrect).length;
    // TIMER REAL: do clique em Começar até terminar o questionário.
    const realSeconds = Math.max(lessonSeconds, 1);
    const realMinutes = Math.max(1, Math.ceil(realSeconds / 60));
    const startedAt = lessonStartedAt || new Date(Date.now() - realSeconds * 1000).toISOString();
    const today = dateKeyLocal(new Date());

    setCompletedLessonIds((prev) => [...new Set([...prev, currentStudyLesson.id])]);
    setCompletedToday(true);
    setTodayDoneCount((prev) => prev + 1);

    // Marca o dia como estudado (base da sequência estilo Duolingo).
    setStudyDates((prev) => {
      const merged = [...new Set([...(prev || []), today])];
      const streak = computeStreak(merged, today);
      setStudentState((s) => ({
        ...s,
        current_streak: streak,
        longest_streak: Math.max(s.longest_streak || 0, streak),
      }));
      return merged;
    });

    if (activeUser?.id && isSupabaseConfigured) {
      // Salva cada resposta do questionário antes de concluir a aula.
      for (const item of quizResults) {
        await recordQuestionAttempt({
          userId: activeUser.id,
          questionId: `${currentStudyLesson.id}:${item.id}`,
          subject: currentStudyLesson.subject,
          topic: currentStudyLesson.topic,
          difficulty: 'Aula',
          correct: item.isCorrect,
          selectedAnswer: item.options[item.selectedIndex],
        });
      }

      await recordStudySession({
        userId: activeUser.id,
        subject: currentStudyLesson.subject,
        lessonId: currentStudyLesson.id,
        minutes: realMinutes,
        durationSeconds: realSeconds,
        startedAt,
        studyDate: new Date().toISOString(),
      });

      const [hydrated, progress, totals, totalLessons] = await Promise.all([
        hydrateStudentState(activeUser.id),
        getStudentProgress(activeUser.id),
        getStudyTotals(activeUser.id),
        countTotalLessons(),
      ]);
      const realSecondsTotal = Number(totals?.totalSeconds || progress.study_seconds || 0);
      setStudentState((prevLocal) => ({
        ...studentProfile,
        ...EMPTY_PROGRESS,
        ...hydrated,
        ...progress,
        name: hydrated.name || studentProfile.name,
        study_seconds: realSecondsTotal,
        study_minutes: Math.max(1, Math.ceil(realSecondsTotal / 60)),
        // FINAL POLISH: calculado a partir dos IDs oficiais ja
        // concluidos, nunca do contador agregado `progress`, que pode
        // vir guardado antigo.
        overall_progress: officialProgress(completedLessonIds, OFFICIAL_LESSON_IDS, totalLessons).percent,
        // FINAL POLISH: a sequencia vem SEMPRE das datas reais.
        // Antes era `computeStreak(...) || progress.current_streak ||
        // prevLocal.current_streak`: como 0 e um valor legitimo (a
        // sequencia quebrou), o `||` ressuscitava um numero morto e a
        // tela mostrava uma sequencia que ja nao existia.
        current_streak: computeStreak([...new Set([...studyDates, today])], today),
      }));
      await syncCompletedLessons(activeUser.id, [...completedLessonIds, currentStudyLesson.id]);
    } else {
      // Modo offline: mantém XP/sequência localmente até o login.
      setStudentState((prev) => {
        const merged = [...new Set([...studyDates, today])];
        const streak = computeStreak(merged, today);
        const prevSeconds = prev.study_seconds || (prev.study_minutes || 0) * 60;
        const nextSeconds = prevSeconds + realSeconds;
        return {
          ...prev,
          xp: (prev.xp || 0) + 15 + hits * 5,
          study_seconds: nextSeconds,
          study_minutes: Math.max(1, Math.ceil(nextSeconds / 60)),
          questions_answered: (prev.questions_answered || 0) + quizResults.length,
          questions_correct: (prev.questions_correct || 0) + hits,
          questions_wrong: (prev.questions_wrong || 0) + (quizResults.length - hits),
          lessons_completed: (prev.lessons_completed || 0) + 1,
          current_streak: streak,
          longest_streak: Math.max(prev.longest_streak || 0, streak),
          // FINAL POLISH: o numero vem das datas reais. Sem `|| atual`: quando
          // a sequencia quebra, o resultado correto e 0, e 0 nao pode
          // ser trocado por um valor antigo guardado.
          overall_progress: officialProgress(completedLessonIds, OFFICIAL_LESSON_IDS, totalLessons).percent,
        };
      });
    }

    setIsSavingLesson(false);
    setLessonFlow('list');
    setLessonView('home');
    setLessonSeconds(0);
    setLessonStartedAt(null);
    setQuizAnswers({});
    setQuizResults(null);
    setQuizError('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem(RESUME_LESSON_KEY);
      setResumeLesson(null);
    }
    window.alert(`Aula concluída em ${formatStudyTime(realSeconds)}! Você acertou ${hits}/${quizResults.length}. Sequência mantida. 🔥`);
  };

  const handleLessonStart = (item) => {
    setSelectedStudyLesson(item);
    setLessonFlow('lesson');
    setLessonView('lesson');
    setQuizAnswers({});
    setQuizResults(null);
    setQuizError('');
    // Timer começa AGORA (clique em Começar) e só para no fim do quiz.
    setLessonSeconds(0);
    setLessonStartedAt(new Date().toISOString());
  };

  // Clique num BLOCO do Cronograma -> abre a aula daquele tópico (a IA escreve).
  // Recebe o id do bloco (ex.: dia-2026-09-29-b1-portugues), não a data,
  // porque cada dia tem dois blocos diferentes.
  const handleOpenPlanDay = (planId) => {
    const plan = getPlanDayById(planId);
    if (!plan || !isGeneratedDay(plan)) return;
    handleLessonStart(planDayToLesson(plan));
  };

  const handleResumeLesson = () => {
    if (!resumeLesson?.lessonId) return;
    const found = lessons.find((l) => l.id === resumeLesson.lessonId) || todayLessons.find((l) => l.id === resumeLesson.lessonId);
    if (found) setSelectedStudyLesson(found);
    setLessonFlow(resumeLesson.lessonFlow || 'lesson');
    setLessonView(resumeLesson.lessonView || 'lesson');
    setQuizAnswers({});
    setQuizResults(null);
    setQuizError('');
    // Retomada: continua contando de onde parou (sem zerar o timer).
    if (!lessonStartedAt) setLessonStartedAt(new Date().toISOString());
  };

  const handleDismissResume = () => {
    if (typeof window !== 'undefined') localStorage.removeItem(RESUME_LESSON_KEY);
    setResumeLesson(null);
  };

  const handleBackToHome = () => {
    // Voltar sem concluir NÃO limpa o resume de propósito:
    // se fechar a aba aqui, o botão de voltar aparece.
    // Só conclui (finishLessonFlow) limpa e conta a sequência.
    setLessonFlow('list');
    setLessonView('home');
    setQuizAnswers({});
    setQuizResults(null);
    setQuizError('');
  };

  const handleGoToQuiz = async () => {
    if (lessonSeconds < LESSON_MIN_SECONDS) {
      setQuizError(`Fique na aula por pelo menos ${LESSON_MIN_SECONDS} segundos antes de continuar.`);
      return;
    }
    setQuizError('');

  // FASE D: a aula personalizada NUNCA pode usar o plano do cronograma.
  // O loadQuizForLesson abre pelo cache local do plano, e o plano do
  // cronograma ja tinha quiz salvo de uma aula de Ciencias: a aluna
  // clicava em "questionario" na aula do ceu azul e recebia um quiz
  // de atomos. Aqui o plano e a propria aula, com chave propria, e o
  // acerto so acontece na aula certa.
  const planDoQuiz = isCustomLessonOpen
    ? {
        id: `custom:${generatedStudyLesson.lessonId ?? generatedStudyLesson.title ?? 'aula'}`,
        subject: generatedStudyLesson.subject,
        topic: generatedStudyLesson.topic,
      }
    : openPlan;

  // Quiz ainda NAO pronto: a aluna clicou, geramos agora e abrimos.
  // O botao nunca dependeu do quiz existir, entao este caminho sempre
  // acaba em quiz aberto ou em erro com "Tentar novamente".
  //
  // FASE D: a aula personalizada entra pelo MESMO caminho, com o
  // lessonId da linha salva. O generate-quiz le a aula por esse id e
  // o cache dele (generated_quizzes.lesson_id) funciona sem nenhuma
  // alteracao: a coluna ja tem FK para generated_lessons.
  if (generatedStudyLesson?.generated && !lessonQuiz.length) {
    setIsPreparingQuiz(true);
    setQuizError('');
    setAiStatus('Preparando questionario...');
    try {
      const result = await loadQuizForLesson(planDoQuiz, generatedStudyLesson.lessonId, {
        lesson: generatedStudyLesson,
      });
      setAiQuiz(result.quiz);
      setAiStatus('');
      setIsPreparingQuiz(false);
    } catch (error) {
      setAiStatus('');
      setIsPreparingQuiz(false);
      // Nao prende a aluna: mostra o erro e o botao vira "Tentar novamente".
      setQuizError(error?.message || AI_MESSAGES.offline);
      return;
    }
  }

  setLessonFlow('quiz');
  setLessonView('quiz');
};

  const handleQuizSubmit = () => {
    if (!lessonQuiz.length) return;

    const unanswered = lessonQuiz.filter((question) => quizAnswers[question.id] === undefined || quizAnswers[question.id] === null);
    if (unanswered.length) {
      setQuizError('Responda todas as perguntas antes de finalizar o questionário.');
      return;
    }

    setQuizError('');

    const evaluated = lessonQuiz.map((question) => {
      const selectedIndex = quizAnswers[question.id];
      const isCorrect = selectedIndex === question.correct;

      return {
        ...question,
        selectedIndex,
        isCorrect,
      };
    });

    setQuizResults(evaluated);
    setLessonView('results');
  };

  // ---------- Simulados: soma XP/questões (offline local, logado no Supabase) ----------
  const handleSimuladoResult = async ({ subject, results }) => {
    const hits = results.filter((item) => item.isCorrect).length;

    if (activeUser?.id && isSupabaseConfigured) {
      for (const item of results) {
        await recordQuestionAttempt({
          userId: activeUser.id,
          questionId: item.id,
          subject,
          topic: item.topic,
          difficulty: item.difficulty,
          correct: item.isCorrect,
          selectedAnswer: item.options[item.selectedIndex],
        });
      }
      const progress = await getStudentProgress(activeUser.id);
      setStudentState((prev) => ({ ...prev, ...EMPTY_PROGRESS, ...progress, name: prev.name }));
      return;
    }

    setStudentState((prev) => ({
      ...prev,
      xp: (prev.xp || 0) + results.reduce((sum, item) => sum + (item.isCorrect ? 25 : 5), 0),
      questions_answered: (prev.questions_answered || 0) + results.length,
      questions_correct: (prev.questions_correct || 0) + hits,
      questions_wrong: (prev.questions_wrong || 0) + (results.length - hits),
    }));
  };

  // Botão "Abrir simulado" vindo do chat da Tutora IA.
  const handleOpenSimulado = (id) => {
    setActivePage('Simulados');
    setOpenSimuladoId(id);
  };

  const weekRow = useMemo(() => weekDaysFromToday(todayDateKey), [todayDateKey]);
  const liveStreak = useMemo(() => computeStreak(studyDates, todayDateKey), [studyDates, todayDateKey]);
  // FINAL POLISH: o card de progresso passa a mostrar o numero calculado
  // a partir dos IDs oficiais concluidos, nunca um contador agregado
  // antigo. Era essa leitura que exibia 100% com 2 de 122.
  //
  // O denominador e OFFICIAL_LESSON_IDS.length (122) e nao o tanto de
  // blocos gerados: o numerador e uma contagem de IDs desta MESMA
  // lista, e o denominador precisa sair dela tambem.
  const progressoOficial = useMemo(
    () => officialProgress(completedLessonIds, OFFICIAL_LESSON_IDS, OFFICIAL_LESSON_IDS.length),
    [completedLessonIds],
  );

  const displayStreak = Math.max(liveStreak, 0);
  const showResume = Boolean(resumeLesson?.lessonId) && lessonView === 'home' && !completedLessonIds.includes(resumeLesson.lessonId);

  const lessonHits = quizResults ? quizResults.filter((item) => item.isCorrect).length : 0;
  const showLessonPage = (currentStudyLesson || isCustomLessonOpen) && lessonView !== 'home' && lessonFlow !== 'list';

  // Texto do indicador de sincronização (usado na lateral e no topo).
  const syncBadgeText =
    syncStatus === 'syncing'
      ? '☁️ Sincronizando...'
      : syncStatus === 'offline'
        ? '⚠️ Sem sincronizar agora'
        : syncStatus === 'synced'
          ? `☁️ Sincronizado${syncAt ? ` às ${new Date(syncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
          : '☁️ Sincronização ligada';

  if (showLessonPage) {
    return (
      <LessonPage
        lesson={generatedStudyLesson}
        lessonView={lessonView}
        detail={lessonDetail}
        quiz={lessonQuiz}
        quizAnswers={quizAnswers}
        setQuizAnswers={setQuizAnswers}
        quizResults={quizResults}
        lessonHits={lessonHits}
        quizError={quizError}
        aiStatus={aiStatus}
        aiError={aiError}
        onRetryLesson={() => setAiNonce((n) => n + 1)}
        lessonSeconds={lessonSeconds}
        canShowQuiz={canShowQuiz}
        isPreparingQuiz={isPreparingQuiz}
        quizReady={Boolean(lessonQuiz.length)}
        isSavingLesson={isSavingLesson}
        onBack={handleBackToHome}
        onGoToQuiz={handleGoToQuiz}
        onBackToLesson={() => { setLessonFlow('lesson'); setLessonView('lesson'); }}
        onSubmitQuiz={handleQuizSubmit}
        onFinish={finishLessonFlow}
        studentState={studentState}
        todayLessons={currentStudyPlan}
        completedLessonIds={completedLessonIds}
        onOpenSimulado={(id) => {
          // Sai da lição e abre o simulado criado pelo chat, sem perder o dia.
          handleBackToHome();
          handleOpenSimulado(id);
        }}
      />
    );
  }

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
          {sidebarItems.map((item) => (
            <button key={item} className={`nav-item ${activePage === item ? 'active' : ''}`} onClick={() => setActivePage(item)}>
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

        <div className={`sync-badge sync-${syncStatus}`} title="Sincronização entre celular e computador">
          {syncBadgeText}
        </div>

        <button className="ghost-button auth-logout" onClick={handleLogout}>Sair</button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>Olá, {studentState.name}</h2>
          </div>

          <div className="topbar-actions">
            <div className={`sync-badge topbar-sync sync-${syncStatus}`} title="Sincronização entre celular e computador">
              {syncBadgeText}
            </div>
            {showResume && (
              <button className="primary-button" onClick={handleResumeLesson}>
                Voltar à lição: {resumeLesson.subject} — {resumeLesson.topic}
              </button>
            )}
          </div>
        </header>

        {showResume && (
          <section className="panel resume-panel">
            <div>
              <strong>Você estava no meio de uma lição e saiu.</strong>
              <p>{resumeLesson.subject} — {resumeLesson.topic}. Clique para continuar de onde parou.</p>
            </div>
            <div className="hero-actions">
              <button className="primary-button" onClick={handleResumeLesson}>Continuar lição interrompida</button>
              <button className="ghost-button" onClick={handleDismissResume}>Descartar</button>
            </div>
          </section>
        )}

        <section className="hero-card">
          {/* FINAL POLISH: o numero vem SO do calculo. O `|| atual` que
            estava aqui ressuscitava uma sequencia antiga depois da
            quebra — 0 e um resultado legitimo e precisa aparecer como 0.
            Em JSX o comentario precisa de chaves: um `//` solto aqui
            aparecia como texto na tela da aluna. */}
          <div className="hero-copy">
            <span className="tag tag-hot">
            {displayStreak > 0
              ? `🔥 ${displayStreak} ${displayStreak === 1 ? 'dia' : 'dias'} de sequência`
              : 'Comece sua sequência hoje'}
          </span>
            <h3>Você vai conseguir meu amor srsrsrsrsr</h3>
            <p>
              Sua maior sequência foi <strong>{studentState.longest_streak || 0} dias</strong> e você estudou <strong>{studentState.study_minutes || 0} minutos</strong> no total.
            </p>
          </div>

          <div className="streak-panel">
            <div className="streak-highlight">
              <span className="fire-icon">🔥</span>
              <div>
                <p>Meta diária</p>
                <strong>{todayDoneCount}/{dailyGoal} lição</strong>
              </div>
            </div>
            <div className="sequence-row">
              {weekRow.map((item) => {
                const done = studyDates.includes(item.key);
                return (
                  <div key={item.key} className={`day-badge ${done ? 'active streak-done' : ''}`} title={`${item.name} ${item.num}`}>
                    <span>{item.label}</span>
                    <b>{done ? '🔥' : '○'}</b>
                  </div>
                );
              })}
            </div>
            {completedToday && <div className="celebration-banner">🔥 Sequência mantida!</div>}
          </div>
        </section>

        {activePage === 'Estudo de hoje' && (
          <>
            <section className="panel study-today-panel">
              <TodayPanelContent
                todayKey={todayKey}
                todayDateKey={todayDateKey}
                currentStudyPlan={currentStudyPlan}
                completedLessonIds={completedLessonIds}
                onStart={handleLessonStart}
              />
            </section>

            <section className="stats-grid" id="progresso">
              <StatsContent
                studentState={studentState}
                totalLessons={totalGeneratedBlocks}
                progressoOficial={progressoOficial}
                lessonSeconds={lessonSeconds}
                lessonView={lessonView}
              />
            </section>
          </>
        )}

        {activePage === 'Minhas aulas' && (
          <CustomLessonsPage
            onBack={() => setActivePage('Estudo de hoje')}
            onOpenLesson={({ lesson, lessonId }) => {
              // Abre no MESMO LessonPage das aulas do cronograma.
              // Nada de progresso, XP ou streak e tocado aqui.
              setQuizAnswers({});
              setQuizResults(null);
              setQuizError('');
              setAiQuiz(null);
              setLessonSeconds(0);
              setCustomLesson({ lesson, id: lessonId });
              setLessonFlow('lesson');
              setLessonView('lesson');
            }}
          />
        )}

        {activePage === 'Cronograma' && (
          <SchedulePage
            weeks={scheduleWeeks}
            todayDateKey={todayDateKey}
            completedIds={completedLessonIds}
            onOpenPlanDay={handleOpenPlanDay}
          />
        )}

        {activePage === 'Tutor IA' && (
          <AiChatPage
            studentState={studentState}
            todayLessons={currentStudyPlan}
            completedLessonIds={completedLessonIds}
            onOpenSimulado={handleOpenSimulado}
          />
        )}

        {activePage === 'Simulados' && (
          <SimuladosPage
            initialId={openSimuladoId}
            onInitialIdConsumed={() => setOpenSimuladoId(null)}
            onResult={handleSimuladoResult}
          />
        )}

        {activePage === 'Configurações' && (
          <SettingsPage themes={THEMES} active={themeName} onSelect={setThemeName} />
        )}

      </main>
    </div>
  );
}

/**
 * FASE D — da a forma de uma aula do cronograma a uma aula
 * personalizada, para LessonPage, getLessonDetail e o quiz
 * funcionarem sem nenhum renderer novo.
 *
 * O `id` comeca com "custom:" de proposito: nunca colide com um id
 * oficial, entao uma aula personalizada nao pode ser confundida com
 * item do cronograma por acidente de chave.
 */
function customLessonShape(lesson) {
  const objetivo = (lesson?.objectives ?? [])[0] ?? '';
  const id = `custom:${lesson?.title ?? 'aula'}`;
  return {
    id,
    plan: { id },
    subject: 'Personalizada',
    topic: lesson?.title ?? 'Aula personalizada',
    title: lesson?.title ?? 'Aula personalizada',
    objective: objetivo,
    time: '',
    color: '#c98ab5',
    duration: lesson?.estimatedMinutes ?? 55,
    videoUrl: '',
    isCustom: true,
  };
}

function TodayPanelContent(props) {
  return (
    <>
      <div className="panel-head">
        <h3>Estudo de hoje — {DAY_LABELS[props.todayKey]} {formatDateBR(props.todayDateKey)}</h3>
        <span className="tag">{props.currentStudyPlan.length} bloco(s) · {props.currentStudyPlan.reduce((sum, item) => sum + (item.duration || 0), 0)} min</span>
      </div>
      {props.currentStudyPlan.length === 0 && (
        <p className="quiz-error">Nenhum bloco de aula para {formatDateBR(props.todayDateKey)} no cronograma. Veja a aba Cronograma para o conteúdo do dia.</p>
      )}
      <div className="study-plan-grid">
        {props.currentStudyPlan.map((item) => (
          <article key={item.id} className="study-plan-item" style={{ borderLeft: `4px solid ${item.color}` }}>
            <div className="study-plan-header">
              <span className="study-dot" style={{ background: item.color }} />
              <div>
                <strong>{item.subject}</strong>
                <small>{item.time}{item.blockLabel ? ` · ${item.blockLabel}` : ''}</small>
              </div>
            </div>
            <h4>{item.topic}</h4>
            <p>{item.explanation}</p>
            <div className="study-plan-meta">
              <span>🎯 {item.objective}</span>
            </div>
            <div className="study-plan-actions">
              {props.completedLessonIds.includes(item.id) ? (
                <span className="tag lesson-done-tag">✅ Concluída · sequência mantida</span>
              ) : (
                <button className="primary-button small-button" onClick={() => props.onStart(item)}>Começar</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function StatsContent(props) {
  const { studentState } = props;
  return (
    <>
      <div className="stat-card accent">
        <span className="stat-label">Progresso geral</span>
        <strong>{props.progressoOficial?.percent ?? 0}%</strong>
        <small>
          {props.progressoOficial?.done ?? 0} de {props.progressoOficial?.total ?? props.totalLessons} lições concluídas
        </small>
      </div>
      <div className="stat-card">
        <span className="stat-label">Questões resolvidas</span>
        <strong>{studentState.questions_answered || 0}</strong>
        <small>{studentState.questions_correct || 0} acertos · {studentState.questions_wrong || 0} erros</small>
      </div>
      <div className="stat-card">
        <span className="stat-label">Taxa de acerto</span>
        <strong>{(studentState.questions_answered || 0) > 0 ? Math.round(((studentState.questions_correct || 0) / studentState.questions_answered) * 100) : 0}%</strong>
        <small>{(studentState.questions_answered || 0) > 0 ? 'Baseado nas suas respostas' : 'Responda o primeiro quiz'}</small>
      </div>
      <div className="stat-card">
        <span className="stat-label">Tempo total acumulado</span>
        <strong>{formatStudyTime(studentState.study_seconds || (studentState.study_minutes || 0) * 60)}</strong>
        <small>Nesta lição: {formatStudyTime(props.lessonView === 'home' ? 0 : props.lessonSeconds)}</small>
      </div>
    </>
  );
}

export default App;
