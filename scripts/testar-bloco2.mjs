// Testa o extractJson contra o defeito real do DiffusionGemma:
// ele fecha o objeto com `]}` e deixa uma aspa solta no fim.
import { extractJson } from "../deploy-src/generate-lesson/_nvidia.js";

const casos = [
  ['fecha normal', '{"title":"A","summary":["x","y"]}'],
  ['aspa solta no fim (defeito do DiffusionGemma)', '{"title":"A","summary":["x","y"]}"'],
  ['aspa solta + texto antes', 'Aqui esta a aula:\n{"title":"A","summary":["x","y"]}"'],
  ['fecha com ```json', '```json\n{"title":"A","summary":["x","y"]}\n```'],
  ['virgula sobrando', '{"title":"A","summary":["x","y"],}'],
  ['sem o ultimo }', '{"title":"A","summary":["x","y"]'],
  ['aspas escapadas dentro', '{"title":"A \\"citada\\"","summary":["x","y"]}'],
];

let passou = 0;
for (const [nome, entrada] of casos) {
  const r = extractJson(entrada);
  const ok = Boolean(r && typeof r === 'object' && r.title === 'A');
  if (ok) passou += 1;
  console.log(`${ok ? 'OK   ' : 'FALHA'} | ${nome} -> ${ok ? 'title=' + r.title : 'null'}`);
}
console.log(`\n${passou}/${casos.length} casos passaram`);
