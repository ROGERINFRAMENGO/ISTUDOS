// Gera a aula de um bloco REAL forcando um modelo especifico.
// Como usa uma dataVersion diferente, nunca pega o cache da aula real.
// Uso: node scripts/testar-modelo-função.mjs [modelo]
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

const model = process.argv.slice(2).find((a) => a.startsWith('google/') || a.startsWith('meta/') || a.startsWith('nvidia/')) || '';
const noFallback = process.argv.slice(2).includes('--no-fallback');
const versao = process.argv.slice(2).find((a) => /^v\d+$/.test(a)) || `m${Date.now().toString(36).slice(-5)}`;

const supabase = createClient(env.VITE_SUPABASE_URL, KEY, { auth: { persistSession: false } });
const { data: s, error } = await supabase.auth.signInAnonymously();
if (error || !s?.session) { console.log(`sessao falhou: ${error?.message}`); process.exit(1); }

// Payload do cronograma (29/09, Bloco 1) com versao de cache unica.
const body = {
  curriculumVersion: versao,
  week: 1, weekTitle: 'Semana 1',
  weekGoal: process.argv.includes('--sem-goal')
    ? ''
    : 'Construir a base: ler uma questão, entender o pedido, separar os dados e tentar resolver. Matemática e Português como pilares; Ciências, História e Inglês entrando de forma recorrente.',
  day: 2, dateKey: '2026-09-29', weekday: 'Ter 29/09',
  phase: 'base', phaseLabel: 'Base — fundamentos de Matemática, Português, Ciências, História e Inglês',
  block: 1, blockCount: 2, blockLabel: 'Bloco 1 de 2',
  breakAfterMinutes: 10, dayBreakMinutes: 10, dayTotalMinutes: 120,
  kind: 'lesson', subject: 'Português', topic: 'informação explícita',
  subtopics: ['informação explícita', 'informação implícita', 'compreensão', 'interpretação'],
  objectives: ['Português: informação explícita; informação implícita; compreensão; interpretação'],
  durationMinutes: 55, studentLevel: 'Fundamental II',
  studentPerformance: {}, force: false,
};
if (model) body.forceModel = model;
if (noFallback) body.noFallback = true;

console.log(`modelo forcado: ${model || '(padrao = principal + fallback)'}`);
if (noFallback) console.log('fallback: DESATIVADO (so o principal)');
console.log(`versao de cache: ${versao}\n`);

const t0 = Date.now();
const res = await fetch(FN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${s.session.access_token}` },
  body: JSON.stringify(body),
});
const ms = ((Date.now() - t0) / 1000).toFixed(1);
const j = await res.json().catch(() => ({}));

console.log(`HTTP ${res.status} em ${ms}s`);
if (res.status !== 200) {
  const extra = j.debug ? `\n\n--- DEBUG (ultimos chars da resposta do modelo) ---\n${j.debug}` : '';
  console.log('corpo bruto:', JSON.stringify(j).slice(0, 400) + extra);
  process.exit(1);
}

const l = j.lesson ?? {};
console.log(`modelo usado : ${j.model}`);
console.log(`cached       : ${j.cached}`);
console.log(`id salvo     : ${j.id ?? '(nao salvo)'}`);
console.log(`titulo       : ${l.title}`);
console.log(`minutos      : ${l.estimatedMinutes}`);
console.log(`secoes       : ${(l.sections ?? []).length}`);
(l.sections ?? []).forEach((x, i) => console.log(`   ${i + 1}. ${x.title} (${(x.explanation ?? '').length} chars, ${(x.examples ?? []).length} ex)`));
console.log(`objetivos    : ${(l.objectives ?? []).length}`);
console.log(`pratica      : ${(l.guidedPractice ?? []).length}`);
console.log(`erros comuns : ${(l.commonMistakes ?? []).length}`);
console.log(`resumo       : ${(l.summary ?? []).length}`);

const t = JSON.stringify(l);
const subs = ['compreensão', 'interpretação', 'explícita', 'implícita'];
const faltando = subs.filter((x) => !t.toLowerCase().includes(x.toLowerCase()));
console.log(`\nqualidade:`);
console.log(`   palavras      : ${t.split(/\s+/).length}`);
console.log(`   4 subtopicos  : ${faltando.length ? `faltando ${faltando.join(', ')}` : 'todos presentes'}`);
console.log(`   HTML          : ${/<\s*\/?\s*(div|span|p|br|img)\b/i.test(t)}`);
console.log(`   JSX/CSS       : ${/<[A-Z][A-Za-z]*\s*\/?>|[.#][a-z-]+\s*\{[^}]*:[^}]*;/.test(t)}`);
console.log(`   markdown      : ${/\*\*|^#{1,6}\s/m.test(t)}`);

// Limpa o registro deste teste (nao suja as aulas reais).
if (j.id) {
  await supabase.from('generated_lessons').delete().eq('id', j.id);
  console.log(`\nregistro de teste removido (${j.id})`);
}

