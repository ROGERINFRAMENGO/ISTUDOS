// ============================================================
// Monta o bundle de deploy de uma Edge Function a partir de _shared.
// ------------------------------------------------------------
// A ferramenta de deploy nao empacota "../_shared/*", entao cada
// bundle leva sua propria copia dos modulos com o prefixo "_" e os
// imports do index reescritos para "./_mod.js".
//
// Gera tambem um JSON com o conteudo exato de cada arquivo, para a
// ferramenta de deploy usar exatamente o que esta no disco (foi assim
// que um bundle publicado divergiu do fonte e quebrou no boot).
//
// Uso: node scripts/sync-bundle.mjs <funcao> [saida.json]
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nome = process.argv[2];
if (!nome) {
  console.error('Uso: node scripts/sync-bundle.mjs <funcao> [saida.json]');
  process.exit(1);
}

const shared = path.join(raiz, 'supabase', 'functions', '_shared');
const fonte = path.join(raiz, 'supabase', 'functions', nome, 'index.ts');
const destino = path.join(raiz, 'deploy-src', nome);

if (!fs.existsSync(fonte)) {
  console.error(`ERRO: nao achei ${fonte}`);
  process.exit(1);
}

const original = fs.readFileSync(fonte, 'utf8');

// Resolve a arvore de dependencias de _shared, nao so o primeiro
// nivel. A FASE C introduziu schemas.js -> mathCheck.js e
// schemas.js -> textCheck.js: sao imports DENTRO de um modulo
// compartilhado, e o codigo antigo so varria o index.ts. O
// resultado era um bundle sem esses dois arquivos e um BOOT_ERROR
// em producao.
const modulos = [];
const fila = [...original.matchAll(/["']\.\.\/_shared\/([a-zA-Z_]+)\.js["']/g)].map((m) => m[1]);
while (fila.length) {
  const mod = fila.shift();
  if (modulos.includes(mod)) continue;
  modulos.push(mod);
  const caminho = path.join(shared, `${mod}.js`);
  if (!fs.existsSync(caminho)) {
    console.error(`ERRO: _shared/${mod}.js nao existe, mas a arvore de ${nome} importa.`);
    process.exit(1);
  }
  const fonteMod = fs.readFileSync(caminho, 'utf8');
  for (const m of fonteMod.matchAll(/["']\.\/([a-zA-Z_]+)\.js["']/g)) fila.push(m[1]);
}

const arquivos = { 'index.ts': original.replace(/(["'])\.\.\/_shared\/([a-zA-Z_]+)\.js\1/g, '$1./_$2.js$1') };

for (const mod of modulos) {
  const caminho = path.join(shared, `${mod}.js`);
  // A copia achatada renomeia ai_config.js -> _ai_config.js, entao os
  // imports internos do modulo precisam do mesmo prefixo. Sem isso o
  // bundle sobe apontando para um arquivo que nao existe e da BOOT_ERROR.
  arquivos[`_${mod}.js`] = fs.readFileSync(caminho, 'utf8').replace(/(from\s+["']\.\/)/g, '$1_');
}

fs.mkdirSync(destino, { recursive: true });
for (const [arquivo, conteudo] of Object.entries(arquivos)) {
  fs.writeFileSync(path.join(destino, arquivo), conteudo, 'utf8');
}

if (process.argv[3]) {
  fs.writeFileSync(process.argv[3], JSON.stringify(arquivos, null, 2), 'utf8');
}

// Todo import relativo de qualquer arquivo do bundle (index e cada
// modulo copiado) precisa ter a chave correspondente no bundle.
const faltando = Object.entries(arquivos).flatMap(([arquivo, codigo]) =>
  [...codigo.matchAll(/from\s+["'](\.\/[^"']+\.js)["']/g)]
    .map((m) => m[1].slice(2))
    .filter((modulo) => !Object.hasOwn(arquivos, modulo))
    .map((modulo) => `${arquivo} -> ${modulo}`),
);

console.log(`${nome}: ${Object.keys(arquivos).length} arquivos -> ${destino}`);
console.log(`  modulos: ${modulos.join(', ') || '(nenhum)'}`);
if (faltando.length) {
  console.error(`  ERRO: import sem arquivo no bundle: ${faltando.join(', ')}`);
  process.exit(1);
}
console.log('  imports: todos com arquivo');
