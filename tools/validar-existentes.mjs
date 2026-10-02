// ============================================================
// FASE E — validacao do que ja existe.
//
//   node tools/validar-existentes.mjs
//
// REGRA CRITICA: as 7+ aulas de producao que ja estavam no banco
// foram gravadas ANTES das regras de seguranca da FASE E. Se uma
// delas for reprovada agora, a FASE E introduziu uma regressao — e
// isso precisa aparecer, nao ser escondido.
//
// Nao chama IA. Nao escreve nada. So valida e reporta.
// ============================================================

import fs from 'node:fs';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const { validateLesson } = await import('../supabase/functions/_shared/schemas.js');

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess } = await cliente.auth.signInAnonymously();
const headers = { apikey: KEY, Authorization: `Bearer ${sess.session.access_token}` };

// O filtro like do PostgREST trata "|" como caractere especial, e a
// chave de cache tem varios. Buscar tudo e filtrar aqui e mais seguro.
const r = await fetch(`${BASE}/rest/v1/generated_lessons?select=cache_key,subject,topic,lesson_data&kind=eq.curriculum`, { headers });
const todas = await r.json();
const PRODUCAO = 'v2|p1-aulas-2026-09-30|';
const linhas = (Array.isArray(todas) ? todas : []).filter((l) => String(l.cache_key).startsWith(PRODUCAO));
const unicas = new Map();
for (const l of linhas) if (!unicas.has(l.cache_key)) unicas.set(l.cache_key, l);

console.log('='.repeat(70));
console.log('FASE E — validacao das aulas ja gravadas (regra nova de seguranca)');
console.log('='.repeat(70));
console.log(`  linhas no banco : ${linhas.length}`);
console.log(`  chaves unicas   : ${unicas.size}`);
console.log('');

let ok = 0; const reprovadas = [];
for (const [chave, l] of unicas) {
  const v = validateLesson(l.lesson_data, { subject: l.subject, topic: l.topic });
  const tag = `${l.subject} — ${l.topic}`.slice(0, 52);
  if (v.ok) { ok += 1; console.log(`  OK      ${tag}`); }
  else {
    reprovadas.push({ chave, tag, erros: v.errors });
    console.log(`  REPROV  ${tag}`);
    for (const e of v.errors.slice(0, 3)) console.log(`            ${e}`);
  }
}

console.log('');
console.log(`  aprovadas: ${ok}/${unicas.size}`);

fs.mkdirSync('.tmp-bench/fase-e', { recursive: true });
fs.writeFileSync('.tmp-bench/fase-e/validacao-existentes.json', JSON.stringify({ ok, reprovadas, total: unicas.size }, null, 2), 'utf8');

if (reprovadas.length) {
  console.log('\n  ATENCAO: alguma aula ja gravada foi reprovada pela regra nova.');
  console.log('  Se o motivo for seguranca (segredo/instrucao), a regra funcionou.');
  console.log('  Se o motivo for texto/tamanho, e REGRESSAO da FASE E.');
} else {
  console.log('\n  Nenhuma regressao: as aulas existentes passam nas regras novas.');
}
