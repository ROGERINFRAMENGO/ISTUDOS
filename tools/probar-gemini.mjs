// ============================================================
// FASE 1C.1 - chama a Edge Function gemini-probe e imprime o
// diagnostico das duas chaves Gemini.
//
// A chave NUNCA sai do servidor: a probe so devolve fingerprint e
// metadados. Este script apenas formata o que a probe respondeu.
//
// Uso: node tools/probar-gemini.mjs
// ============================================================
import fs from 'node:fs';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const ARQ = '.tmp-bench/gemini-probe.json';

if (!KEY) {
  console.error('Defina VITE_SUPABASE_PUBLISHABLE_KEY no ambiente.');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) throw eSess;

const r = await fetch(`${BASE}/functions/v1/gemini-probe`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: KEY,
    Authorization: `Bearer ${sess.session.access_token}`,
    Origin: 'https://rogerinframengo.github.io',
  },
  body: JSON.stringify(
    process.argv[2] === '--limites'
      ? { modo: 'limites', key: process.argv[3] || 'A', burst: Number(process.argv[4]) || 6 }
      : process.argv[2] === '--compartilhar'
        ? { modo: 'compartilhar', esgotar: process.argv[3] || 'A' }
        : {},
  ),
});

const texto = await r.text();
let dados;
try { dados = JSON.parse(texto); } catch { console.error('resposta nao-JSON:', texto.slice(0, 500)); process.exit(1); }

fs.mkdirSync('.tmp-bench', { recursive: true });
fs.writeFileSync(ARQ, JSON.stringify(dados, null, 2), 'utf8');

// Modo compartilhar: imprime o teste de cota compartilhada e sai.
if (dados.diag === 'gemini-probe/compartilhar') {
  console.log('\n===== A E B DIVIDEM A MESMA COTA? =====');
  console.log(`esgota a chave  : ${dados.esgotar} (a outra e ${dados.outra})`);
  console.log(`rajada         : ${dados.rajadaAlvo.map((r) => r.http).join(' -> ')}`);
  console.log(`${dados.esgotar} atingiu 429 : ${dados.alvo_atingiu_429}${dados.alvo_limite ? ` (limite=${dados.alvo_limite})` : ''}`);
  console.log(`${dados.outra} imediato #1 : http=${dados.outra_imediato_1.http} ${dados.outra_imediato_1.ms}ms`);
  console.log(`${dados.outra} imediato #2 : http=${dados.outra_imediato_2.http} ${dados.outra_imediato_2.ms}ms`);
  console.log(`${dados.outra} tambem 429  : ${dados.outra_tambem_429}`);
  console.log(`\nLEITURA: ${dados.leitura}`);
  process.exit(0);
}

// Modo limites: imprime o tier/limite e sai.
if (dados.diag === 'gemini-probe/limites') {
  console.log(`\n===== LIMITES DA CHAVE ${dados.chave} (rajada de ${dados.rajada}) =====`);
  console.log(`tier             : ${dados.tier}`);
  console.log(`limite declarado : ${dados.limiteDeclarado ?? '-'}`);
  console.log(`metrica de cota  : ${dados.metricaCota ?? '-'}`);
  console.log(`1o 429 na tentativa: ${dados.primeiro429NaTentativa ?? '-'}`);
  console.log(`retry em (s)     : ${dados.retryEmSegundos ?? '-'}`);
  for (const g of dados.registros) {
    console.log(`  #${g.n} http=${g.http} ${g.ms}ms ${g.finish ? `finish=${g.finish}` : ''} ${g.limite ? `limite=${g.limite} ` : ''}${g.erro ? g.erro.slice(0, 90) : ''}`);
  }
  process.exit(0);
}

const linha = (k) => `${k}:`;
for (const nome of ['A', 'B']) {
  const k = dados[nome];
  console.log(`\n===== CHAVE ${nome} =====`);
  if (!k?.configurada) { console.log('NAO CONFIGURADA'); continue; }
  console.log(`fingerprint   : ${k.fingerprint}  (len ${k.comprimento})`);
  console.log(`ListModels    : http ${k.modelos?.http} em ${k.modelos?.ms}ms · ${k.modelos?.total ?? '?'} modelos generativos`);
  console.log(`familias      : ${(k.modelos?.familias ?? []).join(', ') || '(nenhuma)'}`);
  console.log(`gemini-3.8-flash: ${k.modelos?.tem38 ? 'EXISTE' : 'NAO ESTA NA LISTA'}`);
  if (k.modelos?.lista38?.length) console.log(`  3.8 visiveis : ${k.modelos.lista38.join(', ')}`);
  const g38 = k.gerar38;
  if (g38) {
    console.log(`generate(3.8) : http ${g38.http} em ${g38.ms}ms finish=${g38.finish} jsonValido=${g38.jsonValido} chars=${g38.chars}`);
    console.log(`  tokens      : prompt=${g38.usage?.prompt ?? '-'} PENSAMENTO=${g38.usage?.thoughts ?? '-'} saida=${g38.usage?.candidates ?? '-'} total=${g38.usage?.total ?? '-'}`);
    if (g38.preview) console.log(`  preview     : ${g38.preview}`);
    if (g38.erro) console.log(`  erro        : ${g38.erro}`);
  } else {
    console.log('generate(3.8) : nao executado (modelo ausente)');
  }
  const aula = k.aulaSchema;
  if (aula) {
    console.log(`AULA COM SCHEMA: http ${aula.http} em ${aula.ms}ms finish=${aula.finish} jsonOk=${aula.jsonOk} chars=${aula.chars}`);
    if (aula.contagens) console.log(`  estrutura   : ${aula.contagens.sections} secoes · ${aula.contagens.examplesTotal} exemplos · ${aula.contagens.guidedPractice} pratica · ${aula.contagens.commonMistakes} erros comuns`);
    if (aula.faltando?.length) console.log(`  FALTANDO    : ${aula.faltando.join(', ')}`);
    console.log(`  tokens      : PENSAMENTO=${aula.usage?.thoughts ?? '-'} saida=${aula.usage?.candidates ?? '-'} total=${aula.usage?.total ?? '-'}`);
    if (aula.preview) console.log(`  preview     : ${aula.preview.slice(0, 160)}`);
    if (aula.erro) console.log(`  erro        : ${aula.erro}`);
  }
}

console.log('\n===== CONCLUSOES =====');
console.log(`mesmaChaveAB                 : ${dados.conclusoes?.mesmaChaveAB}`);
console.log(`B_igual_ChaveAntigaDoTutor   : ${dados.conclusoes?.B_igual_ChaveAntigaDoTutor}`);
console.log(`doisProjetosIndependentes    : ${dados.conclusoes?.haDoisProjetosIndependentes}`);
console.log(`\n(completo em ${ARQ})`);
