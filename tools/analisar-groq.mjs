// ============================================================
// FASE 1D — analise dos resultados do benchmark Groq.
// Le .tmp-bench/groq/{aulas,quizzes}.json e as saidas completas.
// Separa DADOS OBSERVADOS de INTERPRETAÇÃO. Sem nota de 0 a 100.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, '.tmp-bench', 'groq');

const ler = (n) => {
  const p = path.join(SAIDA, n);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const aulaDe = (modelo, r, sub = 'aulas') => {
  const arqs = fs.existsSync(path.join(SAIDA, sub))
    ? fs.readdirSync(path.join(SAIDA, sub))
    : [];
  const achado = arqs.find((f) => f.startsWith(`${modelo.replace(/\//g, '_')}__${r.temaSlug ?? slugTema(r)}__r${r.run}`) && !f.includes('INVALIDA'));
  if (!achado) return null;
  const d = JSON.parse(fs.readFileSync(path.join(SAIDA, sub, achado), 'utf8'));
  return d.aula ?? d.quiz ?? null;
};
const slugTema = (r) => `${r.materia}-${r.topico}`
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

const mediana = (v) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const ms = (v) => (v == null ? '-' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`);

function secaoAulas(rows) {
  if (!rows?.length) return console.log('\nsem dados de aulas.\n');
  const modelos = [...new Set(rows.map((r) => r.modelo))].sort();

  console.log('\n============================================================');
  console.log(' AULAS — DADOS OBSERVADOS');
  console.log('============================================================');
  console.log('modelo                  tent  ok  validas  1a_tent  med    min   max   retries  tokens_med');
  for (const m of modelos) {
    const rs = rows.filter((r) => r.modelo === m);
    const ok = rs.filter((r) => r.ok).length;
    const val = rs.filter((r) => r.validate_ok).length;
    const val1 = rs.filter((r) => r.validate_ok_1a).length;
    const lat = rs.filter((r) => r.ms).map((r) => r.ms);
    const retries = rs.reduce((n, r) => n + (r.retries ?? 0), 0);
    const tok = rs.filter((r) => r.usage?.total).map((r) => r.usage.total);
    console.log(`${m.padEnd(23)} ${String(rs.length).padStart(4)} ${String(ok).padStart(3)} ${String(val).padStart(8)}`
      + ` ${String(val1).padStart(8)} ${ms(mediana(lat)).padStart(6)} ${ms(Math.min(...(lat.length ? lat : [0]))).padStart(6)}`
      + ` ${ms(Math.max(...(lat.length ? lat : [0]))).padStart(6)} ${String(retries).padStart(8)} ${String(mediana(tok) ?? '-').padStart(11)}`);
  }
  console.log('\n1a_tent = passou no validateLesson ja na PRIMEIRA chamada, sem correcao');

  // ---- Causa das falhas, separada por tipo ----
  console.log('\n--- causa das falhas (provider, cota e modelo sao coisas diferentes) ---');
  console.log('modelo                  ok  schema_err  json_err  rate_lim  timeout  validate_err  trunc');
  for (const m of modelos) {
    const rs = rows.filter((r) => r.modelo === m);
    const c = (k) => rs.filter((r) => r.error_kind === k).length;
    console.log(`${m.padEnd(23)} ${String(rs.filter((r) => r.ok).length).padStart(2)} ${String(c('schema_error')).padStart(11)}`
      + ` ${String(c('json_error')).padStart(9)} ${String(c('rate_limit')).padStart(9)} ${String(c('timeout')).padStart(8)}`
      + ` ${String(rs.filter((r) => r.ok && !r.validate_ok).length).padStart(14)} ${String(rs.filter((r) => r.truncado).length).padStart(6)}`);
  }

  // ---- Quality ----
  console.log('\n--- estrutura das aulas VALIDAS (medias) ---');
  console.log('modelo                   n  sec  ex  exer  err  res  obj  medExpl  chars');
  for (const m of modelos) {
    const validas = rows.filter((r) => r.modelo === m && r.validate_ok && r.metricas);
    if (!validas.length) continue;
    const med = (f) => Math.round(validas.reduce((n, r) => n + f(r.metricas), 0) / validas.length);
    console.log(`${m.padEnd(23)} ${String(validas.length).padStart(2)} ${String(med((x) => x.secoes)).padStart(4)}`
      + ` ${String(med((x) => x.exemplos)).padStart(3)} ${String(med((x) => x.exercicios)).padStart(5)}`
      + ` ${String(med((x) => x.errosComuns)).padStart(4)} ${String(med((x) => x.resumo)).padStart(4)}`
      + ` ${String(med((x) => x.objetivos)).padStart(4)} ${String(med((x) => x.mediaExplicacao)).padStart(7)} ${String(med((x) => x.charsTotal)).padStart(7)}`);
  }

  // ---- Why validate rejected ----
  console.log('\n--- POR QUE o validateLesson reprovou (motivo real, agrupado) ---');
  const motivos = new Map();
  for (const r of rows.filter((x) => x.ok && !x.validate_ok)) {
    for (const e of r.validate_errors ?? []) {
      const chave = e.replace(/\[[\d]+\]/g, '[i]').replace(/\(\d+ caracteres[^)]*\)/g, '(N caracteres)').replace(/minimo \d+/g, 'minimo M').replace(/maximo \d+/g, 'maximo M');
      motivos.set(chave, (motivos.get(chave) ?? 0) + 1);
    }
  }
  if (!motivos.size) console.log('  (nenhuma rejeicao)');
  for (const [k, n] of [...motivos.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}x  ${k}`);
  }
  console.log('\nATENCAO: "muito curto/longo" e limite de CARACTERES do validador,');
  console.log('nao erro de conteudo. A aula pode estar boa e reprovar por isso.');
}

