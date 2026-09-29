// ============================================================
// Currículo = o cronograma oficial (src/data/schedule.js).
// ------------------------------------------------------------
// Este arquivo NAO cria um cronograma paralelo: ele apenas lê o
// scheduleWeeks existente e transforma cada BLOCO do dia em um
// "plano de aula" estruturado (semana, dia, bloco, matéria, tópico,
// subtópicos, duração, fase).
// A IA nunca escolhe o que estudar: ela recebe isto pronto.
// ============================================================

import { DAILY_PLAN, getWeekNumberByDate, scheduleWeeks } from './schedule';

// v2: o cronograma mestre passou a ter 2 blocos por dia (55min + 10min
// + 55min). A versão entra na chave do cache, então as aulas geradas
// com o cronograma antigo (1 bloco/dia) NÃO são reaproveitadas.
export const CURRICULUM_VERSION = 'v2';
export const STUDENT_LEVEL = 'Fundamental II';

const SUBJECT_COLORS = {
  matemática: '#a377ff',
  português: '#9c5de5',
  ciencias: '#5dd6a8',
  ciências: '#5dd6a8',
  física: '#5cc8ff',
  química: '#ffb454',
  biologia: '#7be495',
  história: '#ff8fa3',
  geografia: '#ffd166',
  inglês: '#7aa2ff',
  'história e geografia': '#ffc2a1',
  revisão: '#8ea2ff',
  simulado: '#ef476f',
  prova: '#ef476f',
  correção: '#8ea2ff',
  'correção completa': '#8ea2ff',
};

