// ============================================================
// FASE B — prova de que a regra mudada faz o que foi pedido, e
// so isso.
//
// A mudanca foi uma unica: `guidedPractice[].answer` deixou de exigir
// 3 caracteres e passou a exigir 1. Este arquivo verifica os dois
// lados dessa frase, para o limite de 900 continuar sendo o que e.
//
//   node tools/verificar-regra-fase-b.mjs
// ============================================================

import { validateLesson } from '../supabase/functions/_shared/schemas.js';

const NUCLEAR = 'x'.repeat(935);   // 935 chars: o caso real da FASE 1D
const LONGA = 'y'.repeat(700);

const base = {
  title: 'Numeros inteiros no dia a dia',
  objectives: [
    'Reconhecer numeros negativos em situacoes do cotidiano',
    'Comparar e ordenar numeros inteiros com seguranca',
    'Aplicar operacoes com sinais em problemas',
  ],
  introduction: 'Os numeros inteiros aparecem no voltimetro, na temperatura e no saldo. Vamos entender como usa-los em situacoes reais do cotidiano e a resolver problemas com calma, sem perder o sinal negativo no meio do caminho.',
  sections: [
    {
      title: 'O que sao numeros inteiros',
      explanation: 'Numeros inteiros incluem os positivos, os negativos e o zero. Eles aparecem em temperaturas, saldos, altitudes e volts, ou seja, em situacoes reais do cotidiano e na natureza. O desenho dos inteiros ajuda a visualizar a posicao de cada um deles e a comparar valores distantes entre si com seguranca e precisao.',
      examples: [{ problem: 'A temperatura era de -5 graus e subiu 3 graus. Qual foi a temperatura final?', solution: 'A temperatura final foi de -2 graus, porque -5 + 3 = -2.', explanation: 'Subir 3 a partir de -5 leva a -2 graus quando avancamos tres casas para o lado positivo.' }],
    },
    {
      title: 'Comparacao entre valores',
      explanation: 'No desenho dos inteiros, quanto mais a direita, maior o valor. Isso vale para negativos tambem: -2 e maior que -5, mesmo que -5 tenha mais digitos. Essa ordem e usada em todo o sistema de medicoes do cotidiano e aparece com frequencia em questoes de prova.',
      examples: [{ problem: 'Qual e maior: -7 ou -2?', solution: 'E o numero -2, porque ele esta mais a direita.', explanation: '-2 e maior que -7 quando comparamos as posicoes de cada um no desenho.' }],
    },
    {
      title: 'Operacoes com sinais',
      explanation: 'Multiplicar dois negativos da positivo; multiplicar negativo por positivo da negativo. Na divisao vale a mesma regra. Erros de sinal sao o defeito mais comum em prova, e por isso o sinal precisa ser conferido antes de calcular o valor final, escrevendo a conta passo a passo.',
      examples: [{ problem: 'Calcule (-4) + 9.', solution: 'O resultado da soma e 5, porque -4 + 9 = 5.', explanation: 'Somar 9 a -4 resulta em 5 quando andamos 9 casas para o lado positivo.' }],
    },
  ],
  guidedPractice: [
    { question: 'Calcule (-10) + 6.', hint: 'Some mais 6 unidades partindo do inicio.', answer: '-4', explanation: 'Partindo de -10 e somando 6 unidades, chegamos a -4, porque -10 + 6 = -4.' },
    { question: 'Qual e maior entre -3 e -9?', hint: 'Compare onde cada valor aparece no desenho.', answer: '-3', explanation: 'O valor -3 esta mais a direita do que -9, por isso -3 e o maior dos dois.' },
    { question: 'Calcule (-2) x (-5).', hint: 'Dois sinais negativos se anulam.', answer: '10', explanation: 'Como os dois sinais sao negativos, o produto fica positivo: -2 x -5 = 10.' },
  ],
  commonMistakes: [
    'Achar que -2 e menor que -9 porque tem menos digitos',
    'Trocar o sinal na multiplicacao de dois negativos',
    'Somar os sinais em vez de somar os valores',
  ],
  summary: [
    'Inteiros sao os positivos, os negativos e o zero',
    'A reta numerica ordena os inteiros pela posicao',
    'Multiplicar dois negativos da resultado positivo',
  ],
};

const clonar = () => JSON.parse(JSON.stringify(base));
function testa(nome, mutar) {
  const aula = clonar();
  mutar(aula);
  const r = validateLesson(aula, {});
  const detalhe = r.ok ? '' : ` -> ${r.errors[0]}`;
  console.log(`  ${r.ok ? 'APROVA ' : 'REPROVA'} | ${nome}${detalhe}`);
  return r.ok;
}

console.log('\nO QUE A REGRA DEVE PERMITIR');
const b1 = testa('fixture inteiro: 3 respostas curtas ("-4", "-3", "10")', () => {});
const b2 = testa('answer de 1 caractere, coerente com a explicacao', (a) => {
  a.guidedPractice[2].answer = '5';
  a.guidedPractice[2].explanation = 'Como os dois sinais se anulam, o produto fica positivo: -2 x -5 = 5 na conta proposta.';
});
const b3 = testa('answer "-4" reescrito, coerente com a explicacao', (a) => {
  a.guidedPractice[0].answer = '-4';
  a.guidedPractice[0].explanation = 'Partindo de -10 e somando 6 unidades, chegamos a -4, porque -10 + 6 = -4.';
});

console.log('\nO QUE A REGRA DEVE CONTINUAR REJEITANDO');
const r1 = testa('answer VAZIA', (a) => { a.guidedPractice[0].answer = ''; });
const r2 = testa('answer AUSENTE', (a) => { delete a.guidedPractice[0].answer; });
const r3 = testa('answer com 700 chars (acima do maximo de 400)', (a) => { a.guidedPractice[0].answer = LONGA; });
const r4 = testa('examples[].explanation com 935 chars (acima do maximo de 900)', (a) => { a.sections[0].examples[0].explanation = NUCLEAR; });
const r5 = testa('todas as secoes com 120 chars de explicacao (abaixo do minimo de 260)', (a) => { a.sections.forEach((s) => { s.explanation = 'z'.repeat(120); }); });
const r6 = testa('apenas 1 secao (abaixo do minimo de 3)', (a) => { a.sections = [a.sections[0]]; });
const r7 = testa('resposta curta mas CONTRADITA pela explicacao', (a) => {
  a.guidedPractice[0].answer = '-4';
  a.guidedPractice[0].explanation = 'A resposta correta deste exercico e 777, bem diferente do campo answer escrito aqui.';
});

console.log('\nVEREDITO');
const espera = [
  [b1 && b2 && b3, 'respostas curtas corretas passam'],
  [!r1 && !r2, 'resposta vazia/ausente continua rejeitada'],
  [!r3, 'answer acima de 400 continua rejeitado'],
  [!r4, 'limite de 900 em examples[].explanation INTACTO'],
  [!r5, 'profundidade minima INTACTA'],
  [!r6, 'minimo de secoes INTACTO'],
  [!r7, 'coerencia enunciado/resposta INTACTA'],
];
let tudoOk = true;
for (const [passou, desc] of espera) {
  console.log(`  ${passou ? 'OK  ' : 'FALHA'} ${desc}`);
  if (!passou) tudoOk = false;
}
console.log(`\n${tudoOk ? 'TUDO CONFORME' : 'HA FALHA — nao publicar'}`);
process.exit(tudoOk ? 0 : 1);