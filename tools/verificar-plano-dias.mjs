// ============================================================
// PROVA QUE O SERVIDOR E O DASHBOARD ESCOLHEM AS MESMAS AULAS
// ------------------------------------------------------------
// Este e o teste que impede a divergencia mais cara do projeto:
// o cron preparar a aula A, o Dashboard abrir a aula B, e a aluna
// ver "aula nao disponivel" com o cache cheio.
//
// Ele NAO confia em comentario nenhum. Compara as duas entradas de
// verdade, em runtime:
//   1. o artefato que a Edge Function usa (planoDias.js);
//   2. o curriculum que o app usa (src/data/curriculum.js).
// Se um campo divergir em qualquer um dos 122 planos, o teste falha.
//
// USO:  node tools/verificar-plano-dias.mjs
// ============================================================

import { CURRICULUM_VERSION, DATAS_DO_CURRICULO, aulasDoDia } from '../supabase/functions/pregenerate-daily/_shared/planoDias.js';
import { curriculumDays, isGeneratedDay } from '../src/data/curriculum.js';
import { dailyLessonIdsFor, dateKeyInZone } from '../src/data/dailyPlan.js';

let ok = 0;
let falhas = 0;
const erro = (msg) => { falhas += 1; console.log(`  FALHOU: ${msg}`); };
const confere = (cond, msg) => { if (cond) ok += 1; else erro(msg); };

// ------------------------------------------------------------------
// 1. O artefato tem que estar em dia com o cronograma. Se divergir,
//    o dev precisa rodar `node tools/gerar-plano-dias.mjs`.
// ------------------------------------------------------------------
console.log('\n== artefato x cronograma ==');
{
  const peloApp = curriculumDays.filter(isGeneratedDay).reduce((acc, plan) => {
    (acc[plan.dateKey] ??= []).push(plan);
    return acc;
  }, {});

  const datasApp = Object.keys(peloApp).sort();
  const datasArt = [...DATAS_DO_CURRICULO].sort();

  confere(datasApp.join(',') === datasArt.join(','),
    `datas divergem do app (app: ${datasApp.length}, artefato: ${datasArt.length})`);

  for (const dataKey of datasArt) {
    const a = peloApp[dataKey] ?? [];
    const b = aulasDoDia(dataKey);
    confere(a.length === b.length, `${dataKey}: ${a.length} aulas no app, ${b.length} no artefato`);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      for (const campo of ['id', 'week', 'block', 'kind', 'subject', 'topic', 'content', 'objective', 'durationMinutes']) {
        confere(a[i][campo] === b[i][campo],
          `${dataKey} aula ${i + 1}: campo "${campo}" difere (app=${a[i][campo]} / artefato=${b[i][campo]})`);
      }
      confere(JSON.stringify(a[i].subtopics) === JSON.stringify(b[i].subtopics),
        `${dataKey} aula ${i + 1}: subtopics diferem`);
    }
  }
}

// ------------------------------------------------------------------
// 2. A selecao do dia: os dois lados tem que devolver as MESMAS aulas
//    em TODA data do cronograma. E o contrato que o job consome.
// ------------------------------------------------------------------
console.log('\n== selecao do dia (servidor x Dashboard) ==');
{
  for (const dataKey of DATAS_DO_CURRICULO) {
    const servidor = aulasDoDia(dataKey).map((a) => a.id);
    const painel = dailyLessonIdsFor(dataKey).map((a) => a.id);
    confere(servidor.length === painel.length,
      `${dataKey}: servidor planejou ${servidor.length}, Dashboard ${painel.length}`);
    confere(servidor.join('|') === painel.join('|'),
      `${dataKey}: ids divergem -- servidor: ${servidor.join(', ')} | dashboard: ${painel.join(', ')}`);
  }
}
// ------------------------------------------------------------------
// 3. Dia fora do cronograma nao pode devolver "as duas primeiras".
// ------------------------------------------------------------------
console.log('\n== datas fora do cronograma ==');
{
  for (const dataKey of ['2026-09-27', '2026-12-06', '2026-01-01', 'invalida', '']) {
    confere(aulasDoDia(dataKey).length === 0, `"${dataKey}" deveria devolver 0 aulas`);
    confere(dailyLessonIdsFor(dataKey).length === 0, `dailyPlan.js devolveu aulas para "${dataKey}"`);
  }
}

// ------------------------------------------------------------------
// 4. Todo dia tem no maximo 2 aulas (o dia tem 2 blocos). Mais que
//    isso indicaria corrupcao na geracao do artefato.
// ------------------------------------------------------------------
console.log('\n== limite de aulas por dia ==');
{
  for (const dataKey of DATAS_DO_CURRICULO) {
    const n = aulasDoDia(dataKey).length;
    confere(n > 0 && n <= 2, `${dataKey}: ${n} aulas (esperado 1 ou 2)`);
  }
}

// ------------------------------------------------------------------
// 5. O timezone: 23:30 em Sao Paulo ainda e o dia anterior. E o que
//    decide se o cron gera o dia certo.
// ------------------------------------------------------------------
console.log('\n== timezone America/Sao_Paulo ==');
{
  const casos = [
    ['2026-10-02T23:30:00-03:00', '2026-10-02'],
    ['2026-10-03T00:30:00-03:00', '2026-10-03'],
    ['2026-10-03T02:30:00Z', '2026-10-02'],
    ['2026-12-05T23:59:00-03:00', '2026-12-05'],
  ];
  for (const [iso, esperado] of casos) {
    const obtido = dateKeyInZone(new Date(iso));
    confere(obtido === esperado, `${iso}: esperado ${esperado}, obtido ${obtido}`);
  }
}

// ------------------------------------------------------------------
// 6. A versao do curriculo entra na chave do cache, entao os dois
//    lados tem que concordar.
// ------------------------------------------------------------------
console.log('\n== versao do curriculo ==');
{
  confere(CURRICULUM_VERSION === 'v2', `artefato com versao ${CURRICULUM_VERSION}, esperado v2`);
  confere(DATAS_DO_CURRICULO.length === 66, `${DATAS_DO_CURRICULO.length} datas no artefato, esperado 66`);
}

console.log(`\n${ok}/${ok + falhas} verificacoes OK · ${falhas} falha(s)`);
console.log(falhas === 0 ? 'CONFORME' : 'DIVERGENTE');
process.exit(falhas === 0 ? 0 : 1);
