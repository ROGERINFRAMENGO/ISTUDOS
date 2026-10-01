// ============================================================
// FASE C — o que os verificadores novos pegam nas aulas REAIS.
//
//   node tools/antes-depois-fase-c.mjs
//
// Reusa as 17 aulas ja gravadas no benchmark da FASE B. Como sao as
// MESMAS aulas, a unica variavel e o codigo: mede o que a FASE C
// mudou, sem provider, sem cota e sem sorte.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(RAIZ, '.tmp-bench', 'fase-b', 'aulas');
const SCHEMAS = path.join(RAIZ, 'supabase', 'functions', '_shared', 'schemas.js');
const TMP = path.join(path.dirname(SCHEMAS), '_schemas-fase-b-temp.mjs');

// Reconstrói o validador DA FASE B: mesmo arquivo, com as duas
// chamadas novas (mathCheck e textCheck) removidas. E a prova de que
// a diferenca entre as duas colunas vem delas, e nao de outra coisa.
const atual = fs.readFileSync(SCHEMAS, 'utf8');
const antes = atual
  .replace(/^\s*import \{ verificarAula \} from "\.\/mathCheck\.js";\r?\n/m, "")
  .replace(/^\s*import \{ verificarTexto \} from "\.\/textCheck\.js";\r?\n/m, "")
  .replace(/^\s*\/\/ \(E3\)[\s\S]*?\(erro\) => errors\.push\(erro\)\);\r?\n/m, "")
  .replace(/^\s*\/\/ \(E4\)[\s\S]*?\}\)\.forEach\(\(erro\) => errors\.push\(erro\)\);\r?\n/m, "");

if (antes === atual) {
  console.error("ATENCAO: nao consegui remover os verificadores da FASE C; o A/B nao seria confiavel.");
  process.exit(1);
}
for (const marca of ["verificarAula", "verificarTexto"]) {
  if (antes.includes(`${marca}({`)) {
    console.error(`ATENCAO: ${marca} ainda aparece na copia "antes".`);
    process.exit(1);
  }
}
fs.writeFileSync(TMP, antes, "utf8");

const validarAntes = (await import(pathToFileURL(TMP).href)).validateLesson;
const validarDepois = (await import(pathToFileURL(SCHEMAS).href)).validateLesson;

const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
const linhas = arquivos.map((arquivo) => {
  const bruto = JSON.parse(fs.readFileSync(path.join(DIR, arquivo), "utf8"));
  return {
    nome: arquivo.replace(/\.json$/, "").replace(/^openai_|^(qwen)_/, ""),
    antes: validarAntes(bruto.aula, {}),
    depois: validarDepois(bruto.aula, {}),
  };
});

const ehMat = (e) => /vale \d|, e nao |, mas a resposta e/.test(e);
const ehTxt = (e) => /palavra corrompida|pontuacao quebrada|texto cortado/.test(e);
const novos = (l) => l.depois.errors.filter((e) => !l.antes.errors.includes(e));

const aprovadasAntes = linhas.filter((l) => l.antes.ok).length;
const aprovadasDepois = linhas.filter((l) => l.depois.ok).length;

console.log(`\n${"=".repeat(78)}`);
console.log(` FASE C — mesmas ${linhas.length} aulas da FASE B, so o codigo muda`);
console.log("=".repeat(78));
console.log(`aprovadas ... FASE B = ${aprovadasAntes} | FASE C = ${aprovadasDepois}`);
console.log(`erros ..... FASE B = ${linhas.reduce((n, l) => n + l.antes.errors.length, 0)} | FASE C = ${linhas.reduce((n, l) => n + l.depois.errors.length, 0)}`);

const mat = linhas.flatMap((l) => novos(l).filter(ehMat));
const txt = linhas.flatMap((l) => novos(l).filter(ehTxt));

console.log(`\nERROS MATEMATICOS NOVOS: ${mat.length}`);
for (const e of mat) console.log(`  ${e}`);
console.log(`\nERROS DE TEXTO NOVOS: ${txt.length}`);
for (const e of txt) console.log(`  ${e}`);

console.log("\npor aula:");
for (const l of linhas) {
  const n = novos(l);
  if (n.length) console.log(`  ${l.nome}: +${n.length} (${n[0].slice(0, 76)})`);
}

const regrediu = linhas.filter((l) => l.depois.ok && !l.antes.ok);
console.log(`\nregressao (aprovava na FASE B, reprova na FASE C): ${regrediu.length}`);
for (const l of regrediu) console.log(`  ${l.nome}: ${l.depois.errors.join(" | ")}`);

fs.rmSync(TMP, { force: true });
