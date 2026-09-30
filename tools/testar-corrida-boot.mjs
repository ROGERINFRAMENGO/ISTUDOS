// Reproduz a CORRIDA REAL: o boot do sync (pullShared) e o envio da
// mensagem da aluna rodam no MESMO instante. O pullShared devolve a
// conversa velha e o setMessages do merge chega DEPOIS da pergunta,
// apagando a pergunta e a resposta da tela.
//
// Uso: node tools/testar-corrida-boot.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(raiz, 'src/services/sync.js'), 'utf8');

const lastChatAt = (list = []) =>
  (list || []).reduce((max, m) => Math.max(max, Number(m?.at) || 0), 0);
const corpoMerge = src.match(/export function mergeChat\([\s\S]*?\n}/)[0];
const corpoAjuda = src.match(/export function isMensagemIncompleta\([\s\S]*?\n}/)?.[0] ?? '';
const isInc = corpoAjuda
  ? new Function(`${corpoAjuda.replace('export function', 'function')}\nreturn isMensagemIncompleta;`)()
  : (l) => (l || []).some((m) => m?.streaming === true);
const mergeChat = new Function(
  'lastChatAt', 'isMensagemIncompleta',
  `${corpoMerge.replace('export function', 'function')}\nreturn mergeChat;`,
)(lastChatAt, isInc);

const T0 = 1750000000000;
const idProv = `parcial-${T0}`;

// Estado no instante em que a aluna abre a aba e envia.
// A conversa do servidor e a ANTIGA (a de ontem).
const servidorAntigo = [
  { role: 'assistant', content: 'Oi! Eu sou sua Tutora IA', at: T0 - 60000 },
];

// A aluna digita e envia: a pergunta entra no estado.
let messages = [
  { role: 'assistant', content: 'Oi! Eu sou sua Tutora IA', at: T0 - 60000 },
  { role: 'user', content: 'ola', at: T0 },
];
console.log('=== a aluna envia "ola" ===');
console.log('  estado:', messages.length, 'msgs | ultima:', messages[messages.length - 1].content);

// A tutora responde (onDelta + onDone).
messages = messages.map((m) => m);
messages.push({ id: idProv, role: 'assistant', content: 'Oi! Tudo bem?', at: T0 + 300, streaming: false });
console.log('\n=== a tutora responde ===');
console.log('  estado:', messages.length, 'msgs | ultima:', messages[messages.length - 1].content);

// AGORA o pullShared do boot termina e devolve a conversa VELHA do servidor.
const doBoot = servidorAntigo;
const depois = mergeChat(messages, doBoot);
const temResposta = depois.some((m) => m.role === 'assistant' && /Tudo bem/i.test(m.content ?? ''));
const temPergunta = depois.some((m) => m.role === 'user' && m.content === 'ola');

console.log('\n=== o pullShared do boot termina (tarde demais) ===');
console.log('  servidor devolvido:', doBoot.length, 'msgs (a conversa velha)');
console.log('  estado depois do merge:', depois.length, 'msgs');
console.log('  a pergunta "ola" continua?', temPergunta ? 'SIM' : 'NAO  <-- APAGADA');
console.log('  a resposta continua?      ', temResposta ? 'SIM' : 'NAO  <-- APAGADA');

const ok = temPergunta && temResposta;
if (!ok) {
  console.log('\n>>> CAUSA RAIZ CONFIRMADA: o merge do boot chega depois da');
  console.log('>>> pergunta/resposta e troca a conversa INTEIRA pela do');
  console.log('>>> servidor, que ainda era a antiga. A tela volta a mostrar');
  console.log('>>> apenas a conversa de ontem. Para a aluna, "nao respondeu".');
}
process.exit(ok ? 0 : 1);
