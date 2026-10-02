// Descoberta do estado real das 122 licoes oficiais.
//
//   node tools/descobrir-curriculo.mjs
//
// Pergunta: as 122 licoes vivem onde? No banco ou nos arquivos?
// A resposta muda tudo o que a fase precisa fazer.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SRC = path.resolve('src/data');

// O projeto usa import sem extensao em alguns arquivos (o Vite
// resolve). O Node nao. Aqui reescrevemos numa copia temporaria,
// sem tocar no fonte, so para conseguir carregar e contar.
function carregar(nome) {
  const arquivo = path.join(SRC, `${nome}.js`);
  let codigo = fs.readFileSync(arquivo, 'utf8');
  codigo = codigo.replace(/from\s+['"]\.\/([a-zA-Z0-9_]+)['"]/g, "from './$1.js'");
  const temp = path.join(SRC, `.__tmp_${nome}.mjs`);
  fs.writeFileSync(temp, codigo, 'utf8');
  return temp;
}

const arquivos = ['curriculum.js', 'schedule.js', 'lessons.js', 'lessonContent.js'];
for (const a of arquivos) {
  const p = path.join(SRC, a);
  const txt = fs.readFileSync(p, 'utf8');
  const exports = [...txt.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const contaIds = (txt.match(/\bid:\s*['"]/g) || []).length;
  const conta122 = /122/.test(txt);
  console.log(`${a.padEnd(20)} ${String(Math.round(fs.statSync(p).size / 1024)).padStart(3)} KB  exports: ${exports.slice(0, 6).join(', ')}`);
  console.log(`${''.padEnd(20)}      ocorrencias de "id: '": ${contaIds}   menciona 122: ${conta122}`);
}

// Carrega o curriculo de verdade.
const { arquivo: temp } = carregar('curriculum');
const mod = await import(temp);
console.log(`\nexports do curriculum.js: ${Object.keys(mod).join(', ')}`);

for (const [nome, valor] of Object.entries(mod)) {
  if (!Array.isArray(valor)) continue;
  const ids = new Set(valor.map((v) => v?.id).filter(Boolean));
  console.log(`  ${nome}: ${valor.length} itens, ${ids.size} ids unicos`);
  if (valor.length > 50) {
    const porMat = {};
    for (const l of valor) {
      const m = l.subject ?? l.materia ?? l.area ?? '(sem materia)';
      porMat[m] = (porMat[m] ?? 0) + 1;
    }
    console.log('    por materia:', JSON.stringify(porMat));
    console.log('    primeiro:', JSON.stringify(valor[0]).slice(0, 200));
    console.log('    ultimo:  ', JSON.stringify(valor[valor.length - 1]).slice(0, 200));
    const campos = Object.keys(valor[0] ?? {});
    console.log('    campos:  ', campos.join(', '));
  }
}
fs.unlinkSync(temp);
