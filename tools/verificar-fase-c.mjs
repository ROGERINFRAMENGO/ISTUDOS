// ============================================================
// FASE C — provas deterministicas dos verificadores novos.
//
//   node tools/verificar-fase-c.mjs
//
// Cobre os casos da ETAPA 10: os erros REAIS medidos em producao
// (FASE B) e as contas citadas no plano. Nao chama IA nenhuma, entao
// o resultado e estavel e repetivel.
//
// Etiquetas: [DEVE PEGAR] = o problema tem de ser detectado.
//             [NAO PEGAR] = o texto e limpo e nao pode ser barrado.
// Um falso positivo aqui custa uma aula inteira regenerando.
// ============================================================

import { avaliarExpressao, verificarAula as verificarMatematica } from '../supabase/functions/_shared/mathCheck.js';
import { detectarCorrupcao } from '../supabase/functions/_shared/textCheck.js';

let falhas = 0;
let total = 0;

function checar(rotulo, ok, detalhe = '') {
  total += 1;
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} | ${rotulo}${detalhe ? ` -> ${detalhe}` : ''}`);
}

// ------------------------------------------------------------
// 1. MATEMATICA — os casos do plano
// ------------------------------------------------------------
console.log('\n1. MATEMATICA DETERMINISTICA');

const conta = (enunciado, resposta, devePegar, nome) => {
  const aula = {
    sections: [],
    guidedPractice: [{ question: enunciado, answer: resposta, explanation: "Confira a conta." }],
    commonMistakes: [], summary: [],
  };
  const achados = verificarMatematica(aula);
  checar(nome, (achados.length > 0) === devePegar, achados[0] ?? "sem erro");
};

conta('Resolva 45 * (-9).', '-5', true, '[DEVE PEGAR] 45 * (-9) = -5 (real da FASE B)');
conta('Resolva 45 * (-9).', '-405', false, '[NAO PEGAR] 45 * (-9) = -405 (correto)');
conta('Calcule (-12) + 5.', '-7', false, '[NAO PEGAR] (-12) + 5 = -7 (correto)');
conta('Calcule (-3) * (-8).', '24', false, '[NAO PEGAR] (-3) * (-8) = 24 (correto)');
conta('Calcule (-10) + 6.', '-4', false, '[NAO PEGAR] (-10) + 6 = -4 (caso da FASE B)');
conta('Calcule (-10) + 6.', '-7', true, '[DEVE PEGAR] (-10) + 6 = -7 (errado)');
conta('Resolva 45 · (-9).', '-5', true, '[DEVE PEGAR] 45 middot (-9) = -5');
conta('Veja que -5 + 3 = 99 esta certo.', '-2', true, '[DEVE PEGAR] igualdade errada no texto');
conta('Veja que -5 + 3 = -2 esta certo.', '-2', false, '[NAO PEGAR] igualdade correta no texto');

console.log('\n   o que NAO pode ser bloqueado (conservador):');
conta('Reuniao em 15/10/2026 as 14h.', 'ok', false, '[NAO PEGAR] data e hora');
conta('Quantos atomos de O2 existem no CO2?', '1 carbono e 2 oxigenios', false, '[NAO PEGAR] resposta nao numerica');
conta('Calcule 2 ^ 3.', '8', false, '[NAO PEGAR] potencia fora do subconjunto');
conta('Some 1,5 e 2,5.', '4', false, '[NAO PEGAR] virgula decimal');
conta('Calcule 10 / 0.', '0', false, '[NAO PEGAR] divisao por zero');
conta('Calcule 2 + 3 e depois 4 * 5.', '12', false, '[NAO PEGAR] duas contas no enunciado');
conta('Explique o conceito de substancia simples.', 'ok', false, '[NAO PEGAR] texto sem numero');
conta('Calcule (-2) x (-5).', '10', false, '[NAO PEGAR] "x" fora do subconjunto nao gera falso positivo');

console.log('\n   parser:');
for (const [e, esp] of [['(2 + 3) * 4', 20], ['100 / 4', 25], ['2 + 3 * 4', 14]]) {
  const got = avaliarExpressao(e);
  checar(`avalia "${e}"`, got !== null && Math.abs(got - esp) < 1e-9, String(got));
}
for (const e of ['raiz de 9', '2 ^ 3', '1e5', '10%', 'R$ 5', 'x', '']) {
  checar(`recusa "${e}"`, avaliarExpressao(e) === null, String(avaliarExpressao(e)));
}
// ------------------------------------------------------------
// 2. TEXTO — os casos reais da FASE B
// ------------------------------------------------------------
console.log('\n2. TEXTO CORROMPIDO');

const texto = (t, devePegar, nome) => {
  const r = detectarCorrupcao(t, { tamanhoMinimo: 40, exigirFimDeFrase: true });
  checar(nome, (r !== null) === devePegar, r ?? "limpo");
};

texto('O nucleo tem protones e a eletrosfera tem os eletletoes que giram em alta velocidade ao redor do nucleo do atomo.',
  false, '[LIMITE] eletletoes: blend de palavras, NAO detectavel sem dicionario');
texto('Nas provas da Etec, pedem para relacionar as cargas eletricas deas que aparecem no desenho do atomo.',
  true, '[DEVE PEGAR] deas (real da FASE B)');
texto('A pergunta de quantos elementos quimicos ela e feita?? e o tipo de enunciado mais comum na prova.',
  true, '[DEVE PEGAR] feita?? (real da FASE B)');
texto('A molecula surge porque os atomos buscam estabilidade compartilhando AddedAddedAddedAddedAddedAddedAddedAdded',
  true, '[DEVE PEGAR] repeticao adjacente real');

console.log('\n   o padrao "Resposta: X" e legitimo (contraexemplo real do benchmark):');
texto('Primeiro, reconheca que 7 + (-3) = 7 - 3 = 4.\nResposta: 4', false, '[NAO PEGAR] solucao terminando em Resposta: 4');
texto('Primeiro, some os algarismos de 84: 8 + 4 = 12. Como 12 / 3 = 4, 84 e divisivel por 3.\nResposta: sim', false, '[NAO PEGAR] solucao terminando em Resposta: sim');

console.log('\n   nao pode barrar texto bom:');
texto('O atomo e a unidade fundamental da materia, e sua estrutura define as propriedades de cada material.',
  false, '[NAO PEGAR] frase normal');
texto('As moleculas de CO2, H2O e O2 sao formadas por atomos ligados quimicamente entre si deWays diferentes.',
  false, '[NAO PEGAR] formulas quimicas');
texto('O indice indica quantos atomos existem em cada molecula, e essa informacao aparece com clareza na prova de quimica.',
  false, '[NAO PEGAR] palavra terminada em "ca"');
texto('A substancia simples possui apenas um tipo de elemento na sua composicao basica e bem definida.',
  false, '[NAO PEGAR] ponto final normal');
texto('Qual e a diferenca entre uma substancia simples e uma substancia composta no cotidiano?',
  false, '[NAO PEGAR] interrogacao valida');
texto('Ele disse que sim e depois Added aos poucos valores originais que constavam na tabela antiga do exercicio.',
  false, '[NAO PEGAR] palavra isolate "Added"');
texto('-4', false, '[NAO PEGAR] texto curto (ignorado)');
texto('A prova Asked Added Added Added Added Added Added Added Added Added Added Added AddedAddedAdded Asked',
  true, '[DEVE PEGAR] repeticao+colisao forma Asked');

console.log('\n   limite declarado (nao coberto, por decisao):');
texto('...indicam quantos atomos de cada elemento existem naquela molecula espec.',
  false, '[LIMITE] palavra truncada COM ponto: indistinguivel de "logic"/"public"');

console.log(`\n${'-'.repeat(60)}`);
console.log(`${total - falhas}/${total} verificacoes OK · ${falhas} falha(s)`);
console.log(falhas === 0 ? 'CONFORME' : 'DIVERGENTE — nao publicar');
process.exit(falhas === 0 ? 0 : 1);