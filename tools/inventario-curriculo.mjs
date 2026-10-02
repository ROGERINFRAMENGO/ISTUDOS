// ============================================================
// FASE E — PRIORIDADE 3: inventario das 122 licoes oficiais.
//
//   node tools/inventario-curriculo.mjs
//
// As 122 licoes NAO estao no banco. Elas sao derivadas do
// cronograma estatico (src/data/schedule.js) e materializadas por
// src/data/curriculum.js. O que esta no banco e o CACHE do conteudo
// que a IA escreveu para uma licao, com uma chave por
// (versao, semana, dia, bloco, materia, topico).
//
// Este script monta o curriculo com esbuild (o fonte usa import sem
// extensao, que so o Vite resolve) e lista as 122 com a chave exata
// que o generate-lesson vai procurar.
//
// Nao chama IA. Nao escreve nada.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const SAIDA = path.resolve('.tmp-bench/fase-e/inventario.mjs');
const SAIDA_JSON = path.resolve('.tmp-bench/fase-e/inventario.json');
fs.mkdirSync(path.dirname(SAIDA), { recursive: true });

// Bundle de verdade: o Vite faz o mesmo no build.
await esbuild.build({
  entryPoints: ['src/data/curriculum.js'],
  bundle: true,
  format: 'esm',
  outfile: SAIDA,
  platform: 'neutral',
  logLevel: 'error',
});

const mod = await import(`file:///${SAIDA.replace(/\\/g, '/')}`);
const { curriculumDays } = mod;

// A mesma funcao do backend, replicada aqui para prever a chave sem
// chamar rede. Se divergir, o comparativo com o banco mente — e por
// isso a versao esta escrita a mao e conferida a cada uso.
const CONTENT_VERSION = 'p1-aulas-2026-09-30';

function chaveDe(p) {
  return [
    String(p.curriculumVersion ?? 'v2'),
    CONTENT_VERSION,
    String(p.week ?? '?'),
    String(p.dateKey ?? p.day ?? '?'),
    `b${Number(p.block) || 1}`,
    String(p.subject ?? '').toLowerCase().trim(),
    String(p.topic ?? '').toLowerCase().trim(),
  ].join('|');
}

// Achata o cronograma em uma lista de blocos de aula.
// curriculumDays JA e a lista plana: uma entrada por bloco de aula,
// com id, week, day, block, dateKey, subject e topic. Nao existe
// "days" com "blocks" dentro — a primeira versao deste script
// procurou um campo que nao existe e devolveu zero.
const licoes = curriculumDays.filter(Boolean).map((p) => {
  const plano = {
    week: p.week,
    day: p.day,
    dateKey: p.dateKey,
    block: p.block,
    subject: p.subject,
    topic: p.topic,
    subtopics: p.subtopics ?? [],
    kind: p.kind ?? 'lesson',
    curriculumVersion: p.curriculumVersion ?? mod.CURRICULUM_VERSION ?? 'v2',
  };
  return { id: p.id, ...plano, cacheKey: chaveDe(plano) };
});

const soAula = (l) => l.kind === 'lesson';
const porMateria = {};
for (const l of licoes) porMateria[l.subject] = (porMateria[l.subject] ?? 0) + 1;

const chaves = new Set(licoes.map((l) => l.cacheKey));

console.log('=== CURRICULO OFICIAL ===');
console.log(`  entradas em curriculumDays : ${licoes.length}`);
console.log(`  blocos de tipo 'lesson'    : ${licoes.filter(soAula).length}`);
console.log(`  ids distintos              : ${new Set(licoes.map((l) => l.id)).size}`);
console.log(`  chaves de cache distintas  : ${chaves.size}`);
console.log(`  chaves duplicadas          : ${licoes.length - chaves.size}`);
console.log('  por materia:');
for (const [m, n] of Object.entries(porMateria).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${m.padEnd(24)} ${n}`);
}
const kinds = {};
for (const l of licoes) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
console.log('  por kind:', JSON.stringify(kinds));

fs.writeFileSync(SAIDA_JSON, JSON.stringify(licoes, null, 2), 'utf8');
console.log(`\n  inventario salvo em ${SAIDA_JSON}`);

// Ultimas semanas: e onde o cronograma usa structures especiais.
console.log('\n=== AMOSTRA (primeiras 3 e ultimas 3) ===');
for (const l of [...licoes.slice(0, 3), ...licoes.slice(-3)]) {
  console.log(`  s${l.week} d${l.day} b${l.block} | ${l.subject} — ${l.topic}`);
  console.log(`      ${l.cacheKey}`);
}
