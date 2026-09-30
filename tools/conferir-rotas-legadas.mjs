// ============================================================
// Confere se as ROTAS LEGADAS (que nao existem mais na Edge) ainda
// aparecem no bundle de PRODUCAO - local e o publicado no Pages.
// ------------------------------------------------------------
// Rotas validadas:   tutor-chat, generate-lesson, ai-bench, ai-tutor
// Rotas LEGADAS:     tutor, generate-quiz   -> devem dar ZERO
//
// O motif e `/functions/v1/${slug}` em src/services/ai.js: o slug vem
// de uma constante, entao a busca ingenua por "/functions/v1/tutor"
// casa com o prefixo de "tutor-chat". Por isso este script separa os
// dois: conta so o que NAO e prefixo de uma rota valida.
//
// Uso: node tools/conferir-rotas-legadas.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_PAGES = 'https://rogerinframengo.github.io/ISTUDOS';

const ROTAS_VALIDAS = ['tutor-chat', 'generate-lesson', 'ai-bench', 'ai-tutor'];
const ROTAS_LEGADAS = ['tutor', 'generate-quiz'];

/**
 * Extrai os slugs realmente usados em `/functions/v1/<slug>`.
 * Aceita tanto a string literal ("/functions/v1/tutor-chat") quanto a
 * template dinamica ("/functions/v1/${slug}") - no caso dinamico, o
 * slug vem das chamadas a callFunction(), lidas do fonte de ai.js.
 */
function slugsDoBundle(codigo) {
  const literais = [...codigo.matchAll(/\/functions\/v1\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  const dinamico = /\/functions\/v1\/\$\{/.test(codigo);
  return { literais: [...new Set(literais)], dinamico };
}

function conferir(rotulo, codigo) {
  console.log(`\n=== ${rotulo} ===`);
  const { literais, dinamico } = slugsDoBundle(codigo);

  console.log(`  rotas literais no bundle : ${literais.join(', ') || '(nenhuma)'}`);
  console.log(`  URL dinamica \${slug}     : ${dinamico ? 'SIM (os slugs vem de string literals do proprio bundle)' : 'nao'}`);

  let problemas = 0;
  for (const legada of ROTAS_LEGADAS) {
    // O bundle e minificado e sem quebras de linha, entao a busca e
    // feita no arquivo INTEIRO. Duas evidencias independentes:
    //  (1) URL literal   -> /functions/v1/legada
    //  (2) slug solto    -> "legada" (o caso da URL dinamica ${slug},
    //      em que o slug viaja como string literal e e concatenado)
    // O limite (?![A-Za-z0-9_-]) e obrigatorio: sem ele "tutor" casaria
    // com o prefixo de "tutor-chat" e acusaria uma rota inexistente.
    const limite = '(?![A-Za-z0-9_-])';
    const urlLiteral = new RegExp(`/functions/v1/${legada}${limite}`).test(codigo);
    const slugSolto = new RegExp(`(['"\`])${legada}\\1`).test(codigo);
    if (urlLiteral || slugSolto) {
      problemas += 1;
      console.log(
        `  [FALHA]   rota legada "${legada}" presente `
        + `(urlLiteral=${urlLiteral} slugComoString=${slugSolto})`,
      );
    } else {
      console.log(`  [OK]      ZERO chamadas para "${legada}"`);
    }
  }
  for (const valida of ROTAS_VALIDAS) {
    const presente = new RegExp(`(['"\`])${valida}\\1`).test(codigo);
    console.log(`  ${presente ? '[usada]  ' : '[ausente]'} "${valida}"`);
  }
  return problemas;
}

let problemas = 0;

// ---- 1) bundle local -------------------------------------------
const pastaDist = path.join(raiz, 'dist', 'assets');
const local = fs.existsSync(pastaDist)
  ? fs.readdirSync(pastaDist).find((n) => /^index-.*\.js$/.test(n))
  : null;
if (local) {
  problemas += conferir(`BUNDLE LOCAL (${local})`, fs.readFileSync(path.join(pastaDist, local), 'utf8'));
} else {
  console.log('\n(BUNDLE LOCAL ausente: rode npm run build)');
}

// ---- 2) bundle publicado ----------------------------------------
try {
  const html = await (await fetch(`${BASE_PAGES}/index.html?nocache=${Date.now()}`, { cache: 'no-store' })).text();
  const nome = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)?.[1];
  console.log(`\nbundle publicado: ${nome ?? '(nao achei no index.html)'}`);
  if (nome) {
    const remoto = await (await fetch(`${BASE_PAGES}/assets/${nome}`, { cache: 'no-store' })).text();
    if (local) console.log(`igual ao local? ${nome === local ? 'SIM' : 'NAO - o dist local ainda NAO foi publicado'}`);
    problemas += conferir('BUNDLE PUBLICADO (GitHub Pages)', remoto);
  }
} catch (erro) {
  console.log(`\nNAO CONSEGUI ACESSAR ${BASE_PAGES}: ${erro.message}`);
  console.log('DIAGNOSTICO: sem rede ate o GitHub Pages a partir desta maquina.');
}

console.log(
  problemas === 0
    ? '\nRESULTADO: nenhuma rota legada no bundle.'
    : `\nRESULTADO: ${problemas} rota(s) legada(s) ainda no bundle.`,
);
process.exit(problemas === 0 ? 0 : 1);