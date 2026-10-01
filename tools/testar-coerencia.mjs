// ============================================================
// Testa a defesa de COERENCIA do validateLesson (Prioridade 1).
// O que importa aqui: ela pega o erro real do CO2 e NAO cria falso
// positivo que trava uma aula boa.
//
// Uso: node tools/testar-coerencia.mjs
// ============================================================

import { findCoherenceIssues, findDuplicatedWords, validateLesson } from '../supabase/functions/_shared/schemas.js';

const ex = (problem, solution, explanation) => ({ problem, solution, explanation });

const soExemplos = (problem, solution, explanation) => ({
  sections: [{ examples: [ex(problem, solution, explanation)] }],
  guidedPractice: [],
});

const CASOS = [
  // ERRO REAL: o enunciado diz N2 e a explicacao puxa "nitrogenio" +
  // fala de "um tipo de elemento". Reproduz o formato do erro achado.
  ['ERRO REAL: enunciado diz N2, explicacao fala de nitrogenio', soExemplos(
    'O gas carbonico e formado apenas por moleculas de N2. Ele e considerado uma substancia simples ou composta?',
    'O gas carbonico e uma substancia simples.',
    'Como a molecula e formada por apenas um tipo de elemento quimico, o nitrogenio, ela e classificada como substancia simples.',
  ), true],
  // O tema da aula E essa classificacao: responder o termo NAO e erro.
  ['Aula de Ciencias normal (nao pode reprovar)', soExemplos(
    'O gas carbonico (CO2) e formado por moleculas com atomos de carbono e oxigenio. Ele e uma substancia simples ou composta?',
    'Ele e uma substancia composta.',
    'Ele e composta porque a molecula tem dois elementos diferentes: carbono e oxigenio.',
  ), false],
  ['CONTA ERRADA', soExemplos(
    'Calcule 15 - 22 + (-7).',
    'A resposta e 5.',
    'Basta somar os numeros.',
  ), true],
  ['CONTA CERTA (nao pode reprovar)', soExemplos(
    'Calcule 15 - 22 + (-7).',
    '15 - 22 = 15 + (-22) = -7. Depois -7 + (-7) = -14.',
    '15 - 22 = -7. Depois -7 + (-7) = -14 porque mesmo sinal soma modulos.',
  ), false],
  ['ENUNCIADO TEXTUAL com horario (nao pode reprovar)', soExemplos(
    'A biblioteca funciona de segunda a sexta, das 7h as 18h. Qual o horario na sexta?',
    'Das 7h as 18h.',
    'O texto diz que de segunda a sexta funciona das 7h as 18h. Sexta esta nesse intervalo.',
  ), false],
];

let falhas = 0;

