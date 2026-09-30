// Request real ao generate-lesson, com o mesmo caminho do app:
// sessao anonima -> JWT -> /functions/v1/generate-lesson.
import { createClient } from '@supabase/supabase-js';
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const client = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInAnonymously();
if (error) { console.log('sessao falhou:', error.message); process.exit(1); }
const token = data.session.access_token;
const body = {
  subject: 'Matematica',
  topic: 'Revisao de fracao',
  subtopics: ['fracao', 'equivalencia'],
  durationMinutes: 55,
  curriculumVersion: 'v2',
  week: 1,
  day: 1,
  block: 1,
};
const t0 = Date.now();
const res = await fetch(`${BASE}/functions/v1/generate-lesson`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const json = await res.json().catch(() => null);
console.log(`HTTP ${res.status} em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!res.ok) { console.log('erro:', JSON.stringify(json).slice(0, 300)); process.exit(1); }
console.log('cached:', json.cached, '| lessonId:', json.lessonId ?? '-', '| model:', json.model ?? '-');
const l = json.lesson ?? {};
console.log('titulo:', l.title ?? '-');
console.log('palavras:', String(JSON.stringify(l)).split(/\s+/).length);
console.log('secoes:', (l.sections ?? []).length, '| guiados:', (l.guidedPractice ?? []).length);

// Segunda chamada: tem que vir do CACHE, sem chamar a IA de novo.
const t1 = Date.now();
const res2 = await fetch(`${BASE}/functions/v1/generate-lesson`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const json2 = await res2.json().catch(() => null);
console.log(`\n2a chamada: HTTP ${res2.status} em ${Date.now() - t1}ms | cached=${json2?.cached} | mesmo id=${json2?.lessonId === json?.lessonId}`);
