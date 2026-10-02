// ============================================================
// FINAL POLISH — testes do progresso e da sequencia.
//
//   node tools/verificar-metricas.mjs
//
// Usa o CURRICULO REAL (os 122 blocos elegiveis) como denominador,
// extraido com esbuild. Se o curriculo mudar, o denominador
// acompanha sozinho: nao existe constante solta para esquecer.
//
// Os dois bugs que estes testes caçam:
//
//  1. Progresso: `lessons.length` (2 entradas do arquivo de modelo)
//     como denominador fazia 2 concluidas aparecerem como 100%.
//  2. Sequencia: `valorCalculado || valorAntigo` ressuscitava um
//     numero morto quando o calculado era 0.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

import {
  officialProgress, computeStreak, longestStreak,
  accuracyPercent, countOfficialCompleted,
} from '../src/services/metrics.js';

let falhas = 0;
let total = 0;
function checar(rotulo, ok, detalhe = '') {
  total += 1;
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} | ${rotulo}${detalhe ? ` -> ${detalhe}` : ''}`);
}

// --- CURRICULO REAL -------------------------------------------------
const SAIDA = path.resolve('.tmp-bench/final/metricas-curriculo.mjs');
fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
await esbuild.build({
  entryPoints: ['src/data/curriculum.js'],
  bundle: true, format: 'esm', outfile: SAIDA, platform: 'neutral', logLevel: 'error',
});
const { curriculumDays } = await import(`file:///${SAIDA.replace(/\\/g, '/')}`);

// As 122: kind "lesson" (70) + "review" (52). "questions" nao sao aulas.
const OFICIAIS = curriculumDays
  .filter((d) => d.kind === 'lesson' || d.kind === 'review')
  .map((d) => d.id);
const TOTAL = OFICIAIS.length;

console.log(`\nCURRICULO REAL: ${TOTAL} licoes oficiais elegiveis`);
console.log(`  lesson=${curriculumDays.filter((d) => d.kind === 'lesson').length}`
  + ` review=${curriculumDays.filter((d) => d.kind === 'review').length}`
  + ` questions=${curriculumDays.filter((d) => d.kind === 'questions').length}`);
checar('o denominador vem do curriculo (122)', TOTAL === 122, `veio ${TOTAL}`);

// ------------------------------------------------------------
console.log('\n1. PROGRESSO — tabela obrigatoria');
{
  for (const [concluidas, esperado] of [[0, 0], [1, 1], [2, 2], [61, 50], [122, 100]]) {
    const r = officialProgress(OFICIAIS.slice(0, concluidas), OFICIAIS, TOTAL);
    checar(`${concluidas}/${TOTAL} => ${esperado}%`, r.percent === esperado, `veio ${r.percent}%`);
  }
  const r = officialProgress(OFICIAIS.slice(0, 2), OFICIAIS, TOTAL);
  checar('CENARIO REAL: 2 de 122 = 2% e NUNCA 100%', r.percent === 2 && r.done === 2, `${r.percent}% / ${r.done}`);
}

// ------------------------------------------------------------
console.log('\n2. PROGRESSO — o que NAO pode contar');
{
  const base = OFICIAIS.slice(0, 5);
  checar('ids duplicados nao somam', officialProgress([...base, ...base], OFICIAIS, TOTAL).done === 5);
  checar('id inexistente nao soma', officialProgress([...base, 'dia-fantasma-999'], OFICIAIS, TOTAL).done === 5);
  checar('aula personalizada nao soma', officialProgress([...base, 'custom:Por que o ceu e azul'], OFICIAIS, TOTAL).done === 5);
  checar('simulado nao soma', officialProgress([...base, 'simulado-final-2026'], OFICIAIS, TOTAL).done === 5);
  checar('vazio/null nao soma', officialProgress([...base, '', null, undefined], OFICIAIS, TOTAL).done === 5);
  checar('total zero nao divide por zero', officialProgress(base, [], 0).percent === 0);
}

// ------------------------------------------------------------
console.log('\n3. PROGRESSO — o valor antigo nao pode voltar');
{
  const r = officialProgress(OFICIAIS.slice(0, 3), OFICIAIS, TOTAL);
  checar('3/122 = 2%, nunca 100% (o bug antigo)', r.percent === 2, `veio ${r.percent}%`);
}
// ------------------------------------------------------------
console.log('\n4. SEQUENCIA — a regra');
{
  checar('estudou hoje => 1', computeStreak(['2026-03-10'], '2026-03-10') === 1);
  checar('tres dias seguidos => 3', computeStreak(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10') === 3);
  checar('hoje sem licao, ontem com => 2', computeStreak(['2026-03-08', '2026-03-09'], '2026-03-10') === 2);
  checar('perdeu um dia inteiro => 0', computeStreak(['2026-03-08'], '2026-03-10') === 0);
  checar('varios dias sem estudar nao ressuscita', computeStreak(['2026-03-01', '2026-03-02'], '2026-03-15') === 0);
  checar('atualizar a pagina nao aumenta', computeStreak(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10') === 3);
  checar('so aula personalizada nao cria dia oficial', computeStreak(['custom:ceu-azul'], '2026-03-10') === 0);
  checar('meia-noite / virada de dia', computeStreak(['2026-03-10', '2026-03-11'], '2026-03-11') === 2);
  checar('virada de mes', computeStreak(['2026-02-28', '2026-03-01'], '2026-03-01') === 2);
  checar('virada de ano', computeStreak(['2025-12-31', '2026-01-01'], '2026-01-01') === 2);
  checar('datas repetidas nao duplicam', computeStreak(['2026-03-10', '2026-03-10'], '2026-03-10') === 1);
  checar('recorde e o maximo historico', longestStreak(['2026-01-01', '2026-01-02', '2026-01-03']) === 3);
}

// ------------------------------------------------------------
console.log('\n5. SEQUENCIA — zero e resultado, nunca fallback');
{
  // Este e o bug do `|| valorAntigo`: com a sequencia quebrada,
  // o valor antigo nao pode aparecer.
  const calculado = computeStreak(['2026-01-01'], '2026-03-10');
  const COM_FALLBACK = calculado || 14;  // como estava no codigo
  checar('o bug antigo ressuscitava 14', COM_FALLBACK === 14);
  checar('a correcao devolve 0', calculado === 0);
  checar('a interface vera 0, nunca 14', calculado !== 14);
  checar('sequencia legitima continua valendo',
    computeStreak(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10') === 3);
}

// ------------------------------------------------------------
console.log('\n6. TAXA DE ACERTO');
{
  checar('8 de 28 => 29%', accuracyPercent(8, 28) === 29);
  checar('zero respondidas => 0 (nao NaN)', accuracyPercent(0, 0) === 0);
  checar('todas certas => 100', accuracyPercent(10, 10) === 100);
  checar('nenhuma certa => 0', accuracyPercent(0, 10) === 0);
  checar('valores invalidos nao viram NaN', Number.isFinite(accuracyPercent(undefined, undefined)) === true);
}

console.log(`\n${'-'.repeat(60)}`);
console.log(`${total - falhas}/${total} verificacoes OK · ${falhas} falha(s)`);
console.log(falhas === 0 ? 'CONFORME' : 'DIVERGENTE');
process.exit(falhas === 0 ? 0 : 1);