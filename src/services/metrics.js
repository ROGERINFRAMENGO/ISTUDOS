// ============================================================
// FINAL POLISH — fonte unica de verdade das metricas.
//
//   src/services/metrics.js
//
// Antes desta feuille, o progresso e a sequencia eram calculados em
// seis lugares diferentes do App.jsx, e dois deles estavam errados:
//
//  1. `overall_progress` usava `lessons.length` como denominador
//     offline. Esse array tem DUAS entradas (src/data/lessons.js,
//     um arquivo de modelo antigo com texto "COLE AQUI"). Com 2
//     licoes oficiais concluidas de 122, o resultado era 3/3 = 100%.
//
//  2. A sequencia usava `valorCalculado || valorAntigo`. Como 0 e
//     um valor legitimo (a sequencia quebrou), o `||` ressuscitava
//     o numero antigo e a tela mostrava "1 dias de sequencia" com
//     a sequencia ja perdida.
//
// Aqui ficam as duas formulas, em um lugar so, e a interface consome
// exatamente o que a logica de negocio calculou.
// ============================================================

/** Data local no formato YYYY-MM-DD. Meio-dia evita fuso empurrar o dia. */
export function dateKeyLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKeyLocal(d);
}

// ------------------------------------------------------------
// PROGRESSO GERAL
// ------------------------------------------------------------

/**
 * O que conta como "licao oficial concluida".
 *
 * EXCLUI de proposito:
 *  - ids que comecam com "custom:" (aula personalizada);
 *  - "simulado" (prova, nao licao do curriculo);
 *  - qualquer id que nao exista no curriculo oficial.
 *
 * Duplicados contam uma vez, porque o resultado passa por Set.
 */
export function countOfficialCompleted(completedIds = [], officialIds = []) {
  const oficiais = new Set(officialIds);
  if (!oficiais.size) return 0;
  const vistos = new Set();
  for (const bruto of completedIds || []) {
    const id = String(bruto ?? '').trim();
    if (!id) continue;
    if (id.startsWith('custom:')) continue;
    if (/simulado/i.test(id)) continue;
    if (!oficiais.has(id)) continue;
    vistos.add(id);
  }
  return vistos.size;
}

/**
 * Progresso geral = concluidas oficiais / total oficial.
 *
 * `totalOficial` vem do curriculo real. Se vier 0 (curriculo
 * carregado), o resultado e 0 em vez de divisao por zero ou 100%.
 */
export function officialProgress(completedIds = [], officialIds = [], totalOficial = 0) {
  const total = Number(totalOficial) || officialIds.length || 0;
  if (total <= 0) return { done: 0, total: 0, percent: 0 };
  const done = countOfficialCompleted(completedIds, officialIds);
  return { done, total, percent: Math.min(100, Math.round((done / total) * 100)) };
}

// ------------------------------------------------------------
// SEQUENCIA DIARIA
// ------------------------------------------------------------

/**
 * Regra de produto (identica a que estava no App.jsx):
 *  - conta dias consecutivos para tras a partir de hoje;
 *  - se hoje ainda nao tem licao, conta desde ontem;
 *  - se nem ontem tem, a sequencia quebrou e vale 0.
 *
 * Esta funcao NUNCA devolve um valor antigo: quem chama ja tem as
 * datas reais, e 0 e um resultado legitimo.
 */
export function computeStreak(studyDates = [], todayKey = dateKeyLocal(new Date())) {
  const set = new Set((studyDates || []).map((d) => String(d ?? '').trim()).filter(Boolean));
  if (!set.size) return 0;

  let cursor = todayKey;
  if (!set.has(cursor)) {
    cursor = addDays(todayKey, -1);
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  let c = cursor;
  while (set.has(c)) {
    streak += 1;
    c = addDays(c, -1);
  }
  return streak;
}

/** Maior sequencia ja registrada, para o "recorde". */
export function longestStreak(studyDates = []) {
  const unicos = [...new Set((studyDates || []).map((d) => String(d ?? '').trim()).filter(Boolean))].sort();
  let melhor = 0;
  let atual = 0;
  let anterior = null;
  for (const d of unicos) {
    atual = anterior && addDays(anterior, 1) === d ? atual + 1 : 1;
    melhor = Math.max(melhor, atual);
    anterior = d;
  }
  return melhor;
}

// ------------------------------------------------------------
// ESTATISTICAS DERIVADAS
// ------------------------------------------------------------

/**
 * Taxa de acerto. Zero questoes = 0, nunca NaN e nunca divisao por
 * zero — o card mostrava "NaN%" quando nao havia resposta nenhuma.
 */
export function accuracyPercent(correct = 0, answered = 0) {
  const c = Number(correct) || 0;
  const a = Number(answered) || 0;
  if (a <= 0) return 0;
  return Math.round((c / a) * 100);
}

/**
 * Tempo estudado. O valor persistido e um ACUMULADO, nao um total
 * semanal — por isso o rotulo do card dizia "esta semana" e
 * mostrava a soma de todo o historico. A funcao devolve os dois
 * valores para a interface poder dizer a verdade.
 */
export function studyTimeSummary(studyDates = [], totalMinutes = 0) {
  const semana = countDaysInCurrentWeek(studyDates);
  const min = Number(totalMinutes) || 0;
  return {
    totalMinutos: min,
    diasNaSemana: semana,
    // Rotulo honesto: so e "semana" quando existe base para medir.
    rotulo: semana > 0 ? 'Dias estudados esta semana' : 'Tempo total acumulado',
  };
}

/** Dias de estudo dentro da semana local atual (segunda a domingo). */
export function countDaysInCurrentWeek(studyDates = [], today = new Date()) {
  const hoje = dateKeyLocal(today);
  const dow = new Date(`${hoje}T12:00:00`).getDay();
  const inicioSemana = addDays(hoje, dow === 0 ? -6 : 1 - dow);
  const fimSemana = addDays(inicioSemana, 6);
  return new Set(
    (studyDates || [])
      .map((d) => String(d ?? '').trim())
      .filter((d) => d >= inicioSemana && d <= fimSemana),
  ).size;
}