// Mostra o prompt que a IA recebe para um bloco real do cronograma.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const inline = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const scheduleSrc = read('src/data/schedule.js');
const curriculumSrc = read('src/data/curriculum.js').replace("from './schedule'", `from '${inline(scheduleSrc)}'`);
const curriculum = await import(inline(curriculumSrc));
const prompts = await import(inline(read('supabase/functions/_shared/prompts.js')));
const db = await import(inline(read('supabase/functions/_shared/db.js')));

const payload = (plan) => ({
  curriculumVersion: plan.curriculumVersion,
  week: plan.week,
  weekTitle: plan.weekTitle,
  weekGoal: plan.weekGoal,
  day: plan.day,
  dateKey: plan.dateKey,
  weekday: plan.weekday,
  phase: plan.phase,
  phaseLabel: plan.phaseLabel,
  block: plan.block,
  blockCount: plan.blockCount,
  blockLabel: plan.blockLabel,
  breakAfterMinutes: plan.breakAfterMinutes,
  dayBreakMinutes: plan.dayBreakMinutes,
  dayTotalMinutes: plan.dayTotalMinutes,
  kind: plan.kind,
  subject: plan.subject,
  topic: plan.topic,
  subtopics: plan.subtopics,
  objectives: [plan.objective, plan.weekGoal],
  durationMinutes: plan.durationMinutes,
  studentLevel: plan.studentLevel,
});

const planos = [
  curriculum.getPlanDaysForDate('2026-09-29')[0], // Português bloco 1
  curriculum.getPlanDaysForDate('2026-09-29')[1], // Ciências bloco 2
  curriculum.getPlanDaysForDate('2026-10-04')[0], // Revisão
];

planos.forEach((plan) => {
  const { user } = prompts.buildLessonPrompt(payload(plan));
  console.log('='.repeat(70));
  console.log(`SEMANA ${plan.week} · ${plan.dateKey} · ${plan.blockLabel} · ${plan.subject}`);
  console.log('='.repeat(70));
  console.log(user);
  console.log('');
  console.log(`chave de cache: ${db.lessonCacheKey(payload(plan))}`);
  console.log('');
});

// As duas aulas do mesmo dia NAO podem colidir na chave de cache.
const [a, b] = curriculum.getPlanDaysForDate('2026-09-29');
const ka = db.lessonCacheKey(payload(a));
const kb = db.lessonCacheKey(payload(b));
console.log('as 2 aulas de 29/09 tem chaves diferentes?', ka !== kb ? 'SIM' : 'NAO (BUG)');
