// ============================================================
// Roda o NOVO validateLesson() contra as 25 aulas antigas.
// Serve para provar que a validação nova realmente pega os problemas
// que existem no banco (metadado, coerência, profundidade).
//
// Usa: node tools/auditar-validate.mjs
// ============================================================

import fs from 'node:fs';

const schemas = await import('../supabase/functions/_shared/schemas.js');
const { validateLesson } = schemas;

const dump = JSON.parse(fs.readFileSync('.tmp-aulas-antigas.json', 'utf8'));
console.log(`Aulas antigas carregadas: ${dump.length}\n`);

let aprovadas = 0;
const porAssunto = new Map();

for (const linha of dump) {
  const input = {
    subject: linha.subject,
    topic: linha.topic,
    subtopics: linha.subtopics ?? [],
    durationMinutes: 55,
  };
  const v = validateLesson(linha.lesson_data, input);
  const grupo = porAssunto.get(linha.subject) ?? { ok: 0, reprovadas: 0, motivos: new Map() };
  if (v.ok) {
    aprovadas += 1;
    grupo.ok += 1;
  } else {
    grupo.reprovadas += 1;
    for (const e of v.errors) {
      const chave = e.split(':').slice(1).join(':').replace(/\(.*?\)|".*?"|\d+/g, '').trim().slice(0, 52);
      grupo.motivos.set(chave, (grupo.motivos.get(chave) ?? 0) + 1);
    }
  }
  porAssunto.set(linha.subject, grupo);

  if (!v.ok && dump.length <= 30) {
    console.log(`[REPROVADA] ${linha.subject} / ${linha.topic} (${linha.model})`);
    v.errors.slice(0, 4).forEach((e) => console.log(`    - ${e.slice(0, 130)}`));
    if (v.errors.length > 4) console.log(`    ... +${v.errors.length - 4} outros`);
  }
}

console.log('\n=== RESUMO ===');
console.log(`aprovadas pela validacao nova: ${aprovadas}/${dump.length}`);
console.log('por materia:');
for (const [subject, g] of porAssunto) {
  console.log(`  ${subject}: ${g.ok} ok / ${g.reprovadas} reprovadas`);
  for (const [motivo, n] of [...g.motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`      ${String(n).padStart(2)}x ${motivo || '(sem motivo)'}`);
  }
}