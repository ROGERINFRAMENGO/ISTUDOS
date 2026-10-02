// ============================================================
// FINALIZACAO — regra de divergencia entre `answer` e a resposta
// declarada na explicacao.
//
//   node tools/verificar-resposta-declarada.mjs
//
// A regra nasce de um erro real achado na amostragem da FASE E:
// o `answer` dizia "2/3" enquanto a explicacao provava, com a conta
// na tela, que "7/10" era o maior.
//
// O ponto mais importante deste arquivo NAO e a divergencia: sao os
// casos que NAO podem bloquear. Uma regra textual mal desenhada e o
// que destruiu a FASE C. Cada "nao bloquear" abaixo existe para
// travar isso.
//
// Nenhuma chamada de IA.
// ============================================================

import { findAnswerContradiction } from '../supabase/functions/_shared/schemas.js';

let falhas = 0;
let total = 0;
function checar(rotulo, ok, detalhe = '') {
  total += 1;
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} | ${rotulo}${detalhe ? ` -> ${detalhe}` : ''}`);
}
const bloqueia = (answer, explicacao) => Boolean(findAnswerContradiction(answer, explicacao));

// ------------------------------------------------------------
console.log('\n1. DIVERGENCIA (deve bloquear)');
{
  // O caso real da FASE E.
  const explicacao = 'mmc de 10 e 3 e 30. 7/10 vira 21/30 e 2/3 vira 20/30. '
    + '21/30 e maior que 20/30, entao 7/10 e maior que 2/3. Resposta: 7/10.';
  checar('fracoes: answer 2/3 x solucao 7/10', bloqueia('2/3', explicacao));
}
{
  checar('negativo: answer -5 x solucao -7', bloqueia('-5', 'Calculando, chega-se a -7. Resposta: -7.'));
}
{
  checar('sim x nao', bloqueia('sim', 'A analise mostra o contrario. Resposta: nao.'));
}
{
  checar('inteiro divergente', bloqueia('4', 'A soma resulta em 6. Resposta: 6.'));
}

// ------------------------------------------------------------
console.log('\n2. COERENTE (nao pode bloquear)');
{
  checar('fracoes: answer 7/10 x solucao 7/10', !bloqueia('7/10', '21/30 e maior. Resposta: 7/10.'));
  checar('negativo: answer -7 x solucao -7', !bloqueia('-7', 'A conta da -7. Resposta: -7.'));
  checar('sim x sim', !bloqueia('sim', 'Confere a definicao. Resposta: sim.'));
  checar('sem espaco: "Resposta:-7"', !bloqueia('-7', 'Chegamos a -7. Resposta:-7.'));
  checar('minuscula: "resposta: 7/10"', !bloqueia('7/10', 'Comparando. resposta: 7/10.'));
  checar('acentuado: "Resposta: Equatorial"', !bloqueia('Equatorial', 'A regiao quente. Resposta: Equatorial.'));
  checar('com ponto final no rotulo', !bloqueia('4', 'Somando tudo. Resposta: 4.'));
}

// ------------------------------------------------------------
console.log('\n3. NAO INTERPRETAVEL (nao pode bloquear)');
{
  checar('sem marcador algum', !bloqueia('7/10', 'A comparacao mostra que sete decimos e maior que dois tercos.'));
  checar('frase depois do marcador', !bloqueia('5', 'Resposta: a soma e cinco porque somamos os dois termos.'));
  checar('marcador de resultado, sem resposta', !bloqueia('9', 'Resultado: nove ao todo. Depois isso, Resposta: 9.'));
  checar('explicacao vazia', !bloqueia('5', ''));
  checar('answer vazio', !bloqueia('', 'Resposta: 5.'));
  checar('rotulo longo demais', !bloqueia('algo', 'Resposta: uma explicacao bastante longa que nao e um rotulo curto.'));
  checar('texto sem relacao nenhuma', !bloqueia('x', 'O ceu tem variacoes de cor conforme o horario do dia.'));
  checar('duas declaracoes, uma bate', !bloqueia('7/10', 'Primeiro teste. Resposta: 20/30. Conferindo de novo. Resposta: 7/10.'));
}

// ------------------------------------------------------------
console.log('\n4. NAO DEVE REPROVAR AULA BOA');
{
  // Respostas em palavra, bem comuns em aula de matematica.
  const casos = [
    ['Tropical atlantica', 'A regiao costeira e a mais chuvosa. Resposta: Tropical atlantica.'],
    ['Cresce', 'Com agua e luz, a planta cresce. Resposta: Cresce.'],
    ['Nao cresce', 'Sem agua, a planta morre. Resposta: Nao cresce.'],
    ['Diminui', 'Com a altitude a temperatura cai. Resposta: Diminui.'],
    ['Semiarida', 'O sertao recebe pouca chuva. Resposta: Semiarida.'],
    ['Clima', 'A media de muitos anos e o clima. Resposta: Clima.'],
  ];
  for (const [a, e] of casos) checar(`"${a}" nao e barrado`, !bloqueia(a, e));
}

console.log(`\n${'-'.repeat(60)}`);
console.log(`${total - falhas}/${total} verificacoes OK · ${falhas} falha(s)`);
console.log(falhas === 0 ? 'CONFORME' : 'DIVERGENTE - a regra ainda barra coisa boa');
process.exit(falhas === 0 ? 0 : 1);