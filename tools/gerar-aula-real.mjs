// ============================================================
// Gera uma aula REAL pela Edge Function publicada, com o payload
// que o app manda, e mede o resultado. Prioridade 1: a aula nova
// nao pode vazar metadado do cronograma nem vir rasa.
//
// Uso: node tools/gerar-aula-real.mjs <Materia> <Topico> [subtopicos csv]
// ============================================================

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';

const subject = process.argv[2] ?? 'Matemática';
const topic = process.argv[3] ?? 'numeros inteiros';
const subtopics = (process.argv[4] ?? topic).split(',').map((s) => s.trim()).filter(Boolean);

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data, error } = await cliente.auth.signInAnonymously();
if (error || !data?.session) throw new Error(error?.message ?? 'sem sessao');
const token = data.session.access_token;

const t0 = Date.now();
const r = await fetch(`${BASE}/functions/v1/generate-lesson`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: KEY,
    Authorization: `Bearer ${token}`,
    Origin: 'https://rogerinframengo.github.io',
  },
  body: JSON.stringify({
    subject,
    topic,
    subtopics,
    objectives: subtopics.map((s) => `Entender ${s}`),
    durationMinutes: 55,
    curriculumVersion: 'v2',
    week: 1,
    day: 3,
    block: 1,
    // Chave diferente a cada execucao para nao pegar o cache.
    dateKey: `teste-${Date.now()}`,
    force: true,
  }),
});
const ms = Date.now() - t0;
const bruto = await r.text();

if (!r.ok) {
  console.log(`HTTP ${r.status} em ${ms}ms`);
  console.log(bruto.slice(0, 900));
  process.exit(1);
}

const { lesson, model, cached, errors } = JSON.parse(bruto);
if (!lesson) {
  console.log(`SEM AULA em ${ms}ms (modelo ${model})`);
  if (errors) console.log('erros do validador:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const txt = JSON.stringify(lesson);
const SECOES = lesson.sections?.length ?? 0;
const EXEMPLOS = lesson.sections?.reduce((n, s) => n + (s.examples?.length ?? 0), 0) ?? 0;
const medExp = Math.round(
  (lesson.sections ?? []).reduce((n, s) => n + (s.explanation?.length ?? 0), 0) / Math.max(1, SECOES),
);

// Auditoria rapida, espelhando as regras do schema novo.
const METADADO = /\bsemana\s+\d+|\bbloco\s+\d+|\b\d+\s*minutos?\b|revisao (de|para) amanha|o que nao couber|fase do cronograma/i;
const MARKDOWN = /(\*\*|^#{1,6}\s|^\s*[-*]\s|```|\\frac)/m;
const lista = [
  ['metadado do cronograma', METADADO.test(lesson.introduction ?? '') ? 'VAZOU' : 'limpo'],
  ['markdown', MARKDOWN.test(txt) ? 'PRESENTE' : 'limpo'],
];

console.log(`=== ${subject} / ${topic} ===`);
console.log(`modelo: ${model} | cache: ${cached} | ${ms}ms`);
console.log(`chars: ${txt.length} | secoes: ${SECOES} | exemplos: ${EXEMPLOS} | exercicios: ${lesson.guidedPractice?.length ?? 0}`);
console.log(`erros comuns: ${lesson.commonMistakes?.length ?? 0} | resumo: ${lesson.summary?.length ?? 0}`);
console.log(`media da explicacao: ${medExp} chars (piso novo: 600)`);
for (const [nome, st] of lista) console.log(`${nome}: ${st}`);
console.log('');
console.log('--- introduction ---');
console.log(lesson.introduction);
console.log('');
console.log('--- secao 1 (explicacao) ---');
console.log(lesson.sections?.[0]?.explanation?.slice(0, 700));
console.log('');
console.log('--- exemplo 1 ---');
const ex = lesson.sections?.flatMap((s) => s.examples ?? [])[0];
if (ex) {
  console.log('P:', ex.problem);
  console.log('S:', ex.solution);
  console.log('E:', ex.explanation);
}
console.log('');
console.log('--- exercicio 1 ---');
const gp = lesson.guidedPractice?.[0];
if (gp) {
  console.log('Q:', gp.question);
  console.log('R:', gp.answer);
  console.log('E:', gp.explanation);
}
console.log('');
console.log('--- resumo ---');
(lesson.summary ?? []).forEach((s) => console.log('- ' + s));
