// Mostra a aula real gerada na FASE D, para conferencia de qualidade
// por leitura humana. Nao altera nada.
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('.tmp-bench/fase-d/aula.json', 'utf8'));
const a = j.lesson;
console.log('TITULO:', a.title);
console.log('\nINTRODUCAO:\n', a.introduction);
console.log('\nOBJETIVOS:');
for (const o of a.objectives) console.log('  -', o);
console.log('\nEXERCICIOS:');
a.guidedPractice.forEach((g, i) => {
  console.log(`  ${i + 1}. ${g.question}`);
  console.log(`     resposta: [${g.answer}]`);
  console.log(`     explicacao: ${g.explanation}`);
});
console.log('\nERROS COMUNS:');
for (const m of a.commonMistakes) console.log('  -', m);
console.log('\nRESUMO:');
for (const s of a.summary) console.log('  -', s);
