// ============================================================
// FASE B — relatorio da auditoria.
// Le .tmp-bench/fase-b/auditoria.json e responde, com dados:
//   1. quantas aulas foram reprovadas por CADA categoria
//   2. quanto do ruido vem do limite de tamanho
//   3. o limite de 900 e mesmo o gargalo?
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ = path.join(RAIZ, '.tmp-bench', 'fase-b', 'auditoria.json');
const tag = process.argv.includes('--depois') ? 'DEPOIS' : 'ANTES';

if (!fs.existsSync(ARQ)) { console.error('sem auditoria.json — rode tools/auditar-fase-b.mjs'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(ARQ, 'utf8'));

const ROTULOS = {
  tamanho_maximo: 'tamanho acima do maximo',
  tamanho_minimo: 'tamanho abaixo do minimo',
  estrutura: 'estrutura',
  conteudo: 'conteudo',
  qualidade: 'qualidade',
  formato: 'formato',
};

const comSinal = rows.filter((r) => r.ok && !r.validate_ok);
const aprovadas = rows.filter((r) => r.validate_ok);
const falhouAntes = rows.filter((r) => !r.ok);

// ---------- 1. panorama por aula ----------
console.log(`\n${'='.repeat(92)}`);
console.log(` FASE B — ${tag} · ${rows.length} geracoes`);
console.log('='.repeat(92));
console.log('modelo/tema/run            resultado   motivo                  chars  erros');
console.log('-'.repeat(92));

for (const r of rows) {
  const id = `${r.modelo.split('/')[1]}/${r.temaSlug.slice(0, 12)}/r${r.run}`;
  const res = r.validate_ok ? 'VALIDA  ' : (r.ok ? 'REPROV.' : `FALHOU(${r.error_kind ?? '?'})`);
  const cats = r.categorias.length ? r.categorias.join('+').slice(0, 22) : '-';
  console.log(`${id.padEnd(27)} ${res} ${cats.padEnd(23)} ${String(r.chars_totais ?? '-').padStart(6)}  ${String(r.total_erros).padStart(5)}`);
}

// ---------- 2. contagem por categoria (aulas, nao erros) ----------
console.log(`\n${'-'.repeat(92)}`);
console.log('CATEGORIA DE REJEICAO (contagem de AULAS afetadas)');
console.log('-'.repeat(92));
console.log(`aprovadas ................. ${aprovadas.length}/${rows.length}`);
console.log(`reprovadas no validador .... ${comSinal.length}/${rows.length}`);
// ---------- 3. a pergunta central: o limite de 900 e o gargalo? ----------
console.log(`\n${'-'.repeat(92)}`);
console.log('O LIMITE DE 900 E O GARGALO? (erros de TAMANHO com limite 900)');
console.log('-'.repeat(92));

const novecentos = comSinal.flatMap((r) => (r.tamanhos ?? [])
  .filter((t) => t.limite === 900)
  .map((t) => ({ ...t, modelo: r.modelo, tema: r.temaSlug, run: r.run, erro: (r.erros ?? []).find((e) => e.includes(`maximo ${t.limite}`)) })));

if (!novecentos.length) {
  console.log('  NENHUMA rejeicao foi causada pelo limite de 900.');
} else {
  const afetadas = new Set(novecentos.map((x) => `${x.modelo}|${x.tema}|${x.run}`)).size;
  const cabem1200 = novecentos.filter((x) => x.medido <= 1200).length;
  console.log(`  rejeicoes com o limite 900 ..... ${novecentos.length}`);
  console.log(`  aulas afetadas .................. ${afetadas}`);
  console.log(`  excesso alem de 900 ............. ${novecentos.map((x) => x.excesso).sort((a, b) => a - b).join(', ')}`);
  console.log(`  caberiam em 1.200 .............. ${cabem1200}/${novecentos.length}`);
  console.log(`  aulas com 900 entre as causas ... ${comSinal.filter((r) => (r.tamanhos ?? []).some((t) => t.limite === 900)).length}`);
  console.log('');
  for (const x of novecentos) {
    console.log(`    ${String(x.medido).padStart(4)} (+${String(x.excesso).padStart(3)})  ${x.modelo} ${x.tema} r${x.run}`);
    console.log(`         ${String(x.erro ?? '').slice(0, 84)}`);
  }
}

// ---------- 4. todos os limites que apareceram ----------
console.log(`\n${'-'.repeat(92)}`);
console.log('TODOS OS LIMITES DE TAMANHO QUE APARECERAM');
console.log('-'.repeat(92));
const porLimite = new Map();
for (const r of comSinal) {
  for (const t of r.tamanhos ?? []) {
    if (!porLimite.has(String(t.limite))) porLimite.set(String(t.limite), []);
    porLimite.get(String(t.limite)).push(t);
  }
}
for (const [limite, itens] of [...porLimite.entries()].sort((a, b) => Number(b[0]) - Number(a[0]))) {
  const medidos = itens.map((i) => i.medido).filter(Boolean).sort((a, b) => a - b);
  console.log(`  maximo ${String(limite).padStart(4)}: ${String(itens.length).padStart(2)} ocorrencia(s) medidas=[${medidos.join(', ')}]`);
}

// ---------- 5. tamanho observado por campo ----------
console.log(`\n${'-'.repeat(92)}`);
console.log('TAMANHO OBSERVADO POR CAMPO (aulas com texto salvo)');
console.log('-'.repeat(92));
console.log('campo                     min   media    max');
for (const campo of ['explicacoes', 'exemplos_explicacao', 'exemplos_solucao', 'respostas_exercicio']) {
  const vals = rows.map((r) => r.estatisticas?.[campo]).filter(Boolean);
  if (!vals.length) continue;
  const meds = vals.map((v) => v.media);
  console.log(`${campo.padEnd(24)} ${String(Math.min(...vals.map((v) => v.min))).padStart(4)} ${String(Math.round(meds.reduce((a, b) => a + b, 0) / meds.length)).padStart(7)} ${String(Math.max(...vals.map((v) => v.max))).padStart(6)}`);
}
console.log('\nlimite atual: examples[].explanation = 900 | sections[].explanation = 3500');
console.log(`nao chegaram a validar .... ${falhouAntes.length}/${rows.length} (provider/schema/cota)`);
console.log('');
for (const [id, rotulo] of Object.entries(ROTULOS)) {
  const n = comSinal.filter((r) => r.categorias.includes(id)).length;
  console.log(`  ${rotulo.padEnd(24)} ${String(n).padStart(2)}/${comSinal.length} ${'#'.repeat(n)}`);
}
const semCat = comSinal.filter((r) => r.categorias.length === 0).length;
if (semCat) console.log(`  ${'(nao classificado)'.padEnd(24)} ${String(semCat).padStart(2)}/${comSinal.length}`);