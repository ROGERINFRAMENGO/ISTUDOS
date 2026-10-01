// ============================================================
// BASELINE do estado da aluna (P1A) — somente leitura.
// ------------------------------------------------------------
// Guarda uma copia integral do app_state ANTES de mexer no cache
// das aulas. No fim, tools/conferir-preservado.mjs compara e prova
// que XP, progresso, chat, conclusao e preferencias nao mudaram.
//
// Uso: node tools/baseline-aluna.mjs
// ============================================================

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const ARQ = '.tmp-regen/baseline.json';

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { error } = await cliente.auth.signInAnonymously();
if (error) throw error;

const { data, error: e } = await cliente.from('app_state').select('data').eq('id', 'principal').single();
if (e) throw e;

const estado = data.data ?? {};
const s = estado.sections ?? {};
const aiCache = s.aiCache ?? {};

fs.mkdirSync('.tmp-regen', { recursive: true });
fs.writeFileSync(ARQ, JSON.stringify({ capturedAt: new Date().toISOString(), estado }, null, 2), 'utf8');

// Resumo legivel do que NAO pode mudar.
console.log('=== BASELINE DA ALUNA (o que tem de sobreviver) ===');
console.log(`XP ................... ${s.progress?.xp}`);
console.log(`nome ................. ${s.progress?.name}`);
console.log(`nivel ................ ${s.progress?.level}`);
console.log(`totalQuestions ....... ${s.progress?.totalQuestions}`);
console.log(`correctAnswers ....... ${s.progress?.correctAnswers}`);
console.log(`studyMinutes ......... ${s.progress?.studyMinutes}`);
console.log(`generalProgress ...... ${s.progress?.generalProgress}`);
console.log(`matterProgress ....... ${JSON.stringify(s.progress?.matterProgress ?? {})}`);
console.log(`aulas concluidas ..... ${(s.completedLessonIds ?? []).length} -> ${JSON.stringify(s.completedLessonIds ?? [])}`);
console.log(`todayDone ............ ${JSON.stringify(s.todayDone ?? {})}`);
console.log(`studyDates ........... ${JSON.stringify(s.studyDates ?? [])}`);
console.log(`resumeLesson ......... ${s.resumeLesson?.lessonId ?? '(nenhum)'}`);
console.log(`simulados ............ ${(s.simulados ?? []).length}`);
console.log(`chat ................. ${JSON.stringify(s.chat ?? []).slice(0, 120)}`);
console.log(`tema ................. ${s.theme}`);
console.log(`entradas no aiCache .. ${Object.keys(aiCache).length}`);

console.log('\n=== CHAVES DO aiCache (o que o app consulta mesmo) ===');
for (const chave of Object.keys(aiCache)) {
  const p1 = chave.includes('p1-aulas-2026-09-30');
  console.log(`  ${p1 ? 'P1 ' : 'ANT'} | ${chave}`);
}

console.log(`\nBaseline completo em ${ARQ}`);