// ============================================================
// FASE E — geracao em lote das 122 licoes oficiais.
//
//   node tools/gerar-lote-fase-e.mjs [limite] [--so=Materia]
//
// REGRAS QUE ESTE SCRIPT CUMPRE (visiveis no codigo):
//
//  1. SEQUENCIAL. Nunca 122 requisicoes ao mesmo tempo.
//  2. RETOMADA. O progresso vai para .tmp-bench/fase-e/progresso.json
//     a cada licao. Se o processo morrer, continua de onde parou.
//  3. SO O QUE FALTA. Consulta as chaves existentes e pula.
//  4. NUNCA INVENTA. Se o provider recusar ou a aula nao passar no
//     validador, a licao fica PENDENTE e o script segue.
//  5. NAO TOCA EM XP. So chama a Edge Function, que so grava em
//     generated_lessons.
//
// A credencial e a de CONTEUDO (NVIDIA), lida dentro da Edge
// Function. A GROQ_CUSTOM_LESSON_API_KEY, da aula personalizada,
// NAO participa deste fluxo.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!KEY) { console.error('Defina VITE_SUPABASE_PUBLISHABLE_KEY.'); process.exit(1); }

const DIR = '.tmp-bench/fase-e';
const ARQ_INVENTARIO = path.join(DIR, 'inventario.json');
const ARQ_PROGRESSO = path.join(DIR, 'progresso.json');

const limite = Number(process.argv[2]) || 0;
const soMateria = (process.argv.find((a) => a.startsWith('--so=')) || '').slice(5);
const PAUSA_MS = 2500;

if (!fs.existsSync(ARQ_INVENTARIO)) {
  console.error('Rode antes: node tools/inventario-curriculo.mjs');
  process.exit(1);
}

const todas = JSON.parse(fs.readFileSync(ARQ_INVENTARIO, 'utf8'));
// 122 = 70 kind "lesson" + 52 kind "review". Os 15 "questions" NAO sao
// aulas: sao blocos so de exercicios e nao passam por generate-lesson.
const alvo = todas.filter((l) => l.kind === 'lesson' || l.kind === 'review');
if (soMateria) {
  const filtrado = alvo.filter((l) => l.subject.toLowerCase().includes(soMateria.toLowerCase()));
  console.log(`filtro: materia contem "${soMateria}" -> ${filtrado.length} licoes`);
  alvo.splice(0, alvo.length, ...filtrado);
}

