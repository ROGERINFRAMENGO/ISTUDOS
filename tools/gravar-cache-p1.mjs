// ============================================================
// GRAVAR no app_state as 2 aulas P1 regeneradas (P1A).
// ------------------------------------------------------------
// O app serve de app_state.sections.aiCache (chave fixa
// 'principal', sem filtro por usuario). Aqui trocamos SO o
// conteudo das 2 aulas (Portugues e Ciencias) pela versao P1 e
// removemos a entrada ANTIGA delas.
//
// O que NAO e tocado: progress, xp, chat, completedLessonIds,
// todayDone, studyDates, resumeLesson, simulados, theme, meta.
// O script compara antes/depois e ABORTA se algo differ.
//
// Uso: node tools/gravar-cache-p1.mjs
// ============================================================

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const VERSAO_P1 = 'p1-aulas-2026-09-30';

const ALVOS = [
  { arquivo: '.tmp-regen_Portugu_s-informa__o_expl_cita.json', materia: 'português', topico: 'informação explícita' },
  { arquivo: '.tmp-regen_Ci_ncias-mat_ria.json', materia: 'ciências', topico: 'matéria' },
];

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) throw eSess;

const { data, error } = await cliente.from('app_state').select('data').eq('id', 'principal').single();
if (error) throw error;

const antes = structuredClone(data.data);
const estado = structuredClone(data.data);
const s = estado.sections ?? (estado.sections = {});
const cache = s.aiCache ?? (s.aiCache = {});

function casa(chave, alvo) {
  const p = String(chave).split('|');
  const materia = (p[p.length - 2] ?? '').toLowerCase();
  const topico = (p[p.length - 1] ?? '').toLowerCase();
  return materia === alvo.materia && topico === alvo.topico.toLowerCase();
}

// ---- 1) Remover as entradas ANTIGAS das 2 aulas --------------
const antigasRemovidas = [];
for (const chave of Object.keys(cache)) {
  if (chave.includes(VERSAO_P1)) continue;
  if (ALVOS.some((a) => casa(chave, a))) {
    antigasRemovidas.push(chave);
    delete cache[chave];
  }
}

// ---- 2) Gravar as versoes P1 ---------------------------------
const gravadas = [];
for (const alvo of ALVOS) {
  if (!fs.existsSync(alvo.arquivo)) throw new Error(`falta o arquivo ${alvo.arquivo}`);
  const aula = JSON.parse(fs.readFileSync(alvo.arquivo, 'utf8'));

  // Reaproveita a chave P1 que o app ja usa, para nao inventar
  // formato. Se nao existir, deriva da chave antiga removida.
  let chaveP1 = Object.keys(cache).find((c) => c.includes(VERSAO_P1) && casa(c, alvo));
  if (!chaveP1) {
    const antiga = antigasRemovidas.find((c) => casa(c, alvo));
    const p = (antiga ?? 'v2|1|1|1|b1').split('|');
    chaveP1 = ['v2', VERSAO_P1, p[1], p[2], p[3], alvo.materia, alvo.topico].join('|');
  }
  cache[chaveP1] = { ...(cache[chaveP1] ?? {}), lesson: aula, updatedAt: Date.now() };
  gravadas.push(chaveP1);
}

// ---- 3) Prova: so o cache destas 2 aulas mudou --------------
const diferencas = [];
function cmpObj(a, b, prefixo) {
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const va = a?.[k];
    const vb = b?.[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) diferencas.push(`${prefixo}.${k}`);
  }
}
cmpObj(antes.sections?.aiCache, estado.sections?.aiCache, 'aiCache');
for (const k of new Set([...Object.keys(antes.sections ?? {}), ...Object.keys(estado.sections ?? {})])) {
  if (k === 'aiCache') continue;
  if (JSON.stringify(antes.sections?.[k]) !== JSON.stringify(estado.sections?.[k])) diferencas.push(`sections.${k}`);
}
for (const k of new Set([...Object.keys(antes), ...Object.keys(estado)])) {
  if (k === 'sections') continue;
  if (JSON.stringify(antes[k]) !== JSON.stringify(estado[k])) diferencas.push(k);
}

const esperadas = [...antigasRemovidas.map((c) => `aiCache.${c}`), ...gravadas.map((c) => `aiCache.${c}`)];
const inesperadas = diferencas.filter((d) => !esperadas.includes(d));

console.log('=== O QUE VAI MUDAR (so o cache destas 2 aulas) ===');
antigasRemovidas.forEach((c) => console.log(`  removida: ${c}`));
gravadas.forEach((c) => console.log(`  gravada : ${c}`));
console.log(`\ndiferencas totais: ${diferencas.length}`);
console.log(`inesperadas: ${inesperadas.length}`);
if (inesperadas.length) {
  console.log('ABORTADO — mudou algo fora do cache das aulas:');
  inesperadas.forEach((d) => console.log(`  ${d}`));
  process.exit(1);
}

// ---- 4) Gravar ----------------------------------------------
const { error: eUp } = await cliente
  .from('app_state')
  .update({ data: estado, updated_at: new Date().toISOString() })
  .eq('id', 'principal');
if (eUp) throw eUp;

console.log('\napp_state atualizado. Preservado:');
console.log(`  XP ${estado.sections?.progress?.xp} | aulas concluidas ${(estado.sections?.completedLessonIds ?? []).length}`);
console.log(`  todayDone ${JSON.stringify(estado.sections?.todayDone)} | studyDates ${JSON.stringify(estado.sections?.studyDates)}`);
console.log(`  chat ${(estado.sections?.chat ?? []).length} | simulados ${(estado.sections?.simulados ?? []).length} | tema ${estado.sections?.theme}`);
console.log(`  entradas no aiCache: ${Object.keys(cache).length}`);