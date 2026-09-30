// ============================================================
// Comunicacao do frontend com a IA (SR no backend)
// ------------------------------------------------------------
// O navegador NUNCA fala com a NVIDIA e NUNCA tem a chave.
// Este servico chama apenas as Edge Functions do Supabase:
//   generate-lesson  -> gera a aula do topico do cronograma
//   generate-quiz    -> gera o quiz da aula que foi gerada
//   tutor            -> a tutora do chat
// A identidade vem do JWT da sessao (login anonimo do Supabase),
// entao o user_id nunca e enviado no body.
//
// Cache em camadas (para nunca pagar IA de novo):
//   1. localStorage deste aparelho
//   2. public.app_state (secao aiCache) -> vale para celular e PC
//   3. public.generated_lessons / generated_quizzes (por usuario, RLS)
// ============================================================

import { supabase, aiSupabase, SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../lib/supabase';
import { getFullLessonQuiz } from '../data/lessonQuiz';

const LOCAL_CACHE_KEY = 'istudos_ai_lessons';
const MAX_LOCAL_ENTRIES = 40;
const LESSON_TIMEOUT_MS = 150000;
const QUIZ_TIMEOUT_MS = 120000;

const DIAG_KEY = 'istudos_tutor_diag';

// Limite para abrir a sessao anonima. Sem isso, uma rede lenta (ou a
// cota de sessoes anonimas esgotada) trava a tela em 'Respondendo...'.
const SESSION_TIMEOUT_MS = 12000;

// Sem trafego por 50s o fetch e abortado (Bug 4): sem isso a UI
// ficava em generating/streaming para sempre.
const TUTOR_IDLE_TIMEOUT_MS = 50000;

// Teto para a RESPOSTA comecar (fetch + cabecalho + corpo). E o
// prazo maximo que o navegador espera pela Edge Function antes de
// desistir: 30s e tolerante (o gpt-oss-20b leva alguns segundos
// pensando antes do primeiro token) e nunca infinito. Vale para o
// caminho em que o fetch fica pendurado (conexao SSE morta, proxy
// engolindo a requisicao, DNS sem resposta), em que o timer de
// inatividade ainda nem existe porque o reader nem foi criado.
const TUTOR_STREAM_TIMEOUT_MS = 30000;

function diag(etapa, detalhe) {
  try {
    const antes = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    const linha = `${new Date().toISOString().slice(11, 19)} ${etapa}${detalhe ? ` ${detalhe}` : ''}`;
    const depois = [...antes, linha].slice(-200);
    localStorage.setItem(DIAG_KEY, JSON.stringify(depois));
    console.log('[tutor-diag]', linha);
  } catch {
    // diagnostico nunca pode quebrar o chat
  }
}
let sessionToken = null;
let sessionCheckedAt = 0;
let blockReason = null;

export const AI_MESSAGES = {
  noSession:
    'A IA ainda nÃƒÂ£o estÃƒÂ¡ liberada neste aparelho: falta ativar o login anÃƒÂ´nimo no Supabase (Authentication Ã¢â€ â€™ Sign In Ã¢â€ â€™ Allow anonymous sign-ins).',
  offline: 'A IA nÃƒÂ£o respondeu agora. Sua aula salva continua aqui Ã¢â‚¬â€ tente de novo em um minuto.',
  generatingLesson: 'Gerando sua aula...',
  generatingQuiz: 'Preparando seu quiz...',
};

export function getAiBlockReason() {
  return blockReason;
}

/**
 * Garante um JWT para as Edge Functions:
 *  - se houver login por e-mail ativo, usa o token DAQUELE usuario (a IA
 *    estuda e salva na conta certa);
 *  - se nao houver, abre sessao anonima num cliente paralelo (aiSupabase),
 *    que NUNCA pisa no login nem no progresso local do aparelho.
 */
export async function ensureAiSession({ force = false } = {}) {
  if (!isSupabaseConfigured || !supabase || !aiSupabase) {
    blockReason = 'no-supabase';
    return null;
  }
  // Reaproveita o token por 5 minutos (evita leitura por chamada).
  if (!force && sessionToken && Date.now() - sessionCheckedAt < 300000) return sessionToken;

  diag('sessao:inicio');
  try {
    // 1. Login de verdade aberto no app? Usa o token dessa pessoa.
    const main = await supabase.auth.getSession();
    const mainSession = main.data?.session ?? null;
    if (mainSession?.access_token && mainSession.user?.is_anonymous !== true) {
      blockReason = null;
      sessionToken = mainSession.access_token;
      sessionCheckedAt = Date.now();
      diag('sessao:login-real');
      return sessionToken;
    }

    // 2. Sem login: sessao anonima exclusiva da IA (storageKey propria).
    const { data } = await aiSupabase.auth.getSession();
    let session = data?.session ?? null;

    if (!session) {
      // O BUG DESTE PASSO: signInAnonymously() e uma chamada de rede e
      // pode demorar (ou travar) se a internet estiver instavel ou se o
      // projeto tiver estourado a cota de sessoes anonimas. Sem este
      // limite o await nunca resolve, nenhum handler e chamado, nada e
      // logado e a tela fica em "Respondendo..." para sempre.
      diag('sessao:criando-anonima');
      const criada = await Promise.race([
        aiSupabase.auth.signInAnonymously(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('timeout ao abrir sessao anonima')),
            SESSION_TIMEOUT_MS,
          ),
        ),
      ]);
      session = criada.data?.session ?? null;
      if (criada.error && !session) {
        blockReason = criada.error.code === 'anonymous_provider_disabled' ? 'anonymous_disabled' : 'auth_error';
        console.warn('[ai] sem sessao anonima:', criada.error?.message ?? criada.error);
        diag(`sessao:falhou ${criada.error?.code ?? 'erro'}`);
        return null;
      }
      diag('sessao:anonima-ok');
    }
    if (!session?.access_token) {
      blockReason = 'no_session';
      diag('sessao:token-vazio');
      return null;
    }
    blockReason = null;
    sessionToken = session.access_token;
    sessionCheckedAt = Date.now();
    diag('sessao:pronta');
    return sessionToken;
  } catch (error) {
    // Antes, uma falha aqui deixava a tela travada sem aviso nenhum.
    blockReason = 'auth_error';
    console.warn('[ai] nao consegui abrir a sessao', error);
    diag(`sessao:erro ${String(error?.message ?? error).slice(0, 60)}`);
    return null;
  }
}

