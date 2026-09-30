// Compara a LIGACAO dos handlers entre o bundle local e o publicado.
// Interessa nao so a presenca da string "1.onStart", mas se o handler
// de onDelta realmente chama o log E o setMessages. Um bundle pode ter
// as strings e ainda assim nao ligar o handler na certo.
//
// Uso: node tools/conferir-handlers-publicados.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://rogerinframengo.github.io/ISTUDOS';

function inspecionar(rotulo, codigo) {
  console.log(`\n=== ${rotulo} ===`);

  // Trecho do handler onDelta: procura a chamada de log e a de
  // setMessages, que sao o que faz o texto aparecer na tela.
  const i = codigo.indexOf('2.onDelta');
  if (i < 0) {
    console.log('  [FALTA] 2.onDelta nao existe neste bundle');
    return false;
  }
  const trecho = codigo.slice(i, i + 700);

  const logaDelta = trecho.includes('2.onDelta');
  const chamaSetMessages = /\.\.\.prev|\.\.\.F,|\[\.\.\./.test(trecho);
  const marcaStreaming = /streaming:!0|streaming:!0/.test(trecho);

  console.log(`  2.onDelta presente:      ${logaDelta ? 'sim' : 'NAO'}`);
  console.log(`  chama setMessages:       ${chamaSetMessages ? 'sim' : 'NAO'}`);
  console.log(`  marca streaming:!0:      ${marcaStreaming ? 'sim' : 'NAO'}`);

  const temOnStart = codigo.includes('1.onStart');
  const temOnDone = codigo.includes('5.onDone');
  const temOnError = codigo.includes('X.onError');
  console.log(`  1.onStart:               ${temOnStart ? 'sim' : 'NAO'}`);
  console.log(`  5.onDone:                ${temOnDone ? 'sim' : 'NAO'}`);
  console.log(`  X.onError:               ${temOnError ? 'sim' : 'NAO'}`);

  // O parser SSE: depois de logar o evento, ele CHAMA o handler?
  const p = codigo.indexOf('evento:delta-primeiro');
  const parser = p < 0 ? '' : codigo.slice(p, p + 220);
  const chamaHandler = /==null\|\|/.test(parser);
  console.log(`  parser chama onDelta:    ${chamaHandler ? 'sim' : 'NAO'}`);
  if (p >= 0) console.log(`  trecho: ...${parser.slice(0, 160)}`);

  return logaDelta && chamaSetMessages && temOnStart && temOnDone && chamaHandler;
}

let ok = true;

// ---- local ----
const pasta = path.join(raiz, 'dist', 'assets');
const local = fs.existsSync(pasta) ? fs.readdirSync(pasta).find((n) => /^index-.*\.js$/.test(n)) : null;
if (local) ok = inspecionar(`LOCAL (${local})`, fs.readFileSync(path.join(pasta, local), 'utf8')) && ok;
else console.log('(sem dist local)');

// ---- publicado ----
try {
  const html = await (await fetch(`${BASE}/index.html?nocache=${Date.now()}`, { cache: 'no-store' })).text();
  const nome = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)?.[1];
  console.log(`\nbundle publicado: ${nome}`);
  if (local) console.log(`igual ao local? ${nome === local ? 'SIM' : 'NAO'}`);
  const remoto = await (await fetch(`${BASE}/assets/${nome}`, { cache: 'no-store' })).text();
  ok = inspecionar('PUBLICADO (no ar)', remoto) && ok;
} catch (erro) {
  console.log('sem rede ate o Pages:', erro.message);
}

console.log(`\nRESULTADO: ${ok ? 'os dois bundles ligam os handlers' : 'DIVERGENCIA entre local e publicado'}`);
process.exit(ok ? 0 : 1);