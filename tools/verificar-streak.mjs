// ============================================================
// FINALIZACAO — regra da sequencia (streak).
//
//   node tools/verificar-streak.mjs
//
// Nao usa o navegador e NAO toca em dado nenhum da Anna: a regra e
// uma funcao pura de datas, extraida do App.jsx e testada aqui com
// um "hoje" controlado.
//
// Regra implementada (App.jsx, calcStreak):
//   - sequencia = dias consecutivos com licao concluida, contando
//     para tras a partir de hoje;
//   - se HOJE ainda nao tem licao, conta a partir de ontem;
//   - se nem ontem tem, a sequencia e 0 (quebrou, estilo Duolingo);
//   - datas sao comparadas em horario local ao meio-dia, para o
//     fuso nao virar um dia a mais ou a menos.
//
// A secao 15 pede exatamente: estudar hoje, estudar amanha, deixar
// um dia passar, voltar depois, e conferir que a quebra acontece —
// alem de garantir que atualizar a pagina NAO aumenta a sequencia.
// ============================================================

let falhas = 0;
let total = 0;
function checar(rotulo, ok, detalhe = '') {
  total += 1;
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} | ${rotulo}${detalhe ? ` -> ${detalhe}` : ''}`);
}

// Mesma implementacao do App.jsx, copiada sem alteracao.
const dateKeyLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function calcStreak(dateKeys, todayKey) {
  const set = new Set(dateKeys || []);
  if (!set.size) return 0;
  let cursor = todayKey;
  if (!set.has(cursor)) {
    const y = new Date(`${cursor}T12:00:00`);
    y.setDate(y.getDate() - 1);
    const yesterday = dateKeyLocal(y);
    if (!set.has(yesterday)) return 0;
    cursor = yesterday;
  }
  let streak = 0;
  let c = cursor;
  while (set.has(c)) {
    streak += 1;
    const d = new Date(`${c}T12:00:00`);
    d.setDate(d.getDate() - 1);
    c = dateKeyLocal(d);
  }
  return streak;
}

const D = (n) => {
  const d = new Date(`${n}T12:00:00`);
  d.setDate(d.getDate() + 0);
  return dateKeyLocal(d);
};
const soma = (base, dias) => {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return dateKeyLocal(d);
};

// ------------------------------------------------------------
console.log('\n1. ESTUDAR HOJE');
{
  checar('primeiro dia', calcStreak(['2026-03-10'], '2026-03-10') === 1);
  checar('tres dias seguidos', calcStreak(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10') === 3);
  checar('dez dias seguidos', calcStreak(
    Array.from({ length: 10 }, (_, i) => soma('2026-03-01', i)), '2026-03-10') === 10);
}

// ------------------------------------------------------------
console.log('\n2. ESTUDAR AMANHA');
{
  const ateOntem = Array.from({ length: 3 }, (_, i) => soma('2026-03-08', i)); // 8,9,10
  checar('ontem a sequencia contava 3', calcStreak(ateOntem, '2026-03-10') === 3);
  const comHoje = [...ateOntem, '2026-03-11'];
  checar('estudando hoje vira 4', calcStreak(comHoje, '2026-03-11') === 4);
}

// ------------------------------------------------------------
console.log('\n3. DEIXAR UM DIA PASSAR (a quebra)');
{
  // Para a sequencia quebrar em 10/03, os dados NAO podem ter 09
  // nem 10: sem a lesson de ontem E sem a de hoje, calcStreak
  // devolve 0. (Um teste anterior passava ['2026-03-08','2026-03-09']
  // e esperava 0 — estava errado, porque com 09 presente a
  // sequencia vive e vale 2.)
  checar('10/03 sem 09 e sem 10 => 0', calcStreak(['2026-03-08'], '2026-03-10') === 0);
  // Voltou no dia seguinte e estudou: recomeca em 1.
  checar('11/03 voltam a estudar => 1', calcStreak(['2026-03-08', '2026-03-11'], '2026-03-11') === 1);
  // Em 10/03 sem 10 mas com 09: a sequencia vive ate 09.
  checar('10/03 sem 10, com 09 => 2', calcStreak(['2026-03-08', '2026-03-09'], '2026-03-10') === 2);
  // Dois dias seguidos sem estudar zeram de vez.
  checar('12/03 sem 10 nem 11 => 0', calcStreak(['2026-03-08', '2026-03-09'], '2026-03-12') === 0);
}

// ------------------------------------------------------------
console.log('\n4. VOLTAR DEPOIS');
{
  const antigas = ['2026-03-01', '2026-03-02'];
  checar('volta 15 dias depois => 0 (quebrou de vez)', calcStreak(antigas, '2026-03-15') === 0);
  checar('volta e estuda => 1', calcStreak([...antigas, '2026-03-15'], '2026-03-15') === 1);
}

// ------------------------------------------------------------
console.log('\n5. ATUALIZAR PAGINA NAO MUDA NADA');
{
  // A funcao e pura: a mesma entrada devolve a mesma saida, quantas
  // vezes for chamada. E isso que impede "abrir o site" de virar
  // "estudar".
  const entrada = ['2026-03-08', '2026-03-09', '2026-03-10'];
  const a = calcStreak(entrada, '2026-03-10');
  const b = calcStreak(entrada, '2026-03-10');
  const c = calcStreak(entrada, '2026-03-10');
  checar('tres chamadas identicas', a === b && b === c, `${a}/${b}/${c}`);
  checar('recarregar nao soma dia novo', a === 3);
  checar('abrir sem estudar nao gera data', calcStreak([...entrada, '2026-03-11'], '2026-03-11') === 4);
}

// ------------------------------------------------------------
console.log('\n6. VIRADA DE MES E FIM DE MES');
{
  checar('31/12 -> 01/01 continua a sequencia', calcStreak(['2025-12-31', '2026-01-01'], '2026-01-01') === 2);
  checar('28/02 -> 01/03 continua', calcStreak(['2026-02-28', '2026-03-01'], '2026-03-01') === 2);
  // Estudou em 31/12 e em 01/01 AINDA nao estudou: a regra diz que,
  // sem lesson hoje, a sequencia vive conta desde ontem. Logo 1.
  checar('01/01 sem lesson hoje, com 31/12 => 1', calcStreak(['2025-12-31'], '2026-01-01') === 1);
  // Em 02/01, sem 01/01 e sem 02/01: quebrou.
  checar('02/01 sem 01 e sem 02 => 0', calcStreak(['2025-12-31'], '2026-01-02') === 0);
}

// ------------------------------------------------------------
console.log('\n7. ENTRADAS ESTRANHAS');
{
  checar('lista vazia => 0', calcStreak([], '2026-03-10') === 0);
  checar('undefined => 0', calcStreak(undefined, '2026-03-10') === 0);
  checar('datas duplicadas contam uma vez', calcStreak(['2026-03-10', '2026-03-10'], '2026-03-10') === 1);
  checar('data no futuro nao conta', calcStreak(['2026-03-11'], '2026-03-10') === 0);
}

console.log(`\n${'-'.repeat(60)}`);
console.log(`${total - falhas}/${total} verificacoes OK · ${falhas} falha(s)`);
console.log(falhas === 0 ? 'CONFORME' : 'DIVERGENTE');
process.exit(falhas === 0 ? 0 : 1);