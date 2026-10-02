// Le o benchmark ja gravado nas fases B e C e mostra a taxa de
// aprovacao por modelo no schema ESTRITO de aula. E a evidencia que
// justifica a escolha de modelo da FASE D — nao um palpite.
import fs from 'node:fs';
import path from 'node:path';

const raizes = ['.tmp-bench/1c2/aulas', '.tmp-bench/fase-b', '.tmp-bench/fase-c', '.tmp-bench/groq', '.tmp-bench/aulas'];

for (const raiz of raizes) {
  if (!fs.existsSync(raiz)) continue;
  const arquivos = [];
  const andar = (dir, prof = 0) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && prof < 3) andar(p, prof + 1);
      else if (e.isFile() && e.name.endsWith('.json') && e.name !== 'bundle.json') arquivos.push(p);
    }
  };
  andar(raiz);

  const por = {};
  for (const p of arquivos) {
    const nome = path.basename(p);
    if (!nome.includes('__')) continue;
    const modelo = nome.split('__')[0].replace(/-/g, '_');
    const reprovada = /INVALIDA|REPROVADA/.test(nome);
    por[modelo] ??= { ok: 0, fail: 0 };
    reprovada ? por[modelo].fail++ : por[modelo].ok++;
  }
  if (!Object.keys(por).length) continue;

  console.log(`\n${raiz}`);
  const linhas = Object.entries(por)
    .map(([m, v]) => ({ m, ...v, taxa: v.ok / (v.ok + v.fail) }))
    .sort((a, b) => b.taxa - a.taxa);
  for (const l of linhas) {
    const t = l.ok + l.fail;
    console.log(`  ${l.m.padEnd(24)} ${String(l.ok).padStart(2)}/${String(t).padStart(2)}  (${Math.round(l.taxa * 100)}%)`);
  }
}
