// ============================================================
// Auditoria das 4 aulas REAIS que o app serve (P1A).
// ------------------------------------------------------------
// Roda as MESMAS heuristicas do validateLesson() da Edge Function
// sobre o conteudo que esta em app_state.sections.aiCache, e
// compara com a versao antiga. Mede profundidade, cobertura,
// exemplos, exercicios, resumo, coerencia e estrutura.
//
// Uso: node tools/auditar-4-aulas.mjs
// ============================================================

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const VERSAO_P1 = 'p1-aulas-2026-09-30';

const schemas = await import('../supabase/functions/_shared/schemas.js');
const { validateLesson } = schemas;

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { error } = await cliente.auth.signInAnonymously();
if (error) throw error;
const { data, error: e } = await cliente.from('app_state').select('data').eq('id', 'principal').single();
if (e) throw e;

const aiCache = data.data?.sections?.aiCache ?? {};

// As 4 aulas reais do conjunto auditado, na ordem do cronograma.
const REAIS = [
  { materia: 'Português', topico: 'informação explícita' },
  { materia: 'Ciências', topico: 'matéria' },
  { materia: 'Matemática', topico: 'números inteiros' },
  { materia: 'História', topico: 'primeiras civilizações' },
];

function metricas(aula) {
  const secs = aula.sections ?? [];
  const exemplos = secs.reduce((n, s) => n + (s.examples?.length ?? 0), 0);
  const chars = secs.reduce((n, s) => n + (s.explanation?.length ?? 0), 0);
  return {
    bytes: JSON.stringify(aula).length,
    secoes: secs.length,
    exemplos,
    exercicios: aula.guidedPractice?.length ?? 0,
    errosComuns: aula.commonMistakes?.length ?? 0,
    resumo: aula.summary?.length ?? 0,
    introChars: (aula.introduction ?? '').length,
    mediaExplicacao: secs.length ? Math.round(chars / secs.length) : 0,
    menorExplicacao: secs.length ? Math.min(...secs.map((s) => (s.explanation?.length ?? 0))) : 0,
  };
}

// Heuristicas de texto, aplicados a cada campo legivel.
const { findScheduleLeak, findDuplicatedWords, findHollow } = schemas;
function defeitos(aula) {
  const textos = [
    aula.introduction,
    ...(aula.sections ?? []).map((s) => `${s.title} ${s.explanation}`),
    ...(aula.sections ?? []).flatMap((s) => (s.examples ?? []).flatMap((x) => [x.problem, x.solution, x.explanation])),
    ...(aula.guidedPractice ?? []).flatMap((g) => [g.question, g.answer, g.explanation]),
    ...(aula.commonMistakes ?? []),
    ...(aula.summary ?? []),
  ].filter(Boolean);
  const out = [];
  const leak = findScheduleLeak(...textos);
  if (leak) out.push(`metadado do cronograma: "${leak}"`);
  const dup = findDuplicatedWords(...textos);
  if (dup) out.push(`palavra repetida: "${dup.trecho}"`);
  const hollow = findHollow(...textos);
  if (hollow) out.push(`frase generica: "${hollow}"`);
  if (textos.some((t) => /(\*\*|^#{1,6}\s|```|\\frac|<[a-z]+\/?>)/im.test(t))) out.push('markdown ou HTML');
  if (textos.some((t) => /semana\s+\d|bloco\s+\d|\d+\s*minutos?/i.test(t))) out.push('agenda vazada');
  // "todo" sozinho e palavra COMUM em portugues ("todo mundo"). O
  // placeholder e o TODO em ingles, com contexto de lista de tarefa.
  if (textos.some((t) => /\bTODO\b\s*[:(-]|placeholder|cole aqui/i.test(t))) out.push('placeholder');
  return out;
}

console.log('='.repeat(74));
console.log('AS 4 AULAS REAIS — versao ATUALMENTE SERVIDA');
console.log('='.repeat(74));

const linhas = [];
for (const alvo of REAIS) {
  // P1 tem prioridade: e a chave que o app pede hoje.
  const chaveP1 = `v2|${VERSAO_P1}|1|`;
  const candidatas = Object.entries(aiCache).filter(
    ([c, v]) =>
      String(v?.lesson?.subject ?? '').toLowerCase() === alvo.materia.toLowerCase() &&
      String(v?.lesson?.topic ?? '').toLowerCase() === alvo.topico.toLowerCase(),
  );
  const p1 = candidatas.find(([c]) => c.startsWith(chaveP1));
  const antiga = candidatas.find(([c]) => !c.startsWith(chaveP1));
  const escolhida = p1 ?? antiga;
  if (!escolhida) {
    console.log(`\n${alvo.materia} / ${alvo.topico}: NAO ENCONTRADA no aiCache`);
    continue;
  }
  const [chave, v] = escolhida;
  const aula = v.lesson;
  const m = metricas(aula);
  const d = defeitos(aula);
  const versao = chave.startsWith(chaveP1) ? 'P1' : 'ANTIGA';

  console.log(`\n${alvo.materia} — ${alvo.topico}  [${versao}]`);
  console.log(`  chave: ${chave}`);
  console.log(`  ${m.secoes} secoes | ${m.exemplos} exemplos | ${m.exercicios} exercicios | ${m.errosComuns} erros comuns | ${m.resumo} resumo`);
  console.log(`  intro ${m.introChars}c | explicacao media ${m.mediaExplicacao}c (menor ${m.menorExplicacao}c) | ${m.bytes}b`);
  console.log(`  defeitos: ${d.length ? d.join(' | ') : 'NENHUM'}`);

  if (antiga && p1) {
    const ma = metricas(antiga[1].lesson);
    console.log(`  --- antiga (${ma.bytes}b, ${ma.exemplos}ex, ${ma.exercicios}exerc, intro ${ma.introChars}c) ---`);
    const delta = ((m.bytes / ma.bytes - 1) * 100).toFixed(0);
    console.log(`  evolucao: ${ma.bytes}b -> ${m.bytes}b (+${delta}%)`);
  }

  linhas.push({ materia: alvo.materia, topico: alvo.topico, versao, ...m, defeitos: d, chave });
}

console.log(`\n${'='.repeat(74)}`);
const comDefeito = linhas.filter((l) => l.defeitos.length);
const p1Count = linhas.filter((l) => l.versao === 'P1').length;
console.log(`aulas reais com P1: ${p1Count}/4`);
console.log(`aulas reais com defeito: ${comDefeito.length}/4`);
comDefeito.forEach((l) => console.log(`  ${l.materia} / ${l.topico}: ${l.defeitos.join(' | ')}`));

fs.writeFileSync('.tmp-regen/auditoria-4.json', JSON.stringify(linhas, null, 2), 'utf8');
console.log('\nEvidencia: .tmp-regen/auditoria-4.json');