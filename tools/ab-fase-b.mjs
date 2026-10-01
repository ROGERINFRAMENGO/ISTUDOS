// ============================================================
// FASE B — A/B deterministico do validateLesson().
//
// Nao chama a IA. Pega as MESMAS aulas salvas pela auditoria e valida
// cada uma duas vezes: uma com o codigo de antes e outra com o de
// depois. Como a aula e identica nos dois lados, a unica variavel e a
// regra — e o efeito da mudanca fica isolado, sem provider, sem cota
// e sem sorte.
//
//   node tools/ab-fase-b.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(RAIZ, '.tmp-bench', 'fase-b', 'aulas');
const SCHEMAS = path.join(RAIZ, 'supabase', 'functions', '_shared', 'schemas.js');
const TMP = path.join(RAIZ, '.tmp-bench', 'fase-b', 'schemas-antes.mjs');

if (!fs.existsSync(DIR)) { console.error('sem aulas salvas — rode tools/auditar-fase-b.mjs'); process.exit(1); }

// Reconstrói o validador DE ANTES: o mesmo arquivo, com o piso de 3
// caracteres na `answer` restaurado. Nada mais muda.
//
// A substituicao usa uma FUNCAO de proposito. Com string, o
// String.replace trata `$` como referencia de grupo, e o texto que
// we're reescrevendo contem `${at}.answer` — o `$` seria expandido e o
// arquivo de teste sairia corrompido, com o A/B medindo nada.
const atual = fs.readFileSync(SCHEMAS, 'utf8');
const antes = atual.replace(
  /(answer: readString\(item\?\.answer,[^\n]*?min:\s*)1(,\s*max:\s*400\s*\}\s*\),)/,
  (_m, cabeca, cauda) => `${cabeca}3${cauda}`,
);

if (antes === atual) {
  console.error('ATENCAO: nao consegui reverter a regra; o A/B nao seria confiavel.');
  process.exit(1);
}
if (!/answer: readString\(item\?\.answer,[^\n]*?min:\s*3\b/.test(antes)) {
  console.error('ATENCAO: a reversao nao ficou consistente; abortando.');
  process.exit(1);
}
if (!/answer: readString\(item\?\.answer,[^\n]*?min:\s*1\b/.test(atual)) {
  console.error('ATENCAO: o codigo atual nao tem min: 1 na answer; o A/B mediria outra coisa.');
  process.exit(1);
}
fs.writeFileSync(TMP, antes, 'utf8');

const validarAntes = (await import(pathToFileURL(TMP).href)).validateLesson;
const validarDepois = (await import(pathToFileURL(SCHEMAS).href)).validateLesson;

const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
const linhas = [];
for (const arquivo of arquivos) {
  const bruto = JSON.parse(fs.readFileSync(path.join(DIR, arquivo), 'utf8'));
  const input = bruto.input ?? {};
  linhas.push({
    arquivo, tema: bruto.tema, modelo: bruto.modelo, run: bruto.run,
    antes: validarAntes(bruto.aula, input),
    depois: validarDepois(bruto.aula, input),
  });
}

const ok = (v) => v.ok;
const mudou = linhas.filter((l) => ok(l.antes) !== ok(l.depois));
const continuamRuins = linhas.filter((l) => !ok(l.antes) && !ok(l.depois));
const sempreOk = linhas.filter((l) => ok(l.antes) && ok(l.depois));

// Mudanca por ERRO, e nao so por aprovado/reprovado. Uma aula pode ter
// ganho um defeito real e perdido um falso no mesmo geracao: o placar
// binario esconderia a correcao. O que interessa e o saldo.
const errosAntes = linhas.reduce((n, l) => n + l.antes.errors.length, 0);
const errosDepois = linhas.reduce((n, l) => n + l.depois.errors.length, 0);
const Some = (l, erro) => l.depois.errors.filter((e) => e !== erro).length < l.antes.errors.filter((e) => e !== erro).length;

console.log(`\n${'='.repeat(78)}`);
console.log(` FASE B — A/B do validateLesson() sobre as mesmas ${linhas.length} aulas`);
console.log('='.repeat(78));
console.log(`total de ERROS ..... antes = ${errosAntes} | depois = ${errosDepois}  (${errosAntes - errosDepois > 0 ? '-' : '+'}${Math.abs(errosAntes - errosDepois)})`);
console.log(`aulas aprovadas ... antes = ${linhas.filter((l) => ok(l.antes)).length} | depois = ${linhas.filter((l) => ok(l.depois)).length}`);
console.log(`aprovavam e seguem .. ${sempreOk.length}`);
console.log(`REPROVADAS -> APROVARAM ......... ${mudou.filter((l) => ok(l.depois)).length}   <-- efeito da mudanca`);
console.log(`APROVARAM -> REPROVADAS ......... ${mudou.filter((l) => !ok(l.depois)).length}   <-- REGRESSAO`);
console.log(`continuam reprovadas ............ ${continuamRuins.length}`);

// Aulas que perderam erros sem virar aprovadas: a correcao aconteceu,
// mas a aula tem OUTRO defeito real e continua nao salvando.
const melhorouSemVirar = linhas.filter((l) => !ok(l.depois) && l.depois.errors.length < l.antes.errors.length);
const piorou = linhas.filter((l) => l.depois.errors.length > l.antes.errors.length);
if (melhorouSemVirar.length) {
  console.log(`\n${'-'.repeat(78)}\nPERDERAM ERROS FALSOS, MAS SEGUEM REPROVADAS POR DEFEITO REAL\n${'-'.repeat(78)}`);
  for (const l of melhorouSemVirar) {
    const someu = l.antes.errors.filter((e) => !l.depois.errors.includes(e));
    console.log(`  ${l.tema} r${l.run}: eliminou ${someu.length} erro(s) falso(s)`);
    for (const e of someu) console.log(`     - ${e}`);
    console.log(`     ainda reprova por: ${l.depois.errors.join(' | ')}`);
  }
}
if (piorou.length) {
  console.log(`\nPIORARAM: ${piorou.map((l) => `${l.tema} r${l.run}`).join(', ')}`);
}

if (mudou.length) {
  console.log(`\n${'-'.repeat(78)}\nMUDANCA DE RESULTADO\n${'-'.repeat(78)}`);
  for (const l of mudou) {
    console.log(`  ${l.arquivo.replace(/\.json$/, '')}`);
    console.log(`     antes:  ${ok(l.antes) ? 'APROVADA' : l.antes.errors.join(' | ')}`);
    console.log(`     depois: ${ok(l.depois) ? 'APROVADA' : l.depois.errors.join(' | ')}`);
  }
}

if (continuamRuins.length) {
  console.log(`\n${'-'.repeat(78)}\nAINDA REPROVADAS (nada foi relaxado; o defeito e real)\n${'-'.repeat(78)}`);
  for (const l of continuamRuins) console.log(`  ${l.tema} r${l.run}: ${l.depois.errors.join(' | ')}`);
}

const ainda = linhas.flatMap((l) => l.depois.errors).filter((e) => /answer.*muito curto/.test(e));
console.log(`\nreprovacoes por "answer muito curto" depois: ${ainda.length}  (esperado: 0)`);
fs.rmSync(TMP, { force: true });