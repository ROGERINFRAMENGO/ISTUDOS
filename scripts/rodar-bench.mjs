// Roda o benchmark pela Edge Function ai-bench (usa o secret do servidor).
// Uso: node scripts/rodar-bench.mjs --case=portugues --repeats=3 [--model=...]
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
const FN = `${env.VITE_SUPABASE_URL}/functions/v1/ai-bench`;

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};
const caso = arg('case', 'portugues');
const repeats = Number(arg('repeats', '1'));
const model = arg('model', '');

const supabase = createClient(env.VITE_SUPABASE_URL, KEY, { auth: { persistSession: false } });
const { data: s, error } = await supabase.auth.signInAnonymously();
if (error || !s?.session) { console.log(`sessao falhou: ${error?.message}`); process.exit(1); }

const body = { case: caso, repeats };
if (model) body.models = [model];
// v2 do bench: "auto" deixa supportsJsonMode() decidir (como a producao).
body.jsonMode = process.argv.includes('--no-json-mode') ? false : 'auto';
if (process.argv.includes('--no-probe')) body.probe = false;
if (process.argv.includes('--reasoning-low')) body.reasoning = 'low';
const mt = process.argv.find((a) => a.startsWith('--max-tokens='));
if (mt) body.maxTokens = Number(mt.split('=')[1]);

console.log(`bench: caso=${caso} repeats=${repeats}${model ? ` model=${model}` : ' (todos)'}\n`);
const t0 = Date.now();
const res = await fetch(FN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${s.session.access_token}` },
  body: JSON.stringify(body),
});
const j = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status} em ${((Date.now() - t0) / 1000).toFixed(1)}s | prompt=${j.promptChars ?? '?'} chars\n`);

if (!Array.isArray(j.results)) { console.log(JSON.stringify(j).slice(0, 300)); process.exit(1); }

const salvo = path.join(raiz, `scripts/.bench-${caso}${model ? '-' + model.replace(/[^a-z0-9]/gi, '_') : ''}.json`);
fs.writeFileSync(salvo, JSON.stringify(j, null, 2));

j.results.forEach((r) => {
  if (r.probeJsonMode) {
    console.log(`   json_mode: ${r.probeJsonMode.suporta ? 'SUPORTA' : 'nao suporta'} - ${r.probeJsonMode.detail}`);
  }
  if (r.error) {
    console.log(`[FALHOU] ${r.model} (t${r.attempt}): ${r.error} - ${String(r.detail).slice(0, 160)}`);
    if (r.stack) console.log(`   pilha: ${r.stack}`);
    return;
  }
  const c = r.counts ?? {};
  console.log(`${r.validateOk ? '[OK]    ' : '[AVISO] '} ${r.model} (t${r.attempt}): ${(r.totalMs / 1000).toFixed(1)}s | json=${r.jsonOk} | validate=${r.validateOk}`);
  console.log(`   tokens=${r.completionTokens} | finish=${r.finishReason} | jsonMode=${r.usedJsonMode} | ${c.chars} chars / ${c.words} palavras`);
  console.log(`   obj=${c.objectives} sec=${c.sections} exe=${c.guidedPractice} erros=${c.commonMistakes} res=${c.summary}`);
  if (r.quality) {
    const q = r.quality;
    const problemas = ['placeholders', 'inventou_nota', 'delegou_pesquisa', 'markdown', 'html'].filter((k) => q[k] === true);
    const ruins = ['com_exemplo', 'exercicio_completo', 'resposta_explicada'].filter((k) => q[k] === false);
    console.log(`   qualidade: subtopicos=${q.subtopicos} acentos=${q.acentos_ok}` +
      (problemas.length ? ` | ALERTA: ${problemas.join(',')}` : '') +
      (ruins.length ? ` | FALHA: ${ruins.join(',')}` : ''));
  }
  if (!r.validateOk) console.log(`   erros: ${(r.validateErrors || []).join(' | ').slice(0, 220)}`);
});
