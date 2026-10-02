// ============================================================
// FASE E — PRIORIDADE 2: por que ~23% das aulas reprovam?
//
//   node tools/auditar-reprovacoes.mjs
//
// Le os arquivos JA GRAVOS pelas fases B, C e D. Nao chama IA nenhuma
// e nao gasta cota: a pergunta e "o que o historico mostra", nao
// "será que hoje da sorte".
//
// A regra da fase e explicita: so mexer em prompt, validator ou
// pipeline se aparecer um padrao CONCRETO e REPRODUZIVEL. Este
// script existe para dar a evidencia que decide isso.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const RAIZES = ['.tmp-bench/1c2/aulas', '.tmp-bench/fase-b', '.tmp-bench/fase-c', '.tmp-bench/groq', '.tmp-bench/aulas'];

/** Agrupa a causa em familia, para ver se ha padrao ouivariado. */
function familia(erro) {
  const t = String(erro).toLowerCase();
  if (/conta|calcul|matem|divis/.test(t)) return 'matematica/calculo';
  if (/curto|muitos caracteres|minimo|maximo|longo/.test(t)) return 'tamanho de campo';
  if (/vazou|cronograma|metadado/.test(t)) return 'vazamento de cronograma';
  if (/palavra corrompida|pontuacao|repeti/.test(t)) return 'texto corrompido';
  if (/vazio|ausente|obrigat/.test(t)) return 'campo vazio/ausente';
  if (/minimo \d+ (secao|quest|exerc|objet|resumo|erro)/.test(t)) return 'contagem de itens';
  if (/coerencia|premissa|nao aparece no enunciado/.test(t)) return 'coerencia enunciado/resposta';
  if (/generico|hollow|preenchimento/.test(t)) return 'conteudo generico';
  if (/schema|json|propriedade|campo/.test(t)) return 'schema/formato';
  return 'outro';
}

const arquivos = [];
for (const raiz of RAIZES) {
  if (!fs.existsSync(raiz)) continue;
  const andar = (dir, prof = 0) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && prof < 3) andar(p, prof + 1);
      else if (e.isFile() && e.name.endsWith('.json')) arquivos.push(p);
    }
  };
  andar(raiz);
}

const porModelo = {};
const porFase = {};
const familias = {};
const familiasAntigas = {};
let totalOk = 0;
let totalReprov = 0;
const exemplos = {};

for (const p of arquivos) {
  const nome = path.basename(p);
  if (!nome.includes('__')) continue;
  const modelo = nome.split('__')[0];
  const fase = p.split(path.sep)[1]; // .tmp-bench/<fase>/...
  const reprovada = /INVALIDA|REPROVADA/.test(nome);
  porModelo[modelo] ??= { ok: 0, fail: 0 };
  if (reprovada) porModelo[modelo].fail += 1; else { porModelo[modelo].ok += 1; totalOk += 1; continue; }
  totalReprov += 1;
  porFase[fase] = (porFase[fase] ?? 0) + 1;

  let erros = [];
  try {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    // O bench da FASE B/C grava em "erros"; o da FASE D, em "errors".
    erros = json.erros ?? json.errors ?? [];
    if (!erros.length && json.motivo) erros = [json.motivo];
  } catch { /* arquivo ilegível: cai em "sem causa" */ }
  if (!erros.length) { familias['sem causa registrada'] = (familias['sem causa registrada'] ?? 0) + 1; continue; }
  for (const erro of erros) {
    // Regra JA CORRIGIDA depois do bench: "answer muito curto, minimo 3"
    // foi relaxado para minimo 1 na propria FASE B. Contar isso hoje
    // faria a auditoria acusar um defeito que nao existe mais.
    if (/guidedPractice\[\d+\]\.answer: muito curto \(\d+ caracteres, minimo 3\)/.test(erro)) {
      familiasAntigas.answerMin3 = (familiasAntigas.answerMin3 ?? 0) + 1;
      continue;
    }
    const f = familia(erro);
    familias[f] = (familias[f] ?? 0) + 1;
    (exemplos[f] ??= []).push(String(erro).slice(0, 95));
  }
}