/** Esquece o token guardado (usado no logout, para nao vazar sessao). */
export function resetAiSession() {
  sessionToken = null;
  sessionCheckedAt = 0;
}

/** POST numa Edge Function. Devolve o JSON ou lanca Error com .status/.code. */
async function callFunction(slug, body, timeoutMs) {
  const token = await ensureAiSession();
  if (!token) {
    const error = new Error(AI_MESSAGES.noSession);
    error.code = 'unauthorized';
    error.status = 401;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || AI_MESSAGES.offline);
      error.status = response.status;
      error.code = payload?.error ?? 'http_error';
      error.detail = payload?.detail ?? payload?.errors ?? null;
      if (response.status === 401) error.code = 'unauthorized';
      throw error;
    }
    if (!payload) {
      const error = new Error(AI_MESSAGES.offline);
      error.code = 'empty_response';
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error(AI_MESSAGES.offline);
      timeout.code = 'timeout';
      timeout.status = 408;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}


// ---------- cache local (camada 1) ----------
function readLocalCache() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeLocalCache(cache) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(cache)
      .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0))
      .slice(0, MAX_LOCAL_ENTRIES);
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // armazenamento cheio: segue sem cache local
  }
}

/**
 * Versao do CONTEUDO gerado pela IA (Prioridade 1, 30/09/2026).
 *
 * O prompt da aula e o validateLesson() mudaram: agora a aula nao pode
 * citar o cronograma, tem defesa de coerencia e exige mais
 * profundidade. As 25 aulas ja gravadas usam o prompt antigo e contem
 * erros conhecidos. Bump aqui (e na MESMA constante em
 * supabase/functions/_shared/db.js) faz a chave do cache mudar, e a
 * aula antiga deixa de ser servida sem precisar apagar nada.
 *
 * IMPORTANTE: isto invalida apenas o CONTEUDO gerado. Progresso,
 * conclusao de aula, respostas, XP, historico e dados do Tutor nao
 * usam esta chave e ficam intactos.
 */
export const LESSON_CONTENT_VERSION = 'p1-aulas-2026-09-30';

