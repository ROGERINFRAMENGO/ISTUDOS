// ============================================================
// Diagnostico do cronograma: por que 69 dias e 136 (ou 137) blocos?
// ------------------------------------------------------------
// O requisito fala em 137 blocos. Este script NAO inventa numero:
// ele conta o que existe na fonte (src/data/schedule.js), mostra
// de onde vem cada bloco e aponta onde a contagem pode divergir.
//
// Uso: node tools/contar-blocos.mjs
// ============================================================

const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');
const esbuild = (await import('esbuild')).default;

// src/data/curriculum.js importa './schedule' SEM extensao: o Vite
// resolve, o Node puro nao. Em vez de mexer no codigo de producao,
// este script empacota os dois arquivos num .mjs temporario.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrada = path.join(raiz, 'tools', '_entrada-contar.mjs');
const temporario = path.join(os.tmpdir(), `contar-${Date.now()}.mjs`);

fs.writeFileSync(
  entrada,
  [
    "export { scheduleWeeks, DAILY_PLAN, SCHEDULE_START, SCHEDULE_END, TOTAL_WEEKS } from '../src/data/schedule.js';",
    "export { curriculumDays, isGeneratedDay, totalGeneratedBlocks, CURRICULUM_VERSION } from '../src/data/curriculum.js';",
  ].join('\n'),
  'utf8',
);

await esbuild.build({
  entryPoints: [entrada],
  bundle: true,
  format: 'esm',
  outfile: temporario,
  logLevel: 'silent',
});

const schedule = await import(pathToFileURL(temporario).href);
const curriculum = schedule;
fs.rmSync(entrada, { force: true });
fs.rmSync(temporario, { force: true });

const semanas = schedule.scheduleWeeks;
let dias = 0;
let blocos = 0;
const porDia = [];

semanas.forEach((semana) => {
  (semana.days ?? []).forEach((dia) => {
    dias += 1;
    const lista = dia.blocks ?? [];
    blocos += lista.length;
    porDia.push({
      semana: semana.number,
      key: dia.key,
      weekday: dia.weekday,
      blocos: lista.length,
      materias: lista.map((b) => `${b.subject}${b.kind === 'questions' ? '(Q)' : ''}`).join(' + '),
      minutos: lista.reduce((n, b) => n + (b.minutes ?? 0), 0),
    });
  });
});

console.log('=== CONTAGEM DIRETA DA FONTE (src/data/schedule.js) ===');
console.log(`semanas: ${semanas.length}`);
console.log(`dias: ${dias}`);
console.log(`blocos (soma de day.blocks): ${blocos}`);

const kinds = {};
porDia.forEach((d) => (d.materias.match(/\(Q\)/g) ?? []).forEach(() => (kinds.q = (kinds.q ?? 0) + 1)));
console.log(`\nblocos de questoes (kind=questions): ${kinds.q ?? 0}`);

// ---- O que o app realmente conta como "bloco de aula" ----
const plans = curriculum.curriculumDays;
const gerados = plans.filter(curriculum.isGeneratedDay);
const deQuestao = plans.filter((p) => p.kind === 'questions');

console.log('\n=== O QUE O APP CONTA (src/data/curriculum.js) ===');
console.log(`curriculumDays (itens de plano): ${plans.length}`);
console.log(`totalGeneratedBlocks (isGeneratedDay): ${gerados.length}`);
console.log(`blocos de questoes (kind=questions): ${deQuestao.length}`);

// ---- Dias com contagem diferente de 2: candidatos a divergencia ----
console.log('\n=== DIAS COM NUMERO DE BLOCOS DIFERENTE DE 2 ===');
const foraDoPadrao = porDia.filter((d) => d.blocos !== 2);
if (!foraDoPadrao.length) console.log('nenhum: todos os 69 dias tem 2 blocos');
foraDoPadrao.forEach((d) => console.log(`  S${d.semana} ${d.key} ${d.weekday}: ${d.blocos} bloco(s) | ${d.materias}`));

// ---- Dias duplicados / chaves repetidas ----
const porKey = new Map();
porDia.forEach((d) => porKey.set(d.key, (porKey.get(d.key) ?? 0) + 1));
const chavesRepetidas = [...porKey.entries()].filter(([, n]) => n > 1);
console.log('\n=== CHAVES DE DIA REPETIDAS ===');
console.log(chavesRepetidas.length ? chavesRepetidas.map(([k, n]) => `${k} x${n}`).join(', ') : 'nenhuma');

// ---- O mesmo (dia, bloco, materia) aparece duas vezes? ----
const assinaturas = new Map();
plans.forEach((p) => {
  const sig = `${p.dateKey}|b${p.block}|${p.subject}|${p.topic}`;
  if (!assinaturas.has(sig)) assinaturas.set(sig, []);
  assinaturas.get(sig).push(p.id);
});
const colisoes = [...assinaturas.entries()].filter(([, ids]) => ids.length > 1);
console.log('\n=== COLISAO (dia+bloco+materia+topico) ===');
console.log(colisoes.length ? colisoes.map(([s, ids]) => `${s} -> ${ids.length}x`).join('\n') : 'nenhuma');

// ---- Onde um 137 poderia estar "escondido" ----
console.log('\n=== DIAGNOSTICO ===');
const porDia2 = porDia.filter((d) => d.blocos === 2).length;
console.log(`- dias com 2 blocos: ${porDia2} | dias com 1 bloco: ${porDia.filter((d) => d.blocos === 1).length} | outros: ${porDia.filter((d) => d.blocos !== 1 && d.blocos !== 2).length}`);
console.log(`- soma dos blocos: ${blocos}`);
console.log(`- se um unico dia tivesse 3 blocos em vez de 2, a soma seria ${blocos + 1}`);
console.log(`- scheduleWeeks.flatMap(w => w.days).length = ${semanas.flatMap((w) => w.days ?? []).length}`);