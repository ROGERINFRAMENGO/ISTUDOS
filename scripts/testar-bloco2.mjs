// Reproduz localmente o erro ".length" que a Edge Function devolveu.
// Roda o MESMO validateLesson do bench, com shapes que um modelo pode
// devolver (ex.: "examples" como objeto em vez de array).
import { validateLesson } from "../supabase/functions/_shared/schemas.js";

const caso = {
  subtopics: ['informação explícita', 'informação implícita', 'compreensão', 'interpretação'],
  durationMinutes: 55, subject: 'Português', topic: 'informação explícita',
};

const base = {
  title: 'Aula de teste', introduction: 'x'.repeat(60),
  sections: [{ title: 'S1', explanation: 'y'.repeat(100), examples: [{ problem: 'p', solution: 's', explanation: 'e' }] }],
  guidedPractice: [{ question: 'q', hint: 'h', answer: 'a', explanation: 'e' }],
  commonMistakes: ['erro um bem claro', 'erro dois bem claro'], summary: ['resumo um', 'resumo dois'],
};

const amostras = [
  ['completa e correta', { ...base, objectives: ['a', 'b', 'c'] }],
  ['examples como objeto (nao array)', { ...base, objectives: ['a', 'b', 'c'], sections: [{ ...base.sections[0], examples: { 0: { problem: 'p', solution: 's', explanation: 'e' } } }] }],
  ['objectives como string', { ...base, objectives: 'apenas um texto' }],
  ['guidedPractice como objeto', { ...base, objectives: ['a', 'b', 'c'], guidedPractice: { 0: { question: 'q', hint: 'h', answer: 'a', explanation: 'e' } } }],
  ['sem sections', { title: 'Aula de teste', introduction: 'x'.repeat(60), objectives: ['a', 'b', 'c'] }],
];

for (const [nome, amostra] of amostras) {
  try {
    const v = validateLesson(amostra, caso);
    console.log(`${nome}: ok=${v.ok}${v.ok ? '' : ' | ' + v.errors.slice(0, 2).join(' ; ')}`);
  } catch (e) {
    console.log(`${nome}: LANCOU -> ${e.message}`);
    console.log('   ' + e.stack.split('\n').slice(1, 4).join('\n   '));
  }
}
