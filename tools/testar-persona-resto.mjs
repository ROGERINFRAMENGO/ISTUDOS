// Continua a avaliacao da persona nos cenarios 7 a 12.
// Complementa tools/testar-persona.mjs, que as vezes e interrompido
// pelo rate limit do provider no meio da bateria.
//
// Uso: node tools/testar-persona-resto.mjs
// ============================================================

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;
const MARKDOWN = /\*\*|^#{1,3} |\\frac|^\s*-\s/m;

const CENARIOS = [
  { r: '7. ajuda sem dar a resposta', m: [{ role: 'user', content: 'Me ajuda sem dar a resposta. Quanto e 3/4 + 1/8?' }] },
  { r: '8. Acertei!', m: [
    { role: 'user', content: 'Quanto e 3/4 + 1/8?' },
    { role: 'assistant', content: 'Coloca as duas com denominador 8. E 6/8 + 1/8 = ?' },
    { role: 'user', content: 'Acertei!' },
  ] },
  { r: '9. nao entendi ainda', m: [
    { role: 'user', content: 'O que e mitocondria?' },
    { role: 'assistant', content: 'E uma parte da celula que produz energia.' },
    { role: 'user', content: 'Nao consegui entender ainda.' },
  ] },
  { r: '11. Pergunta SIMPLES', m: [{ role: 'user', content: 'O que significa explicito?' }] },
  { r: '12. Pergunta COMPLEXA', m: [{ role: 'user', content: 'Qual a diferenca entre compreensao e interpretacao?' }] },
  { r: '10. Contextual na aula', m: [{ role: 'user', content: 'O que e uma fracao?' }] },
];

// Pega so os cenarios pedidos: node tools/testar-persona-resto.mjs 9
const SO = process.argv[2] ? Number(process.argv[2]) : null;
const ALVO = SO ? CENARIOS.filter((x) => x.r.startsWith(String(SO))) : CENARIOS;

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data } = await cliente.auth.signInAnonymously();
const token = data.session.access_token;
console.log('sessao anonima ok\n');

for (const x of ALVO) {
  // Pausa: sem ela o provider devolve 502 por rate limit em rajada.
  await new Promise((s) => setTimeout(s, 6000));
  const t0 = Date.now();
  const r = await fetch(`${BASE}/functions/v1/tutor-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}`, Origin: 'https://rogerinframengo.github.io' },
    body: JSON.stringify({ stream: false, messages: x.m, context: { student: { name: 'Anna' } } }),
  });
  const bruto = await r.text();
  if (!r.ok) {
    let erro = String(r.status);
    try { erro += ' ' + (JSON.parse(bruto).error ?? ''); } catch { /* nao-JSON */ }
    console.log(`### ${x.r} | ERRO HTTP ${erro}`);
    continue;
  }
  const rep = JSON.parse(bruto).reply;
  const em = (rep.match(EMOJI) || []).length;
  const nome = (rep.match(/Anna/gi) || []).length;
  const md = MARKDOWN.test(rep);
  console.log(`### ${x.r} | ${Date.now() - t0}ms | nome=${nome} emojis=${em} chars=${rep.length} markdown=${md}`);
  console.log(rep.replace(/\n/g, ' ').slice(0, 320));
  console.log('');
}