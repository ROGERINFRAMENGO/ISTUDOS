// Teste rápido do curriculum.js (roda com: node scripts/testar-curriculum.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scheduleSrc = fs.readFileSync(path.join(raiz, 'src/data/schedule.js'), 'utf8');
const scheduleUrl = `data:text/javascript;base64,${Buffer.from(scheduleSrc).toString('base64')}`;

const curriculumSrc = fs
  .readFileSync(path.join(raiz, 'src/data/curriculum.js'), 'utf8')
  .replace("from './schedule'", `from '${scheduleUrl}'`);

const mod = await import(`data:text/javascript;base64,${Buffer.from(curriculumSrc).toString('base64')}`);

console.log('total de planos:', mod.curriculumDays.length);
console.log('blocos de aula (gerados):', mod.totalGeneratedBlocks);
console.log('versao do curriculo:', mod.CURRICULUM_VERSION);
console.log('');

['2026-09-28', '2026-09-29', '2026-10-04', '2026-11-09', '2026-12-05'].forEach((data) => {
  console.log(`${data} -> SEMANA ${mod.getWeekNumber(data)}`);
  mod.getPlanDaysForDate(data).forEach((p) => {
    console.log(`  bloco ${p.block}/${p.blockCount} (${p.durationMinutes}min, ${p.blockLabel})`);
    console.log(`    materia: ${p.subject}`);
    console.log(`    topico : ${p.topic}`);
    console.log(`    subtop : ${p.subtopics.join(' | ')}`);
    console.log(`    tipo   : ${p.kind}  |  aula IA: ${mod.isGeneratedDay(p)}`);
    console.log(`    fase   : ${p.phase}`);
    console.log(`    id     : ${p.id}`);
  });
  console.log('');
});

// Semana de cada dia, lado a lado.
console.log('--- Semana de todas as datas ---');
const datas = [];
mod.curriculumDays.forEach((p) => {
  if (!datas.includes(p.dateKey)) datas.push(p.dateKey);
});
datas.forEach((d) => {
  const semana = mod.getWeekNumber(d);
  const nBlocos = mod.getPlanDaysForDate(d).length;
  const materias = mod.getPlanDaysForDate(d).map((p) => p.subject).join(' + ');
  console.log(`S${String(semana).padStart(2)} ${d} (${nBlocos} bloco[s]): ${materias}`);
});
