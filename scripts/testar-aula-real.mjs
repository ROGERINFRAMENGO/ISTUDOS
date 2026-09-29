// ============================================================
// TESTE REAL DA GERAÇÃO DE AULA — 29/09/2026, Bloco 1 (Português)
// ------------------------------------------------------------
// Reproduz o fluxo exato da Edge Function `generate-lesson`:
//   cronograma -> bloco -> payload -> prompt -> NVIDIA -> JSON
//   -> validateLesson -> chave de cache -> render no LessonPage
// A chave da NVIDIA é lida do AMBIENTE (nunca fica no repo).
// Roda com: node scripts/testar-aula-real.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const inline = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const BRUTO = path.join(raiz, 'scripts/.aula-bruta.json');

// ---------- 1. CRONOGRAMA -> BLOCO DO DIA ----------
const curriculum = await import(inline(read('src/data/curriculum.js').replace("from './schedule'", `from '${inline(read('src/data/schedule.js'))}'`)));
const DATA = '2026-09-29';
const plano = curriculum.getPlanDaysForDate(DATA)[0];

console.log('1) CRONOGRAMA -> BLOCO DO DIA');
console.log(`   ${DATA} · Semana ${plano.week} · ${plano.blockLabel}`);
console.log(`   Materia: ${plano.subject} | Topico: ${plano.topic} | ${plano.durationMinutes} min`);
console.log(`   Subtopicos: ${JSON.stringify(plano.subtopics)}`);

if (plano.subject !== 'Português') throw new Error('Bloco 1 de 29/09 deveria ser Português');
if (plano.subtopics.length !== 4) throw new Error('Deveriam chegar 4 subtópicos');
console.log('   OK: Português com os 4 subtópicos.\n');

// ---------- 2. PAYLOAD EXATO (mesmo de src/services/ai.js) ----------
const lessonPayload = {
  curriculumVersion: plano.curriculumVersion,
  week: plano.week,
  weekTitle: plano.weekTitle,
  weekGoal: plano.weekGoal,
  day: plano.day,
  dateKey: plano.dateKey,
  weekday: plano.weekday,
  phase: plano.phase,
  phaseLabel: plano.phaseLabel,
  block: plano.block,
  blockCount: plano.blockCount,
  blockLabel: plano.blockLabel,
  breakAfterMinutes: plano.breakAfterMinutes,
  dayBreakMinutes: plano.dayBreakMinutes,
  dayTotalMinutes: plano.dayTotalMinutes,
  kind: plano.kind,
  subject: plano.subject,
  topic: plano.topic,
  subtopics: plano.subtopics,
  objectives: [plano.objective, plano.weekGoal].filter(Boolean),
  durationMinutes: plano.durationMinutes,
  studentLevel: plano.studentLevel,
  studentPerformance: {},
  force: false,
};

console.log('2) PAYLOAD ENVIADO PARA A EDGE FUNCTION');
console.log(JSON.stringify(lessonPayload, null, 2));
console.log('');

// ---------- 3. PROMPT (mesmo de _shared/prompts.js) ----------
const prompts = await import(inline(read('supabase/functions/_shared/prompts.js')));
const { system, user } = prompts.buildLessonPrompt(lessonPayload);
const QUATRO = ['compreensão', 'interpretação', 'informação explícita', 'informação implícita'];
const temOsQuatro = QUATRO.every((t) => user.includes(t));

console.log('3) PROMPT MONTADO');
console.log(`   system: ${system.length} caracteres`);
console.log(`   user  : ${user.length} caracteres`);
console.log(`   Os 4 subtopicos aparecem no prompt? ${temOsQuatro ? 'SIM' : 'NAO'}`);
console.log(`   Duracao citada: ${lessonPayload.durationMinutes} min`);
console.log(`   Fase citada: ${lessonPayload.phaseLabel}`);
if (!temOsQuatro) throw new Error('Prompt perdeu algum subtópico');
console.log('');

// ---------- 4. CHAMADA REAL NA IA ----------
const nvidia = await import(inline(read('supabase/functions/_shared/nvidia.js')));
console.log('4) PROVEDOR E MODELO');
console.log(`   Provedor: NVIDIA (API compativel com OpenAI)`);
console.log(`   Base URL: ${nvidia.NVIDIA_BASE_URL}`);
console.log(`   Modelo  : ${nvidia.NVIDIA_MODEL}`);
console.log('');

