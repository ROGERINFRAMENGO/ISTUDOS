// Roda rodadas individuais (1 modelo x 1 repeticao por chamada) para nunca
// estourar o limite de 150s, e consolida as metricas por modelo.
// Uso: node scripts/rodar-fase1.mjs [--casos=portugues,ciencias] [--rodadas=3]
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

const MODELOS = [
  { id: 'meta/muse-glimmer-30b', jsonMode: true },
  { id: 'google/diffusiongemma-26b-a4b-it', jsonMode: false },
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', jsonMode: true },
];
const CASOS = arg('casos', 'portugues,ciencias').split(',');
const RODADAS = Number(arg('rodadas', '3'));

const supabase = createClient(env.VITE_SUPABASE_URL, KEY, { auth: { persistSession: false } });
const { data: s } = await supabase.auth.signInAnonymously();
if (!s?.session) { console.log('sem sessao anonima'); process.exit(1); }
const token = s.session.access_token;

const dados = [];
for (const caso of CASOS) {
  for (const m of MODELOS) {
    for (let rodada = 1; rodada <= RODADAS; rodada += 1) {
      const body = { case: caso, repeats: 1, model: m.id, jsonMode: m.jsonMode };
      const t0 = Date.now();
      let j = {};
      try {
        const res = await fetch(FN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        j = await res.json().catch(() => ({}));
        if (!Array.isArray(j.results)) { console.log(`  gateway ${res.status} em ${((Date.now() - t0) / 1000).toFixed(0)}s`); continue; }
      } catch (e) {
        console.log(`  erro de rede: ${e.message}`);
        continue;
      }
      const r = j.results[0];
      if (!r) continue;
      dados.push({ caso, modelo: m.id, rodada, ...r });
      const ok = r.error ? `ERRO ${r.error}` : `${(r.requestMs / 1000).toFixed(1)}s json=${r.jsonOk} validate=${r.validateOk}`;
      console.log(`${caso} | ${m.id.split('/').pop()} | r${rodada} | ${ok}`);
    }
  }
}

const salvo = path.join(raiz, 'scripts/.fase1-resultados.json');
fs.writeFileSync(salvo, JSON.stringify(dados, null, 2));
console.log(`\n${dados.length} amostras salvas em ${salvo}`);

// ------- resumo -------
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
console.log('\n=== RESUMO (so geracoes reais, sem cache) ===');
for (const m of MODELOS) {
  const porCaso = {};
  for (const c of CASOS) {
    const rs = dados.filter((d) => d.modelo === m.id && d.caso === c && !d.error);
    const todos = dados.filter((d) => d.modelo === m.id && d.caso === c);
    if (!todos.length) { porCaso[c] = 'sem amostras'; continue; }
    const tempos = rs.map((r) => r.requestMs / 1000);
    const jsonOk = rs.filter((r) => r.jsonOk).length;
    const valOk = rs.filter((r) => r.validateOk).length;
    const erros = todos.length - rs.length;
    const tokens = rs.filter((r) => r.completionTokens).map((r) => r.completionTokens);
    const chars = rs.filter((r) => r.counts).map((r) => r.counts.chars);
    porCaso[c] = {
      n: todos.length, erros,
      media_s: tempos.length ? media(tempos).toFixed(1) : 'n/a',
      min_s: tempos.length ? Math.min(...tempos).toFixed(1) : 'n/a',
      max_s: tempos.length ? Math.max(...tempos).toFixed(1) : 'n/a',
      json_ok: `${jsonOk}/${rs.length}`,
      validate_ok: `${valOk}/${rs.length}`,
      tokens_medio: tokens.length ? Math.round(media(tokens)) : 'n/a',
      chars_medio: chars.length ? Math.round(media(chars)) : 'n/a',
    };
  }
  console.log(`\n${m.id}`);
  for (const [c, v] of Object.entries(porCaso)) console.log(`  ${c}:`, JSON.stringify(v));
}
