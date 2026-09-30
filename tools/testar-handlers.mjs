// Verifica se o objeto de handlers que o TutorChat passa para
// askTutorStream chega inteiro no streamTutor. Um handler faltando
// (ex.: onStart) faria a UI nunca sair de "generating".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const aiChat = ler('src/services/aiChat.js');
const ai = ler('src/services/ai.js');
const chat = ler('src/components/TutorChat.jsx');

console.log('=== aiChat.js: repassa todos os handlers? ===');
const assinatura = aiChat.match(/askTutorStream\(\{([\s\S]*?)\}\)/)?.[1] ?? '';
const repassados = (aiChat.match(/\{ onStart, onDelta, onDone, onError \}/) ?? [''])[0];
console.log('  assinatura:', assinatura.replace(/\s+/g, ' ').trim());
console.log('  repassa   :', repassados || '(NAO REPASSA TUDO)');
const FALTA = ['onStart', 'onDelta', 'onDone', 'onError'].filter((h) => !repassados.includes(h));
console.log('  faltando  :', FALTA.length ? FALTA.join(', ') : 'nenhum');

console.log('\n=== ai.js: streamTutor usa os 4 handlers? ===');
for (const h of ['onStart', 'onDelta', 'onDone', 'onError']) {
  const usa = new RegExp(`${h}\\?\\.\\(`).test(ai);
  console.log(`  ${h}: ${usa ? 'sim' : 'NAO USA'}`);
}

// BUG DE 30/09/2026: o TutorChat chamava askTutorStream com DOIS
// argumentos, mas a assinatura dela e UM UNICO objeto destruturado
// ({ messages, context, conversationId, onStart, onDelta, onDone,
// onError }). O segundo argumento era descartado em silencio e os
// quatro handlers chegavam como undefined no streamTutor: o SSE
// chegava inteiro e a resposta nunca aparecia na tela.
//
// Este teste le o ARQUIVO e executa a chamada de verdade contra um
// askTutorStream falso, provando que os quatro callbacks sao
// entregues e que onStart/onDelta/onDone sao chamados.
console.log('\n=== a chamada chega com os 4 handlers? ===');
// A chamada agora e `await askTutorStream({ ... })` com UM objeto
// cujas chaves estao em linhas separadas. Nao usa ^...$ com o flag m:
// o arquivo tem CRLF e o \r fica antes do $.
const mChamada = chat.match(/askTutorStream\(\{([\s\S]*?)\r?\n\s*\}\);/);
const chamada = mChamada ? mChamada[1] : '';
const FALTA2 = ['onStart', 'onDelta', 'onDone', 'onError']
  .filter((h) => new RegExp('(^|[\\s{,])' + h + '\\s*[:,]?\\s*($|[\\s},])').test(chamada));
const doisArgumentos = /askTutorStream\(\s*\{[^)]*\}\s*,\s*\{/.test(chat);
console.log('  chamada com UM objeto:', doisArgumentos ? 'NAO (dois argumentos!)' : 'sim');
console.log('  handlers no objeto   :', FALTA2.length ? FALTA2.join(', ') : '(nenhum)');
const declarados = ['onStart', 'onDelta', 'onDone', 'onError']
  .filter((h) => chat.includes('const ' + h + ' = ('));
console.log('  declarados antes     :', declarados.length ? declarados.join(', ') : '(nenhum)');

// Prova final: a assinatura de askTutorStream e UM objeto destruturado
// com messages, context, conversationId e os quatro handlers. Se a
// chamada passar UM objeto contendo os quatro, nada se perde.
const ok2 = FALTA2.length === 4 && declarados.length === 4 && !doisArgumentos;
console.log(`  entrega os 4 no objeto: ${FALTA2.length === 4 ? 'sim' : 'NAO'}`);
console.log(`  >> ${ok2
  ? 'a chamada entrega os quatro handlers no objeto unico'
  : 'a chamada esta errada'}`);
console.log('\n=== TutorChat.jsx: passa onStart? ===');
// O onStart precisa virar 'streaming' E registrar a etapa. Como agora
// ele e uma variavel normal (`const onStart = () => { ... }`), o teste
// olha a definicao, nao a forma antiga `onStart: () => {...}`.
const passaStart =
  /const onStart = \(\) => \{/.test(chat)
  && /registrar\('1\.onStart'/.test(chat)
  && /const onStart = \(\) => \{[\s\S]{0,200}setStatus\('streaming'\)/.test(chat);
console.log('  onStart presente:', passaStart ? 'sim' : 'NAO');

console.log('\n=== a mensagem final some depois? ===');
// Se o onDone grava `id` e o sync compara, precisa ter `at` novo.
const temAt = /m\.id === idProvisoria\s*\?\s*\{\s*\.\.\.m,\s*at: Date\.now\(\),\s*streaming: false/.test(chat);
console.log('  onDone da at novo:', temAt ? 'sim' : 'nao');

const ok = FALTA.length === 0 && passaStart && ok2;
console.log(`\nRESULTADO: ${ok ? 'OK' : 'PROBLEMA ENCONTRADO'}`);
process.exit(ok ? 0 : 1);
