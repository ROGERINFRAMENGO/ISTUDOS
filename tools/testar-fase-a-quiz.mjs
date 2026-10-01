// ============================================================
// FASE A - teste real da Edge Function generate-quiz.
// Le as 4 aulas P1 do app_state.aiCache (mesma sessao anonima que o
// app usa) e chama a funcao como o app chamaria. Imprime o quiz
// inteiro para conferencia manual do gabarito.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const SAIDA = path.join(RAIZ, '.tmp-bench', 'fase-a');
fs.mkdirSync(SAIDA, { recursive: true });

if (!KEY) { console.error('Defina VITE_SUPABASE_PUBLISHABLE_KEY.'); process.exit(1); }

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) throw eSess;
const TOKEN = sess.session.access_token;

const soContexto = process.argv.includes('--contexto');
const soTeste = process.argv.includes('--fallback');

const { data: st, error } = await cliente.from('app_state').select('data').eq('id', 'principal').single();
if (error) { console.error('app_state:', error.message); process.exit(1); }

const cache = st?.data?.sections?.aiCache ?? {};
const porMateria = new Map();
for (const [chave, entrada] of Object.entries(cache)) {
  if (!chave.includes('p1-aulas-2026-09-30')) continue;
  const aula = entrada?.lesson;
  if (!aula?.sections?.length) continue;
  const materia = chave.split('|').at(-2);
  if (!porMateria.has(materia)) {
    porMateria.set(materia, {
      materia,
      topico: chave.split('|').at(-1),
      aula,
      chave,
      // lessonId real do cache: e ele que ativa o cache no servidor.
      lessonId: entrada?.lessonId ?? null,
    });
  }
}
const aulas = [...porMateria.values()];
console.log(`aulas P1 no cache: ${aulas.length}`);
for (const a of aulas) console.log(`  - ${a.materia} / ${a.topico} (${a.aula.sections.length} secoes)`);

if (soContexto) process.exit(0);