console.log('--- findCoherenceIssues ---');
for (const [nome, entrada, devePegar] of CASOS) {
  const issues = findCoherenceIssues(entrada);
  const pegou = issues.length > 0;
  const ok = pegou === devePegar;
  if (!ok) falhas += 1;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}`);
  console.log(`        esperado ${devePegar ? 'reprovar' : 'aprovar'} | obtido ${pegou ? 'reprovar' : 'aprovar'}`);
  issues.forEach((i) => console.log(`        -> ${i.slice(0, 115)}`));
}

// A defense precisa estar DENTRO do validateLesson, nao so no helper.
const LONGO = 'Explicacao suficientemente longa para passar da validacao minima de tamanho exigida pelo schema novo, com detalhe suficiente para a aula contar como aula de verdade e nao como texto vazio. Repetindo para garantir comprimento minimo exigido aqui. Mais um pedaco de texto para ultrapassar com folga o piso de profundidade. ';

const aulaBase = {
  title: 'Substancias',
  introduction: 'Vamos aprender sobre materia e substancias, o que existe em volta de nos.',
  objectives: ['Distinguir substancia simples de composta', 'Reconhecer misturas no dia a dia'],
  sections: [0, 1, 2].map((i) => ({
    title: 'Parte ' + (i + 1),
    explanation: LONGO,
    examples: [ex(
      'Uma amostra de agua pura e formada por hidrogenio e oxigenio. Ela e substancia simples ou composta?',
      'Ela e uma substancia composta.',
      'Como tem dois elementos diferentes, hidrogenio e oxigenio, ela e uma substancia composta.',
    )],
  })),
  guidedPractice: [0, 1, 2].map(() => ({
    question: 'A agua do mar e substancia simples ou composta?',
    hint: 'Conte os elementos.',
    answer: 'E uma substancia composta.',
    explanation: 'A agua do mar contem agua e sal, que sao substancias diferentes, portanto e uma mistura.',
  })),
  commonMistakes: [
    'Errar a conta de Chainsaw e nao conferir o resultado no fim',
    'Confundir substancia simples com composta no laboratorio',
    'Esquecer de lavar a vidraria ao final do experimento pratico',
  ],
  summary: [
    'Materia e tudo que ocupa lugar no espaco',
    'Substancia simples tem um elemento so na composicao',
    'Substancia composta tem dois ou mais elementos juntos',
    'Mistura junta substancias sem reacao quimica entre elas',
  ],
};

const CTX = { subject: 'Ciencias', topic: 'materia', subtopics: ['materia', 'substancia', 'mistura'], durationMinutes: 55 };

const v1 = validateLesson(aulaBase, CTX);
console.log(`\n--- validateLesson ---\n${v1.ok ? 'OK   ' : 'FALHA'} aula boa e aprovada (ok=${v1.ok})`);
if (!v1.ok) { falhas += 1; v1.errors.slice(0, 6).forEach((e) => console.log('        -> ' + e)); }

const checar = (nome, aula, ctx, esperado) => {
  const v = validateLesson(aula, ctx);
  const ok = v.errors.some((e) => e.includes(esperado));
  if (!ok) falhas += 1;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}`);
  if (ok) console.log(`        -> ${v.errors.find((e) => e.includes(esperado))}`);
  else console.log(`        erros: ${JSON.stringify(v.errors.slice(0, 3))}`);
};

checar('metadado do cronograma e reprovado',
  { ...aulaBase, introduction: 'Hoje e semana 1 dia 3 e vamos trabalhar materia em 55 minutos.' },
  CTX, 'metadado');

checar('repeticao artificial e reprovada',
  { ...aulaBase, summary: [...aulaBase.summary.slice(0, 3), aulaBase.summary[0]] },
  CTX, 'repeticao');

checar('aula fora do tema e reprovada',
  {
    ...aulaBase,
    introduction: 'Vamos aprender sobre escolha de lente, exposicao e equipamentos fotograficos.',
    objectives: ['Escolher a lente adequada', 'Ajustar a exposicao da foto'],
    sections: aulaBase.sections.map((s) => ({
      title: 'Fotografia digital',
      explanation: LONGO,
      examples: [ex(
        'Qual lente usar para fotografar uma paisagem com muita luz ao ar livre?',
        'A lente grande angular, que enquadra mais cena com muita luz.',
        'A lente grande angular captura um angulo amplo e usa menos tempo de exposicao sob sol forte.',
      )],
    })),
    guidedPractice: [0, 1, 2].map(() => ({
      question: 'Que lente escolher para um retrato em ambiente fechado?',
      hint: 'Pense na luz.',
      answer: 'A teleobjetiva, que separa o fundo.',
      explanation: 'A teleobjetiva comprime o fundo e destaca o rosto em ambiente com pouca luz.',
    })),
    commonMistakes: ['Confundir abertura com velocidade do obturador na fotografia', 'Usar iso alto sem necessidade e sujar a foto final', 'Esquecer de estabilizar a camera em movimento durante a exposicao'],
    summary: ['A grande angular enquadra mais e usa menos exposicao', 'A teleobjetiva comprime o fundo e destaca o sujeito', 'Iso alto ajuda na pouca luz mas suja a imagem final', 'Estabilizar a camera evita a foto tremida na mao'],
  },
  CTX, 'fora do tema');

