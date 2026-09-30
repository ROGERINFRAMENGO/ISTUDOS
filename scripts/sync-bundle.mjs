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
const modulos = [...new Set([...original.matchAll(/["']\.\.\/_shared\/([a-zA-Z_]+)\.js["']/g)].map((m) => m[1]))];

const arquivos = { 'index.ts': original.replace(/(["'])\.\.\/_shared\/([a-zA-Z_]+)\.js\1/g, '$1./_$2.js$1') };

for (const mod of modulos) {
  const caminho = path.join(shared, `${mod}.js`);
  if (!fs.existsSync(caminho)) {
    console.error(`ERRO: _shared/${mod}.js nao existe, mas ${nome}/index.ts importa.`);
    process.exit(1);
  }
  arquivos[`_${mod}.js`] = fs.readFileSync(caminho, 'utf8');
}

fs.mkdirSync(destino, { recursive: true });
for (const [arquivo, conteudo] of Object.entries(arquivos)) {
  fs.writeFileSync(path.join(destino, arquivo), conteudo, 'utf8');
}

if (process.argv[3]) {
  fs.writeFileSync(process.argv[3], JSON.stringify(arquivos, null, 2), 'utf8');
}

// Todo import do index precisa ter o arquivo correspondente no bundle.
const faltando = [...arquivos['index.ts'].matchAll(/from "\.\/(_[a-z_]+)\.js"/g)]
  .map((m) => m[1])
  .filter((mod) => !Object.hasOwn(arquivos, `${mod}.js`));

console.log(`${nome}: ${Object.keys(arquivos).length} arquivos -> ${destino}`);
console.log(`  modulos: ${modulos.join(', ') || '(nenhum)'}`);
if (faltando.length) {
  console.error(`  ERRO: import sem arquivo no bundle: ${faltando.join(', ')}`);
  process.exit(1);
}
console.log('  imports: todos com arquivo');
