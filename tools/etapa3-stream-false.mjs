// ETAPA 3: request REAL ao endpoint remoto, stream:false, com JWT valido.
import { createClient } from '@supabase/supabase-js';
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const client = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInAnonymously();
if (error) { console.log('sessao falhou:', error.message); process.exit(1); }
const token = data.session.access_token;
console.log('usuario:', data.user.id.slice(0, 8));
console.log('JWT obtido:', token ? 'sim (' + token.length + ' chars)' : 'nao');

const t0 = Date.now();
const res = await fetch(`${BASE}/functions/v1/tutor-chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    stream: false,
    messages: [{ role: 'user', content: 'Explique o que e uma celula de forma simples.' }],
  }),
});
const ms = Date.now() - t0;
const texto = await res.text();
console.log('\n--- RESULTADO stream:false ---');
console.log('HTTP status     :', res.status, res.statusText);
console.log('content-type    :', res.headers.get('content-type'));
console.log('tempo total     :', ms + 'ms');
let json = null;
try { json = JSON.parse(texto); } catch { console.log('corpo nao-JSON  :', texto.slice(0, 300)); }
if (json) {
  console.log('model           :', json.model ?? '(ausente)');
  console.log('conversationId  :', json.conversationId ?? '(ausente)');
  console.log('streaming       :', json.streaming);
  console.log('retries         :', json.retries);
  console.log('erro            :', json.error ?? '(nenhum)');
  console.log('mensagem        :', json.message ?? '(nenhuma)');
  console.log('reply (chars)   :', String(json.reply ?? '').length);
  console.log('reply           :', String(json.reply ?? '').slice(0, 200));
}
