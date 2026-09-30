// ============================================================
// Pre-geraÃ§Ã£o de aulas (FASE 3)
// ------------------------------------------------------------
// Objetivo: a aluna NAO espera a IA gerar a aula ao clicar.
//
// Como funciona: ao abrir o cronograma (ou apos concluir algo), o app
// identifica as proximas aulas, verifica se ja estao em
// generated_lessons e, se faltar, chama a MESMA Edge Function
// generate-lesson em segundo plano. Nao existe um segundo sistema de
// geracao: a pre-geracao reutiliza loadLessonForPlan, que por sua vez
// usa a chave deterministica e o cache existentes.
//
// Garantias:
//   - nunca bloqueia a interface (nada de await na renderizacao);
//   - nunca gera os 137 blocos (limite por ciclo);
//   - nunca duplica (dedup por cache_key e registro em andamento);
//   - nunca entra em loop (cooldown por aula);
//   - se falhar, o fluxo manual de estudar continua funcionando.
// ============================================================

import { loadLessonForPlan, getCachedLesson, lessonCacheKey } from './ai';
import { curriculumDays, isGeneratedDay, CURRICULUM_VERSION } from '../data/curriculum';
import { getDateKey } from '../data/lessons';

/** Quantas aulas futuras preparar por ciclo. Configuravel. */
export const PREWARM_MAX_PER_CYCLE = 2;

/** Espera minima entre duas tentativas da MESMA aula. */
export const PREWARM_COOLDOWN_MS = 5 * 60 * 1000;

/** Uma falha nao pode virar dez chamadas seguidas. */
export const PREWARM_MAX_ATTEMPTS = 2;

const emAndamento = new Map(); // cacheKey -> Promise
const ultimoTentativa = new Map(); // cacheKey -> timestamp
const tentativas = new Map(); // cacheKey -> numero de tentativas
let ultimoCiclo = 0;
let cicloEmAndamento = false;

export const PREWARM_STATE = {
  IDLE: 'idle',
  READY: 'ready',
  GENERATING: 'generating',
  FAILED: 'failed',
};

function agora() {
  return Date.now();
}

/** Telemetria da pre-geracao. Nunca loga conteudo de aula nem chave. */
function log(evento, dados = {}) {
  const campos = Object.entries(dados)
    .map(([k, v]) => `${k}=${v === null || v === undefined ? '-' : v}`)
    .join(' ');
  console.info(`[prewarm] ${evento} ${campos}`);
}

/**
 * Aulas que a aluna provavelmente vai estudar a seguir, em ordem.
 * Prioridade: o proximo bloco de hoje, depois os do dia seguinte.
 * Nao altera o cronograma: apenas le a ordem ja existente.
 */
export function proximasAulas(limite = PREWARM_MAX_PER_CYCLE, referencia = new Date()) {
  const hoje = getDateKey(referencia);
  const candidatos = curriculumDays
    .filter(isGeneratedDay)
    .filter((plan) => (plan.dateKey ?? '') >= hoje)
    .sort(
      (a, b) =>
        String(a.dateKey).localeCompare(String(b.dateKey)) || (a.block ?? 1) - (b.block ?? 1),
    );
  return candidatos.slice(0, limite);
}

/** True se esta aula pode ser tentada agora (cooldown + tentativas). */
function podeTentar(plan) {
  const key = lessonCacheKey(plan);
  if (emAndamento.has(key)) return false;
  if ((tentativas.get(key) ?? 0) >= PREWARM_MAX_ATTEMPTS) return false;
  const ultimo = ultimoTentativa.get(key) ?? 0;
  return agora() - ultimo >= PREWARM_COOLDOWN_MS;
}

/**
 * Prepara UMA aula em segundo plano.
 * Deduplica: se a MESMA aula ja esta sendo gerada, devolve a promessa
 * existente em vez de chamar a IA de novo.
 */
export function prewarmLesson(plan) {
  const key = lessonCacheKey(plan);
  const base = { block: plan.id, subject: plan.subject, curriculumVersion: CURRICULUM_VERSION };

  if (!podeTentar(plan)) {
    return Promise.resolve({ ...base, state: PREWARM_STATE.IDLE });
  }

  ultimoTentativa.set(key, agora());
  tentativas.set(key, (tentativas.get(key) ?? 0) + 1);
  const tentativa = tentativas.get(key);

  log('prewarm_started', { ...base, attempt: tentativa, cache_hit: false });

  const trabalho = (async () => {
    const t0 = agora();
    try {
      // Cache local ja resolve: nao ha por que chamar a IA.
      if (getCachedLesson(plan)) {
        log('prewarm_cache_hit', { ...base, generation_ms: 0, success: true });
        return { ...base, state: PREWARM_STATE.READY, cacheHit: true, generationMs: 0, success: true };
      }

      const resultado = await loadLessonForPlan(plan);
      const generationMs = agora() - t0;
      const ok = Boolean(resultado?.lessonId || resultado?.lesson);
      log(ok ? 'prewarm_ready' : 'prewarm_failed', {
        ...base,
        generation_ms: generationMs,
        success: ok,
        error_type: ok ? null : 'sem_aula',
      });
      return {
        ...base,
        state: ok ? PREWARM_STATE.READY : PREWARM_STATE.FAILED,
        cacheHit: false,
        generationMs,
        success: ok,
      };
    } catch (error) {
      const generationMs = agora() - t0;
      log('prewarm_failed', {
        ...base,
        generation_ms: generationMs,
        success: false,
        error_type: String(error?.code || error?.message || 'erro').slice(0, 60),
      });
      return { ...base, state: PREWARM_STATE.FAILED, generationMs, success: false };
    } finally {
      emAndamento.delete(key);
    }
  })();

  emAndamento.set(key, trabalho);
  return trabalho;
}

/**
 * Cicla a pre-geracao: prepara as proximas aulas que faltam.
 * Seguro para chamar em qualquer evento (abrir cronograma, concluir
 * aula, concluir quiz). Dois ciclos nunca rodam ao mesmo tempo, e um
 * cooldown evita que a chamada se repita a cada renderizacao.
 */
export function prewarmProximasAulas({ limite = PREWARM_MAX_PER_CYCLE } = {}) {
  if (cicloEmAndamento) return Promise.resolve([]);
  const agoraMs = agora();
  if (agoraMs - ultimoCiclo < PREWARM_COOLDOWN_MS / 2) return Promise.resolve([]);
  ultimoCiclo = agoraMs;
  cicloEmAndamento = true;

  const planos = proximasAulas(limite);
  return Promise.all(planos.map((plan) => prewarmLesson(plan)))
    .then((resultados) => resultados.filter((r) => r.state !== PREWARM_STATE.IDLE))
    .finally(() => {
      cicloEmAndamento = false;
    });
}

/** Estado de uma aula especifica, para o indicador do cronograma. */
export function prewarmStatusDe(plan) {
  const key = lessonCacheKey(plan);
  if (getCachedLesson(plan)) return PREWARM_STATE.READY;
  if (emAndamento.has(key)) return PREWARM_STATE.GENERATING;
  if ((tentativas.get(key) ?? 0) >= PREWARM_MAX_ATTEMPTS) return PREWARM_STATE.FAILED;
  return PREWARM_STATE.IDLE;
}

/** Usado pelos testes: limpa os registros de em andamento. */
export function resetPrewarm() {
  emAndamento.clear();
  ultimoTentativa.clear();
  tentativas.clear();
  ultimoCiclo = 0;
  cicloEmAndamento = false;
}
