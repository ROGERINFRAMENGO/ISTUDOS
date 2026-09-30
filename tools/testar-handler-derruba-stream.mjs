// ============================================================
// PROVA: um handler que LANCA excecao mata o stream do TutorChat?
// ------------------------------------------------------------
// Sintoma reportado no site: o log para em "evento:start" e a
// resposta nunca aparece. O parser SSE grava o evento e DEPOIS
// chama o handler - se o handler lanca, a leitura morre ali e o
// evento seguinte (delta/done) nunca e processado.
//
// Este teste usa o streamTutor REAL, recortado do fonte, com um
// fetch simulado que devolve start + 3 deltas + done.
//
// Uso: node tools/testar-handler-derruba-stream.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(raiz, 'src/services/ai.js'), 'utf8');
const enc = new TextEncoder();
const sse = (n, d) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`;

function montar(logs) {
  // Recorta o corpo do streamTutor e escreve um .mjs temporario, em vez
  // de new Function: o new Function nao resolveria o caminho relativo
  // do import que existe no topo do arquivo.
  const inicio = src.indexOf('export async function streamTutor');
  const corpo = src.slice(inicio);
  const arq = path.join(raiz, 'tools', '.stream-injetado.mjs');
  const deps = [
    'const fetch = globalThis.__fetch;',
    "const ensureAiSession = async () => 'jwt';",
    "const SUPABASE_URL = 'https://x.supabase.co';",
    "const SUPABASE_ANON_KEY = 'anon';",
    "const AI_MESSAGES = { noSession: 'sem sessao', offline: 'offline' };",
    'const diag = (e, det) => globalThis.__log(e + (det ? " " + det : ""));',
    'const TUTOR_IDLE_TIMEOUT_MS = 50000;',
    'const TUTOR_STREAM_TIMEOUT_MS = 30000;',
    '',
  ].join('\n');
  fs.writeFileSync(arq, deps + corpo);
  return import('file:///' + arq.replace(/\\/g, '/'));
}

const bytes = [
  enc.encode(sse('start', { conversationId: 'c1' })),
  enc.encode(sse('delta', { text: 'Uma ' })),
  enc.encode(sse('delta', { text: 'celula ' })),
  enc.encode(sse('delta', { text: 'e a menor unidade viva.' })),
  enc.encode(sse('done', { reply: 'Uma celula e a menor unidade viva.', model: 'openai/gpt-oss-20b', conversationId: 'c1' })),
];

async function cenario(nome, onStart) {
  const logs = [];
  let i = 0;
  globalThis.__log = (linha) => logs.push(linha);
  globalThis.__fetch = async () => ({
    ok: true, status: 200,
    headers: { get: () => 'text/event-stream; charset=utf-8' },
    text: async () => '',
    body: {
      getReader: () => ({
        read: () => Promise.resolve(i < bytes.length ? { done: false, value: bytes[i++] } : { done: true }),
        cancel: () => Promise.resolve(),
      }),
    },
  });

  const { streamTutor } = await montar(logs);
  const chamadas = [];
  let erro = null;
  try {
    await streamTutor({ messages: [{ role: 'user', content: 'oi' }], context: {}, conversationId: 'c1' }, {
      onStart: () => { chamadas.push('onStart'); onStart(); },
      onDelta: () => chamadas.push('onDelta'),
      onDone: () => chamadas.push('onDone'),
      onError: () => chamadas.push('onError'),
    });
  } catch (e) { erro = e; }
  const tem = (m) => logs.some((l) => l.includes(m));
  console.log(`\n--- ${nome} ---`);
  console.log(`  handlers: ${chamadas.join(', ') || '(nenhum)'}`);
  console.log(`  erro escapou: ${erro ? erro.message : 'nao'}`);
  console.log(`  log: start=${tem('evento:start')} delta=${tem('evento:delta-primeiro')} done=${tem('evento:done')}`);
  return { chamadas, tem, erro };
}

console.log('=== onStart NORMAL ===');
const bom = await cenario('onStart normal', () => {});
console.log(`  >> ${bom.chamadas.join(',')} = tudo rodou`);

console.log('\n=== onStart que LANCA ===');
const ruim = await cenario('onStart lanca', () => { throw new Error('falha dentro do handler'); });
const parou = ruim.chamadas.length === 1 && ruim.tem('evento:start') && !ruim.tem('evento:done');
console.log(`  >> ${parou
  ? 'CONFIRMADO: o log gravou "evento:start", o handler lancou, e o stream MORREU.'
  + ' O "done" nunca chega ao log, onDelta/onDone nunca rodam e a resposta nao entra na tela.'
  : 'o stream sobreviveu ao handler'}`);

console.log(`\nRESULTADO: ${parou ? 'reproduzido o travamento do site' : 'nao reproduzido'}`);
process.exit(parou ? 0 : 1);