// ============================================================
// CHAMADA REAL para a Edge Function `generate-lesson` publicada.
// Usa a sessão anônima (igual ao app) e o payload REAL do cronograma
// do bloco 1 de 29/09/2026 (Português).
// Roda com: node scripts/chamar-edge-function.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const inline = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const env = Object.fromEntries(
  read('.env').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const URL_BASE = env.VITE_SUPABASE_URL;
const FN = `${URL_BASE}/functions/v1/generate-lesson`;

// Payload REAL montado a partir do cronograma (nada inventado).
const curriculum = await import(inline(read('src/data/curriculum.js').replace("from './schedule'", `from '${inline(read('src/data/schedule.js'))}'`)));
const dbShared = await import(inline(read('supabase/functions/_shared/db.js')));
const [plano] = curriculum.getPlanDaysForDate('2026-09-29');

const payload = {
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
  // Igual ao src/services/ai.js: o weekGoal NAO e repetido em objectives
  // (inflava o prompt e o modelo estourava o limite de 150s do gateway).
  objectives: [plano.objective].filter(Boolean),
  durationMinutes: plano.durationMinutes,
  studentLevel: plano.studentLevel,
  studentPerformance: {},
  force: process.argv.includes('--force'),
};

console.log('PAYLOAD (do cronograma, sem alteracao):');
console.log(JSON.stringify(payload, null, 2));
console.log(`\ncache_key esperada: ${dbShared.lessonCacheKey(payload)}\n`);

const supabase = createClient(URL_BASE, KEY, { auth: { persistSession: false } });
const { data: sessao, error: erroSessao } = await supabase.auth.signInAnonymously();
if (erroSessao || !sessao?.session) {
  console.log(`SESSAO ANONIMA FALHOU: ${erroSessao?.message ?? 'sem sessao'}`);
  process.exit(1);
}
const token = sessao.session.access_token;
console.log(`JWT anonimo obtido (user ${sessao.user.id}, anon=${Boolean(sessao.user.is_anonymous)})`);


const r1 = await chamar(payload);

if (r1.status !== 200) {
  console.log(`\nERRO: ${JSON.stringify(r1.corpo, null, 2)}`);
  process.exit(1);
}

const l = r1.corpo.lesson ?? {};
console.log(`\nRESPOSTA:`);
console.log(`   cached      : ${r1.corpo.cached}`);
console.log(`   model       : ${r1.corpo.model}`);
console.log(`   id no banco : ${r1.corpo.id ?? '(nao salvo)'}`);
console.log(`   saveFailed  : ${r1.corpo.saveFailed ?? false}`);
console.log(`   titulo      : ${l.title}`);
console.log(`   materia     : ${l.subject} | topico: ${l.topic}`);
console.log(`   minutos     : ${l.estimatedMinutes}`);
console.log(`   secoes      : ${(l.sections ?? []).length}`);
(l.sections ?? []).forEach((s, i) => console.log(`     ${i + 1}. ${s.title} (${(s.explanation ?? '').length} chars, ${(s.examples ?? []).length} exemplo[s])`));
console.log(`   objetivos   : ${(l.objectives ?? []).length}`);
console.log(`   pratica     : ${(l.guidedPractice ?? []).length}`);
console.log(`   erros comuns: ${(l.commonMistakes ?? []).length}`);
console.log(`   resumo      : ${(l.summary ?? []).length}`);

const textoTodo = JSON.stringify(l);
console.log(`\nQUALIDADE:`);
console.log(`   palavras     : ${textoTodo.split(/\s+/).length}`);
console.log(`   tem HTML     : ${/<\s*\/?\s*(div|span|p|br|img)\b/i.test(textoTodo)}`);
console.log(`   tem React/JSX: ${/<[A-Z][A-Za-z]*\s*\/?>|\{\/\*/.test(textoTodo)}`);
console.log(`   tem CSS       : ${/[.#][a-z-]+\s*\{[^}]*:[^}]*;/.test(textoTodo)}`);
console.log(`   tem markdown  : ${/\*\*|^#{1,6}\s/m.test(textoTodo)}`);
const faltando = ['compreensão', 'interpretação', 'explícita', 'implícita'].filter((t) => !textoTodo.toLowerCase().includes(t.toLowerCase()));
console.log(`   4 subtopicos : ${faltando.length === 0 ? 'todos presentes' : `faltando ${faltando.join(', ')}`}`);

fs.writeFileSync(path.join(raiz, 'scripts/.aula-real-29-09-b1.json'), JSON.stringify(r1.corpo, null, 2));

// ---- 2. ABRIR DE NOVO: tem que vir do cache ----
const r2 = await chamar(payload);
console.log(`\n2a CHAMADA (mesma aula): cached=${r2.corpo.cached} (esperado: true)`);
console.log(`   mesma aula? ${r2.corpo.lesson?.title === l.title ? 'SIM' : 'NAO'}`);
console.log(`   mesmo id?   ${r2.corpo.id === r1.corpo.id ? 'SIM' : 'NAO'}`);

// ---- 3. BLOCO 2 (Ciências) ----
const [p2] = curriculum.getPlanDaysForDate('2026-09-29').slice(1);
const payload2 = { ...payload, block: p2.block, subject: p2.subject, topic: p2.topic, subtopics: p2.subtopics, objectives: [p2.objective].filter(Boolean), force: false };
console.log(`\nChave do bloco 2: ${dbShared.lessonCacheKey(payload2)}`);
console.log(`Chaves diferentes? ${dbShared.lessonCacheKey(payload2) !== dbShared.lessonCacheKey(payload) ? 'SIM' : 'NAO (BUG)'}`);
const r3 = await chamar(payload2);
if (r3.status !== 200) {
  console.log(`   FALHOU o bloco 2: ${JSON.stringify(r3.corpo).slice(0, 180)}`);
  console.log('   (o bloco 1 e o cache continuam valendo; o bloco 2 pode tentar de novo)');
}
console.log(`   materia: ${r3.corpo.lesson?.subject} | cached=${r3.corpo.cached} | id=${r3.corpo.id ?? '(nao salvo)'}`);

const { data: linhas } = await supabase.from('generated_lessons').select('id,cache_key');
console.log(`\nLinhas em generated_lessons para este usuario: ${linhas?.length ?? 0}`);
(linhas ?? []).forEach((x) => console.log(`   ${x.cache_key}`));

async function chamar(p) {
  console.log(`\n--- chamando generate-lesson (bloco ${p.block}: ${p.subject}) ---`);
  const t0 = Date.now();
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(p),
  });
  const ms = Date.now() - t0;
  const texto = await res.text();
  let corpo;
  try { corpo = JSON.parse(texto); } catch { corpo = { bruto: texto.slice(0, 400) }; }
  console.log(`HTTP ${res.status} em ${(ms / 1000).toFixed(1)}s`);
  return { status: res.status, corpo, ms };
}
