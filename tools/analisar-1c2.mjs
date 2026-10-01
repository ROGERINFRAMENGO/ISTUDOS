// ============================================================
// FASE 1C.2 - analisa os resultados do benchmark.
// ------------------------------------------------------------
// Le .tmp-bench/1c2/resultados.json e as aulas salvas, e produz:
//   1. estabilidade / latencia / truncamento
//   2. causa das falhas, SEPARADA por tipo
//   3. estrutura e pedagogia (contagens observadas)
//   4. varredura de PISTAS de erro factual (NAO e fact-check)
//   5. comparacao lado a lado por tema
//
// REGRA: nada de nota de 0 a 100 sem justificativa. Os numeros aqui
// sao contagens observadas; a leitura de conteudo continua humana.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, '.tmp-bench', '1c2');
const DIR_AULAS = path.join(SAIDA, 'aulas');
const ARQ = path.join(SAIDA, 'resultados.json');

if (!fs.existsSync(ARQ)) {
  console.error('sem resultados.json — rode antes: node tools/bench-1c2.mjs');
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(ARQ, 'utf8'));

// ---------- estatisticas ----------
const mediana = (v) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const media = (v) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const min = (v) => (v.length ? Math.min(...v) : null);
const max = (v) => (v.length ? Math.max(...v) : null);
const ms = (v) => (v == null ? '-' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`);

const ORDEM = ['nvidia-diffusion', 'nvidia-muse', 'gemini-low', 'gemini-medium'];
const porConfig = (id) => rows.filter((r) => r.config === id);

function aulaDe(id, r) {
  const f = path.join(DIR_AULAS, `${id}__${r.temaSlug}__r${r.run}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8')).lesson;
}

// ============================================================
// 1. ESTABILIDADE / LATENCIA / TRUNCAMENTO
// ============================================================
console.log('\n============================================================');
console.log(' 1. ESTABILIDADE / LATENCIA / TRUNCAMENTO');
console.log('============================================================');
console.log('config           tent  ok validas retries  med   min   max  429 503  trunc');

const est = {};
for (const id of ORDEM) {
  const rs = porConfig(id);
  if (!rs.length) continue;
  const ok = rs.filter((r) => r.ok).length;
  const validas = rs.filter((r) => r.validate_ok).length;
  const lat = rs.filter((r) => r.ms).map((r) => r.ms);
  const tries = rs.reduce((n, r) => n + (r.retries || 0), 0);
  est[id] = {
    tent: rs.length, ok, validas, tries,
    e429: rs.filter((r) => r.provider_error === 'cota_429').length,
    e503: rs.filter((r) => r.provider_error === 'demanda_503').length,
    trunc: rs.filter((r) => r.truncado).length,
    lat,
  };
  console.log(
    `${id.padEnd(16)} ${String(rs.length).padStart(4)} ${String(ok).padStart(3)} ${String(validas).padStart(7)}`
    + ` ${String(tries).padStart(7)} ${ms(mediana(lat)).padStart(5)} ${ms(min(lat)).padStart(5)} ${ms(max(lat)).padStart(5)}`
    + ` ${String(est[id].e429).padStart(4)} ${String(est[id].e503).padStart(3)} ${String(est[id].trunc).padStart(6)}`,
  );
}
console.log('\n(latencia = ponta a ponta, ja incluindo os retries)');

// ============================================================
// 2. CAUSA DAS FALHAS — o ponto que mais importa.
// provider_error e do provider; model_output_error e do modelo;
// validate_error e da forma/conteudo. Misturar os tres mascara o
// problema e faz parecer "modelo ruim" o que era provider instavel.
// ============================================================
console.log('\n============================================================');
console.log(' 2. CAUSA DAS FALHAS (separadas de proposito)');
console.log('============================================================');
console.log('config            ok  json_inval   vazio  validate_err  sem_resposta   rede');

