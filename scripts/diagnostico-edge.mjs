// Diagnostico: a funcao esta lendo o secret e alcancando a IA?
// Chama com um payload invalido proposital (sem "topic"): se a funcao
// responder 400 = ela esta viva e a sessao passou. Se responder 503
// ai_not_configured = o secret NVIDIA_API_KEY nao chegou na funcao.
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
const URL_BASE = env.VITE_SUPABASE_URL;
const FN = `${URL_BASE}/functions/v1/generate-lesson`;

const supabase = createClient(URL_BASE, KEY, { auth: { persistSession: false } });
const { data: s } = await supabase.auth.signInAnonymously();
if (!s?.session) { console.log('sem sessao anonima'); process.exit(1); }
const token = s.session.access_token;
console.log(`sessao anonima ok (${s.user.id})\n`);

async function post(body, rotulo) {
  const t0 = Date.now();
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt.slice(0, 200); }
  console.log(`${rotulo}: HTTP ${res.status} em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`   ${JSON.stringify(j).slice(0, 300)}\n`);
  return { status: res.status, j };
}

// 1) Sem token: deve dar 401 (a funcao esta viva).
const semToken = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: '{}' });
console.log(`sem token: HTTP ${semToken.status} (401 = funcao viva e exigindo sessao)\n`);

// 2) Sem subject/topic: 400 esperado.
await post({}, 'sem topico');

// 3) Com subject/topic mas topic invalido para medir o secret sem gerar.
await post({ subject: 'Portugues', topic: 'teste', durationMinutes: 5 }, 'topico curto (deve passar do secret)');
