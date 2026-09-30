// ============================================================
// Sincronização entre aparelhos (celular <-> computador)
// ============================================================
// O site é de UM único usuário, então todo o estado compartilhado fica em
// UMA linha da tabela public.app_state (id = 'principal', conteúdo em jsonb).
// Não precisa de login: o aparelho entra com a senha do app e este serviço
// mantém celular e computador iguais.
//
// Regras de merge (para NADA se perder quando os dois aparelhos mexem):
// - listas (aulas concluídas, datas de estudo, simulados): UNIÃO
// - tentativas de simulado: união por horário (mantém o histórico dos dois)
// - chat: vence a conversa com a mensagem mais recente
// - progresso, meta do dia, tema e lição retomada: vence o mais recente
//   (cada seção guarda o horário da última gravação em meta)
//
// O envio sempre LÊ a linha antes de escrever (read-merge-write), então um
// aparelho nunca apaga o que o outro gravou.

import { supabase } from '../lib/supabase';

export const SHARED_ROW_ID = 'principal';
const TABLE = 'app_state';
const LOCAL_META_KEY = 'istudos_sync_meta';

export const isSyncConfigured = Boolean(supabase);

// Seções que o merge precisa conhecer (arrays e valores simples).
const SECTIONS = [
  'progress',
  'completedLessonIds',
  'studyDates',
  'todayDone',
  'simulados',
  'chat',
  'theme',
  'resumeLesson',
  'aiCache',
];

export function nowIso() {
  return new Date().toISOString();
}

// ---------- meta local (horário da última gravação de cada seção) ----------
export function loadLocalMeta() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_META_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveLocalMeta(meta) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta || {}));
  } catch {
    // ignore
  }
}

// ---------- merges ----------
function unionList(a = [], b = []) {
  return [...new Set([...(a || []), ...(b || [])])];
}

function lastChatAt(list = []) {
  return (list || []).reduce((max, message) => Math.max(max, Number(message?.at) || 0), 0);
}

// Junta as tentativas de um simulado sem perder nenhuma (união por horário).
function mergeAttempts(a = [], b = []) {
  const map = new Map();
  for (const attempt of [...(a || []), ...(b || [])]) {
    if (!attempt) continue;
    map.set(attempt.at || Math.random(), attempt);
  }
  return [...map.values()].sort((x, y) => (x.at || 0) - (y.at || 0));
}

// Une as duas listas de simulados por id (o mais novo "ganha" nos campos fixos,
// mas o histórico de tentativas é sempre somado).
export function mergeSimulados(local = [], remote = []) {
  const map = new Map();
  for (const sim of [...(remote || []), ...(local || [])]) {
    if (!sim?.id) continue;
    const existing = map.get(sim.id);
    if (!existing) {
      map.set(sim.id, sim);
      continue;
    }
    map.set(sim.id, { ...existing, ...sim, attempts: mergeAttempts(existing.attempts, sim.attempts) });
  }
  return [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/**
 * Verdadeiro se a lista tem uma mensagem que a tutora AINDA esta
 * escrevendo. Nesse caso a lista nao pode ser trocada por outra.
 */
export function isMensagemIncompleta(lista) {
  return (lista || []).some((m) => m?.streaming === true);
}

/**
 * Escolhe a conversa mais recente entre os dois aparelhos.
 *
 * CUIDADO (bug corrigido): a mensagem que a tutora esta escrevendo
 * nasce com o mesmo `at` da pergunta (as duas usam Date.now() no mesmo
 * instante). Se o outro aparelho gravou a conversa 3ms depois, o
 * `lastChatAt` do remoto ganha e esta funcao TROCAVA a conversa em
 * andamento pela conversa antiga - a resposta sumia da tela mesmo com
 * HTTP 200 e SSE perfeito.
 *
 * Por isso: se qualquer lado tem mensagem incompleta, ele vence e nao
 * ha troca. O merge so acontece com conversa parada.
 */
export function mergeChat(local = [], remote = []) {
  if (isMensagemIncompleta(local)) return local || [];
  if (isMensagemIncompleta(remote)) return remote || [];
  return lastChatAt(local) >= lastChatAt(remote) ? local || [] : remote || [];
}

// Contadores só crescem (XP, questões, tempo, aulas): o merge pega o MAIOR de
// cada campo para nenhum aparelho "perder" progresso. Campos de texto (nome)
// seguem o lado mais recente.
export function mergeProgress(local = null, remote = null, remoteIsNewer = false) {
  if (!local) return remote ?? null;
  if (!remote) return local ?? null;

  const base = remoteIsNewer ? remote : local;
  const other = remoteIsNewer ? local : remote;
  const merged = { ...other, ...base };

  for (const key of Object.keys(local)) {
    if (typeof local[key] === 'number' && typeof remote[key] === 'number') {
      merged[key] = Math.max(local[key], remote[key]);
    }
  }

  if (merged.study_seconds > 0) merged.study_minutes = Math.max(1, Math.ceil(merged.study_seconds / 60));
  return merged;
}

// Meta do dia { date, count }: mesmo dia vale o maior; dia diferente, o mais recente.
function mergeTodayDone(local, remote, remoteIsNewer) {
  if (!local) return remote ?? null;
  if (!remote) return local ?? null;
  if (local.date === remote.date) {
    return { date: local.date, count: Math.max(Number(local.count) || 0, Number(remote.count) || 0) };
  }
  return remoteIsNewer ? remote : local;
}

// Cache de aulas da IA: união por chave (aula já gerada não se regenera).
function mergeCache(local = {}, remote = {}) {
  const out = { ...(local && typeof local === 'object' ? local : {}) };
  Object.entries(remote && typeof remote === 'object' ? remote : {}).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    if (!out[key] || (value.updatedAt || 0) > (out[key].updatedAt || 0)) out[key] = value;
  });
  return out;
}