for (const id of ORDEM) {
  const rs = porConfig(id);
  if (!rs.length) continue;
  const c = {
    ok: rs.filter((r) => r.ok).length,
    json: rs.filter((r) => r.model_output_error === 'json_invalido').length,
    vazio: rs.filter((r) => r.model_output_error === 'vazio').length,
    inval: rs.filter((r) => r.ok && !r.validate_ok).length,
    // Corpo vazio / sem status: o gateway cortou a requisicao (150s) ou a
    // funcao morreu antes do handler. NAO e do modelo.
    semResposta: rs.filter((r) => !r.ok && !r.provider_error && !r.model_output_error).length,
    rede: rs.filter((r) => r.provider_error === 'rede').length,
  };
  console.log(`${id.padEnd(16)} ${String(c.ok).padStart(2)} ${String(c.json).padStart(11)} ${String(c.vazio).padStart(6)}`
    + ` ${String(c.inval).padStart(14)} ${String(c.semResposta).padStart(13)} ${String(c.rede).padStart(5)}`);
}
console.log('\nok             = chegou e virou objeto JSON');
console.log('json_inval     = chegou mas nao parseou (truncamento na pratica)');
console.log('validate_err   = parseou, mas validateLesson() reprovou');
console.log('sem_resposta   = resposta vazia: gateway cortou OU chamada estourou o limite');
console.log('                do provedor (NUNCA e culpa do modelo)');
console.log('rede           = falha de conexao');
// ============================================================
// 3. ESTRUTURA E PEDAGOGIA (contagens observadas)
// ============================================================
console.log('\n============================================================');
console.log(' 3. ESTRUTURA E PEDAGOGIA (medias das aulas VALIDAS)');
console.log('============================================================');
console.log('config           n  sec  ex  exer erros res obj  medExpl minExpl  chars');

const qual = {};
for (const id of ORDEM) {
  const validas = porConfig(id).filter((r) => r.validate_ok && r.metricas);
  if (!validas.length) continue;
  const med = (fn) => media(validas.map((r) => fn(r.metricas)));
  const aulas = validas.map((r) => aulaDe(id, r)).filter(Boolean);
  const txt = (t) => JSON.stringify(t);
  const q = {
    n: validas.length,
    etec: aulas.filter((t) => /\betec\b/i.test(txt(t))).length,
    recognizesQuestao: aulas.filter((t) => /\b(enunciado|quest[aã]o|prova)\b/i.test(txt(t))).length,
    porQue: aulas.filter((t) => /\bpor qu[eê]\b/i.test(txt(t))).length,
    generico: aulas.filter((t) => /\b(em resumo.{0,20}podemos dizer)\b/i.test(txt(t))).length,
    vazamento: aulas.filter((t) => /\b(semana \d|bloco \d|\d+ minutos|revis[aã]o amanh[aã])\b/i.test(txt(t))).length,
  };
  qual[id] = q;
  console.log(
    `${id.padEnd(16)} ${String(q.n).padStart(2)} ${String(med((m) => m.secoes)).padStart(4)}`
    + ` ${String(med((m) => m.exemplos)).padStart(3)} ${String(med((m) => m.exercicios)).padStart(4)}`
    + ` ${String(med((m) => m.errosComuns)).padStart(5)} ${String(med((m) => m.resumo)).padStart(3)}`
    + ` ${String(med((m) => m.objetivos)).padStart(3)} ${String(med((m) => m.mediaExplicacao)).padStart(7)}`
    + ` ${String(med((m) => m.menorExplicacao)).padStart(7)} ${String(med((m) => m.charsTotal)).padStart(6)}`,
  );
}

console.log('\n--- marcadores pedagogicos pedidos pela P1A (aulas que contem / total) ---');
console.log('config           Etec  "por que"  enunciado/questao  generico  vazamento');
for (const id of ORDEM) {
  const q = qual[id];
  if (!q) continue;
  console.log(`${id.padEnd(16)} ${String(`${q.etec}/${q.n}`).padStart(5)} ${String(`${q.porQue}/${q.n}`).padStart(10)}`
    + ` ${String(`${q.recognizesQuestao}/${q.n}`).padStart(18)} ${String(q.generico).padStart(9)} ${String(q.vazamento).padStart(10)}`);
}
console.log('\nEtec   = cita a Etec (exigido pela P1A)');
console.log('vazamento = vazou metadado de cronograma (PROIBIDO pela P1A)');
console.log('chars = volume do JSON. NAO e medida de qualidade.');

