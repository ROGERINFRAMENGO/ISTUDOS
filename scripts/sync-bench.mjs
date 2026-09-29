// Sincroniza deploy-src/ai-bench com a fonte de producao (_shared).
// O deploy usa modulos achatados: a ferramenta nao empacota ../_shared/*,
// entao o bundle leva sua propria copia com o prefixo "_".
// Uso: node scripts/sync-bench.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = path.join(raiz, 'supabase', 'functions', '_shared');
const bench = path.join(raiz, 'deploy-src', 'ai-bench');

fs.mkdirSync(bench, { recursive: true });
['http', 'nvidia', 'db', 'schemas', 'prompts', 'ai_config'].forEach((name) => {
  fs.copyFileSync(path.join(shared, `${name}.js`), path.join(bench, `_${name}.js`));
});

// Confere que o bench nao importa nada que ficou de fora do bundle.
const index = fs.readFileSync(path.join(bench, 'index.ts'), 'utf8');
const imports = [...index.matchAll(/from "\.\/(_[a-z_]+)\.js"/g)].map((m) => m[1]);
const existentes = fs.readdirSync(bench).map((f) => f.replace(/\.js$/, ''));
const faltando = imports.filter((i) => !existentes.includes(i));
if (faltando.length) {
  console.error(`ERRO: import sem arquivo no bundle: ${faltando.join(', ')}`);
  process.exit(1);
}
console.log(`sync-bench: ok | imports: ${imports.join(', ')}`);