export function lessonCacheKey(plan) {
  return [
    plan.curriculumVersion || 'v1',
    LESSON_CONTENT_VERSION,
    plan.week ?? '?',
    plan.dateKey ?? plan.day ?? '?',
    // O bloco entra na chave: no mesmo dia sao duas aulas diferentes.
    `b${plan.block ?? 1}`,
    String(plan.subject ?? '').toLowerCase(),
    String(plan.topic ?? '').toLowerCase(),
  ].join('|');
}

/** Cache vindo do app_state (outro aparelho ja gerou essa aula). */
export function mergeSharedCache(remoteCache) {
  if (!remoteCache || typeof remoteCache !== 'object') return;
  const local = readLocalCache();
  let changed = false;
  Object.entries(remoteCache).forEach(([key, value]) => {
    if (!value?.lesson) return;
    if (!local[key] || (value.updatedAt || 0) > (local[key].updatedAt || 0)) {
      local[key] = value;
      changed = true;
    }
  });
  if (changed) writeLocalCache(local);
}

/** Secao que vai em public.app_state para celular e PC compartilharem. */
export function getSharedCachePayload() {
  const local = readLocalCache();
  const out = {};
  Object.entries(local)
    .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0))
    .slice(0, 24)
    .forEach(([key, value]) => {
      out[key] = value;
    });
  return out;
}

export function getCachedLesson(plan) {
  const entry = readLocalCache()[lessonCacheKey(plan)];
  return entry?.lesson ? entry : null;
}

function saveCachedLesson(plan, patch) {
  const cache = readLocalCache();
  const key = lessonCacheKey(plan);
  cache[key] = { ...(cache[key] || {}), ...patch, updatedAt: Date.now() };
  writeLocalCache(cache);
  return cache[key];
}

// ---------- API usada pelas paginas ----------

/**
 * Monta o payload flat que a generate-lesson espera (vem do cronograma).
 * O `weekGoal` NAO entra em `objectives`: ele ja e enviado em `weekGoal` e,
 * repetido no prompt, aumentava o tempo de resposta do modelo a ponto de
 * estourar o limite de 150s do gateway.
 */
function lessonPayload(plan, performance, force) {
  return {
    curriculumVersion: plan.curriculumVersion || 'v1',
    week: plan.week ?? null,
    weekTitle: plan.weekTitle ?? null,
    weekGoal: plan.weekGoal ?? null,
    day: plan.day ?? null,
    dateKey: plan.dateKey ?? null,
    weekday: plan.weekday ?? null,
    phase: plan.phase ?? null,
    phaseLabel: plan.phaseLabel ?? null,
    block: plan.block ?? null,
    blockCount: plan.blockCount ?? null,
    blockLabel: plan.blockLabel ?? null,
    breakAfterMinutes: plan.breakAfterMinutes ?? 0,
    dayBreakMinutes: plan.dayBreakMinutes ?? 0,
    dayTotalMinutes: plan.dayTotalMinutes ?? null,
    kind: plan.kind ?? 'lesson',
    subject: plan.subject,
    topic: plan.topic,
    subtopics: plan.subtopics ?? [],
    objectives: [plan.objective].filter(Boolean),
    durationMinutes: plan.durationMinutes ?? 55,
    studentLevel: plan.studentLevel ?? 'Fundamental II',
    studentPerformance: performance ?? {},
    force: Boolean(force),
  };
}

/**
 * Aula do dia: usa o cache ou chama generate-lesson.
 * @returns {Promise<{lesson:object, quiz:object|null, lessonId:string|null, fromCache:boolean, model:string|null}>}
 */
export async function loadLessonForPlan(plan, { performance = null, onStatus } = {}) {
  const cached = getCachedLesson(plan);
  if (cached?.lesson) {
    return {
      lesson: cached.lesson,
      quiz: cached.quiz ?? null,
      lessonId: cached.lessonId ?? null,
      fromCache: true,
      model: cached.model ?? null,
    };
  }

  onStatus?.(AI_MESSAGES.generatingLesson);
  const result = await callFunction('generate-lesson', lessonPayload(plan, performance, false), LESSON_TIMEOUT_MS);

  if (!result?.lesson) {
    const error = new Error(AI_MESSAGES.offline);
    error.code = 'invalid_lesson';
    throw error;
  }

  saveCachedLesson(plan, {
    lesson: result.lesson,
    lessonId: result.id ?? null,
    quiz: null,
    model: result.model ?? null,
  });

  return {
    lesson: result.lesson,
    quiz: null,
    lessonId: result.id ?? null,
    fromCache: Boolean(result.cached),
    model: result.model ?? null,
  };
}

