// ============================================================
// Serviço de Simulados e mini-provas
// ============================================================
// - buildSimulado(): monta um simulado a partir do banco de questões
// - parseSimuladoIntent(): detecta quando o usuário PEDE para a IA criar um
// - load/save: persistência no localStorage (mesma filosofia do progresso)

import { questionBank } from '../data/simuladoBank';
import { getWeekQuestionIds } from '../data/weekQuestionMap';

const SIMULADOS_KEY = 'istudos_simulados';

export function loadSimulados() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(SIMULADOS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveSimulados(list) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIMULADOS_KEY, JSON.stringify(list || []));
  } catch {
    // ignore
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function defaultTitle(subject, difficulty, week) {
  const subjectPart = !subject || subject === 'Todas' ? 'misto' : `de ${subject}`;
  const diffPart = difficulty && difficulty !== 'qualquer' ? ` (${difficulty})` : '';
  if (week) return `Mini prova Semana ${week} — ${subjectPart}${diffPart}`;
  return `Mini prova ${subjectPart}${diffPart}`;
}

// Monta o simulado. Se vier "week", prioriza as questões do conteúdo
// daquela semana do cronograma (src/data/weekQuestionMap.js) e só
// completa com revisão mista se faltar questão da semana.
export function buildSimulado({ title, subject, count = 10, difficulty = 'qualquer', week } = {}) {
  const wanted = Math.min(Math.max(Number(count) || 10, 2), 30);
  const useSubject = subject && subject !== 'Todas' ? subject : null;
  const weekNumber = Number(week) || null;

  const bySubject = useSubject ? questionBank.filter((q) => q.subject === useSubject) : [...questionBank];
  const byDifficulty =
    difficulty && difficulty !== 'qualquer' ? bySubject.filter((q) => q.difficulty === difficulty) : bySubject;

  // 1º lugar: conteúdo da semana que passe no filtro de matéria/dificuldade
  const weekIds = weekNumber ? getWeekQuestionIds(weekNumber) : null;
  const weekPool = weekIds ? questionBank.filter((q) => weekIds.includes(q.id) && byDifficulty.includes(q)) : [];
  const startPool = weekPool.length ? weekPool : byDifficulty;

  let picked = shuffle(startPool);
  if (picked.length < wanted) {
    const pickedIds = new Set(picked.map((q) => q.id));
    picked = [...picked, ...shuffle(byDifficulty.filter((q) => !pickedIds.has(q.id)))];
  }
  if (picked.length < wanted) {
    const pickedIds = new Set(picked.map((q) => q.id));
    picked = [...picked, ...shuffle(bySubject.filter((q) => !pickedIds.has(q.id)))];
  }
  if (picked.length < wanted) {
    const pickedIds = new Set(picked.map((q) => q.id));
    picked = [...picked, ...shuffle(questionBank.filter((q) => !pickedIds.has(q.id)))];
  }
  picked = picked.slice(0, wanted);

  return {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: (title || '').trim() || defaultTitle(subject, difficulty, weekNumber),
    subject: subject || 'Todas',
    difficulty: difficulty || 'qualquer',
    week: weekNumber,
    createdAt: new Date().toISOString(),
    attempts: [],
    questions: picked,
  };
}

// Detecta pedidos de criação tipo:
//   "cria um simulado de matemática com 10 questões difícil"
//   "quero uma mini prova de português"
// Retorna os parâmetros ou null se não for um pedido de criação.
export function parseSimuladoIntent(text = '') {
  const t = String(text).toLowerCase();

  const wantsCreate = /\b(cria|criar|crie|faz|fazer|faz me|me faz|monta|montar|quero|queria|gerar|gera|prepara|preparar|monta pra mim)\b/.test(t);
  const mentionsTest = /\b(simulado|mini[- ]?prova|miniprova|prova)\b/.test(t);
  if (!wantsCreate || !mentionsTest) return null;

  // Ordem importa: específicos primeiro (química/física antes de "ciências")
  const subjectRules = [
    [/matem|fra[çc]õe|fra[çc]o|porcentagem|algebra|equa[çc]/, 'Matemática'],
    [/qu[íi]mic/, 'Ciências'],
    [/f[íi]sic|newton|velocidade/, 'Ciências'],
    [/biolog|c[êe]lula|fotoss/, 'Ciências'],
    [/ci[êe]ncia|natureza/, 'Ciências'],
    [/portug|interpret|gram[áa]tica|concord[âa]ncia|crase/, 'Português'],
    [/hist[óo]ric|vargas|col[ôo]nial/, 'História'],
    [/geograf|mapa|relevo/, 'Geografia'],
    [/cidad|pol[íi]tic|constitui|sociais/, 'Cidadania'],
  ];
  const subjectHit = subjectRules.find(([pattern]) => pattern.test(t));
  const subject = subjectHit ? subjectHit[1] : 'Todas';

  const countMatch = t.match(/(\d{1,2})\s*(?:quest|prova|simulado)/) || t.match(/com (\d{1,2})/);
  const count = countMatch ? Math.min(30, Math.max(2, parseInt(countMatch[1], 10))) : 10;

  let difficulty = 'qualquer';
  if (/f[áa]cil|f[áa]ceis/.test(t)) difficulty = 'facil';
  else if (/dif[íi]cil|dif[íi]ceis|pesado/.test(t)) difficulty = 'dificil';
  else if (/m[ée]dio|m[ée]dia/.test(t)) difficulty = 'medio';

  // "semana 3", "da semana 2", "sem. 5" → conteúdo do cronograma daquela semana
  const weekMatch = t.match(/\bsemana\s*(\d{1,2})\b/) || t.match(/\bsem\.?\s*(\d{1,2})\b/);
  const week = weekMatch ? Math.min(10, Math.max(1, parseInt(weekMatch[1], 10))) : null;

  return { subject, count, difficulty, week, title: null };
}
