// ============================================================
// Descarrega as 25 aulas do backup para .tmp-aulas-antigas.json.
// O tools/auditar-validate.mjs usa esse arquivo para rodar o
// validateLesson() novo contra o conteudo antigo.
//
// Uso: node tools/dump-aulas-antigas.mjs
// ============================================================

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data, error } = await cliente.auth.signInAnonymously();
if (error || !data?.session) throw new Error(error?.message ?? 'sem sessao anonima');

const { data: linhas, error: erroLeitura } = await cliente
  .from('lesson_audit_backup')
  .select('subject,topic,model,lesson_data')
  .limit(50);

if (erroLeitura) throw new Error(erroLeitura.message);
if (!linhas?.length) {
  console.log('Nenhuma aula no backup (rode o INSERT antes).');
  process.exit(1);
}

const dump = linhas.map((x) => ({
  subject: x.subject,
  topic: x.topic,
  model: x.model,
  // Os objetivos servem de "subtopicos" aproximados para o teste de
  // topic alignment (as aulas antigas nao gravavam os subtopicos).
  subtopics: Array.isArray(x.lesson_data?.objectives) ? x.lesson_data.objectives : [],
  lesson_data: x.lesson_data,
}));

fs.writeFileSync('.tmp-aulas-antigas.json', JSON.stringify(dump, null, 2));
console.log(`Aulas salvas em .tmp-aulas-antigas.json: ${dump.length}`);
dump.forEach((d) => console.log(`  - ${d.subject} / ${d.topic} (${d.model})`));