/** DÃƒÂ¡ id ÃƒÂ s questÃƒÂµes (o LessonPage usa question.id como chave das respostas). */
function withQuestionIds(quiz) {
  if (!quiz) return null;
  const questions = (quiz.questions ?? []).map((question, index) => ({
    ...question,
    id: question.id ?? `q${index + 1}`,
  }));
  return { ...quiz, questions };
}

/**
 * Quiz da aula ja salva.
 *
 * LIMPEZA (30/09/2026): esta funcao chamava a Edge Function
 * "generate-quiz", que NAO EXISTE no projeto - as unicas implantadas
 * sao ai-tutor, generate-lesson, ai-bench e tutor-chat. Toda abertura
 * de quiz de uma aula da IA respondia 404 e a aluna caia no botao
 * "Tentar novamente" para sempre (a tabela generated_quizzes esta
 * vazia: nenhum quiz de IA chegou a ser gravado).
 *
 * O que substitui a chamada morta e a implementacao que ja existia no
 * projeto e continua em uso pelas aulas cadastradas:
 * src/data/lessonQuiz.js -> getFullLessonQuiz(). Mesma assinatura de
 * retorno ({ quiz, fromCache }), mesma cache, e ZERO requisicao de
 * rede - nenhuma funcionalidade nova foi criada.
 */
export async function loadQuizForLesson(
  plan,
  lessonId,
  { difficulty = 'medium', performance = null, lesson = null, onStatus } = {},
) {
  const cached = getCachedLesson(plan);
  if (cached?.quiz?.questions?.length) return { quiz: withQuestionIds(cached.quiz), fromCache: true };

  // A aula pode nao ter vindo no parametro quando ela foi salva no
  // banco; o cache local ainda a tem. O plano do cronograma e o ultimo
  // recurso (ele ja carrega id/subject/topic/objective).
  const base = lesson ?? cached?.lesson ?? null;
  if (!base) {
    const error = new Error('A aula ainda nao foi salva para gerar o quiz.');
    error.code = 'missing_lesson';
    throw error;
  }

  onStatus?.(AI_MESSAGES.generatingQuiz);
  const questions = getFullLessonQuiz(base);
  if (!questions.length) {
    const error = new Error(AI_MESSAGES.offline);
    error.code = 'invalid_quiz';
    throw error;
  }

  const quiz = withQuestionIds({ questions });
  saveCachedLesson(plan, { quiz, quizId: null });
  return { quiz, fromCache: false };
}

/** Forca uma nova versao da aula (botao "Gerar de novo"). */
export async function regenerateLessonForPlan(plan, { performance = null, onStatus } = {}) {
  onStatus?.(AI_MESSAGES.generatingLesson);
  const result = await callFunction('generate-lesson', lessonPayload(plan, performance, true), LESSON_TIMEOUT_MS);
  if (!result?.lesson) {
    const error = new Error(AI_MESSAGES.offline);
    error.code = 'invalid_lesson';
    throw error;
  }
  saveCachedLesson(plan, {
    lesson: result.lesson,
    lessonId: result.id ?? null,
    quiz: null,
    model: result.model ?? null,
  });
  return { lesson: result.lesson, lessonId: result.id ?? null };
}

/**
 * Chat da Tutora IA (Groq) com STREAMING.
 *
 * A resposta chega em pedacos (SSE) e onDelta e chamado conforme o texto
 * chega, para a tela mostrar a resposta crescendo. A chave do provider
 * NUNCA passa pelo navegador: ela e secret da Edge Function.
 *
 * Importante: a conexao SSE fica aberta (keep-alive), entao encerramos
 * no evento done/error em vez de esperar o fim do corpo. Sem isso a
 * interface ficaria travada em "Respondendo..." para sempre.
 */

export function diagTutor(etapa) {
  diag(etapa);
}

export function lerDiagTutor() {
  try {
    return JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
  } catch {
    return [];
  }
}

