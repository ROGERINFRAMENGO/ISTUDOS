// ============================================================
// Reproduz localmente o pipeline de geracao com o MESMO prompt do
// deploy, mas mede o que a IA devolve. Usa o token do servidor via
// uma chamada minima que NAO grava nada, so para ver o formato.
// Roda com: node scripts/diagnostico-json.mjs
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const FN = `${env.VITE_SUPABASE_URL}/functions/v1/generate-lesson`;

const supabase = createClient(env.VITE_SUPABASE_URL, KEY, { auth: { persistSession: false } });
const { data: s } = await supabase.auth.signInAnonymously();
if (!s?.session) { console.log('sem sessao'); process.exit(1); }
const token = s.session.access_token;

const input = {
  curriculumVersion: 'diag-json', subject: 'Português', topic: 'informação explícita',
  subtopics: ['informação explícita', 'informação implícita', 'compreensão', 'interpretação'],
  objectives: ['Distinguir informação explícita de implícita.'],
  week: 1, day: 2, dateKey: '2099-01-03', block: 1, blockCount: 2, force: true,
  phase: 'base', phaseLabel: 'Base', dayTotalMinutes: 120, dayBreakMinutes: 10, weekday: 'Ter',
  durationMinutes: 55, studentLevel: 'Fundamental II', kind: 'lesson',
};

const t0 = Date.now();
const res = await fetch(FN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
  body: JSON.stringify(input),
});
const ms = (Date.now() - t0) / 1000;
const txt = await res.text();
let j; try { j = JSON.parse(txt); } catch { j = txt; }

console.log(`HTTP ${res.status} em ${ms.toFixed(1)}s`);
if (j && j.lesson) {
  const l = j.lesson;
  console.log(`SUCESSO: ${l.sections?.length} secoes, ${l.guidedPractice?.length} exercicios`);
  fs.writeFileSync(path.join(raiz, 'scripts/.aula-diag.json'), JSON.stringify(j, null, 2));
} else {
  console.log(`ERRO: ${JSON.stringify(j).slice(0, 200)}`);
}
