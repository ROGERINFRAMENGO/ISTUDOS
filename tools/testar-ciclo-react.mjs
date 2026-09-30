// Reproduz o ciclo COMPLETO de efeitos do React durante e depois do
// streaming: onDelta -> setMessages -> saveChat no localStorage ->
// efeito de sync (push 1500ms depois) -> merge -> setMessages.
//
// Reproduz o que o NAVEGADOR faz, nao o que o Node faz.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(raiz, 'src/services/sync.js'), 'utf8');

const lastChatAt = (list = []) =>
  (list || []).reduce((max, m) => Math.max(max, Number(m?.at) || 0), 0);
const corpoMerge = src.match(/export function mergeChat\([\s\S]*?\n}/)[0];
const corpoAjuda = src.match(/export function isMensagemIncompleta\([\s\S]*?\n}/)?.[0] ?? '';
const isIncompleta = corpoAjuda
  ? new Function(`${corpoAjuda.replace('export function', 'function')}\nreturn isMensagemIncompleta;`)()
  : (l) => (l || []).some((m) => m?.streaming === true);
const mergeChat = new Function(
  'lastChatAt', 'isMensagemIncompleta',
  `${corpoMerge.replace('export function', 'function')}\nreturn mergeChat;`,
)(lastChatAt, isIncompleta);

// Estado do navegador: localStorage + servidor.
const storage = { chat: JSON.stringify([{ role: 'assistant', content: 'Oi!', at: 1000 }]) };
let servidor = [{ role: 'assistant', content: 'Oi!', at: 1000 }];

const T0 = 1750000000000;
let relogio = T0;
let messages = JSON.parse(storage.chat);
let status = 'idle';
const idProv = `parcial-${T0}`;

function setMessages(novo) {
  messages = typeof novo === 'function' ? novo(messages) : novo;
  storage.chat = JSON.stringify(messages.slice(-60)); // saveChat no efeito
}

function onStart() { status = 'streaming'; }
function onDelta(acumulado) {
  status = 'streaming';
  setMessages((prev) => {
    const existe = prev.some((m) => m.id === idProv);
    if (existe) return prev.map((m) => (m.id === idProv ? { ...m, content: acumulado, streaming: true } : m));
    return [...prev, { id: idProv, role: 'assistant', content: acumulado, at: T0, streaming: true }];
  });
}
function onDone(reply) {
  setMessages((prev) => {
    const existe = prev.some((m) => m.id === idProv);
    const base = existe
      ? prev.map((m) => (m.id === idProv ? { ...m, content: reply } : m))
      : [...prev, { id: idProv, role: 'assistant', content: reply, at: T0 }];
    return base.map((m) => (m.id === idProv ? { ...m, at: T0 + 500, streaming: false, model: 'gpt' } : m));
  });
  status = 'idle';
}

// Efeito de sync: roda 1500ms depois da ULTIMA mudanca.
function efeitoSync() {
  const remote = servidor;
  const merged = mergeChat(messages, remote);
  // o servidor devolve o que ele tinha
  servidor = merged;
  setMessages(merged);
  return merged;
}

console.log('=== ciclo do streaming ===');
setMessages((prev) => [...prev, { role: 'user', content: 'Explique a celula', at: T0 }]);
onStart();
onDelta('Uma celula');
onDelta('Uma celula e a menor unidade');
onDone('Uma celula e a menor unidade viva.');

console.log('  status apos done :', status);
console.log('  mensagens       :', messages.length);
console.log('  ultima          :', JSON.stringify(messages[messages.length - 1]).slice(0, 110));

console.log('\n=== efeito de sync roda 1,5s depois (servidor ainda com a conversa velha) ===');
const depois = efeitoSync();
const resp = depois.find((m) => m.role === 'assistant' && /celula/i.test(m.content ?? ''));
console.log('  mensagens depois do merge:', depois.length);
console.log('  a resposta continua?     :', resp ? 'SIM' : 'NAO  <-- sumiu');
console.log('  status                   :', status);

console.log('\n=== e o boot da pagina seguinte (loadChat + pullShared) ===');
const doLocalStorage = JSON.parse(storage.chat);
const doBoot = mergeChat(doLocalStorage, servidor);
const resp2 = doBoot.find((m) => m.role === 'assistant' && /celula/i.test(m.content ?? ''));
console.log('  mensagens no boot:', doBoot.length);
console.log('  a resposta volta?:', resp2 ? 'SIM' : 'NAO');

const ok = Boolean(resp) && Boolean(resp2);
console.log(`\nRESULTADO: ${ok ? 'a resposta sobrevive' : 'a resposta PERDE'}`);
process.exit(ok ? 0 : 1);
