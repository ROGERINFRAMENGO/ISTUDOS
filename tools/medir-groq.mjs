// Medicao de latencia REAL do Tutor (FASE 10): 5 perguntas, com
// primeiro token, tempo total, retries e eventos de streaming.
// Nao conta cache: cada pergunta vai para uma sessao nova quando
// preciso, e nenhuma resposta e reaproveitada.
// Uso: node tools/medir-groq.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const FN = `${BASE}/functions/v1/tutor-chat`;

const PERGUNTAS = [
  { nome: 'celula', texto: 'O que e uma celula?' },
  { nome: 'compreensao x interpretacao', texto: 'Qual a diferenca entre compreensao e interpretacao?' },
  { nome: 'DNA facil', texto: 'Me explica DNA de um jeito facil.' },
  { nome: 'fracoes', texto: 'Por que 2/4 e igual a 1/2?' },
  { nome: 'contexto de aula', texto: 'Nao entendi essa parte da aula sobre-reading. Explica de outro jeito.' },
];

const client = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInAnonymously();
if (error) {
  console.log('sessao anonima falhou:', error.message);
  process.exit(1);
}
const token = data.session.access_token;
console.log(`usuario ${data.user.id.slice(0, 8)} - provider: GROQ / openai/gpt-oss-20b\n`);

async function perguntar(pergunta) {
  const t0 = Date.now();
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      stream: true,
      context: { subject: 'Ciencias', topic: 'Celulas' },
      messages: [{ role: 'user', content: pergunta }],
    }),
  });
  if (!res.ok) return { erro: `HTTP ${res.status}`, status: res.status };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let evento = null;
  let primeiro = null;
  let deltas = 0;
  let texto = '';
  let done = null;

  while (true) {
    const { done: fim, value } = await reader.read();
    if (fim) break;
    const agora = Date.now() - t0;
    buffer += decoder.decode(value, { stream: true });
    const blocos = buffer.split('\n\n');
    buffer = blocos.pop() ?? '';
    for (const bloco of blocos) {
      for (const linha of bloco.split('\n')) {
        const limpa = linha.trim();
        if (limpa.startsWith('event:')) { evento = limpa.slice(6).trim(); continue; }
        if (!limpa.startsWith('data:')) continue;
        let dados;
        try { dados = JSON.parse(limpa.slice(5).trim()); } catch { continue; }
        if (evento === 'delta') { deltas += 1; if (primeiro === null) primeiro = agora; texto += dados.text ?? ''; }
        else if (evento === 'done') done = dados;
        else if (evento === 'error') { try { await reader.cancel(); } catch { /* fechado */ } return { erro: dados.error, status: 502 }; }
      }
    }
    if (done) { try { await reader.cancel(); } catch { /* fechado */ } break; }
  }
  return { primeiro, total: Date.now() - t0, deltas, modelo: done?.model, retries: done?.retries, chars: (done?.reply ?? texto).length };
}

const resultados = [];
for (const pergunta of PERGUNTAS) {
  const r = await perguntar(pergunta.texto);
  resultados.push({ ...pergunta, ...r });
  if (r.erro) {
    console.log(`${pergunta.nome.padEnd(30)} ERRO: ${r.erro}`);
  } else {
    console.log(
      `${pergunta.nome.padEnd(30)} 1o token ${String(r.primeiro).padStart(5)}ms | total ${String(r.total).padStart(5)}ms | ` +
      `${String(r.deltas).padStart(3)} deltas | retries ${r.retries} | ${r.chars} chars | ${r.modelo}`,
    );
  }
}

const ok = resultados.filter((r) => !r.erro);
const pct = (lista, p) => {
  const ordenado = [...lista].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((ordenado.length * p) / 100))];
};
console.log('\n=== RESUMO ===');
console.log(`perguntas com sucesso: ${ok.length}/${resultados.length}`);
if (ok.length) {
  const totais = ok.map((r) => r.total);
  const primeiros = ok.map((r) => r.primeiro);
  console.log(`primeiro token  P50 ${pct(primeiros, 50)}ms | pior ${Math.max(...primeiros)}ms`);
  console.log(`tempo total     P50 ${pct(totais, 50)}ms | pior ${Math.max(...totais)}ms`);
  console.log(`retries totais: ${ok.reduce((s, r) => s + (r.retries ?? 0), 0)}`);
  console.log(`deltas totais: ${ok.reduce((s, r) => s + r.deltas, 0)}`);
}
