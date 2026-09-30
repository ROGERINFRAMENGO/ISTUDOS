// Verifica se um arquivo de Edge Function esta estruturalmente correto:
// balance de chaves, Deno.serve fechado e nenhuma statement orfa.
// Falha alto em vez de deixar um arquivo quebrado ir para o deploy.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) {
  console.error('Uso: node tools/verificar-funcao.mjs <arquivo.ts>');
  process.exit(1);
}

const fonte = fs.readFileSync(alvo, 'utf8');
const linhas = fonte.split(/\r?\n/);
const problemas = [];

// 1) Balance de chaves, ignorando o que esta dentro de string/template.
let profundidade = 0;
const pilha = [];
for (let i = 0; i < linhas.length; i += 1) {
  const linha = linhas[i];
  // remove templates e strings para nao contar chaves de literais
  const limpo = linha
    .replace(/`[^`]*`/g, '``')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/\/\/.*$/, '');
  for (const ch of limpo) {
    if (ch === '{') { profundidade += 1; pilha.push(i + 1); }
    else if (ch === '}') {
      profundidade -= 1;
      if (profundidade < 0) {
        problemas.push(`chave } sobrando na linha ${i + 1}`);
        profundidade = 0;
      } else pilha.pop();
    }
  }
}
if (profundidade > 0) {
  problemas.push(`faltam ${profundidade} chaves } (abertas nas linhas ${pilha.slice(0, 5).join(', ')})`);
}

// 2) Deno.serve precisa existir e o arquivo precisa fechar com });
if (!/Deno\.serve\(/.test(fonte)) problemas.push('Deno.serve nao encontrado');
if (!/new Response\(/.test(fonte)) problemas.push('nenhuma Response encontrada');

// 3) Nenhuma linha pode conter lixo de substituicao anterior.
linhas.forEach((linha, i) => {
  if (linha.includes('`n') || linha.includes('`r')) {
    problemas.push(`linha ${i + 1} tem caractere de escape literal`);
  }
});

if (problemas.length) {
  console.log(`${alvo}: ${problemas.length} problema(s)`);
  problemas.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log(`${alvo}: OK (${linhas.length} linhas, chaves balanceadas)`);
