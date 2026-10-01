// ============================================================
// Contexto real das ocorrencias "de de" numa aula.
// Existe porque o LIKE '%de de %' do Postgres sinalizou 2 casos,
// mas o validador JS (findDuplicatedWords) approve a aula. Alguem
// dos dois esta errado, e reportar defeito inexistente seria pior
// do que dejar passar um defeito real.
//
// Uso: node tools/ver-contexto-de-de.mjs
// ============================================================

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
await cliente.auth.signInAnonymously();
const { data, error } = await cliente
  .from('app_state').select('data').eq('id', 'principal').single();
if (error) throw error;

const aiCache = data.data?.sections?.aiCache ?? {};
const VERSION_P1 = 'p1-aulas-2026-09-30';

for (const [chave, v] of Object.entries(aiCache)) {
  if (!chave.includes(VERSION_P1)) continue;
  const aula = v?.lesson ?? {};
  const partes = [
    ['introduction', aula.introduction],
    ...(aula.sections ?? []).flatMap((s) => [
      [`sec:"${s.title}" explanation`, s.explanation],
      ...(s.examples ?? []).flatMap((e) => [
        [`sec:"${s.title}" exemplo.problem`, e.problem],
        [`sec:"${s.title}" exemplo.solution`, e.solution],
        [`sec:"${s.title}" exemplo.explanation`, e.explanation],
      ]),
    ]),
    ...(aula.guidedPractice ?? []).flatMap((g) => [
      ['exercicio.question', g.question],
      ['exercicio.answer', g.answer],
      ['exercicio.explanation', g.explanation],
    ]),
  ];

  for (const [campo, texto] of partes) {
    const t = String(texto ?? '');
    const re = /(de de|da da|do do|em em|no no|na na|com com)/gi;
    let m;
    while ((m = re.exec(t)) !== null) {
      const ini = Math.max(0, m.index - 55);
      const trecho = t.slice(ini, m.index + m[0].length + 55);
      console.log(`\n[${aula.topic}] ${campo}`);
      console.log(`  ...${trecho.replace(/\n/g, ' ')}...`);
    }
  }
}

console.log('\n(nada acima = nenhum "de de" em texto de campo; o LIKE do Postgres contava o JSON serializado)');