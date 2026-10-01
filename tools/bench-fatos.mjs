// ============================================================
// EXTRAI as afirmacoes que podem conter erro factual.
// ------------------------------------------------------------
// O benchmark nao consegue provar verdade. Este script apenas
// REUNE os trechos onde um erro factual seria grave (definicoes,
// classificacoes, formulas, solucoes de exercicio, causa e
// efeito) para eu ler e julgar um a um. A leitura e manual.
//
// Uso: node tools/bench-fatos.mjs [slug do modelo]
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const DIR = '.tmp-bench/aulas';
const filtro = process.argv[2] ?? '';

const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f.includes(filtro));

for (const arq of arquivos) {
  const aula = JSON.parse(fs.readFileSync(path.join(DIR, arq), 'utf8'));
  console.log(`\n${'='.repeat(74)}`);
  console.log(`${arq}`);
  console.log(`titulo: ${aula.title}`);
  console.log(`${'='.repeat(74)}`);

  console.log('\n[INTRODUCAO]');
  console.log(aula.introduction);

  for (const s of aula.sections ?? []) {
    console.log(`\n[SECAO] ${s.title}`);
    console.log(s.explanation);
    for (const [i, ex] of (s.examples ?? []).entries()) {
      console.log(`\n  [EXEMPLO ${i + 1}] ${ex.problem}`);
      console.log(`  -> ${ex.solution}`);
      console.log(`  porque: ${ex.explanation}`);
    }
  }

  console.log('\n[EXERCICIOS]');
  for (const [i, g] of (aula.guidedPractice ?? []).entries()) {
    console.log(`\n  ${i + 1}. ${g.question}`);
    console.log(`     resposta: ${g.answer}`);
    console.log(`     porque: ${g.explanation}`);
  }

  console.log('\n[ERROS COMUNS]');
  (aula.commonMistakes ?? []).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log('\n[RESUMO]');
  (aula.summary ?? []).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
}