const norm = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const capitalize = (text) => {
  const clean = String(text ?? '').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

function colorFor(subject) {
  return SUBJECT_COLORS[norm(subject)] ?? '#a377ff';
}

const slug = (text) => norm(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ------------------------------------------------------------------
// Compatibilidade: um dia SEM `blocks` (formato antigo de texto) ainda
// é lido, para nunca quebrar um dia já salvo no banco.
// ------------------------------------------------------------------
function splitDayContent(content) {
  const parts = String(content ?? '')
    .split(/\s+\+\s+(?=[A-ZÀ-Ú][^+]*:)/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(content ?? '').trim()];
}

function parseLegacyPart(part) {
  const text = String(part ?? '').trim();
  const hasColon = /:/.test(text);
  let subject = 'Revisão';
  let rest = text;
  if (hasColon) {
    const index = text.indexOf(':');
    subject = capitalize(text.slice(0, index).trim());
    rest = text.slice(index + 1).trim();
  }
  const subtopics = rest
    .split(/[,;]\s*|\se\s+/i)
    .map((item) => item.trim())
    .filter(Boolean);
  const isQuestions = !hasColon && /^(quest[õo]es|refazer|simulado|corre)/i.test(text);
  const isReview = !hasColon && /^revis[ãa]o/i.test(text);
  return {
    subject,
    topic: capitalize(subtopics[0] || rest || 'Revisão da semana'),
    subtopics: subtopics.length ? subtopics : [capitalize(rest || 'Revisão da semana')],
    kind: isQuestions ? 'questions' : isReview ? 'review' : 'lesson',
    minutes: isReview ? DAILY_PLAN.blockMinutes : isQuestions ? 45 : DAILY_PLAN.blockMinutes,
  };
}

/** Blocos do dia: usa o `blocks` do cronograma mestre; senão, o texto. */
function blocksForDay(day) {
  if (Array.isArray(day.blocks) && day.blocks.length) {
    return day.blocks.map((item) => ({
      subject: item.subject,
      topic: item.topic || (item.subtopics ?? [])[0] || item.subject,
      subtopics: item.subtopics?.length ? item.subtopics : [item.topic || item.subject],
      kind: item.kind || 'lesson',
      minutes: Number(item.minutes) || DAILY_PLAN.blockMinutes,
    }));
  }
  return splitDayContent(day.content).map(parseLegacyPart);
}

function buildCurriculum() {
  const plans = [];
  scheduleWeeks.forEach((week, weekIndex) => {
    // A semana vem da POSIÇÃO no cronograma (nunca de conta de dias),
    // então 29/09/2026 é sempre Semana 1.
    const weekNumber = week.number ?? weekIndex + 1;
    (week.days ?? []).forEach((day, dayIndex) => {
      const blocks = blocksForDay(day);
      blocks.forEach((parsed, blockIndex) => {
        const id = `dia-${day.key}-b${blockIndex + 1}-${slug(parsed.subject)}`;
        plans.push({
          id,
          week: weekNumber,
          weekTitle: week.title,
          weekRange: week.range,
          weekGoal: week.goal ?? '',
          phase: week.phase ?? '',
          phaseLabel: week.phaseLabel ?? '',
          dateKey: day.key,
          weekday: day.weekday,
          // dia = posição do dia DENTRO da semana (1..7), não um contador global.
          day: dayIndex + 1,
          // bloco = qual dos blocos do dia (1 = primeiro de 55min).
          block: blockIndex + 1,
          blockCount: blocks.length,
          blockLabel: blocks.length > 1 ? `Bloco ${blockIndex + 1} de ${blocks.length}` : 'Bloco único',
          breakAfterMinutes: blockIndex < blocks.length - 1 ? (day.breakMinutes ?? DAILY_PLAN.breakMinutes) : 0,
          dayBreakMinutes: day.breakMinutes ?? Math.max(0, blocks.length - 1) * DAILY_PLAN.breakMinutes,
          dayTotalMinutes: day.totalMinutes ?? blocks.reduce((sum, b) => sum + b.minutes, 0),
          subject: parsed.subject,
          topic: parsed.topic,
          // TODOS os subtópicos do cronograma, sem cortar nada.
          subtopics: parsed.subtopics,
          content: `${parsed.subject}: ${parsed.subtopics.join('; ')}`,
          kind: parsed.kind,
          durationMinutes: parsed.minutes,
          color: colorFor(parsed.subject),
          studentLevel: STUDENT_LEVEL,
          // objetivo do cronograma (a IA não decide isso)
          objective:
            parsed.kind === 'questions'
              ? 'Treinar questões no tempo de prova'
              : `${parsed.subject}: ${parsed.subtopics.join('; ')}`,
          curriculumVersion: CURRICULUM_VERSION,
        });
      });
    });
  });
  return plans;
}

export const curriculumDays = buildCurriculum();

/** Todos os planos de um dia (28/09, 12/10...). */
export function getPlanDaysForDate(dateKey) {
  return curriculumDays.filter((day) => day.dateKey === dateKey);
}

export function getPlanDayById(id) {
  return curriculumDays.find((day) => day.id === id) ?? null;
}

/** Blocos que viram aula gerada pela IA (exclui blocos de prova/questões). */
export function isGeneratedDay(plan) {
  return Boolean(plan) && plan.kind !== 'questions';
}

/** Semana do cronograma que contém a data (29/09/2026 => Semana 1). */
export function getWeekOfDate(dateKey) {
  return scheduleWeeks.find((week) => (week.days ?? []).some((day) => day.key === dateKey)) ?? null;
}

/** Número da semana (1..10) de uma data, sem fazer conta de dias. */
export function getWeekNumber(dateKey) {
  return getWeekNumberByDate(dateKey);
}

/** Quantidade de blocos de aula de verdade (o resto é simulado/questões). */
export const totalGeneratedBlocks = curriculumDays.filter(isGeneratedDay).length;

/**
 * Cartão de aula para as listas do site (Estudo de hoje / Cronograma).
 * O campo `plan` é o que avisa ao App: esta aula é do cronograma e a
 * IA (generate-lesson) é quem escreve o conteúdo dela.
 */
export function planDayToLesson(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    subject: plan.subject,
    topic: plan.topic,
    time: plan.weekday,
    blockLabel: plan.blockLabel,
    date: plan.dateKey,
    duration: plan.durationMinutes,
    color: plan.color,
    objective: plan.objective,
    explanation: plan.content,
    videoUrl: '',
    images: [],
    plan,
  };
}

/** Cartões de aula (IA) de um dia do cronograma, pulando dias de questões. */
export function planLessonsForDate(dateKey) {
  return getPlanDaysForDate(dateKey)
    .filter(isGeneratedDay)
    .map(planDayToLesson)
    .filter(Boolean);
}
