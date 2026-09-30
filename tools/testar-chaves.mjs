// A chave que o SITE usa (JWT legado) vs a publishable key. Testa se
// cada uma consegue criar sessao anonima e chamar a Edge Function.
import fs from 'node:fs';
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const c = fs.readFileSync('src/lib/supabase.js', 'utf8');
const jwt = c.match(/fallbackAnonKey = '([^']+)'/)[1];
const pub = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';

async function testar(nome, chave) {
  try {
    const r = await fetch(`${BASE}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const corpo = await r.json().catch(() => ({}));
    const token = corpo?.access_token;
    let fn = 'nao testada';
    if (token) {
      const t = await fetch(`${BASE}/functions/v1/tutor-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: chave, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stream: false, messages: [{ role: 'user', content: 'oi' }] }),
      });
      fn = `HTTP ${t.status}`;
    }
    console.log(`${nome.padEnd(16)} signup HTTP ${r.status} | token=${token ? 'sim' : 'NAO'} | erro=${corpo?.error_description || corpo?.msg || corpo?.message || '-'} | function ${fn}`);
  } catch (e) {
    console.log(`${nome.padEnd(16)} EXCEPCAO: ${e.message}`);
  }
}

console.log('=== CHAVE USADA PELO SITE (JWT legado) ===');
await testar('JWT legado', jwt);
console.log('\n=== CHAVE MODERNA (publishable) ===');
await testar('publishable', pub);
