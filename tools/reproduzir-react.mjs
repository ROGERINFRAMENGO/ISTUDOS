// Reproduz o fluxo do React do TutorChat (onDelta + onDone) com um SSE
// REAL gravado da Edge Function, para ver se a mensagem sobrevive ate a
// tela. Nao importa nada do frontend: e o mesmo passo a passo do
// handleSend, com os mesmos handlers.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const client = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data } = await client.auth.signInAnonymously();
const token = data.session.access_token;

// 1) Chamada real, guardando os bytes crus do SSE.
const res = await fetch(`${BASE}/functions/v1/tutor-chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    stream: true,
    messages: [{ role: 'user', content: 'Explique o que e uma celula de forma simples.' }],
  }),
});
const bruto = await res.text();
fs.writeFileSync('tools/.sse-capturado.txt', bruto);
console.log(`SSE capturado: ${bruto.length} bytes, ${(bruto.match(/event:/g) || []).length} eventos\n`);

// 2) Estado inicial, como o React comecaria apos handleSend.
let messages = [{ role: 'user', content: 'Explique o que e uma celula de forma simples.', at: 1000 }];
let status = 'generating';
let streamText = '';
const idProvisoria = 'parcial-2000';

// 3) O MESMO parser de src/services/ai.js.
let buffer = '';
let evento = null;
let acumulado = '';
let encerrou = false;
let primeiroToken = null;
let recebeuAlgo = false;
const eventosVistos = [];

for (const bloco of bruto.split('\n\n')) {
  if (encerrou) break;
  if (!bloco.trim()) continue;
  const linhas = bloco.split('\n');
  for (const linha of linhas) {
    const limpa = linha.trim();
    if (limpa.startsWith('event:')) { evento = limpa.slice(6).trim(); continue; }
    if (!limpa.startsWith('data:')) continue;
    let dados;
    try { dados = JSON.parse(limpa.slice(5).trim()); } catch { continue; }
    eventosVistos.push(evento);

    if (evento === 'start') {
      status = 'streaming';
    } else if (evento === 'delta') {
      if (!recebeuAlgo) primeiroToken = true;
      recebeuAlgo = true;
      status = 'streaming';
      acumulado += dados.text ?? '';
      // onDelta: cria/atualiza a mensagem provisoria
      streamText = acumulado;
      const existe = messages.some((m) => m.id === idProvisoria);
      messages = existe
        ? messages.map((m) => (m.id === idProvisoria ? { ...m, content: acumulado } : m))
        : [...messages, { id: idProvisoria, role: 'assistant', content: acumulado, at: 2000 }];
    } else if (evento === 'done') {
      encerrou = true;
      // onDone: RECONCILIA com o texto completo do done
      const final = dados?.reply ?? streamText;
      const existe = messages.some((m) => m.id === idProvisoria);
      const base = existe
        ? messages.map((m) => (m.id === idProvisoria ? { ...m, content: final } : m))
        : [...messages, { id: idProvisoria, role: 'assistant', content: final, at: 2000 }];
      messages = base.map((m) =>
        m.id === idProvisoria ? { ...m, id: undefined, streaming: false, model: dados?.model } : m,
      );
      streamText = '';
      status = 'idle';
    }
  }
}

console.log('=== ESTADO APOS O FLUXO ===');
console.log('eventos vistos    :', eventosVistos.slice(0, 4).join(','), '... total', eventosVistos.length);
console.log('deltas aplicados  :', eventosVistos.filter((e) => e === 'delta').length);
console.log('primeiro token    :', primeiroToken ? 'sim' : 'nao');
console.log('status final      :', status);
console.log('mensagens no estado:', messages.length);
messages.forEach((m, i) => {
  const tamanho = String(m.content ?? '').length;
  console.log(`  [${i}] role=${m.role} id=${m.id ?? '(sem id)'} streaming=${m.streaming ?? false} chars=${tamanho}`);
  if (m.role === 'assistant') {
    console.log(`      conteudo: "${String(m.content).slice(0, 120)}"`);
  }
});

const resposta = messages.find((m) => m.role === 'assistant');
const visivel = Boolean(resposta && String(resposta.content ?? '').trim());
console.log('\nA RESPOSTA APARECERIA NA TELA?', visivel ? 'SIM' : 'NAO');
console.log('status travado em generating/streaming?', ['generating', 'streaming'].includes(status) ? 'SIM (BUG)' : 'nao');
