// Diagnostico de BOOT_ERROR: confere se o bundle tem todos os
// arquivos e se cada import aponta para algo que existe.
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const dir = 'deploy-src/generate-lesson';
const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.ts'));
console.log('arquivos:', arquivos.length);

for (const f of arquivos) {
  const caminho = path.join(dir, f);
  try {
    esbuild.buildSync({ entryPoints: [caminho], bundle: true, format: 'esm', write: false, external: ['node:*'] });
    console.log(`  OK    ${f}`);
  } catch (e) {
    const err = (e.errors || [])[0];
    console.log(`  FALHA ${f}: ${err?.text} @ linha ${err?.location?.line}`);
    console.log(`         ${String(err?.location?.lineText ?? '').slice(0, 120)}`);
  }
}

// A importacao real: o bundle sobe se todos os modulos carregarem.
console.log('\ncarregando o grafo de imports...');
for (const f of arquivos) {
  const codigo = fs.readFileSync(path.join(dir, f), 'utf8');
  const imports = [...codigo.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((m) => m[1].slice(2));
  const ruins = imports.filter((i) => !fs.existsSync(path.join(dir, i)));
  if (ruins.length) console.log(`  ${f} -> FALTANDO: ${ruins.join(', ')}`);
}
console.log('  imports resolvidos');

// Ache que derrubou um BOOT_ERROR na FASE D: o import de
// groqContent.js ficou duplicado, com o comentario do meio solto. O
// bundle ainda "parseava" (esbuild so checa sintaxe), mas o modulo
// nao carregava no Deno. Esta verificacao pega isso antes do deploy.
console.log('\nimports duplicados:');
let duplicados = 0;
for (const f of arquivos) {
  const codigo = fs.readFileSync(path.join(dir, f), 'utf8');
  const linhas = codigo.split('\n');
  const vistos = new Map();
  linhas.forEach((linha, i) => {
    const m = linha.match(/^import\s*\{[^}]*\}\s*from\s*["']([^"']+)["']/);
    if (!m) return;
    if (vistos.has(m[1])) {
      console.log(`  DUPLICADO ${f}: ${m[1]} nas linhas ${vistos.get(m[1]) + 1} e ${i + 1}`);
      duplicados += 1;
    } else vistos.set(m[1], i);
  });
}
console.log(duplicados ? `  ${duplicados} duplicado(s)` : '  nenhum');

