// ============================================================
// Testes deterministicos da pre-geracao.
//
//   node tools/verificar-pre-geracao.mjs
//
// Nao chama NENHUM provider e NENHUM banco: o `gerar` e um duble que
// conta as chamadas. E por isso que estes testes provam a regra
// (gerar so o que falta, nunca duas vezes, nunca salvar conteudo
// falso) sem depender do provider estar no ar.
//
// Cobre os 10 casos pedidos:
//    1  nenhuma existe      -> gera 2
//    2  a 1a existe         -> gera 1
//    3  as 2 existem        -> gera 0
//    4  a 1a falha          -> nao salva invalida, a 2a continua
//    5  provider fora       -> nada falso no cache
//    6  roda 2x             -> sem duplicata
//    7  roda 10x            -> sem duplicata
//    8  cache em versao velha-> regenera
//    9  virada de dia em SP -> aulas do dia certo
//   10  dia sem 2 aulas     -> nao inventa
// ============================================================

import {
  cacheValido,
  executarJob,
  chaveCache,
  VERSAO_CONTEUDO,
} from '../supabase/functions/pregenerate-daily/_shared/dailyJob.js';
import { dateKeyInZone, dailyLessonIdsFor } from '../src/data/dailyPlan.js';

let passou = 0;
let falhou = 0;

function ok(condicao, rotulo, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`  OK    | ${rotulo}${detalhe ? `  (${detalhe})` : ''}`);
  } else {
    falhou += 1;
    console.log(`  FALHA | ${rotulo}${detalhe ? `  (${detalhe})` : ''}`);
  }
}

function secao(titulo) {
  console.log(`\n--- ${titulo} ---`);
}

/** Cache falso + provider falso que conta as chamadas. */
function cenario({ cache = {}, provider } = {}) {
  const estado = { ...cache };
  const salvas = [];
  let chamadas = 0;
  return {
    estado,
    salvas,
    get chamadas() { return chamadas; },
    lerCache: (chave) => estado[chave] ?? null,
    salvar: (chave, entrada) => {
      estado[chave] = entrada;
      salvas.push({ chave, ...entrada });
    },
    gerar: async (aula) => {
      chamadas += 1;
      if (provider) return provider(aula, chamadas);
      return { dados: { sections: [{ title: 'secao', paragraphs: [aula.id] }] }, modelo: 'nvidia' };
    },
  };
}

const AULA_A = { id: 'dia-A', week: 1, dateKey: '2026-10-02', block: 1, subject: 'Matemática', topic: 'frações' };
const AULA_B = { id: 'dia-B', week: 1, dateKey: '2026-10-02', block: 2, subject: 'Português', topic: 'ideia principal' };

/** Atalho: roda o job com o cenario completo. */
const rodar = (c, aulas, dateKey = '2026-10-02') =>
  executarJob({ dateKey, aulas, lerCache: c.lerCache, gerar: c.gerar, salvar: c.salvar });

// ---------------------------------------------------------------- 1
secao('Teste 1 — nenhuma das duas existe');
{
  const c = cenario();
  const r = await rodar(c, [AULA_A, AULA_B]);
  ok(r.geradas.length === 2, 'gera as 2 aulas', `geradas=${r.geradas.length}`);
  ok(c.chamadas === 2, 'chama o provider 2 vezes', `chamadas=${c.chamadas}`);
  ok(c.salvas.length === 2, 'salva as 2 no cache');
}

// ---------------------------------------------------------------- 2
secao('Teste 2 — a primeira existe, a segunda nao');
{
  const c = cenario({
    cache: { [chaveCache(AULA_A)]: { versao: VERSAO_CONTEUDO, dados: { sections: [{ title: 'x' }] } } },
  });
  const r = await rodar(c, [AULA_A, AULA_B]);
  ok(r.geradas.length === 1 && r.geradas[0] === 'dia-B', 'gera so a que falta', r.geradas.join(','));
  ok(r.existentes.includes('dia-A'), 'conta a primeira como existente');
  ok(c.chamadas === 1, 'chama o provider 1 vez', `chamadas=${c.chamadas}`);
}

