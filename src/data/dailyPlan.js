// ============================================================
// As DUAS aulas oficiais do dia — fonte unica de verdade.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O Dashboard escolhe as aulas de hoje com `planLessonsForDate` e o
// gerador automatico do servidor precisa escolher EXATAMENTE as
// mesmas. Se cada um fizer a conta por conta propria, o dia em que os
// dois divergirem o servidor prepara A+B e a tela da aluna abre C+D —
// as aulas "prontas" ficam escondidas e ela espera um conteudo que o
// cache nao tem.
//
// Por isso a selecao mora aqui, e os dois lados importam daqui.
//
// TIMEZONE
//
// `getDateKey` de lessons.js usa getFullYear/getMonth/getDate, ou
// seja, o fuso do APARELHO. No celular da aluna isso funciona. No
// servidor o fuso e UTC, e as duas sao coisas diferentes de manha.
//
// A virada do dia importa de verdade aqui: se em Sao Paulo ainda for
// 2026-10-02 23:30, o cron tem que preparar o dia 02, nao o 03. Por
// isso a chave do dia e calculada com Intl no fuso do cronograma.
//
// Este arquivo e importado tanto pelo app (src/) quanto pela Edge
// Function de pre-geracao, por isso NAO importa nada de fora de
// ./curriculum e ./schedule: ele tem que rodar nos dois ambientes.
// ============================================================

// O timezone mora no artefato `planoDias.js`, e nao aqui, porque a
// Edge Function precisa dele e a Edge Function nao alcanca src/.
// Reexportar (e nao reimplementar) e o que garante que o cron e o app
// concordem na virada do dia. O tools/verificar-plano-dias.mjs confere.
export { TIMEZONE_CRONOGRAMA, dateKeyInZone } from '../../supabase/functions/pregenerate-daily/_shared/planoDias.js';

import { getPlanDaysForDate, isGeneratedDay, CURRICULUM_VERSION } from './curriculum.js';

/**
 * Os dois blocos de aula do dia, NA ordem do cronograma.
 *
 * Regras:
 *  - so entram dias que sao aula de verdade (`isGeneratedDay`): dia
 *    de revisao de prova ou de bloco vazio nao gera nada;
 *  - nao se inventa: um dia sem nenhum bloco devolve lista vazia, e
 *    o chamador tem que lidar com isso em vez de pegar os "dois
 *    primeiros" de qualquer array.
 *
 * @returns {Array<{id:string, subject:string, topic:string, block:number}>}
 */
export function dailyLessonIdsFor(dateKey) {
  return getPlanDaysForDate(dateKey)
    .filter(isGeneratedDay)
    .map((plan) => ({
      id: plan.id,
      curriculumVersion: plan.curriculumVersion ?? VERSAO_CURRICULO,
      subject: plan.subject,
      topic: plan.topic,
      block: plan.block ?? 1,
      kind: plan.kind,
      week: plan.week,
      dateKey: plan.dateKey,
      durationMinutes: plan.durationMinutes,
      objective: plan.objective,
      content: plan.content,
      color: plan.color,
    }));
}