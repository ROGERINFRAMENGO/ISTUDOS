// ============================================================
// Serviço de Simulados e mini-provas
// ============================================================
// - buildSimulado(): monta um simulado a partir do banco de questões
// - parseSimuladoIntent(): detecta quando o usuário PEDE para a IA criar um
// - load/save: persistência no localStorage (mesma filosofia do progresso)

import { questionBank } from '../data/simuladoBank';

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

function defaultTitle(subject, difficulty) {
  const subjectPart = !subject || subject === 'Todas' ? 'misto' : `de ${subject}`;
  const diffPart = difficulty && difficulty !== 'qualquer' ? ` (${difficulty})` : '';
  return `Mini prova ${subjectPart}${diffPart}`;
}

// Monta o simulado: filtra por matéria/dificuldade, embaralha e completa
// até a quantidade pedida (se faltar no filtro, pega do resto do banco).
export function buildSimulado({ title, subject, count = 10, difficulty = 'qualquer' } = {}) {
  const wanted = Math.min(Math.max(Number(count) || 10, 2), 30);
  const useSubject = subject && subject !== 'Todas' ? subject : null;

  const bySubject = useSubject ? questionBank.filter((q) => q.subject === useSubject) : [...questionBank];
  const byDifficulty =
    difficulty && difficulty !== 'qualquer' ? bySubject.filter((q) => q.difficulty === difficulty) : bySubject;

  let picked = shuffle(byDifficulty);
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
    title: (title || '').trim() || defaultTitle(subject, difficulty),
    subject: subject || 'Todas',
    difficulty: difficulty || 'qualquer',
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

  return { subject, count, difficulty, title: null };
}
