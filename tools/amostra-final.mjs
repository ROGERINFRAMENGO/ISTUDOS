// Amostra de 5 materias diferentes, um tema cada (secao 6 da
// finalizacao). Confirma qualidade antes de iniciar o lote.
//
//   node tools/amostra-final.mjs
import fs from 'node:fs';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const DIR = '.tmp-bench/final';
fs.mkdirSync(DIR, { recursive: true });

const ALVOS = [
  { week: 2, day: 1, dateKey: '2026-10-05', block: 2, subject: 'Português', topic: 'gênero textual', subtopics: ['gênero textual'] },
  { week: 2, day: 2, dateKey: '2026-10-06', block: 1, subject: 'Ciências', topic: 'fotossíntese e respiração celular', subtopics: ['fotossíntese'] },
  { week: 2, day: 3, dateKey: '2026-10-07', block: 1, subject: 'História', topic: 'Revolução Industrial', subtopics: ['Revolução Industrial'] },
  { week: 2, day: 4, dateKey: '2026-10-08', block: 2, subject: 'Matemática', topic: 'razões e proporções', subtopics: ['razões e proporções'] },
  { week: 2, day: 5, dateKey: '2026-10-09', block: 1, subject: 'Geografia', topic: 'urbanização e全球化', subtopics: ['urbanização'] },
];
ALVOS[4].topic = 'urbanização e crescimento das cidades';
ALVOS[4].subtopics = ['urbanização'];

const { createClient } = await import('@supabase/supabase-js');
async function sessao() {
  for (let t = 0; t < 4; t += 1) {
    const c = createClient(BASE, KEY, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInAnonymously();
    if (data?.session?.access_token) return data.session.access_token;
    console.error(`  sessao falhou (tentativa ${t + 1}): ${error?.message}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  process.exit(1);
}
const token = await sessao();
const H = { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}`, Origin: 'https://rogerinframengo.github.io' };

let ok = 0; let falhou = 0;
for (const a of ALVOS) {
  const t0 = Date.now();
  let j = null; let status = 0;
  try {
    const r = await fetch(`${BASE}/functions/v1/generate-lesson`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ curriculumVersion: 'v2', week: a.week, day: a.day, dateKey: a.dateKey, block: a.block, subject: a.subject, topic: a.topic, subtopics: a.subtopics }),
    });
    status = r.status;
    j = await r.json();
  } catch (e) { j = { error: String(e?.message ?? e) }; }

  const ms = Date.now() - t0;
  if (j?.lesson) {
    ok += 1;
    const L = j.lesson;
    console.log(`OK    ${a.subject.padEnd(12)} ${String(ms).padStart(7)}ms  ${j.model}`);
    console.log(`      ${L.title}`);
    console.log(`      secoes=${L.sections.length} exerc=${L.guidedPractice.length} resumo=${L.summary.length} erros=${L.commonMistakes.length}`);
    console.log(`      respostas: ${L.guidedPractice.map((g) => g.answer).join(' / ').slice(0, 78)}`);
    fs.writeFileSync(`${DIR}/${a.week}-${a.day}-${a.block}.json`, JSON.stringify(j, null, 2), 'utf8');
  } else {
    falhou += 1;
    console.log(`FALHA ${a.subject.padEnd(12)} ${String(ms).padStart(7)}ms  HTTP ${status} ${j?.error ?? ''}`);
  }
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(`\n  amostra: ${ok} ok, ${falhou} falhas de ${ALVOS.length}`);