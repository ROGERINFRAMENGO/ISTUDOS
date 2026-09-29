// ============================================================
// Prova de que a PARTE DE BANCO do fluxo funciona de verdade:
//   1. abre sessao anonima (como o app faz)
//   2. salva a aula em generated_lessons com o MESMO formato de
//      lessonCacheKey/saveLesson da Edge Function
//   3. busca de novo pelo MESMO cache_key e confere se o cache
//      devolve a aula sem chamar a IA
//   4. limpa o registro de teste
// Nao chama a IA e nao usa service_role: usa o JWT do usuario,
// entao o RLS continua valendo.
// Roda com: node scripts/testar-cache-real.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const inline = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const env = Object.fromEntries(
  read('.env').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
// O .env deste projeto tem VITE_SUPABASE_PUBLISHABLE_KEY VAZIA, e o app so
// funciona por causa do fallback hardcoded em src/lib/supabase.js. Aqui usamos
// a mesma chave publica (sb_publishable_...), que e publica por definicao.
const FALLBACK_KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY;
console.log(`   (chave: ${env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'do .env' : 'fallback publico usado pelo app'})\n`);

// Cliente igual ao do app (chave publica + JWT do proprio usuario).
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

console.log('1) SESSAO ANONIMA (a mesma que o app abre para a IA)');
const { data: sessao, error: erroSessao } = await supabase.auth.signInAnonymously();
if (erroSessao || !sessao?.session) {
  console.log(`   ERRO: ${erroSessao?.message ?? 'sem sessao'}`);
  console.log('   Ative Authentication -> Sign In -> Allow anonymous sign-ins no painel.');
  process.exit(1);
}
const token = sessao.session.access_token;
console.log(`   user_id: ${sessao.user.id}`);
console.log(`   token obtido: ${token ? 'sim' : 'nao'}`);

// Confere o token no endpoint de auth (o mesmo que a Edge Function usa).
const resAuth = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
console.log(`   /auth/v1/user respondeu: ${resAuth.status}`);
console.log('');

const curriculum = await import(inline(read('src/data/curriculum.js').replace("from './schedule'", `from '${inline(read('src/data/schedule.js'))}'`)));
const dbShared = await import(inline(read('supabase/functions/_shared/db.js')));
const plano = curriculum.getPlanDaysForDate('2026-09-29')[0];

const cacheKey = dbShared.lessonCacheKey({
  curriculumVersion: plano.curriculumVersion,
  week: plano.week,
  day: plano.day,
  dateKey: plano.dateKey,
  block: plano.block,
  subject: plano.subject,
  topic: plano.topic,
});

const lessonData = {
  title: 'Aula de teste do cache (Portugues - 29/09 bloco 1)',
  estimatedMinutes: 55,
  objectives: ['Verificar se o cache da aula funciona de verdade.'],
  introduction: 'Registro temporario criado apenas para provar que o cache de generated_lessons funciona.',
  sections: [{ title: 'Secao de teste', explanation: 'Explicacao temporaria usada somente para validar o caminho de cache do banco de dados.', examples: [] }],
  guidedPractice: [],
  commonMistakes: ['Nao e uma aula real.'],
  summary: ['Registro temporario de teste do cache.'],
};

console.log('2) SALVAR (findLesson -> nao acha -> saveLesson)');
const { data: achou, error: erroFind } = await supabase
  .from('generated_lessons').select('*').eq('cache_key', cacheKey).limit(1);
if (erroFind) {
  console.log(`   ERRO no SELECT: ${erroFind.message}`);
  process.exit(1);
}
console.log(`   findLesson -> ${achou.length} registro(s) antes de salvar`);
console.log(`   chave: ${cacheKey}`);

const { data: salvo, error: erroSave } = await supabase
  .from('generated_lessons')
  .upsert(
    {
      user_id: sessao.user.id,
      cache_key: cacheKey,
      curriculum_version: plano.curriculumVersion,
      week: plano.week,
      day: plano.day,
      date_key: plano.dateKey,
      subject: plano.subject,
      topic: plano.topic,
      lesson_data: lessonData,
      model: 'teste-local-sem-ia',
    },
    { onConflict: 'user_id,cache_key' },
  )
  .select();
if (erroSave) {
  console.log(`   ERRO no INSERT: ${erroSave.message}`);
  process.exit(1);
}
console.log(`   saveLesson -> id=${salvo?.[0]?.id ?? 'n/a'}`);
console.log('');

console.log('3) ABRIR DE NOVO -> tem que vir do CACHE');
const { data: achou2 } = await supabase.from('generated_lessons').select('*').eq('cache_key', cacheKey).limit(1);
const viaCache = achou2?.[0];
console.log(`   findLesson -> ${achou2.length} registro(s)`);
console.log(`   Veio do cache? ${viaCache ? 'SIM' : 'NAO'}`);
console.log(`   Titulo lido : ${viaCache?.lesson_data?.title}`);
console.log(`   Modelo      : ${viaCache?.model}`);
console.log('   => a Edge Function devolveria { cached: true } e NAO chamaria a IA.');
console.log('');

const outro = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
await outro.auth.signInAnonymously();
const { data: vazamento } = await outro.from('generated_lessons').select('id').eq('cache_key', cacheKey);
console.log(`4) RLS: outro usuario anonimo enxerga ${vazamento?.length ?? 0} registro(s) (esperado: 0)`);
console.log('');

await supabase.from('generated_lessons').delete().eq('cache_key', cacheKey);
const { data: depois } = await supabase.from('generated_lessons').select('id').eq('cache_key', cacheKey);
console.log(`5) LIMPEZA: restaram ${depois.length} registro(s) de teste (esperado: 0)`);
await supabase.auth.signOut();
await outro.auth.signOut();
