// ============================================================
// Reproduz o ciclo de RENDER do TutorChat com os CUIDADOS REAIS
// de cada handler, lidos do fonte. O objetivo e responder: a
// resposta da Groq CHEGA a ser renderizada, ou e descartada?
// ------------------------------------------------------------
// O que este teste reproduz, token a token:
//   - onDelta cria/atualiza a mensagem provisoria (com at: Date.now())
//   - a key do React e `${message.at}-${index}`  <-- muda a cada token
//   - onDone marca streaming:false e da at novo
//   - saveChat no localStorage
//   - o efeito de sync roda 1500ms DEPOIS (nao durante a resposta)
//
// Uso: node tools/testar-render-tutor.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chat = fs.readFileSync(path.join(raiz, 'src/components/TutorChat.jsx'), 'utf8');

// ---- 1) a key do React muda a cada token? ---------------------
console.log('=== 1) key da mensagem no JSX ===');
const key = chat.match(/<div key=\{`([^`]*)`\}/)?.[1] ?? '(nao encontrada)';
console.log('  key usada:', key);
const keyUsaAt = /\$\{message\.at\}/.test(key) || /\$\{m\.at\}/.test(key);
const provissoriaAtualizaAt = /id === idProvisoria[\s\S]{0,200}?\? \{ \.\.\.m, content: acumulado, streaming: true \}/.test(chat);
console.log('  a key depende de `at`?           ', keyUsaAt ? 'SIM' : 'nao');
console.log('  o onDelta mexe no `at` da msg?    ', provissoriaAtualizaAt ? 'SIM' : 'nao (so content + streaming)');
console.log(
  keyUsaAt
    ? '  >> A key ESTAVEL durante o stream: o onDelta nao troca o `at`,'
    + ' entao a mesma div e reaproveitada e o texto cresce na tela.'
    : '  >> key estavel.',
);

// ---- 2) o texto realmente cresce a cada delta? ---------------
console.log('\n=== 2) os handlersdao o texto na tela ===');
const T0 = 1750000000000;
const idProv = 'parcial-teste';
let messages = [{ role: 'user', content: 'Explique o que e uma celula.', at: T0 }];
let status = 'generating';

// reproduz o onDelta EXATO do fonte
function onDelta(acumulado) {
  status = 'streaming';
  messages = messages.some((m) => m.id === idProv)
    ? messages.map((m) => (m.id === idProv ? { ...m, content: acumulado, streaming: true } : m))
    : [...messages, { id: idProv, role: 'assistant', content: acumulado, at: Date.now(), streaming: true }];
  console.log(`  delta -> msgs=${messages.length} streaming=${messages.some((m) => m.streaming === true)} chars=${String(messages.at(-1).content).length}`);
}

const pedacos = ['Uma ', 'celula ', 'e a menor ', 'unidade viva ', 'dos seres vivos.'];
let acumulado = '';
for (const p of pedacos) { acumulado += p; onDelta(acumulado); }

// ---- 3) onDone ------------------------------------------------
function onDone(reply) {
  messages = messages.map((m) => (m.id === idProv ? { ...m, content: reply, at: Date.now(), streaming: false, model: 'gpt' } : m));
  status = 'idle';
}
onDone(acumulado);
const final = messages.find((m) => m.id === idProv);
console.log(`\n  apos done -> msgs=${messages.length} status=${status}`);
console.log(`  texto final: "${final?.content}"`);
console.log(`  streaming=false? ${final?.streaming === false} | id preservado? ${final?.id === idProv}`);

// ---- 4) o que o USUARIO ve ------------------------------------
console.log('\n=== 3) o que o React renderiza ===');
// O JSX filtra por messages e mostra message.content. Reproduzimos.
const visivel = messages.filter((m) => m.content && String(m.content).trim());
const ultima = visivel.at(-1);
console.log('  bolhas com conteudo:', visivel.length);
console.log('  ultima bolha        :', ultima ? `"${ultima.content}"` : '(VAZIA)');
console.log('  o usuario ve texto? ', ultima && ultima.content.trim() ? 'SIM' : 'NAO  <-- BUG');

// ---- 5) o sync troca depois? ---------------------------------
console.log('\n=== 4) sync depois da resposta (o efeito real) ===');
const srcSync = fs.readFileSync(path.join(raiz, 'src/services/sync.js'), 'utf8');
const corpoMerge = srcSync.match(/export function mergeChat\([\s\S]*?\n}/)[0];
const corpoAjuda = srcSync.match(/export function isMensagemIncompleta\([\s\S]*?\n}/)[0];
const isInc = new Function(`${corpoAjuda.replace('export function', 'function')}\nreturn isMensagemIncompleta;`)();
const mergeChat = new Function('lastChatAt', 'isMensagemIncompleta',
  `${corpoMerge.replace('export function', 'function')}\nreturn mergeChat;`)(
  // O lastChatAt real: o maior `at` da lista.
  (list = []) => (list || []).reduce((max, m) => Math.max(max, Number(m?.at) || 0), 0),
  isInc,
);

const remotoAntigo = [{ role: 'user', content: 'Explique o que e uma celula.', at: T0 }];
const depois = mergeChat(messages, remotoAntigo);
const aindaTemResposta = depois.some((m) => m.id === idProv && m.content.trim().length > 0);
console.log('  apos merge com o servidor: a resposta sobrevive?', aindaTemResposta ? 'SIM' : 'NAO  <-- BUG');
console.log('  guard isThinking no efeito de sync?', /isThinking/.test(chat) ? 'SIM' : 'NAO');

const ok = Boolean(ultima?.content?.trim()) && aindaTemResposta;
console.log(`\nRESULTADO: ${ok ? 'a resposta chega a tela' : 'a resposta NAO chega a tela'}`);
process.exit(ok ? 0 : 1);