import { supabase } from '../lib/supabase';

export const EMPTY_PROGRESS = {
  xp: 0,
  level: 1,
  current_streak: 0,
  longest_streak: 0,
  questions_answered: 0,
  questions_correct: 0,
  questions_wrong: 0,
  study_minutes: 0,
  lessons_completed: 0,
  modules_completed: 0,
  reviews_completed: 0,
  overall_progress: 0,
};

export function normalizeDateKey(dateInput) {
  const date = new Date(dateInput);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function calculateStreakFromStudyDates(studyDates = []) {
  if (!studyDates.length) return 0;

  const uniqueDates = [...new Set(studyDates.map((value) => normalizeDateKey(value)))].sort((a, b) => new Date(b) - new Date(a));
  const dateSet = new Set(uniqueDates);
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let cursor = new Date(current);
  if (!dateSet.has(normalizeDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (dateSet.has(normalizeDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function calculateLongestStreakFromStudyDates(studyDates = []) {
  if (!studyDates.length) return 0;

  const uniqueDates = [...new Set(studyDates.map((value) => normalizeDateKey(value)))].sort((a, b) => new Date(a) - new Date(b));
  let longest = 1;
  let currentRun = 1;

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(uniqueDates[index - 1]);
    const currentDate = new Date(uniqueDates[index]);
    const diff = (currentDate - previous) / (1000 * 60 * 60 * 24);

    if (diff === 1) {
      currentRun += 1;
      longest = Math.max(longest, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return longest;
}

export async function ensureStudentProfile(user) {
  if (!supabase || !user) {
    return { data: null, error: null };
  }

  const profileName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Estudante';

  return supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        name: profileName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();
}

export async function getStudentProgress(userId) {
  if (!supabase || !userId) {
    return EMPTY_PROGRESS;
  }

  const { data, error } = await supabase
    .from('student_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar progresso do usuário:', error.message);
    return EMPTY_PROGRESS;
  }

  return {
    ...EMPTY_PROGRESS,
    ...(data || {}),
  };
}

export async function getStudyDates(userId) {
  if (!supabase || !userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('study_days')
    .select('study_date')
    .eq('user_id', userId);

  if (error) {
    console.error('Erro ao buscar datas de estudo:', error.message);
    return [];
  }

  return (data || []).map((row) => row.study_date);
}

export async function getXpSummary(userId) {
  if (!supabase || !userId) {
    return 0;
  }

  const { data, error } = await supabase
    .from('xp_events')
    .select('xp')
    .eq('user_id', userId);

  if (error) {
    console.error('Erro ao buscar XP:', error.message);
    return 0;
  }

  return (data || []).reduce((sum, row) => sum + Number(row.xp || 0), 0);
}

export async function getAccuracySummary(userId) {
  if (!supabase || !userId) {
    return { total: 0, correct: 0, percent: 0 };
  }

  const { data, error } = await supabase
    .from('question_attempts')
    .select('correct')
    .eq('user_id', userId);

  if (error) {
    console.error('Erro ao buscar tentativas:', error.message);
    return { total: 0, correct: 0, percent: 0 };
  }

  const total = data?.length || 0;
  const correct = data?.filter((item) => item.correct).length || 0;

  return {
    total,
    correct,
    percent: total ? Math.round((correct / total) * 100) : 0,
  };
}

export async function hydrateStudentState(userId) {
  if (!supabase || !userId) {
    return { ...EMPTY_PROGRESS };
  }

  const [profileResponse, progress, studyDates, xpTotal, accuracySummary] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    getStudentProgress(userId),
    getStudyDates(userId),
    getXpSummary(userId),
    getAccuracySummary(userId),
  ]);

  const profile = profileResponse.data || {};
  const streak = calculateStreakFromStudyDates(studyDates);
  const longestStreak = calculateLongestStreakFromStudyDates(studyDates);

  return {
    name: profile.name || 'Estudante',
    xp: progress.xp || xpTotal || 0,
    level: progress.level || 1,
    current_streak: streak || progress.current_streak || 0,
    longest_streak: longestStreak || progress.longest_streak || 0,
    questions_answered: progress.questions_answered || accuracySummary.total || 0,
    questions_correct: progress.questions_correct || accuracySummary.correct || 0,
    questions_wrong: progress.questions_wrong || Math.max(0, (accuracySummary.total || 0) - (accuracySummary.correct || 0)),
    study_minutes: progress.study_minutes || 0,
    lessons_completed: progress.lessons_completed || 0,
    modules_completed: progress.modules_completed || 0,
    reviews_completed: progress.reviews_completed || 0,
    overall_progress: progress.overall_progress || 0,
    accuracy_percent: progress.accuracy_percent || accuracySummary.percent || 0,
    profile,
  };
}

export async function upsertStudyDay(userId, studyDate = new Date().toISOString()) {
  if (!supabase || !userId) {
    return { data: null, error: null };
  }

  const formattedDate = normalizeDateKey(studyDate);

  return supabase
    .from('study_days')
    .upsert(
      {
        user_id: userId,
        study_date: formattedDate,
      },
      { onConflict: 'user_id,study_date' }
    )
    .select();
}

export async function recordStudySession({ userId, subject, minutes, studyDate = new Date().toISOString() }) {
  if (!supabase || !userId) return { error: null };

  await upsertStudyDay(userId, studyDate);

  const currentProgress = await getStudentProgress(userId);
  const nextMinutes = (currentProgress.study_minutes || 0) + Number(minutes || 0);
  const nextXp = (currentProgress.xp || 0) + 15;

  const sessionInsert = await supabase.from('study_sessions').insert({
    user_id: userId,
    subject,
    minutes: Number(minutes || 0),
    session_date: new Date(studyDate).toISOString(),
  });

  if (sessionInsert.error) {
    return sessionInsert;
  }

  const xpInsert = await supabase.from('xp_events').insert({
    user_id: userId,
    event_type: 'study_session',
    reference_id: `session-${Date.now()}`,
    xp: 15,
  });

  if (xpInsert.error) {
    return xpInsert;
  }

  const upsert = await supabase.from('student_progress').upsert(
    {
      user_id: userId,
      xp: nextXp,
      study_minutes: nextMinutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  ).select();

  return upsert;
}

export async function recordQuestionAttempt({ userId, questionId, subject, topic, difficulty, correct, selectedAnswer }) {
  if (!supabase || !userId) return { error: null };

  const currentProgress = await getStudentProgress(userId);
  const nextAnswers = (currentProgress.questions_answered || 0) + 1;
  const nextCorrect = (currentProgress.questions_correct || 0) + (correct ? 1 : 0);
  const nextWrong = (currentProgress.questions_wrong || 0) + (!correct ? 1 : 0);
  const nextXp = (currentProgress.xp || 0) + (correct ? 25 : 5);

  const attemptInsert = await supabase.from('question_attempts').insert({
    user_id: userId,
    question_id: questionId,
    subject,
    topic,
    difficulty,
    selected_answer: selectedAnswer,
    correct,
    time_spent: 0,
  });

  if (attemptInsert.error) {
    return attemptInsert;
  }

  if (correct) {
    await supabase.from('xp_events').insert({
      user_id: userId,
      event_type: 'question_correct',
      reference_id: questionId,
      xp: 25,
    });
  }

  return supabase.from('student_progress').upsert(
    {
      user_id: userId,
      xp: nextXp,
      questions_answered: nextAnswers,
      questions_correct: nextCorrect,
      questions_wrong: nextWrong,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  ).select();
}

export async function resetStudentData(userId) {
  if (!supabase || !userId) {
    return { error: null };
  }

  const operations = [
    supabase.from('study_days').delete().eq('user_id', userId),
    supabase.from('student_progress').delete().eq('user_id', userId),
    supabase.from('question_attempts').delete().eq('user_id', userId),
    supabase.from('lesson_progress').delete().eq('user_id', userId),
    supabase.from('module_progress').delete().eq('user_id', userId),
    supabase.from('daily_missions').delete().eq('user_id', userId),
    supabase.from('achievements').delete().eq('user_id', userId),
    supabase.from('simulation_attempts').delete().eq('user_id', userId),
    supabase.from('activity_feed').delete().eq('user_id', userId),
    supabase.from('xp_events').delete().eq('user_id', userId),
  ];

  const results = await Promise.all(operations);

  const failed = results.find((item) => item.error);
  if (failed?.error) {
    return { error: failed.error };
  }

  return { error: null };
}
