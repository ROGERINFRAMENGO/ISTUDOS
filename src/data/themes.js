export const THEMES = {
  roxo: { label: 'Roxo', primary: '#8b5cf6', soft: '#efe6ff', accent: '#c084fc', text: '#1f1630', muted: '#6f6683', bg1: '#f9f5ff', bg2: '#f4f3ff', border: 'rgba(139, 92, 246, 0.12)', panel: 'rgba(255,255,255,0.7)' },
  roxoEscuro: { label: 'Roxo escuro', primary: '#6d28d9', soft: '#e6dcff', accent: '#a855f7', text: '#170f2e', muted: '#5f5478', bg1: '#efe7ff', bg2: '#e4dcff', border: 'rgba(109, 40, 217, 0.16)', panel: 'rgba(255,255,255,0.72)' },
  roxoClaro: { label: 'Roxo claro', primary: '#a78bfa', soft: '#f1eaff', accent: '#c4b5fd', text: '#2a2140', muted: '#7b7094', bg1: '#fbfaff', bg2: '#f3edff', border: 'rgba(167, 139, 250, 0.18)', panel: 'rgba(255,255,255,0.75)' },
  rosaClaro: { label: 'Rosa claro', primary: '#ec4899', soft: '#fce7f3', accent: '#f9a8d4', text: '#3b1226', muted: '#8a5a72', bg1: '#fff5f9', bg2: '#ffe9f3', border: 'rgba(236, 72, 153, 0.14)', panel: 'rgba(255,255,255,0.75)' },
  rosaEscuro: { label: 'Rosa escuro', primary: '#be185d', soft: '#fbd3e3', accent: '#f472b6', text: '#330a1d', muted: '#8a4a63', bg1: '#ffeef5', bg2: '#ffdcea', border: 'rgba(190, 24, 93, 0.16)', panel: 'rgba(255,255,255,0.74)' },
  preto: { label: 'Preto', primary: '#e8e8ef', soft: '#26262e', accent: '#8b8b9e', text: '#f4f4f6', muted: '#a7a7b8', bg1: '#101014', bg2: '#17171d', border: 'rgba(255,255,255,0.12)', panel: 'rgba(28,28,34,0.85)' },
  branco: { label: 'Branco', primary: '#4f46e5', soft: '#eef2ff', accent: '#93c5fd', text: '#111827', muted: '#6b7280', bg1: '#ffffff', bg2: '#f3f4f6', border: 'rgba(17, 24, 39, 0.08)', panel: 'rgba(255,255,255,0.92)' },
};

export const THEME_KEY = 'istudos_theme';

export function loadTheme() {
  if (typeof window === 'undefined') return 'roxo';
  const saved = localStorage.getItem(THEME_KEY);
  return THEMES[saved] ? saved : 'roxo';
}

export function applyTheme(name) {
  if (typeof window === 'undefined') return;
  const theme = THEMES[name] || THEMES.roxo;
  const root = document.documentElement;
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-soft', theme.soft);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--panel', theme.panel);
  root.style.setProperty('--bg', theme.bg1);
  document.body.style.background = `linear-gradient(180deg, ${theme.bg1} 0%, ${theme.bg2} 100%)`;
  document.body.style.color = theme.text;
  localStorage.setItem(THEME_KEY, name);
}
