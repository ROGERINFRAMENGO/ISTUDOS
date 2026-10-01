// ============================================================
// Mostra o texto exato que disparou cada defeito.
// Existe porque "placeholder" e "metadado" apareceram na auditoria
// das 4 aulas e nao da para reportar defeito sem ver a frase.
//
// Uso: node tools/ver-defeitos.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
await cliente.auth.signInAnonymously();
const { data, error } = await cliente
  .from('app_state').select('data').eq('id', 'principal').single();
if (error) throw error;
const aiCache = data.data?.sections?.aiCache ?? {};

const PLACEHOLDER = /\bTODO\b|placeholder|cole aqui/i;
const AGENDA = /semana\s+\d|bloco\s+\d|\d+\s*minutos?/i;

for (const [chave, v] of Object.entries(aiCache)) {
  const aula = v?.lesson ?? {};
  const campos = [
    ['introduction', aula.introduction],
    ...(aula.sections ?? []).flatMap((s) => [
      [`secao "${s.title}"`, s.explanation],
      ...(s.examples ?? []).flatMap((e) => [
        [`secao "${s.title}" > exemplo.problem`, e.problem],
        [`secao "${s.title}" > exemplo.solution`, e.solution],
        [`secao "${s.title}" > exemplo.explanation`, e.explanation],
      ]),
    ]),
    ...(aula.guidedPractice ?? []).flatMap((g) => [
      ['exercicio.question', g.question],
      ['exercicio.answer', g.answer],
      ['exercicio.explanation', g.explanation],
    ]),
    ...(aula.commonMistakes ?? []).map((t, i) => [`erroComum[${i}]`, t]),
    ...(aula.summary ?? []).map((t, i) => [`resumo[${i}]`, t]),
  ];

  const achados = [];
  for (const [campo, texto] of campos) {
    const t = String(texto ?? '');
    if (!t) continue;
    for (const re of [PLACEHOLDER, AGENDA]) {
      const m = t.match(re);
      if (!m) continue;
      const i = t.indexOf(m[0]);
      achados.push({
        topico: aula.topic,
        p1: chave.includes('p1-aulas-2026-09-30'),
        tipo: re === PLACEHOLDER ? 'PLACEHOLDER' : 'AGENDA',
        campo,
        trecho: t.slice(Math.max(0, i - 90), i + m[0].length + 90).replace(/\n/g, ' '),
      });
    }
  }

  achados.forEach((a) => {
    console.log(`\n[${a.p1 ? 'P1' : 'ANTIGA'}] ${a.topico} — ${a.tipo}`);
    console.log(`  campo: ${a.campo}`);
    console.log(`  ...${a.trecho}...`);
  });
}

console.log('\n(nada acima = nenhuma ocorrencia)');