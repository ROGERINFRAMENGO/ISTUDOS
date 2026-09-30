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
const falta = ['onStart', 'onDelta', 'onDone', 'onError'].filter((h) => !repassados.includes(h));
console.log('  faltando  :', falta.length ? falta.join(', ') : 'nenhum');

console.log('\n=== ai.js: streamTutor usa os 4 handlers? ===');
for (const h of ['onStart', 'onDelta', 'onDone', 'onError']) {
  const usa = new RegExp(`${h}\\?\\.\\(`).test(ai);
  console.log(`  ${h}: ${usa ? 'sim' : 'NAO USA'}`);
}

console.log('\n=== TutorChat.jsx: passa onStart? ===');
const passaStart = /onStart:\s*\(\)\s*=>\s*setStatus\('streaming'\)/.test(chat);
console.log('  onStart presente:', passaStart ? 'sim' : 'NAO');

console.log('\n=== a mensagem final some depois? ===');
// Se o onDone grava `id` e o sync compara, precisa ter `at` novo.
const temAt = /m\.id === idProvisoria\s*\?\s*\{\s*\.\.\.m,\s*at: Date\.now\(\),\s*streaming: false/.test(chat);
console.log('  onDone da at novo:', temAt ? 'sim' : 'nao');

const ok = falta.length === 0 && passaStart;
console.log(`\nRESULTADO: ${ok ? 'OK' : 'PROBLEMA ENCONTRADO'}`);
process.exit(ok ? 0 : 1);
