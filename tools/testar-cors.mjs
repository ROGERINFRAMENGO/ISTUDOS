// CORS visto pelo NAVEGADOR: os headers que o preflight devolve para a
// origem real do GitHub Pages. Sem o header correto, o fetch do browser
// falha antes mesmo de a Edge Function ver a requisicao.
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const ORIGEM = 'https://rogerinframengo.github.io';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';

console.log('=== PREFLIGHT (OPTIONS) que o browser faz antes do POST ===');
const r = await fetch(`${BASE}/functions/v1/tutor-chat`, {
  method: 'OPTIONS',
  headers: {
    Origin: ORIGEM,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,x-client-info,apikey,content-type',
  },
});
console.log('HTTP', r.status);
for (const h of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-max-age']) {
  console.log(`  ${h}: ${r.headers.get(h)}`);
}

console.log('\n=== POST com Origin (o que o browser realmente envia) ===');
const { data } = await (await import('@supabase/supabase-js')).createClient(BASE, KEY, { auth: { persistSession: false } }).auth.signInAnonymously();
const p = await fetch(`${BASE}/functions/v1/tutor-chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${data.session.access_token}`, Origin: ORIGEM },
  body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'Explique o que e uma celula de forma simples.' }] }),
});
console.log('HTTP', p.status, '| content-type:', p.headers.get('content-type'));
const acao = p.headers.get('access-control-allow-origin');
console.log('  access-control-allow-origin:', acao);
console.log(' 筆 credenciais/acao necessaria?', acao === ORIGEM ? 'nao (aceito direto)' : 'SIM - pode falhar no browser');
const t = await p.text();
console.log('  eventos recebidos:', (t.match(/event: \w+/g) || []).slice(0, 3).join(','), '... total', (t.match(/event: \w+/g) || []).length);
