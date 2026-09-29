// Validação do CRONOGRAMA MESTRE (roda com: node scripts/validar-cronograma.mjs)
import {
  DAILY_PLAN,
  SCHEDULE_END,
  SCHEDULE_START,
  getScheduleDay,
  getWeekNumberByDate,
  scheduleWeeks,
} from '../src/data/schedule.js';

let falhas = 0;
const ok = (cond, msg) => {
  if (!cond) {
    falhas += 1;
    console.log(`  FALHOU: ${msg}`);
  }
  return cond;
};

// Transições de semana exigidas na tarefa.
const TRANSICOES = [
  ['2026-09-28', 1], ['2026-09-29', 1], ['2026-10-04', 1],
  ['2026-10-05', 2], ['2026-10-11', 2],
  ['2026-10-12', 3], ['2026-10-18', 3],
  ['2026-10-19', 4],
  ['2026-10-26', 5],
  ['2026-11-02', 6],
  ['2026-11-09', 7],
  ['2026-11-16', 8],
  ['2026-11-23', 9],
  ['2026-11-30', 10], ['2026-12-05', 10],
];

console.log('=== 1. Estrutura ===');
ok(scheduleWeeks.length === 10, 'deve existir exatamente 10 semanas');
ok(SCHEDULE_START === '2026-09-28', 'primeiro dia deve ser 28/09/2026');
ok(SCHEDULE_END === '2026-12-05', 'último dia deve ser 05/12/2026');

const datasVistas = new Set();
let totalBlocos = 0;
const materias = new Set();

scheduleWeeks.forEach((week, indice) => {
  const esperado = indice + 1;
  ok(week.number === esperado, `semana na posição ${indice + 1} deve ter number=${esperado}`);
  ok(week.days.length > 0, `${week.title} não pode ficar sem dias`);

  week.days.forEach((item) => {
    ok(!datasVistas.has(item.key), `data duplicada no cronograma: ${item.key}`);
    datasVistas.add(item.key);
    // Regra: todo dia tem >= 2 blocos. A ÚNICA exceção é 04/12, que o
    // cronograma mestre define como um bloco só (SIMULADO FINAL de 4h).
    const simuladoFinal = item.key === '2026-12-04';
    if (simuladoFinal) {
      ok(item.blocks.length === 1 && item.blocks[0].subject === 'Simulado final', '04/12 e o simulado final em bloco unico');
    } else {
      ok(item.blocks.length >= 2, `${item.key} (${week.title}) tem so ${item.blocks.length} bloco(s) - minimo 2`);
    }
    ok(item.totalMinutes > 0, `${item.key} sem tempo total`);
    item.blocks.forEach((b) => {
      totalBlocos += 1;
      materias.add(b.subject);
      ok(Array.isArray(b.subtopics) && b.subtopics.length > 0, `${item.key} ${b.subject} sem subtópicos`);
      b.subtopics.forEach((s) => ok(String(s).trim().length > 0, `${item.key} ${b.subject} tem subtópico vazio`));
    });
  });
});

console.log(`  ${datasVistas.size} dias - ${totalBlocos} blocos - ${materias.size} materias`);

console.log('=== 2. Transicoes de semana ===');
TRANSICOES.forEach(([data, semana]) => {
  const obtida = getWeekNumberByDate(data);
  ok(obtida === semana, `${data} deveria ser Semana ${semana} e veio ${obtida}`);
});
ok(getWeekNumberByDate('2026-09-29') === 1, '29/09/2026 PRECISA ser Semana 1');
ok(getWeekNumberByDate('2026-09-28') === 1, '28/09/2026 deve ser Semana 1');
ok(getWeekNumberByDate('2026-10-01') === 1, '01/10/2026 deve ser Semana 1');
ok(getWeekNumberByDate('2026-10-05') === 2, '05/10/2026 deve ser Semana 2');
ok(getWeekNumberByDate('2026-10-12') === 3, '12/10/2026 deve ser Semana 3');
ok(getWeekNumberByDate('2026-10-19') === 4, '19/10/2026 deve ser Semana 4');
ok(getWeekNumberByDate('2026-12-05') === 10, '05/12/2026 deve ser Semana 10');

console.log('=== 3. Dias-chave exigidos ===');
const esperadoDoDia = {
  '2026-09-28': ['Matemática', 'Português'],
  '2026-09-29': ['Português', 'Ciências'],
};
Object.entries(esperadoDoDia).forEach(([data, subjects]) => {
  const dia = getScheduleDay(data);
  ok(Boolean(dia), `${data} nao existe no cronograma`);
  const gotos = (dia?.blocks ?? []).map((b) => b.subject);
  subjects.forEach((s) => ok(gotos.includes(s), `${data} deveria ter ${s} (tem: ${gotos.join(', ')})`));
  ok(gotos.length >= 2, `${data} deveria ter 2 blocos`);
});


