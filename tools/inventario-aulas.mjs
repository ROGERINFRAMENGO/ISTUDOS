// ============================================================
// Inventario REAL das aulas (P1A) — SOMENTE LEITURA.
// ------------------------------------------------------------
// Nao gera, nao apaga, nao altera nada. Existe para responder UMA
// pergunta: as "25 aulas" do relatorio anterior sao 25 aulas ou
// 25 LINHAS de poucas aulas repetidas?
//
// Duas descoberta que o SQL sozinho nao mostra:
//   1) cada sessao anonima cria um user_id novo, e o RLS de
//      generated_lessons e auth.uid() = user_id. Logo as linhas
//      ficam espalhadas por NENZE user_ids diferentes;
//   2) app_state NAO tem esse filtro (id fixo 'principal'), e por
//      isso e a unica fonte que o app realmente compartilha.
//
// Uso: node tools/inventario-aulas.mjs
// Saida: .tmp-inv/*.json (evidencia confiavel, UTF-8 integral)
// ============================================================

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const VERSAO_P1 = 'p1-aulas-2026-09-30';

fs.mkdirSync('.tmp-inv', { recursive: true });

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { error } = await cliente.auth.signInAnonymously();
if (error) throw error;

// ---- 1) app_state: o que o app REALMENTE serve hoje -----------
const { data: estado, error: e2 } = await cliente
  .from('app_state').select('data').eq('id', 'principal').single();
if (e2) throw e2;
const s = estado.data ?? {};
const aiCache = s.sections?.aiCache ?? {};

// ---- 2) As linhas deste usuario (RLS = auth.uid() = user_id) --
const { data: linhas, error: e1 } = await cliente
  .from('generated_lessons')
  .select('id,cache_key,subject,topic,model,lesson_data,week,day,date_key,created_at')
  .limit(500);
if (e1) throw e1;

const dump = (linhas ?? []).map((l) => ({
  id: l.id,
  cache_key: l.cache_key,
  subject: l.subject,
  topic: l.topic,
  model: l.model,
  date_key: l.date_key,
  created_at: l.created_at,
  bytes: JSON.stringify(l.lesson_data).length,
  secoes: l.lesson_data?.sections?.length ?? 0,
  exemplos: (l.lesson_data?.sections ?? []).reduce((n, x) => n + (x.examples?.length ?? 0), 0),
  exercicios: l.lesson_data?.guidedPractice?.length ?? 0,
}));

fs.writeFileSync('.tmp-inv/aulas.json', JSON.stringify({ linhas: dump }, null, 2), 'utf8');

// ---- 3) app_state: quem tem aula P1 --------------------------
console.log('=== app_state.sections.aiCache (o que o app serve hoje) ===');
const servidas = [];
for (const [chave, v] of Object.entries(aiCache)) {
  const p1 = chave.includes(VERSAO_P1);
  const aula = v?.lesson ?? {};
  const topic = aula?.topic ?? '(sem topico)';
  const bytes = JSON.stringify(aula).length;
  const exemplos = (aula?.sections ?? []).reduce((n, x) => n + (x.examples?.length ?? 0), 0);
  const exercicios = aula?.guidedPractice?.length ?? 0;
  const secoes = aula?.sections?.length ?? 0;
  const intro = aula?.introduction ?? '';
  servidas.push({ chave, p1, topic, bytes, exemplos, exercicios, secoes, introChars: intro.length });
  console.log(
    `  ${p1 ? 'P1 ' : 'ANT'} | ${topic.padEnd(26)} | ${String(secoes)}s ${String(exemplos)}ex ${String(exercicios)}exerc | intro ${String(intro.length)}c | ${bytes}b`,
  );
}

// ---- 4) Heuristicas de defeito no que esta SENDO servido ------
const { findScheduleLeak, findDuplicatedWords, findHollow } =
  await import('../supabase/functions/_shared/schemas.js');

console.log('\n=== DEFEITOS NO CONTEUDO SERVIDO (heuristicas da P1) ===');
let comDefeito = 0;
for (const [chave, v] of Object.entries(aiCache)) {
  const aula = v?.lesson ?? {};
  const textos = [
    aula.introduction,
    ...(aula.sections ?? []).map((x) => `${x.title} ${x.explanation}`),
    ...(aula.sections ?? []).flatMap((x) => (x.examples ?? []).flatMap((e) => [e.problem, e.solution, e.explanation])),
    ...(aula.guidedPractice ?? []).flatMap((g) => [g.question, g.answer, g.explanation]),
    ...(aula.commonMistakes ?? []),
    ...(aula.summary ?? []),
  ].filter(Boolean);
  const problemas = [];
  const leak = findScheduleLeak(...textos);
  if (leak) problemas.push(`metadado: "${leak}"`);
  const dup = findDuplicatedWords(...textos);
  if (dup) problemas.push(`palavra repetida: "${dup.trecho}"`);
  const hollow = findHollow(...textos);
  if (hollow) problemas.push(`frase vazia: "${hollow}"`);
  const md = textos.find((t) => /(\*\*|^#{1,6}\s|```|\\frac)/m.test(t));
  if (md) problemas.push('markdown residual');
  if (problemas.length) {
    comDefeito += 1;
    console.log(`  [DEFEITO] ${aula.topic}: ${problemas.join(' | ')}`);
  } else {
    console.log(`  [limpo]   ${aula.topic}`);
  }
}
console.log(`\naulas servidas com defeito: ${comDefeito}/${Object.keys(aiCache).length}`);

fs.writeFileSync('.tmp-inv/servidas.json', JSON.stringify(servidas, null, 2), 'utf8');
console.log('\nEvidencia: .tmp-inv/servidas.json e .tmp-inv/aulas.json');
console.log(`linhas visiveis para ESTE usuario anonimo: ${dump.length}`);
console.log('(o total global de 29 linhas e por usuario administrativo no SQL)');