// ============================================================
// 4. PISTAS DE ERRO FACTUAL
// ------------------------------------------------------------
// IMPORTANTE: isto NAO e fact-check. Sao padroes que historicamente
//_rsaram erro. Um padrao detectado e um ponto para o olho humano;
// a ausencia dele NAO prova que a aula esta correta.
// ============================================================
console.log('\n============================================================');
console.log(' 4. PISTAS DE ERRO FACTUAL (NAO e fact-check)');
console.log('============================================================');
console.log('config           n  pistas  detalhe das pistas');

for (const id of ORDEM) {
  const validas = porConfig(id).filter((r) => r.validate_ok);
  const linhas = [];
  for (const r of validas) {
    const t = aulaDe(id, r);
    if (!t) continue;
    const s = JSON.stringify(t);
    // Padroes que ja apareceram em erro real (o caso do CO2, por exemplo).
    const achados = [];
    if (/g[aá]s carbonico[^.]{0,40}formado[^.]{0,40}nitrog[eê]nio/i.test(s)) achados.push('CO2 formado de nitrogenio');
    if (/todo[^.]{0,20}g[aá]s[^.]{0,30}e[lí]quido na temperatura ambiente/i.test(s)) achados.push('gas=liquido ambiente');
    if (/Egipto[^.]{0,60}Tigre|c[aá]nas do[^.]{0,20}Egito/i.test(s)) achados.push('rio errado no Egito');
    if (/vapor d[^áa]gua[^.]{0,30}s[oó]lido/i.test(s)) achados.push('vapor=solido');
    if (/0\s*[÷x]\s*0\s*=/.test(s)) achados.push('divisao por zero com resposta');
    if (achados.length) linhas.push(`      ${r.temaSlug} r${r.run}: ${achados.join(' | ')}`);
  }
  console.log(`${id.padEnd(16)} ${String(validas.length).padStart(2)} ${String(linhas.length).padStart(7)}`);
  for (const l of linhas) console.log(l);
  if (!linhas.length) console.log('      (nenhuma pista automatica — revisar o texto a mao)');
}
// ============================================================
// 5. COMPARACAO LADO A LADO POR TEMA
// ------------------------------------------------------------
// Mostra um trecho real de cada config no MESMO tema, para a leitura
// humana. Nao escolhe vencedor: mostra o texto.
// ============================================================
console.log('\n============================================================');
console.log(' 5. COMPARACAO LADO A LADO (trechos reais do mesmo tema)');
console.log('============================================================');

const temasPresentes = [...new Set(rows.filter((r) => r.validate_ok).map((r) => r.temaSlug))];
for (const tema of temasPresentes) {
  console.log(`\n--- ${tema} ---`);
  for (const id of ORDEM) {
    const r = porConfig(id).find((x) => x.temaSlug === tema && x.validate_ok);
    const t = r ? aulaDe(id, r) : null;
    if (!t) { console.log(`  ${id.padEnd(17)} (sem aula valida)`); continue; }
    const sec0 = t.sections?.[0] ?? {};
    const ex0 = sec0.examples?.[0] ?? {};
    console.log(`  ${id.padEnd(17)} ${Math.round((r.ms ?? 0) / 1000)}s · ${r.metricas.secoes}sec ${r.metricas.exemplos}ex ${r.metricas.exercicios}exerc · finish=${r.finish}`);
    console.log(`      titulo     : ${String(t.title ?? '').slice(0, 100)}`);
    console.log(`      1a secao   : ${String(sec0.title ?? '').slice(0, 100)}`);
    console.log(`      explicacao : ${String(sec0.explanation ?? '').replace(/\s+/g, ' ').slice(0, 220)}...`);
    console.log(`      exemplo    : ${String(ex0.problem ?? '').replace(/\s+/g, ' ').slice(0, 150)}`);
    console.log(`      solucao    : ${String(ex0.solution ?? '').replace(/\s+/g, ' ').slice(0, 150)}`);
    console.log('');
  }
}

console.log('\n============================================================');
console.log(' FIM. Os arquivos com as aulas completas estao em');
console.log(' .tmp-bench/1c2/aulas/ — a leitura fina e humana.');
console.log('============================================================');