const aulas = ler('aulas.json');
secaoAulas(aulas);
// ---- Pistas factuais: NAO e fact-check, so pontos para o olho humano.
console.log('\n--- PISTAS DE ERRO FACTUAL (padroes ja vistos; NAO e fact-check) ---');
console.log('modelo                  n  pistas  detalhe');
for (const m of [...new Set((aulas ?? []).map((r) => r.modelo))].sort()) {
  const validas = (aulas ?? []).filter((r) => r.modelo === m && r.validate_ok);
  const linhas = [];
  for (const r of validas) {
    const t = aulaDe(m, r);
    if (!t) continue;
    const s = JSON.stringify(t);
    const achados = [];
    if (/g[aá]s carbonico[^.]{0,40}formado[^.]{0,40}nitrog[eê]nio/i.test(s)) achados.push('CO2 formado de nitrogenio');
    if (/todo[^.]{0,20}g[aá]s[^.]{0,30}e[lí]quido na temperatura ambiente/i.test(s)) achados.push('gas=liquido ambiente');
    if (/polite[ií]smo[^.]{0,60}(mumifica|pir[aâ]mide)/i.test(s)) achados.push('politeismo>mumificacao/piramide');
    if (/mumifica[^.]{0,40}(polite[ií]smo|v[aá]rios deuses)/i.test(s)) achados.push('mumificacao por politeismo');
    if (/vapor d[^áa]gua[^.]{0,30}s[oó]lido/i.test(s)) achados.push('vapor=solido');
    if (/\b0\s*[÷x×]\s*0\s*=\s*0?\d/.test(s)) achados.push('divisao por zero');
    if (achados.length) linhas.push(`      ${r.temaSlug ?? slugTema(r)} r${r.run}: ${achados.join(' | ')}`);
  }
  console.log(`${m.padEnd(23)} ${String(validas.length).padStart(2)} ${String(linhas.length).padStart(7)}`);
  for (const l of linhas) console.log(l);
  if (!linhas.length) console.log('      (nenhuma pista — revisar o texto a mao)');
}

// ============================================================
// QUIZZES
// ============================================================
function secaoQuizzes(rows) {
  if (!rows?.length) return console.log('\nsem dados de quizzes.\n');
  const modelos = [...new Set(rows.map((r) => r.modelo))].sort();
  console.log('\n============================================================');
  console.log(' QUIZZES — DADOS OBSERVADOS');
  console.log('============================================================');
  console.log('modelo                  tent  ok  validos  med    min   max   retries  tokens_med');
  for (const m of modelos) {
    const rs = rows.filter((r) => r.modelo === m);
    const ok = rs.filter((r) => r.ok).length;
    const val = rs.filter((r) => r.validate_ok).length;
    const lat = rs.filter((r) => r.ms).map((r) => r.ms);
    const retries = rs.reduce((n, r) => n + (r.retries ?? 0), 0);
    const tok = rs.filter((r) => r.usage?.total).map((r) => r.usage.total);
    console.log(`${m.padEnd(23)} ${String(rs.length).padStart(4)} ${String(ok).padStart(3)} ${String(val).padStart(8)}`
      + ` ${ms(mediana(lat)).padStart(6)} ${ms(Math.min(...(lat.length ? lat : [0]))).padStart(6)}`
      + ` ${ms(Math.max(...(lat.length ? lat : [0]))).padStart(6)} ${String(retries).padStart(8)} ${String(mediana(tok) ?? '-').padStart(11)}`);
  }

  console.log('\n--- estrutura dos quizzes VALIDOS ---');
  console.log('modelo                   n  q  alt_med  comExp  comSkill  niveis');
  for (const m of modelos) {
    const v = rows.filter((r) => r.modelo === m && r.validate_ok && r.metricas);
    if (!v.length) continue;
    const med = (f) => Math.round(v.reduce((n, r) => n + f(r.metricas), 0) / v.length);
    const niveis = [...new Set(v.flatMap((r) => r.metricas.niveis ?? []))].sort().join('/');
    console.log(`${m.padEnd(23)} ${String(v.length).padStart(2)} ${String(med((x) => x.questoes)).padStart(2)}`
      + ` ${String(med((x) => x.alternativasMedias)).padStart(8)} ${String(med((x) => x.comExplicacao)).padStart(7)}`
      + ` ${String(med((x) => x.comSkill)).padStart(9)}  ${niveis}`);
  }

  console.log('\n--- POR QUE o validateQuiz reprovou ---');
  const motivos = new Map();
  for (const r of rows.filter((x) => x.ok && !x.validate_ok)) {
    for (const e of r.validate_errors ?? []) {
      const chave = e.replace(/questions\[\d+\]/g, 'questions[i]').replace(/\(\d+ caracteres[^)]*\)/g, '(N caracteres)');
      motivos.set(chave, (motivos.get(chave) ?? 0) + 1);
    }
  }
  if (!motivos.size) console.log('  (nenhuma rejeicao)');
  for (const [k, n] of [...motivos.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x  ${k}`);
}

secaoQuizzes(ler('quizzes.json'));

console.log('\n============================================================');
console.log(' Os arquivos com as saidas completas estao em .tmp-bench/groq/');
console.log(' A leitura fina de conteudo continua sendo humana.');
console.log('============================================================');