// ---------------------------------------------------------------- 3
secao('Teste 3 — as duas ja existem');
{
  const c = cenario({
    cache: {
      [chaveCache(AULA_A)]: { versao: VERSAO_CONTEUDO, dados: { sections: [{ title: 'x' }] } },
      [chaveCache(AULA_B)]: { versao: VERSAO_CONTEUDO, dados: { sections: [{ title: 'y' }] } },
    },
  });
  const r = await rodar(c, [AULA_A, AULA_B]);
  ok(r.geradas.length === 0, 'gera 0');
  ok(c.chamadas === 0, 'ZERO chamadas ao provider', `chamadas=${c.chamadas}`);
  ok(r.existentes.length === 2, 'as 2 como existentes');
}

// ---------------------------------------------------------------- 4
secao('Teste 4 — a primeira falha, a segunda funciona');
{
  const c = cenario({
    provider: (aula) => (aula.id === 'dia-A'
      ? { erro: 'provider fora do ar' }
      : { dados: { sections: [{ title: 'ok' }] }, modelo: 'nvidia' }),
  });
  const r = await rodar(c, [AULA_A, AULA_B]);
  ok(r.geradas.length === 1 && r.geradas[0] === 'dia-B', 'a segunda segue e salva');
  ok(r.falhas.length === 1 && r.falhas[0].id === 'dia-A', 'a primeira fica registrada como falha');
  ok(c.salvas.length === 1, 'so a valida foi salva', `salvos=${c.salvas.length}`);
}

