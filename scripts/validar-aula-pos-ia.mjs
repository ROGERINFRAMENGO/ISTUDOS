// ============================================================
// ETAPAS 5-8: valida o que a Edge Function faz DEPOIS da chamada ao
// modelo, usando uma resposta no MESMO formato que o prompt pede.
// Prova que validateLesson aceita, que o cache separa os blocos e
// que o LessonPage renderiza.
// Roda com: node scripts/validar-aula-pos-ia.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const inline = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const curriculum = await import(inline(read('src/data/curriculum.js').replace("from './schedule'", `from '${inline(read('src/data/schedule.js'))}'`)));
const schemas = await import(inline(read('supabase/functions/_shared/schemas.js')));
const dbShared = await import(inline(read('supabase/functions/_shared/db.js')));
const lessonContent = await import(inline(read('src/data/lessonContent.js')));

const DATA = '2026-09-29';
const plano = curriculum.getPlanDaysForDate(DATA)[0];

const lessonPayload = {
  curriculumVersion: plano.curriculumVersion,
  week: plano.week,
  day: plano.day,
  dateKey: plano.dateKey,
  block: plano.block,
  subject: plano.subject,
  topic: plano.topic,
  subtopics: plano.subtopics,
  objectives: [plano.objective, plano.weekGoal].filter(Boolean),
  durationMinutes: plano.durationMinutes,
  studentLevel: plano.studentLevel,
  kind: plano.kind,
};

const exemplo = {
  problem: 'O texto afirma que a cidade plantou 500 arvores e, no verao seguinte, ficou mais fresca. A pergunta diz: segundo o texto, quantas arvores foram plantadas?',
  solution: 'Essa e a informacao explicita. A frase do texto traz o numero, e a pergunta pede o mesmo numero, entao a resposta esta escrita no proprio texto, sem precisar calcular nem deduzir nada.',
  explanation: 'O numero de arvores e explicito, mas a ideia de que o plantio diminuiu o calor e implicita.',
};

const secao = (titulo, texto) => ({ title: titulo, explanation: texto, examples: [exemplo] });


