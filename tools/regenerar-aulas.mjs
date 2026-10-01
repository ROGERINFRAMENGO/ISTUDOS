// ============================================================
// REGENERAR as aulas reais pendentes (P1A).
// ------------------------------------------------------------
// Usa a MESMA chave que o app usa, extraida do cronograma real
// (src/data/curriculum.js). Sem isso a chamada cria chave
// artificial: foi assim que "dateKey=teste-..." virou lixo.
//
// NAO apaga progresso, XP, chat, conclusao nem nenhum dado da
// aluna: apenas chama generate-lesson.
//
// Uso: node tools/regenerar-aulas.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const VERSAO_P1 = 'p1-aulas-2026-09-30';

// As 2 aulas reais que ainda NAO tem P1 (Matematica e Historia ja tem).
const ALVOS = [
  { subject: 'Português', topic: 'informação explícita' },
  { subject: 'Ciências', topic: 'matéria' },
];

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrada = path.join(raiz, 'tools', '_entrada-regen.mjs');
const bundle = path.join(os.tmpdir(), `regen-${Date.now()}.mjs`);
fs.writeFileSync(
  entrada,
  "export { curriculumDays, isGeneratedDay } from '../src/data/curriculum.js';\n",
  'utf8',
);
const esbuild = (await import('esbuild')).default;
await esbuild.build({ entryPoints: [entrada], bundle: true, format: 'esm', outfile: bundle, logLevel: 'silent' });
const { curriculumDays, isGeneratedDay } = await import(pathToFileURL(bundle).href);
fs.rmSync(entrada, { force: true });
fs.rmSync(bundle, { force: true });

// Mesma formula de src/services/ai.js (lessonCacheKey).
function chaveDe(plan) {
  return [
    plan.curriculumVersion || 'v1',
    VERSAO_P1,
    plan.week ?? '?',
    plan.dateKey ?? plan.day ?? '?',
    `b${plan.block ?? 1}`,
    String(plan.subject ?? '').toLowerCase(),
    String(plan.topic ?? '').toLowerCase(),
  ].join('|');
}

const planos = ALVOS.map((alvo) => {
  const plan = curriculumDays.find(
    (p) =>
      isGeneratedDay(p) &&
      String(p.subject).toLowerCase() === alvo.subject.toLowerCase() &&
      String(p.topic).toLowerCase() === alvo.topic.toLowerCase(),
  );
  if (!plan) throw new Error(`nao achei no cronograma: ${alvo.subject} / ${alvo.topic}`);
  return plan;
});

console.log('=== CHAVES QUE SERAO USADAS (iguais as do app) ===');
planos.forEach((p) => console.log(`  ${chaveDe(p)}`));

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) throw eSess;
console.log(`\nusuario anonimo: ${sess.user.id}`);

fs.mkdirSync('.tmp-regen', { recursive: true });
const relatorio = [];

// Payload identico ao que src/services/ai.js monta para o app.
function payloadDe(plan) {
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
    force: true,
  };
}
for (const plan of planos) {
  console.log(`\n${'='.repeat(62)}`);
  console.log(`${plan.subject} — ${plan.topic} (${plan.dateKey} b${plan.block})`);
  console.log(`subtopicos: ${(plan.subtopics ?? []).join(' | ')}`);

  const t0 = Date.now();
  let r;
  try {
    r = await fetch(`${BASE}/functions/v1/generate-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${sess.session.access_token}`,
        Origin: 'https://rogerinframengo.github.io',
      },
      body: JSON.stringify(payloadDe(plan)),
    });
  } catch (erro) {
    const ms = Date.now() - t0;
    console.log(`  FALHA DE REDE em ${ms}ms: ${erro.message}`);
    relatorio.push({ materia: plan.subject, topico: plan.topic, ok: false, erro: erro.message });
    continue;
  }

  const ms = Date.now() - t0;
  const bruto = await r.text();

  if (!r.ok) {
    console.log(`  HTTP ${r.status} em ${ms}ms`);
    console.log(`  ${bruto.slice(0, 400)}`);
    relatorio.push({ materia: plan.subject, topico: plan.topic, ok: false, http: r.status, ms });
    continue;
  }

  let saida;
  try {
    saida = JSON.parse(bruto);
  } catch {
    console.log('  resposta nao-JSON');
    relatorio.push({ materia: plan.subject, topico: plan.topic, ok: false, erro: 'json invalido' });
    continue;
  }

  const aula = saida.lesson;
  if (!aula) {
    console.log(`  SEM AULA em ${ms}ms (modelo ${saida.model})`);
    console.log(`  erros: ${(saida.errors ?? []).slice(0, 5).join(' | ')}`);
    relatorio.push({ materia: plan.subject, topico: plan.topic, ok: false, erros: saida.errors ?? [] });
    continue;
  }

  const exemplos = (aula.sections ?? []).reduce((n, s) => n + (s.examples?.length ?? 0), 0);
  console.log(`  OK em ${ms}ms | modelo ${saida.model} | cached: ${saida.cached}`);
  console.log(`  ${aula.sections?.length} secoes | ${exemplos} exemplos | ${aula.guidedPractice?.length} exercicios`);
  console.log(`  intro ${aula.introduction?.length}c | ${JSON.stringify(aula).length}b`);

  const arquivo = `.tmp-regen/${plan.subject}-${plan.topic}.json`.replace(/[^\w.\-]/g, '_');
  fs.writeFileSync(arquivo, JSON.stringify(aula, null, 2), 'utf8');
  console.log(`  salvo em ${arquivo}`);

  relatorio.push({
    materia: plan.subject,
    topico: plan.topic,
    chave: chaveDe(plan),
    ok: true,
    model: saida.model,
    cached: saida.cached,
    ms,
    id: saida.id,
    bytes: JSON.stringify(aula).length,
    introChars: aula.introduction?.length ?? 0,
    secoes: aula.sections?.length ?? 0,
    exemplos,
    exercicios: aula.guidedPractice?.length ?? 0,
  });
}

fs.writeFileSync('.tmp-regen/relatorio.json', JSON.stringify(relatorio, null, 2), 'utf8');
console.log(`\n${'='.repeat(62)}`);
relatorio.forEach((x) =>
  console.log(`${x.ok ? 'OK   ' : 'FALHA'} | ${x.materia} / ${x.topico} | cached=${x.cached ?? '-'} | ${x.ms}ms`),
);