// Isola a causa do timeout: mesmo dia, mesmo modelo, so mudando o
// tamanho do pedido. Mede a latencia de cada variacao.
// Roda com: node scripts/medir-latencia.mjs
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

async function medir(rotulo, body) {
  const t0 = Date.now();
  process.stdout.write(`${rotulo} ... `);
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt.slice(0, 110); }
  const s2 = (ms / 1000).toFixed(1);
  if (res.status === 200) {
    const l = j.lesson ?? {};
    console.log(`HTTP 200 em ${s2}s | secoes=${(l.sections ?? []).length} palavras=${JSON.stringify(l).split(/\s+/).length} chars=${JSON.stringify(l).length}`);
  } else {
    console.log(`HTTP ${res.status} em ${s2}s | ${JSON.stringify(j).slice(0, 110)}`);
  }
  return { status: res.status, ms, j };
}

const base = (extra) => ({
  subject: 'Português', topic: 'informação explícita',
  subtopics: ['informação explícita', 'informação implícita', 'compreensão', 'interpretação'],
  durationMinutes: 55, studentLevel: 'Fundamental II',
  week: 1, day: 2, dateKey: '2099-01-02', block: 1, blockCount: 2, force: true,
  ...extra,
});

// A) Real, mas com objetivo CORTO (sem o weekGoal gigante repetido).
const rA = await medir('A) 4 subtopicos + objetivo curto', base({
  curriculumVersion: 'lat-a', objectives: ['Distinguir informação explícita de implícita.'],
  phase: 'base', phaseLabel: 'Base', dayTotalMinutes: 120, dayBreakMinutes: 10, weekday: 'Ter', kind: 'lesson',
}));

// B) Mesmo conteudo, mas o topic/subtopicos reduzidos (menos texto a gerar).
const rB = await medir('B) 1 subtopico (conteudo menor)', base({
  curriculumVersion: 'lat-b', topic: 'compreensão', subtopics: ['compreensão'],
  objectives: ['Compreender o texto.'],
  phase: 'base', phaseLabel: 'Base', dayTotalMinutes: 120, dayBreakMinutes: 10, weekday: 'Ter', kind: 'lesson',
}));

console.log(`\nresumo: A=${(rA.ms / 1000).toFixed(1)}s (HTTP ${rA.status})  B=${(rB.ms / 1000).toFixed(1)}s (HTTP ${rB.status})`);