checar('frase de preenchimento e reprovada',
  { ...aulaBase, introduction: 'Vou explicar o assunto a continuar no proximo bloco do cronograma.' },
  CTX, 'conteudo generico');

// ------------------------------------------------------------
// PALAVRA DUPLICADA (defeito real visto no site publicado)
// ------------------------------------------------------------
console.log('\n--- findDuplicatedWords ---');

const DUPLICADOS = [
  // ERRO REAL, copiado da aula de Historia gerada e publicada.
  ['ERRO REAL: "organizacao burocratica do Estado de Estado antigo"', true,
    'Isso mostra que a escrita nao surgiu apenas como forma de comunicacao, mas como uma ferramenta de poder politico e social. Em questoes de historia, quando o texto mencionar "controle de impostos" ou "funcao dos escribas", ele provavelmente esta falando da organizacao burocratica do Estado de Estado antigo.'],
  ['"revolucao da revolucao"', true,
    'A leitura desse tema ajuda a entender a dinamica da revolucao da revolucao francesa no periodo.'],
  ['preposicao repetida "de de"', true,
    'A resposta depende de varios fatores de de forma direta na question.'],
  ['conector repetido "com com"', true,
    'Ele apresenta o argumento com com muita força na conclusão.'],
  // "a a" NAO e verificado de proposito: em portugues o par aparece
  // em frase legitima ("a aula a seguir", "a.camera a direita"), e
  // reprovar por isso seria falso positivo. So conector IDENTICO
  // dos dois lados e sinal de frase quebrada.
  ['"a a" ambiguo (nao pode reprovar)', false,
    'A camera a direita mostra o enquadramento de forma clara e a luz ajuda. A leitura e boa.'],
  // FALSOS POSITIVOS QUE NAO PODEM ACONTECER:
  ['CONTA LEGITIMA: "um terco de um terco" (nao pode reprovar)', false,
    'Se voce come um terco de um terco de uma pizza, sobra bem mais que a metade.'],
  ['GIRIA "que que" (nao pode reprovar)', false,
    'Que que voce ta tentando me dizer com essa frase?'],
  ['REPETICAO LEGITIMA de substantivo em frase normal (nao pode reprovar)', false,
    'A revolucao industrial transformou as cidades: a revolucao mudou o trabalho, a revolucao mudou a familia e a revolucao mudou a escola.'],
  ['PALAVRA SIMILAR, nao identica (nao pode reprovar)', false,
    'A leitura do texto e a leitura do enunciado pedem coisas diferentes.'],
  ['TEXTO LIMPO e longo (nao pode reprovar)', false,
    'O Estado egipcio organizava a cobranca de impostos por meio dos escribas, que registravam tudo em papiros e depois os contavam ao farao.'],
];

for (const [nome, devePegar, texto] of DUPLICADOS) {
  const r = findDuplicatedWords(texto);
  const pegou = r !== null;
  const ok = pegou === devePegar;
  if (!ok) falhas += 1;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}`);
  console.log(`        esperado ${devePegar ? 'reprovar' : 'aprovar'} | obtido ${pegou ? 'reprovar' : 'aprovar'}${r ? ` ("${r.trecho}")` : ''}`);
}

checar('palavra duplicada na aula inteira e reprovada',
  {
    ...aulaBase,
    sections: aulaBase.sections.map((s, i) => (i === 1
      ? { ...s, explanation: LONGO + 'Isso mostra a organizacao do Estado de Estado antigo de um jeito bem claro.' }
      : s)),
  },
  CTX, 'palavra repetida');

console.log(`\nRESULTADO: ${falhas === 0 ? 'todos os casos passaram' : falhas + ' caso(s) falharam'}`);
process.exit(falhas === 0 ? 0 : 1);
