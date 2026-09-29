// Correcao E: StudyContent nao pode assumir que toda secao tem paragraphs/bullets.
import fs from 'node:fs';

const path = 'src/components/LessonPage.jsx';
let text = fs.readFileSync(path, 'utf8');

function count(needle) {
  return text.split(needle).length - 1;
}

const pairs = [
  ['section.paragraphs.map((paragraph, index) =>', '(section.paragraphs || []).map((paragraph, index) =>', 2],
  ['{section.bullets.map((bullet, bulletIndex) =>', '{(section.bullets || []).map((bullet, bulletIndex) =>', 3],
];

for (const [from, to, expected] of pairs) {
  const found = count(from);
  if (found !== expected) throw new Error(`PATCH E: achei ${found}x "${from}", esperava ${expected}`);
  text = text.split(from).join(to);
}

fs.writeFileSync(path, text, 'utf8');
console.log('E) StudyContent protegido contra secao sem paragraphs/bullets');