// ------------------------------------------------------------
// Teste de fallback: simula a Edge Function fora do ar. Serve para
// provar que o app nao fica sem questoes, sem precisar derrubar nada.
// ------------------------------------------------------------
if (soTeste) {
  console.log('\n===== TESTE DE FALLBACK =====');
  const { getFullLessonQuiz } = await import('../src/data/lessonQuiz.js');
  for (const a of aulas) {
    const qs = getFullLessonQuiz(a.aula);
    const genericas = qs.filter((q) => /melhor estrat|atitude|melhor forma|primeiro passo/i.test(q.question)).length;
    console.log(`  ${a.materia}: ${qs.length} questoes · ${genericas} genericas (padrao-antigo)`);
    qs.forEach((q, i) => console.log(`     ${i + 1}. ${q.question.slice(0, 88)}`));
  }
  console.log('\nO fallback entrega questoes SEMPRE, mas sao as mesmas 3');
  console.log('perguntas de habito de estudo para qualquer materia.');
  process.exit(0);
}
// ------------------------------------------------------------
// TESTE HONESTO DO CACHE: o quiz so e salvo e lido quando aula e
// quiz pertencem ao MESMO usuario (RLS por user_id). O teste
// anterior falhava por dois motivos que nao ocorrem em uso real:
// signInAnonymously() cria um usuario NOVO a cada execucao, e a aula
// da Anna nao pertence ao usuario anonimo de teste.
//
// Aqui o usuario anonimo de teste e REUTILIZADO nas duas chamadas e a
// gravacao e verificada pelo resultado. Se saveFailed vier true,
// existe um bug de gravacao de verdade.
// ------------------------------------------------------------
if (process.argv.includes('--cache')) {
  console.log('\n===== TESTE DE CACHE (mesma sessao, mesmo usuario) =====');
  const alvo = aulas.find((a) => a.lessonId) ?? aulas[0];
  console.log(`alvo: ${alvo.materia}/${alvo.topico} · lessonId=${alvo.lessonId ?? '(nenhum)'}`);

  if (!alvo.lessonId) {
    console.log('\nSem lessonId o cache de servidor nao se aplica por construcao.');
    console.log('O cache que importa aqui e o LOCAL (localStorage), testado no navegador.');
    process.exit(0);
  }

  const corpo = {
    lessonId: alvo.lessonId,
    subject: alvo.materia,
    topic: alvo.topico,
    difficulty: 'medium',
    lesson: alvo.aula,
    studentPerformance: {},
  };
  const bater = (force) => fetch(`${BASE}/functions/v1/generate-quiz`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${TOKEN}`,
      Origin: 'https://rogerinframengo.github.io',
    },
    body: JSON.stringify({ ...corpo, force: Boolean(force) }),
  });

  // Fingerprint do CONTEUDO, e nao do id: no schema estrito os ids sao
  // sempre q1..q5, entao comparar ids nao diria se regerou ou nao.
  const rodadas = [[1, '1a chamada (gera e grava)', false], [2, '2a chamada (force=true, regera)', true], [3, '3a chamada (deve vir do cache)', false]];

  for (const [n, rotulo, force] of rodadas) {
    const t0 = Date.now();
    const r = await bater(force);
    const j = await r.json();
    const q = j?.quiz?.questions ?? [];
    const sig = q.map((x) => `${x.question}|${x.correct}`).join('~').slice(0, 120);
    console.log(`  ${rotulo}`);
    console.log(`     http ${r.status} · ${Date.now() - t0}ms · cached=${j?.cached} · saveFailed=${j?.saveFailed ?? '-'} · q=${q.length}`);
    fs.writeFileSync(path.join(SAIDA, `cache-fp-${n}.txt`), sig, 'utf8');
    if (n < 3) {
      console.log('     (espera 30s: cota de 8000 tokens/min)');
      await new Promise((r2) => setTimeout(r2, 30000));
    }
  }

  const fp1 = fs.readFileSync(path.join(SAIDA, 'cache-fp-1.txt'), 'utf8');
  const fp2 = fs.readFileSync(path.join(SAIDA, 'cache-fp-2.txt'), 'utf8');
  const fp3 = fs.readFileSync(path.join(SAIDA, 'cache-fp-3.txt'), 'utf8');
  console.log(`\n  3a chamada devolveu o MESMO quiz da 2a? ${fp2 === fp3 ? 'SIM' : 'NAO (regerou)'}`);
  console.log(`  3a chamada devolveu o quiz da 1a?        ${fp1 === fp3 ? 'SIM' : 'NAO'}`);
  process.exit(0);
}
const resumo = [];
for (const a of aulas) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/functions/v1/generate-quiz`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${TOKEN}`,
      Origin: 'https://rogerinframengo.github.io',
    },
    body: JSON.stringify({
      lessonId: a.lessonId,
      subject: a.materia,
      topic: a.topico,
      difficulty: 'medium',
      lesson: a.aula,
      studentPerformance: {},
    }),
  });
  const ms = Date.now() - t0;
  const corpo = await r.json();
  const ok = r.ok && corpo?.quiz?.questions?.length > 0;

  resumo.push({
    materia: a.materia, topico: a.topico, http: r.status, ms,
    ok, cached: corpo?.cached ?? null, model: corpo?.model ?? null,
    version: corpo?.version ?? null,
    questoes: corpo?.quiz?.questions?.length ?? 0,
    erro: corpo?.error ?? null, kind: corpo?.kind ?? null,
  });

  console.log(`\n${'='.repeat(64)}`);
  console.log(`${a.materia} / ${a.topico}`);
  console.log(`http ${r.status} · ${ms}ms · cached=${corpo?.cached} · model=${corpo?.model}`);
  if (!ok) {
    console.log(`FALHOU: ${corpo?.error} (${corpo?.kind}) — o app cairia no quiz local.`);
    continue;
  }
  for (const [i, q] of corpo.quiz.questions.entries()) {
    console.log(`\n  [${i + 1}] (${q.difficulty}) ${q.question}`);
    q.options.forEach((o, oi) => console.log(`      ${'ABCD'[oi]}${oi === q.correct ? ' <- gabarito' : ''} ${o}`));
    console.log(`      por que: ${q.explanation}`);
  }

  fs.writeFileSync(
    path.join(SAIDA, `${a.materia}-${a.topico}.json`.replace(/[^a-z0-9.-]/gi, '_')),
    JSON.stringify({ materia: a.materia, topico: a.topico, http: r.status, ms, quiz: corpo.quiz, model: corpo.model }, null, 2),
    'utf8',
  );
}

fs.writeFileSync(path.join(SAIDA, 'resumo.json'), JSON.stringify(resumo, null, 2), 'utf8');

console.log(`\n${'='.repeat(64)}`);
console.log('RESUMO');
for (const r of resumo) {
  console.log(`  ${r.materia.padEnd(12)} http=${r.http} ${String(r.ms).padStart(6)}ms  ok=${r.ok}  q=${r.questoes}  cached=${r.cached}  ${r.erro ?? ''}`);
}
const bons = resumo.filter((r) => r.ok).length;
console.log(`\n${bons}/${resumo.length} quizzes gerados e validados`);
console.log(`saida completa em ${path.relative(RAIZ, SAIDA)}`);