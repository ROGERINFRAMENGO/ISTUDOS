// ============================================================
// FASE C — relatorio do benchmark final (5 materias).
//   node tools/relatorio-fase-c.mjs
//
// A distincao que importa: falha de PROVIDER (structured output,
// cota, rede) NAO e falha de qualidade da aula. Somente as aulas que
// chegaram a ser validadas entram na conta de qualidade.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ = path.join(RAIZ, '.tmp-bench', 'fase-c', 'auditoria-fase-c.json');
if (!fs.existsSync(ARQ)) { console.error('sem auditoria-fase-c.json'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(ARQ, 'utf8'));

const provider = (r) => !r.ok;
const reprovou = (r) => r.ok && !r.validate_ok;
const aprovou = (r) => r.validate_ok;

const MAT = /vale \d|, e nao |, mas a resposta e/;
const TXT = /palavra corrompida|pontuacao quebrada|texto cortado/;

console.log('='.repeat(94));
console.log(' FASE C — benchmark final · 5 materias x 2 runs · gpt-oss-120b');
console.log('='.repeat(94));
console.log('caso                    resultado        lat  tokens  motivo');
console.log('-'.repeat(94));
for (const r of rows) {
  const caso = `${r.temaSlug.slice(0, 17)}/r${r.run}`.padEnd(22);
  let res = 'REPROVADA';
  let motivo = '?';
  if (aprovou(r)) { res = 'aprovada'; motivo = '-'; }
  else if (reprovou(r)) { motivo = r.categorias.join('+') || 'sem categoria'; }
  else { res = 'provider'; motivo = String(r.erro ?? '?').includes('Failed to generate') ? 'structured_output' : String(r.erro ?? '?').slice(0, 40); }
  console.log(`${caso} ${res.padEnd(16)} ${String(r.ms ?? 0).padStart(4)}  ${String(r.usage?.total ?? '-').padStart(6)}  ${motivo}`);
}

console.log('-'.repeat(94));
console.log(`aprovadas ................ ${rows.filter(aprovou).length}/${rows.length}`);
console.log(`reprovadas no validador ... ${rows.filter(reprovou).length}/${rows.length}`);
console.log(`falha de PROVIDER ........ ${rows.filter(provider).length}/${rows.length}  <- nao e falha de qualidade`);

const chegou = rows.filter((r) => r.ok);
console.log(`\ndas ${chegou.length} aulas que chegaram a ser validadas:`);
console.log(`  aprovadas ............... ${chegou.filter(aprovou).length}`);
console.log(`  reprovadas .............. ${chegou.filter(reprovou).length}`);

const errMat = rows.flatMap((r) => (r.erros ?? []).filter((e) => MAT.test(e)));
const errTxt = rows.flatMap((r) => (r.erros ?? []).filter((e) => TXT.test(e)));
console.log(`\nERRO MATEMATICO detectado: ${errMat.length}`);
for (const e of errMat) console.log(`  ${e}`);
console.log(`ERRO DE TEXTO detectado: ${errTxt.length}`);
for (const e of errTxt) console.log(`  ${e}`);

const lat = rows.filter((r) => r.ms).map((r) => r.ms);
if (lat.length) {
  console.log(`\nlatencia: min ${Math.min(...lat)}ms | media ${Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)}ms | max ${Math.max(...lat)}ms`);
}
const tok = rows.map((r) => r.usage?.total).filter(Boolean);
if (tok.length) console.log(`tokens: media ${Math.round(tok.reduce((a, b) => a + b, 0) / tok.length)} · max ${Math.max(...tok)}`);