const apiKey = process.env.NVIDIA_API_KEY ?? '';
if (!apiKey) {
  console.log('   AVISO: NVIDIA_API_KEY nao esta no ambiente deste teste.');
  console.log('   Isso e o esperado: a chave vive como SECRET da Edge Function,');
  console.log('   nunca no repo nem no frontend. Sem ela nao da para chamar o');
  console.log('   modelo real a partir daqui; o fluxo para no ponto exato da chamada.\n');
} else {
  console.log('   Chamando o modelo real...\n');
  const result = await nvidia.requestJson(apiKey, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },


    ],
    temperature: 0.55,
    maxTokens: 3200,
  });
  console.log(`   finishReason = ${result.finishReason}`);
  console.log(`   modelo devolvido = ${result.model}`);
  console.log(`   usage = ${JSON.stringify(result.usage)}`);
  fs.writeFileSync(BRUTO, JSON.stringify(result.data, null, 2));
  console.log('   resposta bruta salva em scripts/.aula-bruta.json\n');
}

// ---------- 5. validateLesson ----------
const bruto = fs.existsSync(BRUTO) ? JSON.parse(fs.readFileSync(BRUTO, 'utf8')) : null;
if (!bruto) {
  console.log('   Encerrado: sem chave para chamar o modelo real.');
  process.exit(0);
}

const schemas = await import(inline(read('supabase/functions/_shared/schemas.js')));
const validacao = schemas.validateLesson(bruto, lessonPayload);
console.log('5) validateLesson');
console.log(`   ok = ${validacao.ok}`);
if (!validacao.ok) {
  console.log('   ERROS:');
  validacao.errors.forEach((e) => console.log(`     - ${e}`));
} else {
  console.log(`   Titulo           : ${validacao.data.title}`);
  console.log(`   estimatedMinutes : ${validacao.data.estimatedMinutes}`);
  console.log(`   Secoes           : ${validacao.data.sections.length}`);
  console.log(`   guidedPractice   : ${validacao.data.guidedPractice.length}`);
}
console.log('');

// ---------- 6. CHAVE DE CACHE ----------
const dbShared = await import(inline(read('supabase/functions/_shared/db.js')));
const cacheKey = dbShared.lessonCacheKey(lessonPayload);
console.log('6) CACHE (generated_lessons.cache_key)');
console.log(`   ${cacheKey}`);
console.log('   A funcao busca por essa chave ANTES de chamar a IA.');
console.log('');

// ---------- 7. RENDER NO LESSONPAGE ----------
const lessonContent = await import(inline(read('src/data/lessonContent.js')));
const card = curriculum.planDayToLesson(plano);
const aulaGerada = { ...card, ...validacao.data, generated: true, lessonId: 'teste-local', model: 'teste' };
const detail = lessonContent.getLessonDetail(aulaGerada);
console.log('7) RENDER (lessonContent.getLessonDetail)');
console.log(`   detail.generated = ${detail.generated}`);
console.log(`   Secoes renderizadas: ${detail.sections.length}`);
detail.sections.forEach((s, i) => {
  console.log(`     ${i + 1}. ${s.title} | paragrafos=${s.paragraphs.length} exemplos=${s.examples.length}`);
});
console.log(`   Exercicios guided : ${detail.guidedPractice.length}`);
console.log(`   Erros comuns      : ${detail.commonMistakes.length}`);
console.log(`   Resumo            : ${detail.summary.length}`);
console.log('');

// As 2 aulas de 29/09 nao podem colidir na chave de cache.
const [b1, b2] = curriculum.getPlanDaysForDate(DATA);
const k1 = dbShared.lessonCacheKey({ ...lessonPayload, block: b1.block, subject: b1.subject, topic: b1.topic });
const k2 = dbShared.lessonCacheKey({ ...lessonPayload, block: b2.block, subject: b2.subject, topic: b2.topic });
console.log(`8) COLISAO? Bloco 1 vs Bloco 2 de 29/09 -> ${k1 !== k2 ? 'NAO colidem (OK)' : 'COLIDEM (BUG)'}`);
console.log('');

console.log('FIM DO TESTE');