console.log('=== 4. Tempo dos blocos ===');
ok(DAILY_PLAN.blockMinutes === 55, 'bloco normal deve ser 55 min');
ok(DAILY_PLAN.breakMinutes === 10, 'intervalo deve ser 10 min');
ok(DAILY_PLAN.totalMinutes === 120, 'total deve ser 120 min');
const diaNormal = getScheduleDay('2026-09-28');
ok(diaNormal.totalMinutes === 120, 'dia normal deve fechar em 120 min');
ok(diaNormal.breakMinutes === 10, 'dia com 2 blocos deve ter 10 min de intervalo');
ok(diaNormal.blocks.every((b) => b.minutes === 55), 'ambos os blocos do dia normal devem ser 55 min');

console.log('=== 5. Provas, reforco e reta final ===');
const semana7 = scheduleWeeks[6];
ok(semana7.days[0].blocks[0].subject.includes('Prova Etec'), 'semana 7 comeca com Prova Etec 2026/1');
ok(semana7.days[0].blocks[0].subtopics[0] === 'questões 1–10', 'semana 7 dia 1 = questoes 1-10');
ok(scheduleWeeks[7].days[0].blocks[0].subtopics[0] === 'questões 1–10', 'semana 8 dia 1 = questoes 1-10');
ok(scheduleWeeks[7].days[4].blocks[0].subtopics[0] === 'questões 41–50', 'semana 8 dia 5 = questoes 41-50');
ok(scheduleWeeks[8].days[6].blocks[0].subject === 'Simulado geral', 'semana 9 fecha com simulado geral');
ok(scheduleWeeks[8].days[6].blocks[0].subtopics[0] === '50 questões', 'simulado geral = 50 questoes');

const semana10 = scheduleWeeks[9];
ok(semana10.days[4].blocks[0].subject === 'Simulado final', '04/12 e o simulado final');
ok(semana10.days[4].blocks[0].subtopics.includes('4 horas'), 'simulado final tem 4 horas');
const ultimo = semana10.days[5];
ok(ultimo.key === '2026-12-05', '05/12 e o ultimo dia');
ok(ultimo.blocks.length === 2, '05/12 mantem 2 blocos');
ok(ultimo.blocks.every((b) => b.kind === 'review'), '05/12 e revisao leve, sem conteudo novo');
ok(ultimo.blocks[0].subject === 'Matemática' && ultimo.blocks[1].subject === 'Português', '05/12 = Matematica + Portugues');

console.log('=== 6. Materias obrigatorias ===');
['Matemática', 'Português', 'Ciências', 'História', 'Geografia', 'Inglês'].forEach((materia) => {
  const onde = scheduleWeeks
    .map((w) => ({ n: w.number, tem: w.days.some((d) => d.blocks.some((b) => b.subject === materia)) }))
    .filter((x) => x.tem)
    .map((x) => x.n);
  ok(onde.length > 0, `${materia} nao aparece em nenhuma semana`);
  console.log(`  ${materia}: semanas ${onde.join(', ')}`);
});

console.log('=== 7. Ciencias com presenca recorrente ===');
const semanasCie = scheduleWeeks.filter((w) => w.days.some((d) => d.blocks.some((b) => b.subject === 'Ciências'))).length;
const diasCie = scheduleWeeks.reduce((acc, w) => acc + w.days.filter((d) => d.blocks.some((b) => b.subject === 'Ciências')).length, 0);
ok(diasCie >= 10, `Ciencias aparece em ${diasCie} dias - precisa ser recorrente`);
console.log(`  Ciencias em ${semanasCie} semanas / ${diasCie} dias`);

console.log('=== 8. Nenhum lessonIds antigo ===');
ok(!JSON.stringify(scheduleWeeks).includes('lessonIds'), 'o cronograma nao deve mais usar lessonIds');

console.log('');
if (falhas === 0) {
  console.log('CRONOGRAMA OK - 10 semanas, 2 blocos por dia, 120 min, 29/09 = Semana 1.');
} else {
  console.log(`${falhas} falha(s) encontrada(s).`);
  process.exit(1);
}

const mat = getScheduleDay('2026-09-28');
ok(mat.blocks[0].subtopics.length === 7, '28/09 Matematica deve preservar os 7 subtópicos');
const rev29 = getScheduleDay('2026-09-29');
ok(rev29.blocks[0].subject === 'Português', '29/09 Bloco 1 deve ser Português');
ok(rev29.blocks[1].subject === 'Ciências', '29/09 Bloco 2 deve ser Ciencias');
ok(rev29.blocks[1].subtopics.length === 4, '29/09 Ciencias deve preservar os 4 subtópicos');