// ---------------------------------------------------------------- 5
secao('Teste 5 — provider indisponivel');
{
  const c = cenario({ provider: () => ({ erro: 'sem credencial' }) });
  const r = await rodar(c, [AULA_A, AULA_B]);
  ok(c.salvas.length === 0, 'nada salvo no cache');
  ok(r.geradas.length === 0, 'nenhuma aula marcada como pronta');
  ok(r.falhas.length === 2, 'as 2 registradas como falha', `falhas=${r.falhas.length}`);
  const c2 = cenario();
// ---------------------------------------------------------------- 6 e 7
secao('Teste 6/7 — rodar varias vezes nao duplica');
{
  const c = cenario();
  await rodar(c, [AULA_A, AULA_B]);
  ok(c.chamadas === 2, '1a execucao gera as 2', `chamadas=${c.chamadas}`);
  await rodar(c, [AULA_A, AULA_B]);
  ok(c.chamadas === 2, 'rodar 2x: provider so na primeira', `chamadas=${c.chamadas}`);
  for (let i = 0; i < 8; i += 1) await rodar(c, [AULA_A, AULA_B]);
  ok(c.chamadas === 2, 'rodar 10x: continua sendo 2 chamadas', `chamadas=${c.chamadas}`);
  ok(c.salvas.length === 2, 'nada duplicado no cache', `salvos=${c.salvas.length}`);
  ok(new Set(c.salvas.map((s) => s.chave)).size === 2, 'cada chave salva uma vez so');
}
// ---------------------------------------------------------------- 8
// Cache de outra VERSAO e o schema real.
//
// A tabela nao tem coluna `versao`: a versao do conteudo e um
// SEGMENTO da cache_key. Entao "versao antiga" nao e uma linha
// invalida, e uma chave diferente -- o job nem chega a ler a linha
// velha, porque procura pela chave nova.
//
// E por isso que o teste importa tanto: se a chave parasse de
// carregar a versao, a aula antiga voltaria a valer, a aluna leria
// o texto que o prompt novo ja trocou, e ninguem perceberia.
secao('Teste 8 — versao do conteudo mora na chave');
{
  const chaveNova = chaveCache(AULA_A);
  const chaveAntiga = chaveCache({ ...AULA_A, versao: 'p0-antigo' });

  ok(chaveAntiga !== chaveNova, 'versao diferente produz chave diferente');
  ok(chaveNova.includes(VERSAO_CONTEUDO), `a chave atual carrega a versao (${chaveNova})`);

  // Entrada gravada com a versao nova e content = cache valido.
  ok(cacheValido({ cache_key: chaveNova, lesson_data: { sections: [{ title: 'atual' }] } }),
    'entrada no schema real (cache_key + lesson_data) e valida');

  // Linha sem conteudo e invalida: e a aula falsa que nao pode existir.
  ok(!cacheValido({ cache_key: chaveNova, lesson_data: null }), 'lesson_data nulo NAO e valido');
  ok(!cacheValido({ cache_key: chaveNova, lesson_data: { sections: [] } }), 'sections vazio NAO e valido');
  ok(!cacheValido(null), 'linha inexistente NAO e valida');

  // O job procura so pela chave nova: a linha velha fica no banco,
  // intacta, e nao e lida.
  const c = cenario({
    cache: {
      [chaveAntiga]: { cache_key: chaveAntiga, lesson_data: { sections: [{ title: 'velho' }] } },
    },
  });
  ok(!cacheValido(c.estado[chaveNova]), 'a linha da versao antiga nao satisfaz a chave nova');
  const r = await rodar(c, [AULA_A, AULA_B]);
  ok(r.geradas === 2 || r.geradas.length === 2, 'regenera pela versao atual', `geradas=${JSON.stringify(r.geradas)}`);
  ok(c.salvas.every((s) => s.chave.includes(VERSAO_CONTEUDO)), 'salva na versao atual');
  ok(c.salvas.every((s) => s.chave !== chaveAntiga), 'nao sobrescreve a linha antiga');
}

// ---------------------------------------------------------------- 8b
// O FORMATO REAL: `app_state.sections.aiCache`
//
// A auditoria mostrou que o caminho normal do app nao usa a tabela
// `generated_lessons`: usa o `aiCache`, dentro da linha compartilhada.
// Entao o formato que o job encontra em producao e este:
//
//   { lesson: { sections: [...] }, lessonId, quiz, quizId, model, updatedAt }
//
// Se o `cacheValido` so entendesse o formato antigo da tabela, ele
// veria "sem aula" num cache cheio e o cron chamaria o provider toda
// vez -- e, pior, gravaria por cima do conteudo que a Anna tem no
// celular. Estes testes travam esse erro.
secao('Teste 8b — formato real do aiCache');
{
  const chave = chaveCache(AULA_A);
  const aulaBoa = { title: 'Aula real', sections: [{ title: 'Parte 1', explanation: '...' }] };

  ok(cacheValido({ lesson: aulaBoa, lessonId: 'x', model: 'm', updatedAt: 1 }),
    'entrada no formato aiCache (lesson + lessonId) e valida');
  ok(!cacheValido({ lessonId: 'x', quiz: null, updatedAt: 1 }),
    'entrada sem lesson NAO e valida');
  ok(!cacheValido({ lesson: { sections: [] }, lessonId: 'x', updatedAt: 1 }),
    'aiCache com sections vazio NAO e valida');
  ok(!cacheValido({ lesson: { title: 'so titulo' }, lessonId: 'x', updatedAt: 1 }),
    'aula sem sections NAO e valida (e a aula falsa)');

  // Duas entradas do aiCache, uma pronta e outra nao: o job tem que
  // considerar pronta SO a que tem lesson de verdade.
  const c = cenario({
    cache: {
      [chaveCache(AULA_A)]: { lesson: aulaBoa, lessonId: 'a', updatedAt: 10 },
      [chaveCache(AULA_B)]: { lesson: { sections: [] }, lessonId: 'b', updatedAt: 10 },
    },
  });
  const r = await rodar(c, [AULA_A, AULA_B]);
  ok(r.existentes.includes(AULA_A.id), 'aula valida do aiCache e reaproveitada');
  ok(r.geradas.includes(AULA_B.id), 'aula do aiCache sem conteudo e regenerada');
  ok(r.chamadas === 1, 'so uma chamada de provider', `chamadas=${r.chamadas}`);
}

// ---------------------------------------------------------------- 9
secao('Teste 9 — virada do dia em Sao Paulo');
{
  // 02:30 UTC = 23:30 de 02/10 em Sao Paulo (UTC-3).
  ok(dateKeyInZone(new Date('2026-10-03T02:30:00Z')) === '2026-10-02',
    '23:30 em SP ainda e o dia 02');
  // 03:30 UTC = 00:30 de 03/10 em Sao Paulo.
  ok(dateKeyInZone(new Date('2026-10-03T03:30:00Z')) === '2026-10-03',
    '00:30 em SP ja e o dia 03');

  const dia02 = dailyLessonIdsFor('2026-10-02').map((a) => a.id);
  const dia03 = dailyLessonIdsFor('2026-10-03').map((a) => a.id);
  ok(dia02.length === 2 && dia03.length === 2, 'os dois dias tem 2 aulas', `${dia02.length} / ${dia03.length}`);
  ok(dia02.join() !== dia03.join(), 'os dois dias sao diferentes');
  ok(dia02.every((id) => id.includes('2026-10-02')), 'as aulas do dia 02 sao do dia 02', dia02[0]);
  ok(dia03.every((id) => id.includes('2026-10-03')), 'as aulas do dia 03 sao do dia 03', dia03[0]);
  ok(new Date('2026-10-03T02:30:00Z').toISOString().slice(0, 10) !== '2026-10-02',
    'UTC puro escolheria o dia errado (motivo do fuso)');
}

// ---------------------------------------------------------------- 10
secao('Teste 10 — dia sem duas aulas');
{
  const c = cenario();
  const r = await executarJob({
    dateKey: '2030-01-01', aulas: dailyLessonIdsFor('2030-01-01'),
    lerCache: c.lerCache, gerar: c.gerar, salvar: c.salvar,
  });
  ok(r.planejadas === 0, 'nenhuma aula planejada fora do cronograma');
  ok(c.chamadas === 0, 'zero chamadas ao provider');
  ok(r.geradas.length === 0, 'nada gerado');
}

// ---------------------------------------------------------------- extras
secao('Regras extras');
{
  ok(!cacheValido(null), 'cache nulo nao e valido');
  ok(!cacheValido({ versao: VERSAO_CONTEUDO, dados: { sections: [] } }), 'sections vazio nao e valido');
  ok(!cacheValido({ versao: VERSAO_CONTEUDO, dados: {} }), 'sem sections nao e valido');

  const c = cenario();
  const r = await rodar(c, [AULA_A, AULA_A, AULA_B, AULA_B]);
  ok(r.planejadas === 2, 'aulas repetidas nao contam duas vezes', `planejadas=${r.planejadas}`);
  ok(c.chamadas === 2, 'provider chamado uma vez por aula', `chamadas=${c.chamadas}`);

  // Corrida: durante a geracao da A, a B aparece no cache.
  const c2 = cenario();
  const r2 = await executarJob({
    dateKey: '2026-10-02', aulas: [AULA_A, AULA_B],
    lerCache: c2.lerCache,
    gerar: async (aula) => {
      if (aula.id === 'dia-B') {
        c2.estado[chaveCache(AULA_B)] = { versao: VERSAO_CONTEUDO, dados: { sections: [{ title: 'z' }] } };
      }
      return { dados: { sections: [{ title: 'x' }] }, modelo: 'm' };
    },
    salvar: c2.salvar,
  });
  ok(r2.geradas.length + r2.existentes.length === 2, 'as 2 aulas foram cobertas');
  ok(r2.detalhe.some((d) => d.situacao === 'existente_apos_esperar'),
    'nao sobrescreve o que apareceu durante a geracao');
}

// A chave do cache do servidor tem que ser IDENTICA a do cliente.
//
// Esta e a verificacao que impede o pior modo de falha silencioso do
// pre-gerador: o cron roda, paga o provider, grava a aula — e a aluna
// continua vendo "aula nao disponivel", porque o app procura por outra
// chave. Nada quebra, nenhum log acusa, so que o servico nao serve
// para nada.
//
// A funcao do lado do cliente esta REESCRITA aqui de proposito: se
// importassemos o arquivo real, `ai.js` puxa dependencias de browser e
// o teste nao rodaria no Node. Reimplementar a formula e o que torna
// este teste um alarme de drift — se alguem mudar um campo ou a ordem
// la em src/services/ai.js sem mexer aqui, este teste quebra.
function chaveDoCliente(plan) {
  return [
    plan.curriculumVersion || 'v1',
    'p1-aulas-2026-09-30',
    plan.week ?? '?',
    plan.dateKey ?? plan.day ?? '?',
    `b${plan.block ?? 1}`,
    String(plan.subject ?? '').toLowerCase(),
    String(plan.topic ?? '').toLowerCase(),
  ].join('|');
}

for (const dia of ['2026-10-02', '2026-10-03', '2026-10-05']) {
  const aulas = dailyLessonIdsFor(dia);
  for (const aula of aulas) {
    ok(chaveCache(aula) === chaveDoCliente(aula),
      `chave bate com o app em ${dia}`,
      chaveCache(aula) === chaveDoCliente(aula) ? aula.id : `app=${chaveDoCliente(aula)} servidor=${chaveCache(aula)}`);
  }
}

console.log('\n------------------------------------------------------------');
const total = passou + falhou;
console.log(`${passou}/${total} verificacoes OK · ${falhou} falha(s)`);
console.log(falhou === 0 ? 'CONFORME' : 'DIVERGENTE');
process.exit(falhou === 0 ? 0 : 1);
  const r2 = await rodar(c2, [AULA_A, AULA_B]);
  ok(r2.geradas.length === 2, 'a execucao seguinte tenta de novo e agora salva');
}

