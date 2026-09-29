// ============================================================
// Mapa SEMANA DO CRONOGRAMA → questões do banco
// Cada semana cobre o que realmente cai nos 2 blocos de cada dia
// do src/data/schedule.js.
// ids que não existirem no banco são ignorados; se faltar questão
// da semana, o buildSimulado completa com revisão mista (bancos).
// ============================================================

export const WEEK_QUESTION_MAP = {
  // Semana 1: operações, inteiros, primos, frações, interpretação, estados da matéria
  1: ['mat-q1', 'mat-q5', 'mat-q7', 'por-q1', 'por-q3', 'cie-q4', 'his-q1', 'geo-q1'],

  // Semana 2: decimais, vocabulário, razão e proporção, regra de três, coesão, átomos/célula
  2: ['mat-q5', 'mat-q6', 'por-q2', 'por-q6', 'cie-q2', 'geo-q3', 'his-q3'],

  // Semana 3: porcentagem, conectivos, média, concordância/pontuação, célula
  3: ['mat-q2', 'mat-q4', 'por-q6', 'por-q8', 'cie-q1', 'cie-q2', 'geo-q2'],

  // Semana 4: potênciação, ironia, expressões algébricas, corpo humano, equações 1º grau, Egito
  4: ['mat-q3', 'mat-q6', 'por-q1', 'por-q8', 'cie-q1', 'cie-q6', 'geo-q2', 'his-q4'],

  // Semana 5: perímetro/área, figuras de linguagem, escala/geometria, volume, mapas, Idade Média
  5: ['mat-q8', 'mat-q6', 'por-q4', 'cie-q4', 'cie-q2', 'geo-q2', 'geo-q3', 'his-q4'],

  // Semana 6: clima/relevo, navegações, fotossíntese, pH, velocidade, energia
  6: ['cie-q3', 'cie-q5', 'cie-q6', 'cie-q7', 'geo-q2', 'geo-q3', 'his-q3', 'mat-q3'],

  // Semana 7: prova Etec 1º sem — questões mistas de tudo
  7: null,

  // Semana 8: prova Etec 2º sem — questões mistas de tudo
  8: null,

  // Semana 9: reforço pesado — porcentagem, interpretação, ciências, geometria, história/geo
  9: ['mat-q2', 'mat-q6', 'mat-q8', 'mat-q3', 'por-q1', 'por-q8', 'por-q4', 'cie-q3', 'cie-q5', 'cie-q7', 'geo-q2', 'geo-q3', 'his-q1', 'his-q3'],

  // Semana 10: reta final — tudo
  10: null,
};

// null = semana de prova/revisão → usa o banco inteiro (misto)
export function getWeekQuestionIds(week) {
  const number = Number(week);
  if (!number || !WEEK_QUESTION_MAP[number]) return null;
  return WEEK_QUESTION_MAP[number];
}