export function limparDiagTutor() {
  try {
    localStorage.removeItem(DIAG_KEY);
  } catch {
    // ignore
  }
}


export async function streamTutor({ messages, context, conversationId }, handlers = {}) {
  const { onDelta, onDone, onError, onStart } = handlers;
  const token = await ensureAiSession();
  if (!token) {
    const error = new Error(AI_MESSAGES.noSession);
    error.status = 401;
    onError?.(error);
    return;
  }

  const controller = new AbortController();
  let reader = null;
  let finalizou = false;
  let timerOcioso = null;

  // Garante onDone OU onError exatamente uma vez.
  const concluirDone = (dados) => {
    if (finalizou) return;
    finalizou = true;
    onDone?.(dados);
  };
  const concluirErro = (erro) => {
    if (finalizou) return;
    finalizou = true;
    onError?.(erro);
  };
  const desarmarOcioso = () => {
    if (timerOcioso) {
      clearTimeout(timerOcioso);
      timerOcioso = null;
    }
  };
  // Timeout de inatividade: reiniciado a cada chunk recebido.
  const armarOcioso = () => {
    desarmarOcioso();
    timerOcioso = setTimeout(() => {
      diag('timeout:ocioso', `limite=${TUTOR_IDLE_TIMEOUT_MS}`);
      try {
        controller.abort();
      } catch {
        // ignore
      }
      const error = new Error(AI_MESSAGES.offline);
      error.code = 'timeout';
      error.status = 408;
      concluirErro(error);
    }, TUTOR_IDLE_TIMEOUT_MS);
  };

  // Prazo maximo para a resposta COMECAR. Fica armado desde o
  // primeiro instante (antes do fetch) e e o unico que cobre o
  // caminho em que nada volta: conexao SSE pendurada, proxy ou DNS
  // engolindo a requisicao. Sem ele, esse fetch ficava esperando para
  // sempre, nenhum handler era chamado e o chat ficava em
  // "Respondendo..." sem nunca destravar.
  //
  // Ele e desarmado no primeiro evento do stream (abaixo) e nao no
  // `done`: uma resposta longa e legitima pode passar de 30s
  // escrevendo, e o que segura esse caso e o timer de inatividade,
  // que se rearma a cada pedaco. Se ficasse armado ate o fim, ele
  // cortaria no meio uma conversa que estava indo bem.
  const desarmarStream = () => {
    clearTimeout(streamTimer);
  };
  const streamTimer = setTimeout(() => {
    diag('timeout:stream', `limite=${TUTOR_STREAM_TIMEOUT_MS}`);
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }, TUTOR_STREAM_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tutor-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, context, conversationId, stream: true }),
      signal: controller.signal,
    });
    diag('fetch:resposta', `http=${response.status} ct=${response.headers.get('content-type')} body=${Boolean(response.body)}`);

    // Erro antes de comecar o stream: vale para JSON, texto ou HTML.
    // Le o corpo como texto e tenta JSON.parse, para nenhum HTTP falho
    // cair no parser SSE sem chamar onError.
    if (!response.ok) {
      const texto = await response.text().catch(() => '');
      let payload = null;
      try {
        payload = texto ? JSON.parse(texto) : null;
      } catch {
        payload = null;
      }
      const error = new Error(payload?.message || AI_MESSAGES.offline);
      error.status = response.status;
      error.code = response.status === 429 ? 'rate_limited' : (payload?.error ?? 'http_error');
      error.retryAfterMs = payload?.retryAfterMs ?? null;
      error.detail = payload?.detail ?? (texto ? texto.slice(0, 300) : null);
      diag('fetch:erro-http', `http=${response.status} code=${error.code}`);
      concluirErro(error);
      return;
    }

    if (!response.body) {
      diag('erro', 'sem response.body');
      concluirErro(new Error('Este navegador nao suporta leitura em streaming.'));
      return;
    }

    reader = response.body.getReader();
    diag('reader:ok');
    const decoder = new TextDecoder();
    let buffer = '';
    let acumulado = '';
    let encerrou = false;
    let recebeuDiagDelta = false;
    let leituras = 0;

    // Processa um bloco SSE completo ("event: ...\ndata: {...}").
    // O nome do evento vale so para o bloco atual: cada bloco completo
    // e resetado, entao um delta nunca e tratado como start/done.
    // (Evento dividido em dois chunks fica no buffer ate completar,
    // entao o reset por bloco nao quebra esse caso.)
    const processarBloco = (bloco) => {
      let evento = null;
      for (const linha of bloco.split('\n')) {
        const limpa = linha.trim();
        if (limpa.startsWith('event:')) {
          evento = limpa.slice(6).trim();
          continue;
        }
        if (!limpa.startsWith('data:')) continue;
        let dados;
        try {
          dados = JSON.parse(limpa.slice(5).trim());
        } catch {
          continue;
        }
        if (!evento) continue;
        // Chegou dado de verdade: a resposta comecou. O prazo de 30s
        // cumpriu o papel (destravou o caminho do fetch pendurado) e
        // agora quem protege a conversa e o timer de inatividade.
        desarmarStream();
        if (evento === 'start') {
          diag('evento:start');
          onStart?.(dados);
        } else if (evento === 'delta') {
          acumulado += dados.text ?? '';
          if (!recebeuDiagDelta) {
            recebeuDiagDelta = true;
            diag('evento:delta-primeiro', `len=${dados.text?.length ?? 0}`);
          }
          onDelta?.(dados.text ?? '', acumulado);
        } else if (evento === 'done') {
          encerrou = true;
          diag('evento:done', `reply=${dados?.reply?.length ?? 0} model=${dados?.model ?? '-'}`);
          concluirDone(dados);
        } else if (evento === 'error') {
          const error = new Error(dados.message || AI_MESSAGES.offline);
          error.code = dados.error ?? 'tutor_error';
          error.status = 502;
          encerrou = true;
          diag('evento:error', `${error.code} ${String(dados.message ?? '').slice(0, 90)}`);
          concluirErro(error);
        }
      }
    };

    armarOcioso();
    while (!encerrou) {
      const { done, value } = await reader.read();
      leituras += 1;
      if (done) {
        diag('reader:fechou', `leituras=${leituras} buffer=${buffer.length}`);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      armarOcioso();
      const blocos = buffer.split('\n\n');
      buffer = blocos.pop() ?? '';

      for (const bloco of blocos) {
        processarBloco(bloco);
        if (encerrou) break;
      }
    }

    // O ultimo evento pode chegar junto com o fechamento do stream,
    // sem o "\n\n" final - ele ficava preso no buffer.
    if (!encerrou && buffer.trim()) {
      diag('buffer:restante', `len=${buffer.length}`);
      processarBloco(buffer);
      buffer = '';
    }

    // O stream fechou sem done/error (rede cortou, gateway matou a
    // conexao). Se ja chegou texto parcial, entregamos como resposta
    // final; senao, erro para a UI mostrar "tentar de novo".
    if (!encerrou && !finalizou) {
      diag('stream:fechou-sem-done', `acumulado=${acumulado.length}`);
      if (acumulado.trim()) {
        concluirDone({ reply: acumulado, model: null, conversationId, parcial: true });
      } else {
        concluirErro(new Error(AI_MESSAGES.offline));
      }
    }
  } catch (error) {
    diag('catch', `${error?.name ?? 'Error'}: ${String(error?.message ?? error).slice(0, 120)}`);
    // O AbortError NAO e mais engolido com `return`. Ele e a unica prova
    // de que o fetch foi interrompido por um dos dois timers, e e
    // exatamente aqui que a tela se destrava: sem onError, o TutorChat
    // ficava em "Respondendo..." para sempre. `finalizou` mantem a
    // garantia de onDone OU onError, nunca os dois.
    if (error?.name === 'AbortError') {
      if (finalizou) return;
      const timeout = new Error(AI_MESSAGES.offline);
      timeout.code = 'timeout';
      timeout.status = 408;
      concluirErro(timeout);
      return;
    }
    concluirErro(error);
  } finally {
    desarmarOcioso();
    // Antes de abortar/cancelar: um timer de 30s que sobra vivo
    // dispararia no meio da PROXIMA resposta e cortaria a conversa
    // seguinte por um motivo que nao existe.
    clearTimeout(streamTimer);
    controller.abort();
    try {
      await reader?.cancel();
    } catch {
      // corpo ja fechado
    }
  }
}
