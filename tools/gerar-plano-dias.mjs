// ============================================================
// GERA O ARTEFATO DO CURRICULO PARA A EDGE FUNCTION
// ------------------------------------------------------------
// POR QUE ISTO EXISTE
//
// A Edge Function roda em Deno e so enxerga o que esta dentro de
// supabase/functions/. O cronograma, porem, mora em src/data/, e
// ele tem 477 linhas. Copiar esse arquivo para dentro de
// supabase/functions/ criaria DUAS versoes do cronograma, e elas
// divergiriam na primeira edicao de um dia -- o pior tipo de bug
// aqui: o servidor prepararia a aula A, a tela abriria a aula B, e
// a aluna veria "aula nao disponivel" enquanto o cache esta cheio.
//
// Entao em vez de copiar, este script DERIVA o artefato chamando o
// curriculum de verdade (src/data/curriculum.js) e exportando so o
// que a Edge Function precisa: as aulas de cada dia do cronograma.
//
// O artefato e derivado, nunca editado a mao. E o
// tools/verificar-plano-dias.mjs falha se o artefato estiver
// velho: os dois lados passam a ser provados iguais, nao mantidos
// iguais por disciplina.
//
// USO:  node tools/gerar-plano-dias.mjs
// ============================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { curriculumDays, CURRICULUM_VERSION, isGeneratedDay } from '../src/data/curriculum.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = join(aqui, '..', 'supabase', 'functions', 'pregenerate-daily', '_shared', 'planoDias.js');

// Um dia do cronograma vira uma lista de aulas. Usa EXATAMENTE o
// mesmo filtro do app (`isGeneratedDay`): dia de prova/questoes nao
// gera aula, e por isso nao entra no artefato.
const porDia = new Map();
for (const plan of curriculumDays) {
  if (!isGeneratedDay(plan)) continue;
  if (!porDia.has(plan.dateKey)) porDia.set(plan.dateKey, []);
  porDia.get(plan.dateKey).push({
    id: plan.id,
    week: plan.week,
    block: plan.block,
    blockCount: plan.blockCount,
    kind: plan.kind,
    subject: plan.subject,
    topic: plan.topic,
    subtopics: plan.subtopics,
    content: plan.content,
    objective: plan.objective,
    color: plan.color,
    durationMinutes: plan.durationMinutes,
  });
}

// Ordem por data: o arquivo fica estavel entre execucoes, para o
// diff no git mostrar so as aulas que realmente mudaram.
const dias = [...porDia.keys()].sort().map((dateKey) => ({
  dateKey,
  aulas: porDia.get(dateKey),
}));

// fields nao muda a semantica; e so para o arquivo ser pequeno.
// O timezone tambem mora AQUI, e nao em src/data/dailyPlan.js, porque o
// servidor precisa dele e o servidor nao alcanca src/. Definir num lado
// so e reexportar no outro garante que o cron e o app calculem a
// virada do dia do mesmo jeito -- se divergirem, o cron prepara o dia
// seguinte e a aluna abre o dia de hoje.
const TZ = `/** Fuso do cronograma. O produto inteiro presume horario de Sao Paulo. */
export const TIMEZONE_CRONOGRAMA = "America/Sao_Paulo";

/**
 * Chave YYYY-MM-DD de um instante, no fuso indicado.
 *
 * Nao usa toISOString(): isso converte para UTC e adiantaria o dia em
 * quem esta a leste de Greenwich. Sao Paulo e UTC-3, entao 23:30 de um
 * dia vira 02:30 do dia seguinte em UTC -- o dia errado.
 */
export function dateKeyInZone(date = new Date(), timeZone = TIMEZONE_CRONOGRAMA) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const pega = (tipo) => partes.find((p) => p.type === tipo)?.value ?? "";
  return \`\${pega("year")}-\${pega("month")}-\${pega("day")}\`;
}`;

const conteudo = `// ============================================================
// ARTEFATO GERADO — NAO EDITE ESTE ARQUIVO.
//
// Fonte: src/data/curriculum.js (via src/data/schedule.js)
// Gerador: tools/gerar-plano-dias.mjs
// Guardiao: tools/verificar-plano-dias.mjs (falha se ficar velho)
//
// Para mudar o cronograma, mude src/data/schedule.js e rode
//   node tools/gerar-plano-dias.mjs
// Editar aqui nao muda nada: o proximo regerar sobrescreve.
// ============================================================

${TZ}

/** Tem que ser IGUAL a CURRICULUM_VERSION de src/data/curriculum.js. */
export const CURRICULUM_VERSION = ${JSON.stringify(CURRICULUM_VERSION)};

/** Todas as datas do cronograma que tem aula de verdade. */
export const DATAS_DO_CURRICULO = ${JSON.stringify(dias.map((d) => d.dateKey))};

const DIAS = ${JSON.stringify(dias)};

/**
 * As aulas oficiais do dia, na ordem do cronograma.
 *
 * Dia fora do cronograma devolve lista vazia: nao existe "as duas
 * primeiras" para pegar de qualquer array.
 *
 * @param {string} dateKey YYYY-MM-DD, ja no fuso America/Sao_Paulo
 */
export function aulasDoDia(dateKey) {
  const dia = DIAS.find((item) => item.dateKey === dateKey);
  return dia ? dia.aulas : [];
}
`;

writeFileSync(destino, conteudo, 'utf8');
const total = dias.reduce((soma, d) => soma + d.aulas.length, 0);
console.log(`plano-dias: ${dias.length} dias, ${total} aulas, ${conteudo.length} bytes -> ${destino}`);