const respostaIA = {
  title: 'Compreensao e interpretacao: informacao explicita e implicita',
  objectives: [
    'Distinguir informacao explicita de informacao implicita em um texto.',
    'Ler uma questao de prova e localizar no texto a resposta pedida.',
    'Construir a interpretacao separando o que o texto diz do que se conclui dele.',
  ],
  introduction:
    'Quando voce responde uma questao de prova de Portugues, existem dois caminhos: encontrar a frase que responde direto (informacao explicita) ou deduzir a resposta a partir do que o texto sugere (informacao implicita). Neste bloco de 55 minutos voce treina os dois, sempre voltando ao texto antes de marcar a alternativa.',
  sections: [
    secao(
      '1. Informacao explicita: o texto ja escreveu a resposta',
      'Informacao explicita e a informacao que aparece escrita no texto, com as mesmas palavras da pergunta. Quando a questao diz "segundo o texto, onde", a resposta esta em uma frase que voce pode copiar.\n\nPasso a passo:\n1. Leia a pergunta e grife o verbo de comando (segundo, de acordo, o que o texto diz).\n2. Volte ao texto e procure a frase com a mesma palavra do pedido.\n3. Marque a alternativa que repete aquela ideia.\n4. Confira: se voce apagar o trecho e nao conseguir responder, nao era explicita.',
    ),
    secao(
      '2. Informacao implicita: o texto sugere, nao escreve',
      'Informacao implicita e a que o texto nao diz com palavras, mas deixa entender. Aparece quando o autor usa "por isso" ou quando mostra uma causa e um efeito sem nomear a conclusao.\n\nPara achar a implicita:\n1. Substitua a frase-chave do texto pela palavra "isso".\n2. Pergunte: o que "isso" quer dizer aqui?\n3. Escreva a conclusao em uma frase completa e compare com as alternativas.',
    ),
    secao(
      '3. Como usar isso numa questao de prova',
      'Na hora da prova, faca sempre o mesmo movimento: primeiro ache a informacao explicita, porque e mais rapida e mais segura. Se a questao pedir "o que se conclui" ou "o que o texto sugere", ai voce procura a implicita.\n\nMetodo que funciona: leia a pergunta e escreva ao lado a palavra-chave. Depois sublinhe no texto tudo que aparece sobre esse assunto. Se a resposta estiver sublinhada de forma direta, e explicita. Se voce precisou juntar duas frases para responder, e implicita.\n\nErro comum: marcar a alternativa que tem mais palavras parecidas com o texto sem verificar se ela responde ao que foi perguntado. Sempre volte ao verbo de comando da questao.',
    ),
  ],

  guidedPractice: [
    {
      question: 'O texto diz que a leitura diaria melhora a concentracao, segundo pesquisa com estudantes. Qual e a informacao explicita?',
      hint: 'Procure a frase do texto que repete o pedido da pergunta.',
      answer: 'Que a pesquisa mostrou que a leitura diaria melhora a concentracao.',
      explanation: 'Essa e explicita porque esta escrita no texto com as mesmas palavras da pergunta.',
    },
    {
      question: 'O texto diz que depois da campanha o numero de doadores voltou a crescer. O que se pode concluir?',
      hint: 'Junte a campanha e o crescimento do numero de doadores em uma frase so.',
      answer: 'Que a campanha foi eficaz para atrair novos doadores.',
      explanation: 'O texto nao afirma isso, mas a sequencia permite concluir. Essa e a implicita.',
    },
    {
      question: 'Marque a alternativa que resume a ideia central do texto sobre leitura diaria.',
      hint: 'Identifique primeiro o que e explicito e depois o que e conclusao.',
      answer: 'A leitura e apresentada como um habito que traz beneficios para o estudo.',
      explanation: 'A ideia central junta o que o texto diz com o que ele sugere, por isso e uma sintese.',
    },
  ],
  commonMistakes: [
    'Confundir informacao implicita com o que nao esta no texto: se nao da para apontar a frase, a alternativa nao e a correta.',
    'Marcar a alternativa que repete mais palavras do texto sem conferir se ela responde ao verbo de comando da pergunta.',
    'Ler so a pergunta e responder de memoria, sem voltar ao texto para localizar a informacao.',
  ],
  summary: [
    'Informacao explicita e a resposta escrita no texto, com as mesmas palavras da pergunta.',
    'Informacao implicita e a conclusao que voce monta juntando informacoes do texto.',
    'Para achar a implicita, substitua a frase pela palavra "isso" e pergunte o que "isso" quer dizer.',
    'Na prova, "o que o texto diz" pede explicita e "o que se conclui" pede implicita.',
  ],
  estimatedMinutes: 55,
};

console.log('A) validateLesson com a resposta da IA');
const v = schemas.validateLesson(respostaIA, lessonPayload);
console.log(`   ok = ${v.ok}`);
if (!v.ok) {
  v.errors.forEach((e) => console.log(`     ERRO: ${e}`));
  process.exitCode = 1;
} else {
  console.log(`   Titulo         : ${v.data.title}`);
  console.log(`   estimatedMinutes: ${v.data.estimatedMinutes}`);
  console.log(`   Secoes         : ${v.data.sections.length}`);
  console.log(`   guidedPractice : ${v.data.guidedPractice.length}`);
  console.log(`   Erros comuns   : ${v.data.commonMistakes.length}`);
  console.log(`   Resumo         : ${v.data.summary.length}`);
}

console.log('\nB) Chave de cache (generated_lessons.cache_key)');
const k1 = dbShared.lessonCacheKey(lessonPayload);
const b2 = curriculum.getPlanDaysForDate(DATA)[1];
const k2 = dbShared.lessonCacheKey({ ...lessonPayload, block: b2.block, subject: b2.subject, topic: b2.topic });
console.log(`   Bloco 1: ${k1}`);
console.log(`   Bloco 2: ${k2}`);
console.log(`   Colidem? ${k1 === k2 ? 'SIM (BUG)' : 'NAO (OK)'}`);