const progresso = fs.existsSync(ARQ_PROGRESSO)
  ? JSON.parse(fs.readFileSync(ARQ_PROGRESSO, 'utf8'))
  : { ok: [], pendentes: [], inicioEm: new Date().toISOString() };

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) { console.error('sessao:', eSess.message); process.exit(1); }
const headers = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${sess.session.access_token}`,
  Origin: 'https://rogerinframengo.github.io',
};

async function chavesNoBanco() {
  const r = await fetch(`${BASE}/rest/v1/generated_lessons?select=cache_key&kind=eq.curriculum`, { headers });
  const linhas = await r.json().catch(() => []);
  return new Set(Array.isArray(linhas) ? linhas.map((l) => l.cache_key) : []);
}

const feitas = new Set([...progresso.ok, ...(await chavesNoBanco())]);
const faltam = alvo.filter((l) => !feitas.has(l.cacheKey));

console.log('='.repeat(70));
console.log('FASE E - geracao das licoes oficiais');
console.log('='.repeat(70));
console.log(`  alvo (lesson+review)    : ${alvo.length}`);

const fila = limite ? faltam.slice(0, limite) : faltam;
let ok = 0; let erro = 0; let falhasSeguidas = 0;
const inicio = Date.now();

for (const [i, licao] of fila.entries()) {
  const t0 = Date.now();
  let res;
  try {
    const r = await fetch(`${BASE}/functions/v1/generate-lesson`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        curriculumVersion: licao.curriculumVersion,
        week: licao.week, day: licao.day, dateKey: licao.dateKey, block: licao.block,
        subject: licao.subject, topic: licao.topic, subtopics: licao.subtopics,
      }),
    });
    res = { status: r.status, json: await r.json().catch(() => null) };
  } catch (e) {
    res = { status: 0, json: null, erro: String(e?.message ?? e) };
  }

  const ms = Date.now() - t0;
  const linha = `[${String(i + 1).padStart(3)}/${fila.length}] s${licao.week}d${licao.day}b${licao.block} ${licao.subject} - ${String(licao.topic).slice(0, 32)}`;
  const temAula = Boolean(res.json?.lesson) || Boolean(res.json?.cached);

  if (temAula) {
    ok += 1; falhasSeguidas = 0;
    if (!progresso.ok.includes(licao.cacheKey)) progresso.ok.push(licao.cacheKey);
    progresso.pendentes = progresso.pendentes.filter((p) => p.cacheKey !== licao.cacheKey);
    const tag = res.json?.cached ? 'CACHE  ' : `OK ${String(ms).padStart(6)}ms`;
    console.log(`${linha} ${tag} model=${res.json?.model ?? '-'}`);
  } else {
    erro += 1; falhasSeguidas += 1;
    const e = res.json?.error ?? res.erro ?? 'sem resposta';
    const jaTem = progresso.pendentes.find((p) => p.cacheKey === licao.cacheKey);
    progresso.pendentes = progresso.pendentes.filter((p) => p.cacheKey !== licao.cacheKey);
    progresso.pendentes.push({
      cacheKey: licao.cacheKey, erro: e, status: res.status,
      motivo: String(res.json?.errors?.[0] ?? res.json?.message ?? '').slice(0, 120),
      tentativas: (jaTem?.tentativas ?? 0) + 1, em: new Date().toISOString(),
    });
    console.log(`${linha} FALHOU ${String(ms).padStart(6)}ms ${e} :: ${String(res.json?.errors?.[0] ?? '').slice(0, 80)}`);
  }

  fs.writeFileSync(ARQ_PROGRESSO, JSON.stringify(progresso, null, 2), 'utf8');

  // 12, e nao 5. A taxa de acerto medida da NVIDIA e de ~20%: ela
  // responde em 6-9s quando funciona e trava ate o timeout quando
  // nao funciona. Com limiar 5, cinco aulas ruins seguidas encerram
  // o lote antes de qualquer progresso — e era exatamente o que
  // acontecia na primeira execucao (2 de 122).
  //
  // 12 continua sendo uma protecao real contra queda total do
  // provider: com 12 falhas o provider esta fora, nao instavel.
  if (falhasSeguidas >= 12) {
    console.log('\n  12 falhas seguidas: parando para nao estourar cota.');
    console.log('  O progresso esta salvo; rode de novo depois.');
    break;
  }
  if (i < fila.length - 1) await new Promise((r) => setTimeout(r, PAUSA_MS));
}

console.log('');
console.log('='.repeat(70));
console.log(`  OK nesta execucao    : ${ok}`);
console.log(`  falhas              : ${erro}`);
console.log(`  pendentes acumulados: ${progresso.pendentes.length}`);
console.log(`  chaves no banco     : ${(await chavesNoBanco()).size}`);
console.log(`  tempo total         : ${Math.round((Date.now() - inicio) / 1000)}s`);
console.log('='.repeat(70));

const porErro = {};
for (const p of progresso.pendentes) porErro[p.erro] = (porErro[p.erro] ?? 0) + 1;
if (Object.keys(porErro).length) {
  console.log('\n  pendentes por causa:');
  for (const [e, n] of Object.entries(porErro).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}x  ${e}`);
  }
}

console.log(`  ja existentes           : ${alvo.length - faltam.length}`);
console.log(`  faltando                : ${faltam.length}`);
console.log(`  pendentes ja registradas: ${progresso.pendentes.length}`);
if (limite) console.log(`  limite desta execucao    : ${limite}`);
console.log('');
