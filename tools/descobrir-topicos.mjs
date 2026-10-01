// Descoberta: quais materias/topicos existem de fato no cronograma?
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrada = path.join(RAIZ, 'tools', '_cur-temp.mjs');
const bundle = path.join(process.env.TEMP, `cur-${Date.now()}.mjs`);
fs.writeFileSync(entrada, "export { curriculumDays, isGeneratedDay } from '../src/data/curriculum.js';\n", 'utf8');
const esbuild = (await import('esbuild')).default;
await esbuild.build({ entryPoints: [entrada], bundle: true, format: 'esm', outfile: bundle, logLevel: 'silent' });
const { curriculumDays, isGeneratedDay } = await import(pathToFileURL(bundle).href);
fs.rmSync(entrada, { force: true });
fs.rmSync(bundle, { force: true });

const gerados = curriculumDays.filter((d) => isGeneratedDay(d));
console.log(`blocos no cronograma: ${curriculumDays.length} | gerados: ${gerados.length}`);
const vistos = new Map();
for (const d of gerados) {
  const chave = `${d.subject} || ${d.topic}`;
  if (!vistos.has(chave)) vistos.set(chave, true);
}
for (const chave of vistos.keys()) console.log(`  ${chave}`);
