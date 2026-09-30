// Verifica a sintaxe de um modulo ESM do backend sem precisar do Deno.
// Copia o arquivo com o import ajustado e deixa o Node parsear.
// Uso: node scripts/checar-modulo.mjs supabase/functions/_shared/gemini.js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const alvo = process.argv[2];
if (!alvo) {
  console.error('Uso: node scripts/checar-modulo.mjs <arquivo.js>');
  process.exit(1);
}

const absoluto = path.resolve(alvo);
const fonte = fs.readFileSync(absoluto, 'utf8');
// No bundle o import vira "./_ai_config.js"; no source, "./ai_config.js".
const ajustado = fonte.replace(/from "\.\/_([a-z_]+)\.js"/g, 'from "./$1.js"');
const temporario = path.join(path.dirname(absoluto), `__check_${path.basename(absoluto, '.js')}.mjs`);
fs.writeFileSync(temporario, ajustado, 'utf8');

try {
  const modulo = await import(pathToFileURL(temporario).href);
  console.log(`${path.basename(alvo)}: SINTAXE OK | exports: ${Object.keys(modulo).join(', ')}`);
} catch (error) {
  // O Node costuma dizer so "Unexpected token". Para achar a linha de
  // verdade, reparseamos linha a linha ate o ponto em que quebra.
  let linha = '?';
  try {
    // eslint-disable-next-line no-new-func
    new Function(ajustado);
  } catch {
    const linhas = ajustado.split('\n');
    for (let i = 0; i < linhas.length; i += 1) {
      const parcial = linhas.slice(0, i + 1).join('\n');
      try {
        new Function(parcial);
      } catch (e) {
        if (/Unexpected|missing|Unexpected end/i.test(e.message)) {
          linha = `${i + 1}: ${linhas[i]}`;
          break;
        }
      }
    }
  }
  console.log(`${path.basename(alvo)}: FALHOU -> ${error.message}`);
  console.log(`   primeira linha suspeita -> ${linha}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporario, { force: true });
}
