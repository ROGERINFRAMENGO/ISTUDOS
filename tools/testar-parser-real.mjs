// Testa o parser do frontend (src/services/ai.js) contra o SSE REAL
// gravado da Edge Function, exatamente como o navegador receberia.
// Reproduz o fluxo completo: leitura por pedaco de rede, descodificacao,
// split por \n\n, e o break do done.
//
// Uso: node tools/testar-parser-real.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Se existe captura anterior, usa. Senao faz um request real.
let bruto = null;
try {
  bruto = fs.readFileSync(path.join(raiz, 'tools/.sse-capturado.txt'), 'utf8');
  console.log('usando a captura gravada');
} catch {
  console.log('captura ausente, fazendo request real...');
  const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
  const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
  const client = createClient(BASE, KEY, { auth: { persistSession: false } });
  const { data } = await client.auth.signInAnonymously();
  const res = await fetch(`${BASE}/functions/v1/tutor-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({
      stream: true,
      messages: [{ role: 'user', content: 'Explique o que e uma celula de forma simples.' }],
    }),
  });
  bruto = await res.text();
  fs.writeFileSync(path.join(raiz, 'tools/.sse-capturado.txt'), bruto);
}

console.log(`SSE: ${bruto.length} bytes, ${(bruto.match(/event: /g) || []).length} eventos`);
console.log(`eventos: ${[...new Set((bruto.match(/event: \w+/g) || []))].join(', ')}`);

const esperado = (() => {
  const m = bruto.match(/event: done\ndata: (.+)/);
  if (!m) return '';
  try { return JSON.parse(m[1]).reply ?? ''; } catch { return ''; }
})();
console.log(`reply do done: ${esperado.length} chars\n`);

const src = fs.readFileSync(path.join(raiz, 'src/services/ai.js'), 'utf8');
const trataResto = /processarBuffer|finalizarBuffer|drenar/.test(src.slice(src.indexOf('export async function streamTutor')));
console.log(`parser trata o buffer final? ${trataResto ? 'SIM' : 'NAO'}`);

/** Simula o navegador: cada leitura de rede vira um chunk. */
function rodar(leituras) {
  const decoder = new TextDecoder();
  let buffer = '';
  let evento = null;
  let acumulado = '';
  let encerrou = false;
  let status = 'generating';
  const recebidos = [];
  const updates = [];

  for (const bytes of leituras) {
    if (encerrou) break;
    buffer += decoder.decode(bytes, { stream: true });
    const blocos = buffer.split('\n\n');
    buffer = blocos.pop() ?? '';
    for (const bloco of blocos) {
      for (const linha of bloco.split('\n')) {
        const limpa = linha.trim();
        if (limpa.startsWith('event:')) { evento = limpa.slice(6).trim(); continue; }
        if (!limpa.startsWith('data:')) continue;
        let dados;
        try { dados = JSON.parse(limpa.slice(5).trim()); } catch { continue; }
        recebidos.push(evento);
        if (evento === 'start') { status = 'streaming'; updates.push('start'); }
        else if (evento === 'delta') { acumulado += dados.text ?? ''; updates.push(acumulado); }
        else if (evento === 'done') { encerrou = true; status = 'idle'; updates.push(`DONE:${dados.reply?.length ?? 0}`); break; }
      }
    }
  }
  return { recebidos, acumulado, sobrou: buffer, status, updates };
}

const bytes = new TextEncoder().encode(bruto);
const cenarios = [
  { nome: 'TUDO em UMA leitura (o Node fazia assim)', cortes: [] },
  { nome: 'TUDO em LEITURAS de 1 byte (pior caso: proxy cortando tudo)', cortes: [1] },
  { nome: 'LEITURAS de 7 bytes (corteAlignment maluca)', cortes: [7] },
  { nome: 'LEITURAS de 64 bytes', cortes: [64] },
  { nome: 'LEITURAS de 150 bytes (semelhante ao navegador)', cortes: [150] },
];

let falhas = 0;
for (const c of cenarios) {
  const leituras = [];
  if (c.cortes.length === 0) {
    leituras.push(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += c.cortes[0]) leituras.push(bytes.slice(i, i + c.cortes[0]));
  }
  const r = rodar(leituras);
  const texto = r.acumulado || (r.recebidos.includes('done') ? esperado : '');
  const ok = r.recebidos.includes('done') && texto.trim().length > 0;
  if (!ok) falhas += 1;
  console.log(`${ok ? '[OK]   ' : '[FALHA]'} ${c.nome}`);
  console.log(`        leituras=${leituras.length} eventos=${r.recebidos.length} deltas=${r.recebidos.filter((e) => e === 'delta').length} chars=${texto.length} status=${r.status} sobrou=${r.sobrou.length}`);
}

console.log(`\ncenarios com falha: ${falhas}/${cenarios.length}`);
process.exit(falhas === 0 ? 0 : 1);