console.log('\nC) Render no LessonPage (getLessonDetail)');
const card = curriculum.planDayToLesson(plano);
const aulaGerada = { ...card, ...v.data, generated: true, lessonId: 'local', model: 'meta/muse-glimmer-30b' };
const detail = lessonContent.getLessonDetail(aulaGerada);
console.log(`   detail.generated = ${detail.generated}`);
console.log(`   Secoes renderizadas: ${detail.sections.length}`);
detail.sections.forEach((s, i) => {
  console.log(`     ${i + 1}. ${s.title}`);
  console.log(`        paragrafos=${s.paragraphs.length}  exemplos=${s.examples.length}`);
});
console.log(`   Exercicios  : ${detail.guidedPractice.length}`);
console.log(`   Erros comuns: ${detail.commonMistakes.length}`);
console.log(`   Resumo      : ${detail.summary.length}`);

console.log('\nE) O PROMPT esta dentro do que validateLesson aceita?');
const regras = [
  ['title ate 120 chars', plano.objective.length <= 200],
  ['introduction 40-1600 chars', (respostaIA.introduction ?? '').length >= 40 && (respostaIA.introduction ?? '').length <= 1600],
  ['objectives 1-6 itens', respostaIA.objectives.length >= 1 && respostaIA.objectives.length <= 6],
  ['sections entre 2 e 6', respostaIA.sections.length >= 2 && respostaIA.sections.length <= 6],
  ['1a secao tem exemplo', respostaIA.sections[0].examples.length > 0],
  ['exemplos no maximo 3 por secao', respostaIA.sections.every((s) => s.examples.length <= 3)],
  ['cada explanation >= 80 chars', respostaIA.sections.every((s) => s.explanation.length >= 80)],
  ['guidedPractice 2-6 itens', respostaIA.guidedPractice.length >= 2 && respostaIA.guidedPractice.length <= 6],
  ['commonMistakes 2-6 itens', respostaIA.commonMistakes.length >= 2 && respostaIA.commonMistakes.length <= 6],
  ['summary 2-8 itens', respostaIA.summary.length >= 2 && respostaIA.summary.length <= 8],
  ['sem HTML', !/<(p|div|span|br)\b/i.test(JSON.stringify(respostaIA))],
  ['sem placeholder', !/cole aqui|placeholder|lorem ipsum/i.test(JSON.stringify(respostaIA))],
  ['sem "pesquise/assista" (manda estudar fora)', !/pesquise isso|assista (a )?um v/i.test(JSON.stringify(respostaIA))],
  ['estimatedMinutes = 55 (bloco)', respostaIA.estimatedMinutes === 55],
];
let ok = true;
regras.forEach(([nome, passou]) => {
  console.log(`   ${passou ? 'OK  ' : 'FALHA'} ${nome}`);
  if (!passou) ok = false;
});
if (!ok) process.exitCode = 1;

console.log('\nF) Os 4 subtopicos do cronograma aparecem no PROMPT da aula?');
const prompt = read('supabase/functions/_shared/prompts.js');
const enviaSubtopicos = prompt.includes('Subtopicos que a aula DEVE cobrir');
console.log(`   o prompt manda os subtopicos? ${enviaSubtopicos ? 'SIM' : 'NAO'}`);
console.log(`   subtopicos no payload: ${JSON.stringify(plano.subtopics)}`);

const palavras = JSON.stringify(v.data).split(/\s+/).length;
console.log(`   estimatedMinutes = ${v.data.estimatedMinutes}`);
console.log(`   palavras totais  = ${palavras}`);
console.log(`   secoes = ${v.data.sections.length} (alvo 3) · exercicios = ${v.data.guidedPractice.length} (alvo 3)`);

