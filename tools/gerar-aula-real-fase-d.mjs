// ============================================================
// FASE D — UMA geracao real controlada, com a
// GROQ_CUSTOM_LESSON_API_KEY.
//
//   node tools/gerar-aula-real-fase-d.mjs
//
// Regra da fase: UMA geracao, nao benchmark. Se der erro de cota ou
// de provider, o script PARA e mostra o que aconteceu, sem repetir.
//
// Nao imprime nenhuma credencial: o script so fala com a Edge
// Function, que e quem le o secret.
// ============================================================

import fs from 'node:fs';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!KEY) { console.error('Defina VITE_SUPABASE_PUBLISHABLE_KEY.'); process.exit(1); }

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) { console.error('sessao:', eSess.message); process.exit(1); }
const token = sess.session.access_token;

async function chamar(funcao, corpo, metodo = 'POST') {
  const r = await fetch(`${BASE}/functions/v1/${funcao}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      Origin: 'https://rogerinframengo.github.io',
    },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
  return { status: r.status, json, bruto: texto.slice(0, 300) };
}

const linha = (t) => console.log(`\n${'='.repeat(64)}\n${t}\n${'='.repeat(64)}`);

// ------------------------------------------------------------
linha('1. RECUSA: pedido vazio');
{
  const r = await chamar('generate-lesson', { custom: true, request: '   ' });
  console.log(`HTTP ${r.status} | error=${r.json?.error}`);
}

// ------------------------------------------------------------
linha('2. RECUSA: pedido acima de 2.000 caracteres (sem cortar)');
{
  const r = await chamar('generate-lesson', { custom: true, request: 'a'.repeat(2500) });
  console.log(`HTTP ${r.status} | error=${r.json?.error}`);
  console.log(`  limite=${r.json?.limit} | recebido=${r.json?.received}`);
  console.log(`  mensagem: ${r.json?.message}`);
}

// ------------------------------------------------------------
linha('3. BIBLIOTECA antes de gerar');
{
  const r = await chamar('custom-lessons', null, 'GET');
  console.log(`HTTP ${r.status} | aulas=${r.json?.lessons?.length ?? 'erro'}`);
}

// ------------------------------------------------------------
linha('4. UMA GERACAO REAL');
const REQUEST = 'Quero aprender equacoes do primeiro grau do zero. Tenho muita dificuldade com matematica, entao explica devagar, mostra as contas passo a passo e termina com exercicios faceis antes de aumentar a dificuldade.';
const t0 = Date.now();
const r = await chamar('generate-lesson', { custom: true, request: REQUEST });
const ms = Date.now() - t0;

console.log(`HTTP ${r.status} | latencia ${ms} ms`);
if (!r.json?.lesson) {
  console.log(`FALHOU: error=${r.json?.error} kind=${r.json?.kind ?? '-'}`);
  console.log(`  mensagem: ${r.json?.message ?? r.bruto}`);
  if (Array.isArray(r.json?.errors) && r.json.errors.length) {
    console.log('\n  ERROS DO VALIDADOR (todos):');
    for (const e of r.json.errors) console.log(`    - ${e}`);
  }
  console.log('\nSem retry: a regra da fase e parar e diagnosticar.');
  process.exit(2);
}

const aula = r.json.lesson;
console.log(`id: ${r.json.id ?? '(nao salvo)'}`);
console.log(`titulo: ${aula.title}`);
console.log(`secoes=${aula.sections?.length} exercicios=${aula.guidedPractice?.length} errosComuns=${aula.commonMistakes?.length} resumo=${aula.summary?.length} objetivos=${aula.objectives?.length}`);
console.log(`respostas: ${JSON.stringify(aula.guidedPractice?.map((g) => g.answer))}`);
console.log(`latencia reportada: ${r.json.ms} ms`);

fs.mkdirSync('.tmp-bench/fase-d', { recursive: true });
fs.writeFileSync('.tmp-bench/fase-d/aula.json', JSON.stringify(r.json, null, 2), 'utf8');

// ------------------------------------------------------------
linha('5. BIBLIOTECA depois de gerar');
{
  const l = await chamar('custom-lessons', null, 'GET');
  const aulas = l.json?.lessons ?? [];
  console.log(`HTTP ${l.status} | aulas=${aulas.length}`);
  for (const a of aulas) console.log(`  - ${a.lesson_data?.title} | ${a.subject} | ${String(a.created_at).slice(0, 10)}`);
}

// ------------------------------------------------------------
linha('6. REABRIR sem gerar nada (leitura pura)');
{
  const l = await chamar('custom-lessons', null, 'GET');
  const salva = (l.json?.lessons ?? []).find((a) => a.id === r.json.id);
  console.log(salva ? 'reencontrada pelo id, sem chamar a IA' : 'NAO reencontrada');
}

// ------------------------------------------------------------
linha('7. QUIZ da aula personalizada (reusa generate-quiz)');
if (r.json.id) {
  const q0 = Date.now();
  const q = await chamar('generate-quiz', { lessonId: r.json.id, subject: 'Personalizada', topic: aula.title });
  console.log(`HTTP ${q.status} | latencia ${Date.now() - q0} ms | cached=${q.json?.cached}`);
  const perguntas = q.json?.quiz?.questions ?? [];
  console.log(`questoes: ${perguntas.length}`);
  for (const p of perguntas) console.log(`  ${String(p.question).slice(0, 90)}`);
  const q2 = await chamar('generate-quiz', { lessonId: r.json.id, subject: 'Personalizada', topic: aula.title });
  console.log(`2a chamada: HTTP ${q2.status} | cached=${q2.json?.cached} (esperado true, sem chamar a IA)`);
}

// ------------------------------------------------------------
linha('8. EXCLUIR (so aceita aula personalizada)');
if (r.json.id) {
  const d = await chamar('custom-lessons', { id: r.json.id }, 'DELETE');
  console.log(`DELETE da aula personalizada: HTTP ${d.status} | deleted=${d.json?.deleted}`);
  const d2 = await chamar('custom-lessons', { id: 'nao-e-uuid' }, 'DELETE');
  console.log(`DELETE com id invalido: HTTP ${d2.status} | error=${d2.json?.error}`);
  const l = await chamar('custom-lessons', null, 'GET');
  console.log(`biblioteca final: ${(l.json?.lessons ?? []).length} aula(s)`);
}

console.log('\nFIM — nenhuma credencial foi impressa.');