// Merge completo (puro): recebe as seções locais e remotas + os horários.
export function mergeShared({ local = {}, localMeta = {}, remote = {}, remoteMeta = {} } = {}) {
  const data = {};
  const meta = {};
  const remoteIsNewer = (key) => String(remoteMeta?.[key] || '') > String(localMeta?.[key] || '');

  data.completedLessonIds = unionList(local.completedLessonIds, remote.completedLessonIds);
  data.studyDates = unionList(local.studyDates, remote.studyDates);
  data.simulados = mergeSimulados(local.simulados, remote.simulados);
  data.chat = mergeChat(local.chat, remote.chat);

  const progressNewer = remoteIsNewer('progress');
  if (local.progress !== undefined || remote.progress !== undefined) {
    data.progress = mergeProgress(local.progress, remote.progress, progressNewer);
    meta.progress = (progressNewer ? remoteMeta?.progress : localMeta?.progress) || '';
  }

  const todayNewer = remoteIsNewer('todayDone');
  if (local.todayDone !== undefined || remote.todayDone !== undefined) {
    data.todayDone = mergeTodayDone(local.todayDone, remote.todayDone, todayNewer);
    meta.todayDone = (todayNewer ? remoteMeta?.todayDone : localMeta?.todayDone) || '';
  }

  for (const key of ['theme', 'resumeLesson']) {
    const useRemote = remoteIsNewer(key);
    const value = useRemote ? remote[key] : local[key];
    if (value === undefined) continue;
    data[key] = value ?? null;
    meta[key] = (useRemote ? remoteMeta?.[key] : localMeta?.[key]) || '';
  }

  if (local.aiCache || remote.aiCache) data.aiCache = mergeCache(local.aiCache, remote.aiCache);

  return { data, meta };
}

// Mantém só as seções conhecidas (evita lixo crescer na linha do banco).
export function pickSections(source = {}) {
  const out = {};
  for (const key of SECTIONS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

// ---------- transporte ----------
async function fetchRow() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at')
    .eq('id', SHARED_ROW_ID)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// Lê o estado do servidor. Retorna { data, meta, updatedAt } ou null se falhou.
export async function pullShared() {
  if (!isSyncConfigured) return null;
  try {
    const row = await fetchRow();
    if (!row) return { data: {}, meta: {}, updatedAt: null };
    const payload = row.data || {};
    return {
      data: pickSections(payload.sections || {}),
      meta: payload.meta || {},
      updatedAt: row.updated_at || null,
    };
  } catch (error) {
    console.warn('Sincronização: não consegui ler do servidor.', error);
    return null;
  }
}

// Envia seções (pode ser parcial). Faz read-merge-write para nunca apagar
// o que o outro aparelho gravou enquanto este estava offline.
export async function pushShared(sections = {}, localMeta = {}) {
  if (!isSyncConfigured) return null;
  const sending = pickSections(sections);
  if (!Object.keys(sending).length) return null;

  try {
    const row = await fetchRow();
    const remotePayload = row?.data || {};
    const merged = mergeShared({
      local: sending,
      localMeta,
      remote: pickSections(remotePayload.sections || {}),
      remoteMeta: remotePayload.meta || {},
    });

    const stored = nowIso();
    const meta = { ...(remotePayload.meta || {}) };
    for (const key of Object.keys(sending)) meta[key] = localMeta?.[key] || stored;

    const { data, error } = await supabase
      .from(TABLE)
      .upsert({ id: SHARED_ROW_ID, data: { sections: merged.data, meta }, updated_at: stored }, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) throw error;
    return { data: merged.data, meta, updatedAt: data?.updated_at || stored };
  } catch (error) {
    console.warn('Sincronização: não consegui enviar para o servidor.', error);
    return null;
  }
}
