// ============================================================
// TESTE DE CORS: e o navegador tem permissao de chamar a Edge?
// ------------------------------------------------------------
// O Node (curl/fetch) ignora CORS. O NAVEGADOR nao. Se o
// preflight ou o POST vierem sem o Access-Control-Allow-Origin
// correto, o fetch morre com "TypeError: Failed to fetch" e o
// chat trava em "Respondendo..." - com HTTP 200 perfeito no log
// do servidor, porque a requisicao nunca chegou a sair do site.
//
// Simula a origem REAL do GitHub Pages e tambem localhost.
//
// Uso: node tools/testar-cors-site.mjs
// ============================================================

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const URL_TUTOR = `${BASE}/functions/v1/tutor-chat`;

const ORIGENS = [
  'https://rogerinframengo.github.io',   // site publicado
  'http://localhost:5173',              // dev local (Vite)
];

/** Headers de CORS que a resposta devolveu. */
function cors(res) {
  const h = res.headers;
  return {
    allowOrigin: h.get('access-control-allow-origin'),
    allowCredentials: h.get('access-control-allow-credentials'),
    allowHeaders: h.get('access-control-allow-headers'),
    allowMethods: h.get('access-control-allow-methods'),
    vary: h.get('vary'),
  };
}

// ---- 1) preflight (OPTIONS), que o browser faz antes do POST ---
console.log('=== 1) PREFLIGHT (OPTIONS) ===');
for (const origin of ORIGENS) {
  const res = await fetch(URL_TUTOR, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,apikey,content-type',
    },
  });
  const c = cors(res);
  const ok = c.allowOrigin === origin || c.allowOrigin === '*';
  console.log(`  ${origin}`);
  console.log(`    HTTP ${res.status} | allow-origin=${c.allowOrigin} ${ok ? 'OK' : '<-- BLOQUEADO'}`);
  console.log(`    allow-headers=${c.allowHeaders} | allow-methods=${c.allowMethods}`);
}

// ---- 2) POST com Origin, como o browser envia ---------------
console.log('\n=== 2) POST (stream:false, resposta curta) ===');
const { createClient } = await import('@supabase/supabase-js');
const client = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInAnonymously();
if (error || !data?.session) {
  console.log('  NAO CONSEGUI abrir sessao anonima:', error?.message ?? 'sem token');
  process.exit(1);
}
const token = data.session.access_token;

for (const origin of ORIGENS) {
  const t0 = Date.now();
  const res = await fetch(URL_TUTOR, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      Origin: origin,
    },
    body: JSON.stringify({
      stream: false,
      messages: [{ role: 'user', content: 'Explique o que e uma celula de forma simples.' }],
    }),
  });
  const c = cors(res);
  const texto = await res.text();
  let reply = '';
  try { reply = JSON.parse(texto).reply ?? ''; } catch { /* nao-JSON */ }
  console.log(`  ${origin}`);
  console.log(`    HTTP ${res.status} | ct=${res.headers.get('content-type')} | ${Date.now() - t0}ms`);
  console.log(`    allow-origin=${c.allowOrigin} ${c.allowOrigin === origin ? 'OK' : '<-- O NAVEGADOR BLOQUEIA'}`);
  console.log(`    reply: ${reply ? `"${reply.slice(0, 70)}..."` : '(vazio)'}`);
}

console.log('\nComo ler:');
console.log('  allow-origin=<a origem>  -> o browser ACEITA a resposta');
console.log('  allow-origin ausente/diferente -> o browser joga fora e o chat trava');