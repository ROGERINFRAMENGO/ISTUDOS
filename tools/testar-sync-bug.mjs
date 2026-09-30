// Reproduz o BUG real do sync durante o streaming do TutorChat.
//
// Contexto: a mensagem provisoria que a tutora esta escrevendo nasce
// com o mesmo `at` da pergunta (ambos usam Date.now() no mesmo
// instante). Quando o outro aparelho gravou a conversa com um `at`
// ligeiramente maior, mergeChat escolhe o remoto e TROCA a conversa
// que esta em andamento -> a resposta some da tela, mesmo com HTTP 200
// e SSE perfeito na Edge Function.
//
// Uso: node tools/testar-sync-bug.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(raiz, 'src/services/sync.js'), 'utf8');

const lastChatAt = (list = []) =>
  (list || []).reduce((max, m) => Math.max(max, Number(m?.at) || 0), 0);

const corpoMerge = src.match(/export function mergeChat\([\s\S]*?\n}/)[0];
const corpoAjuda = src.match(/export function isMensagemIncompleta\([\s\S]*?\n}/)?.[0] ?? '';
const temProtecao = /isMensagemIncompleta/.test(corpoMerge);
const isMensagemIncompleta = corpoAjuda
  ? new Function(`${corpoAjuda.replace('export function', 'function')}\nreturn isMensagemIncompleta;`)()
  : (lista) => (lista || []).some((m) => m?.streaming === true);
const mergeChat = new Function(
  'lastChatAt',
  'isMensagemIncompleta',
  `${corpoMerge.replace('export function', 'function')}\nreturn mergeChat;`,
)(lastChatAt, isMensagemIncompleta);

console.log('=== mergeChat protege a mensagem em andamento? ===');
console.log(temProtecao ? 'SIM (corrigido)' : 'NAO (vulneravel)');

// Estado local DURANTE o streaming. A parcial nasce com `streaming: true`
// (marca que o onDelta agora grava) e o mesmo `at` da pergunta, porque
// ambas usam Date.now() no mesmo instante do handleSend.
const AGORA = 1750000000000;
const local = [
  { role: 'user', content: 'Explique o que e uma celula de forma simples.', at: AGORA },
  {
    id: 'parcial-1',
    role: 'assistant',
    content: 'Uma celula e a menor unidade viva...',
    at: AGORA,
    streaming: true,
  },
];

// O que volta do servidor: o outro aparelho gravou 3ms depois.
const remoto = [
  { role: 'user', content: 'oi', at: AGORA + 3 },
  { role: 'assistant', content: 'Oi! Eu sou sua Tutora IA', at: AGORA + 3 },
];

const resultado = mergeChat(local, remoto);
const parcial = resultado.find((m) => m.id === 'parcial-1');
const preservou = Boolean(parcial);
const temResposta = resultado.some((m) => m.role === 'assistant' && /celula/i.test(m.content ?? ''));

console.log('\n=== merge durante o streaming ===');
console.log('local   :', local.length, 'msgs (inclui a parcial id=parcial-1)');
console.log('remoto  :', remoto.length, 'msgs (conversa do outro aparelho)');
console.log('resultado:', resultado.length, 'msgs');
console.log('a parcial sobreviveu?', preservou ? 'SIM' : 'NAO');
console.log('a RESPOSTA da celula esta na tela?', temResposta ? 'SIM' : 'NAO  <-- some da tela');

if (!preservou || !temResposta) {
  console.log('\n>>> BUG CONFIRMADO: o merge trocou a conversa em andamento');
  console.log('>>> pela do servidor e a resposta desapareceu, mesmo com');
  console.log('>>> HTTP 200 e SSE perfeito na Edge Function.');
}
process.exit(preservou && temResposta ? 0 : 1);
