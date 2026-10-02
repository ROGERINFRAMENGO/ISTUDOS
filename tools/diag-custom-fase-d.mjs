// Diagnostico: por que a aula personalizada falha na validacao.
// Uma unica chamada, so para LER os erros do validador.
//
//   node tools/diag-custom-fase-d.mjs
import fs from 'node:fs';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const { createClient } = await import('@supabase/supabase-js');
const c = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data } = await c.auth.signInAnonymously();

const REQUEST = process.argv[2] || 'Cria uma aula sobre fotossintese como se eu tivesse 10 anos, usando exemplos do Minecraft e explicando as palavras dificeis. Explica devagar e mostra o passo a passo, termina com exercicios faceis.';

const r = await fetch(`${BASE}/functions/v1/generate-lesson`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${data.session.access_token}`, Origin: 'https://rogerinframengo.github.io' },
  body: JSON.stringify({ custom: true, request: REQUEST }),
});
const j = await r.json();
console.log(`HTTP ${r.status} | error=${j.error ?? '-'} | kind=${j.kind ?? '-'}`);
if (j.lesson) {
  console.log('titulo:', j.lesson.title);
  fs.writeFileSync('.tmp-bench/fase-d/ultima.json', JSON.stringify(j, null, 2), 'utf8');
} else {
  console.log('mensagem:', j.message);
  (j.errors ?? []).forEach((e) => console.log('  -', e));
}
