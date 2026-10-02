// ============================================================
// LOGICA DO JOB DE PRE-GERACAO — pura, sem IO.
//
// O teste deterministico (tools/verificar-pre-geracao.mjs) e a Edge
// Function importam ESTE arquivo. Se a regra de "gerar so o que falta"
// vivesse dentro da Edge Function, os testes estariam testando uma
// copia e nao o que roda em producao.
//
// Regra central: o job decide a priori quais aulas vao chamar o
// provider. Se duas execucoes concorrentes receberem a mesma lista,
// ambas chegao a MESMA conclusao porque a lista ja vem deduplicada e
// o cache e lido antes de qualquer chamada.
// ============================================================

/** Versao do conteudo gerado. Tem que ser IGUAL a de src/services/ai.js. */
export const VERSAO_CONTEUDO = 'p1-aulas-2026-09-30';

/** Versao do curriculo. Tem que ser IGUAL a de src/data/curriculum.js. */
export const VERSAO_CURRICULO = 'v2';

/**
 * Identidade logica da aula — a MESMA chave que o app usa.
 *
 * A ordem dos campos e a ordem exata de `lessonCacheKey` em
 * src/services/ai.js e `lessonCacheKey` em _shared/db.js:
 *
 *     curriculumVersion | versaoConteudo | week | dateKey | b{bloco} | materia | topico
 *
 * Se esta funcao divergir em um unico campo ou uma unica ordem, o
 * servidor grava a aula com uma chave e a aluna procura por outra: a
 * pre-geracao roda, paga o provider e a aula continua "nao
 * disponivel" para ela. E o por que ela e copia campo a campo, e nao
 * uma versao "equivalente".
 */
export function chaveCache({
  curriculumVersion = VERSAO_CURRICULO,
  versao = VERSAO_CONTEUDO,
  week,
  dateKey,
  block,
  subject,
  topic,
}) {
  return [
    String(curriculumVersion || 'v1'),
    String(versao),
    String(week ?? '?'),
    String(dateKey ?? '?'),
    `b${Number(block) || 1}`,
    String(subject ?? '').toLowerCase().trim(),
    String(topic ?? '').toLowerCase().trim(),
  ].join('|');
}

/**
 * Cache valido?
 *
 * Tres condicoes, e as tres importam:
 *  - a entrada existe;
 *  - e da versao de conteudo atual (versao velha = regenerar, como
 *    ja acontecia quando o prompt da aula mudou);
 *  - tem conteudo de verdade, nao um objeto vazio que passou pelo
 *    save por algum motivo.
 */
export function cacheValido(entrada, versao = VERSAO_CONTEUDO) {
  if (!entrada || typeof entrada !== 'object') return false;
  if (entrada.versao !== versao) return false;
  const dados = entrada.dados ?? entrada.lesson_data;
  if (!dados || typeof dados !== 'object') return false;
  const secoes = dados.sections ?? dados.secoes;
  return Array.isArray(secoes) && secoes.length > 0;
}

/**
 * Decide o que fazer e faz.
 *
 * @param {object}   p
 * @param {string}   p.dateKey    dia em YYYY-MM-DD (ja no fuso certo)
 * @param {Array}    p.aulas      as duas aulas do dia (ja deduplicadas)
 * @param {Function} p.lerCache   (chave) => entrada|null
 * @param {Function} p.gerar      (aula) => { dados, modelo } | { erro }
 * @param {Function} p.salvar     (chave, entrada) => void
 * @param {number}   p.cotamaxima 2 por padrao
 *
 * @returns {Promise<object>} relatorio, sem segredo e sem chave.
 */
export async function executarJob({
  dateKey,
  aulas = [],
  lerCache,
  gerar,
  salvar,
  cotamaxima = 2,
  agora = () => new Date().toISOString(),
}) {
  // Deduplica por id ANTES de qualquer coisa. Se o mesmo dia vier
  // repetido, o provider e chamado uma vez so.
  const vistos = new Set();
  const unicas = [];
  for (const aula of aulas) {
    const chave = aula?.chave || chaveCache(aula);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    unicas.push({ ...aula, chave });
  }

  const relatorio = {
    dateKey,
    planejadas: unicas.length,
    existentes: [],
    geradas: [],
    falhas: [],
    chamadas: 0,
    detalhe: [],
  };

  for (const aula of unicas.slice(0, cotamaxima)) {
    const entrada = await lerCache(aula.chave);

    if (cacheValido(entrada)) {
      relatorio.existentes.push(aula.id);
      relatorio.detalhe.push({ id: aula.id, situacao: 'existente' });
      continue;
    }

    relatorio.chamadas += 1;
    const inicio = Date.now();
    let saida;
    try {
      saida = await gerar(aula);
    } catch (erro) {
      saida = { erro: String(erro?.message ?? erro).slice(0, 160) };
    }
    const latenciaMs = Date.now() - inicio;

    // Provider fora do ar: NAO salva. Sem save nao existe aula falsa
    // no cache e a proxima execucao do cron tenta de novo.
    if (saida?.erro || !saida?.dados) {
      relatorio.falhas.push({ id: aula.id, motivo: saida?.erro ?? 'sem_dados' });
      relatorio.detalhe.push({ id: aula.id, situacao: 'falha', latenciaMs });
      continue;
    }

    // Ultima checagem antes de gravar: se enquanto gerava o cache foi
    // preenchido por outra execucao, nao sobrescreve.
    const agoraEntrada = await lerCache(aula.chave);
    if (cacheValido(agoraEntrada)) {
      relatorio.existentes.push(aula.id);
      relatorio.detalhe.push({ id: aula.id, situacao: 'existente_apos_esperar' });
      continue;
    }

    await salvar(aula.chave, {
      versao: VERSAO_CONTEUDO,
      dados: saida.dados,
      modelo: saida.modelo ?? null,
      criadoEm: agora(),
    });
    relatorio.geradas.push(aula.id);
    relatorio.detalhe.push({ id: aula.id, situacao: 'gerada', modelo: saida.modelo ?? null, latenciaMs });
  }

  // O que sobrou alem da cota nao e erro: fica para a proxima rodada.
  const foraDaCota = unicas.slice(cotamaxima);
  if (foraDaCota.length) {
    relatorio.detalhe.push({
      situacao: 'adiado',
      ids: foraDaCota.map((a) => a.id),
      motivo: `cota de ${cotamaxima} por execucao`,
    });
  }

  return relatorio;
}