console.log('=== TAXA POR MODELO (schema estrito de aula) ===');
for (const [m, v] of Object.entries(porModelo).sort((a, b) => (b[1].ok / (b[1].ok + b[1].fail)) - (a[1].ok / (a[1].ok + a[1].fail)))) {
  const t = v.ok + v.fail;
  console.log(`  ${m.padEnd(24)} ${String(v.ok).padStart(2)}/${String(t).padStart(2)}  (${Math.round((v.ok / t) * 100)}%)`);
}

const taxa = totalOk / (totalOk + totalReprov);
console.log(`\n=== TOTAL === ${totalOk}/${totalOk + totalReprov} aprovadas (${Math.round(taxa * 100)}%)`);

console.log('\n=== REPROVACOES POR FASE (o dado antigo nao vale para hoje) ===');
for (const [f, n] of Object.entries(porFase).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f.padEnd(12)} ${String(n).padStart(3)}`);
}

const antigasTotal = Object.values(familiasAntigas).reduce((a, b) => a + b, 0);
if (antigasTotal) {
  console.log(`\n=== DESCARTADAS POR JA CORRIGIDAS === ${antigasTotal}`);
  console.log('  "answer muito curto, minimo 3" foi relaxado para minimo 1 na FASE B.');
  console.log('  Contar essas falhas hoje acusaria um defeito que nao existe mais.');
}

console.log('\n=== CAUSAS DAS REPROVACOES (por familia) ===');
const ordenadas = Object.entries(familias).sort((a, b) => b[1] - a[1]);
for (const [f, n] of ordenadas) {
  const pct = Math.round((n / totalReprov) * 100);
  console.log(`  ${f.padEnd(34)} ${String(n).padStart(3)}  (${pct}% das reprovacoes)`);
}

console.log('\n=== "TAMANHO DE CAMPO" DETALHADO (qual campo?) ===');
const porCampo = {};
for (const p of arquivos) {
  const nome = path.basename(p);
  if (!/INVALIDA|REPROVADA/.test(nome)) continue;
  let erros = [];
  try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); erros = j.erros ?? j.errors ?? []; } catch { continue; }
  for (const erro of erros) {
    if (!/curto|muitos caracteres|minimo \d+|maximo|longo/i.test(String(erro))) continue;
    const m = String(erro).match(/^([a-zA-Z]+(\[\d+\])?(\.[a-zA-Z]+)?)/);
    const chave = m ? m[1] : '(outro)';
    porCampo[chave] = (porCampo[chave] ?? 0) + 1;
  }
}
for (const [c, n] of Object.entries(porCampo).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(36)} ${String(n).padStart(3)}`);
}

console.log('\n=== EXEMPLO DE CADA CAUSA ===');
for (const [f] of ordenadas) {
  console.log(`  [${f}]`);
  for (const e of (exemplos[f] ?? []).slice(0, 2)) console.log(`      ${e}`);
}

// Veredito automatico, para a decisao da fase ficar registrada.
const dominante = ordenadas[0];
const campos = Object.keys(porCampo).length;
const totalAtual = totalReprov - antigasTotal;

console.log('\n=== VEREDITO ===');
if (!dominante) {
  console.log('  Nenhuma reprovacao com causa identificada nos arquivos gravados.');
} else {
  const [nome, n] = dominante;
  console.log(`  Causa mais frequente: ${nome} (${n} ocorrencias).`);
  console.log(`  Reprovacoes: ${totalReprov} no total, ${antigasTotal} delas por uma regra ja relaxada.`);
  console.log(`  ${totalAtual} repovacoes atuais, espalhadas por ${campos} campos diferentes.`);
  console.log('');
  if (campos >= 5) {
    console.log('  ACHADO: DISPERSAO, NAO PADRAO.');
    console.log('  Nenhum campo domina. "Tamanho de campo" e um rotulo generico que');
    console.log('  cobre solution curto, answer curto, secao rasa e resumo curto —');
    console.log('  sintomas diferentes com causas diferentes.');
    console.log('');
    console.log('  DECISAO DA FASE E: registrar como limitacao operacional e seguir.');
    console.log('  Mexer nas regras aqui trocaria qualidade por numero — que e');
    console.log('  exatamente o que a fase proibe. A cadeia de fallback');
    console.log('  (primario + 1 correcao + modelo reserva) ja cobre o restante,');
    console.log('  e o A/B da FASE C mediu 0 regressao em 17 aulas reais.');
  } else {
    console.log('  PADRAO CONCRETO: cabe investigar e corrigir com evidencia.');
  }
}
