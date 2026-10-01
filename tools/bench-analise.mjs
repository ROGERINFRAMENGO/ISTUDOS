// ============================================================
// ANALISE DO BENCHMARK (P1B) — somente leitura.
// ------------------------------------------------------------
// Le .tmp-bench/resultados.json e as aulas salvas, e monta a
// comparacao. NAO chama nenhum modelo e NAO altera producao.
//
// A validade NAO e dada por nota: aqui rodamos as MESMAS heuristicas
// deterministicas da P1 (schemas.js) sobre cada aula salva, mais
// checagens factuais automaticas por topico. O resto e leitura
// manual das afirmacoes, feita no relatorio.
//
// Uso: node tools/bench-analise.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const SAIDA = '.tmp-bench';
const schemas = await import('../supabase/functions/_shared/schemas.js');
const { findScheduleLeak, findDuplicatedWords, findHollow } = schemas;

const dados = JSON.parse(fs.readFileSync(path.join(SAIDA, 'resultados.json'), 'utf8'));

// ---- Checagens factuais por topico -----------------------------
// Sao verificacoes DETERMINISTICAS e estreitas: cobrem poucos
// casos que sabemos estar errados (o CO2 do relatorio anterior,
// por exemplo). Nao provam que a aula inteira esta correta —
// o resto e leitura manual.
const FATOS = [
  {
    materia: 'Ciências',
    teste: (t) => {
      const erros = [];
      // CO2 e composto: nunca "substancia simples"/"elemento".
      if (/co2|dioxid[o]?\s+de\s+carbono/i.test(t)) {
        const trecho = (t.match(/.{90}dioxid[o]?\s+de\s+carbono.{90}/i) || [])[0] ?? '';
        if (/subst[âa]ncia simples|elemento qu[íi]mico|formado por um [úu]nico/i.test(trecho)) {
          erros.push('CO2 descrito como substância simples/elemento');
        }
      }
      // Agua (H2O) tambem e composta.
      if (/[áa]gua\s*\(\s*h2o\s*\)|h2o\s*[ée]\s*a\s*[áa]gua/i.test(t)) {
        const trecho = (t.match(/.{90}([áa]gua\s*\(\s*h2o\s*\)|h2o\s*[ée]\s*a\s*[áa]gua).{90}/i) || [])[0] ?? '';
        if (/subst[âa]ncia simples|elemento/i.test(trecho)) {
          erros.push('H2O descrito como substância simples');
        }
      }
      // Oxigenio e gas; nao pode ser solido/liquido na condicao ambiente.
      if (/oxig[êe]nio/i.test(t) && /oxig[êe]nio\s*[éee]\s*(um\s+)?(s[óo]lido|l[íi]quido)/i.test(t)) {
        erros.push('oxigênio descrito como sólido/líquido sem ressalva');
      }
      return erros;
    },
  },
  {
    materia: 'Geografia',
    teste: (t) => {
      const erros = [];
      // Polo Norte: 90N. Polo Sul: 90S. Equador: 0.
      if (/polo\s+norte/i.test(t) && /(polo\s+norte[^.]{0,60}\b90\s*s\b|lat[^.]{0,30}90)/i.test(t)) {
        erros.push('Polo Norte descrito com latitude 90 S');
      }
      if (/polo\s+sul/i.test(t) && /(polo\s+sul[^.]{0,60}\b90\s*n\b)/i.test(t)) {
        erros.push('Polo Sul descrito com latitude 90 N');
      }
      // Meridiano = longitude (0 a 180). Paralelo = latitude.
      if (/meridiano/i.test(t) && /meridiano[^.]{0,60}(mede|marca|a medida)[^.]{0,20}lat/i.test(t)) {
        erros.push('meridiano descrito como medida de latitude');
      }
      return erros;
    },
  },
  {
    materia: 'Matemática',
    teste: (t) => {
      const erros = [];
      // Dividir por zero nao existe.
      if (/divis[ãa]o|divide|divisor/i.test(t) && /divis[ãa]o\s+por\s+zero[^.]{0,40}(resulta|igual|define|poss[íi]vel)/i.test(t)) {
        erros.push('divisão por zero descrita como definida');
      }
      // Zero e o unico numero que nao e positivo nem negativo.
      if (/zero/i.test(t) && /zero\s*[ée]\s*(um\s+)?n[úu]mero\s+(positivo|negativo)/i.test(t)) {
        erros.push('zero descrito como positivo ou negativo');
      }
      return erros;
    },
  },
  {
    materia: 'História',
    teste: (t) => {
      const erros = [];
      // Mesopotamia: entre Tigre e Eufrates (nao Nile).
      if (/mesopot[âa]mia/i.test(t) && /mesopot[âa]mia[^.]{0,120}(rio\s+)?n[íi]l/i.test(t) && !/n[íi]l[^.]{0,60}egito/i.test(t)) {
        erros.push('Mesopotâmia associada ao rio Nilo');
      }
      return erros;
    },
  },
];

function checarFatos(materia, texto) {
  const alvo = FATOS.find((f) => f.materia === materia);
  return alvo ? alvo.teste(texto) : [];
}

function textoDaAula(aula) {
  return [
    aula.introduction,
    ...(aula.sections ?? []).map((s) => `${s.title} ${s.explanation}`),
    ...(aula.sections ?? []).flatMap((s) => (s.examples ?? []).flatMap((e) => [e.problem, e.solution, e.explanation])),
    ...(aula.guidedPractice ?? []).flatMap((g) => [g.question, g.answer, g.explanation]),
    ...(aula.commonMistakes ?? []),
    ...(aula.summary ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}
// ---- Revalida localmente cada aula salva ----------------------
for (const registro of dados) {
  registro.auditoria = null;
  if (!registro.ok || !registro.arquivo || !fs.existsSync(registro.arquivo)) continue;
  const aula = JSON.parse(fs.readFileSync(registro.arquivo, 'utf8'));
  const textos = [
    aula.introduction,
    ...(aula.sections ?? []).map((s) => `${s.title} ${s.explanation}`),
    ...(aula.sections ?? []).flatMap((s) => (s.examples ?? []).flatMap((e) => [e.problem, e.solution, e.explanation])),
    ...(aula.guidedPractice ?? []).flatMap((g) => [g.question, g.answer, g.explanation]),
    ...(aula.commonMistakes ?? []),
    ...(aula.summary ?? []),
  ].filter(Boolean);
  const problemas = [];
  const leak = findScheduleLeak(...textos);
  if (leak) problemas.push(`metadado: "${leak}"`);
  const dup = findDuplicatedWords(...textos);
  if (dup) problemas.push(`palavra repetida: "${dup.trecho}"`);
  const hollow = findHollow(...textos);
  if (hollow) problemas.push(`frase generica: "${hollow}"`);
  if (textos.some((t) => /(\*\*|^#{1,6}\s|```|\\frac)/m.test(t))) problemas.push('markdown');
  if (textos.some((t) => /[<>]\/?[a-z]{2,}\s*>/i.test(t))) problemas.push('html');
  registro.auditoria = { problemas, fatos: checarFatos(registro.materia, textoDaAula(aula)) };
}

// ---- Agrega por modelo ----------------------------------------
const modelos = [...new Set(dados.map((d) => d.modeloSlug))];
const resumo = [];
for (const slug of modelos) {
  const itens = dados.filter((d) => d.modeloSlug === slug);
  const ok = itens.filter((d) => d.ok);
  const tempos = ok.map((d) => d.ms).sort((a, b) => a - b);
  const motivos = {};
  for (const f of itens.filter((d) => !d.ok)) {
    const m = String(f.motivo ?? 'desconhecido');
    motivos[m] = (motivos[m] ?? 0) + 1;
  }
  resumo.push({
    modelo: slug,
    id: itens[0].modeloId,
    papel: itens[0].papel,
    tentativas: itens.length,
    validas: ok.length,
    taxa: itens.length ? Math.round((ok.length / itens.length) * 100) : 0,
    msMin: tempos[0] ?? null,
    msMediana: tempos.length ? tempos[Math.floor(tempos.length / 2)] : null,
    msMax: tempos[tempos.length - 1] ?? null,
    msMedio: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
    bytesMedio: ok.length ? Math.round(ok.reduce((n, d) => n + d.bytes, 0) / ok.length) : 0,
    profMedia: ok.length ? Math.round(ok.reduce((n, d) => n + d.mediaExplicacao, 0) / ok.length) : 0,
    profMinima: ok.length ? Math.min(...ok.map((d) => d.menorExplicacao)) : 0,
    exemplMedio: ok.length ? (ok.reduce((n, d) => n + d.exemplos, 0) / ok.length).toFixed(1) : 0,
    exercMedio: ok.length ? (ok.reduce((n, d) => n + d.exercicios, 0) / ok.length).toFixed(1) : 0,
    secoesMedio: ok.length ? (ok.reduce((n, d) => n + d.secoes, 0) / ok.length).toFixed(1) : 0,
    truncados: ok.filter((d) => d.truncado).length,
    heuristicas: ok.filter((d) => d.auditoria?.problemas?.length).length,
    fatos: ok.filter((d) => d.auditoria?.fatos?.length).length,
    motivos,
  });
}

console.log('='.repeat(78));
console.log('BENCHMARK DE MODELOS — DADOS OBSERVADOS');
console.log('='.repeat(78));
console.log(`geracoes registradas: ${dados.length}\n`);
for (const r of resumo) {
  console.log(`--- ${r.modelo}  (${r.papel})`);
  console.log(`    id .................. ${r.id}`);
  console.log(`    validas ............. ${r.validas}/${r.tentativas}  (${r.taxa}%)`);
  console.log(`    latencia ............ min ${r.msMin} | mediana ${r.msMediana} | max ${r.msMax} | media ${r.msMedio} (ms)`);
  console.log(`    profundidade ........ media ${r.profMedia}c | mais rasa ${r.profMinima}c`);
  console.log(`    tamanho util ........ ${r.bytesMedio}b | ${r.secoesMedio} secoes | ${r.exemplMedio} exemplos | ${r.exercMedio} exercicios`);
  console.log(`    truncados ........... ${r.truncados}/${r.validas}`);
  console.log(`    heuristicas ......... ${r.heuristicas}/${r.validas}`);
  console.log(`    erros factuais ...... ${r.fatos}/${r.validas}`);
  if (Object.keys(r.motivos).length) console.log(`    falhas .............. ${JSON.stringify(r.motivos)}`);
  console.log('');
}

console.log('='.repeat(78));
console.log('TABELA DE DECISAO');
console.log('='.repeat(78));
console.log(['MODELO', 'VALIDA', 'LAT med', 'PROF', 'EXEM', 'EXERC', 'TRUNC', 'HEUR', 'FATOS'].map((c) => c.padEnd(13)).join(''));
for (const r of resumo) {
  console.log(
    [r.modelo.slice(0, 13).padEnd(13), `${r.validas}/${r.tentativas}`.padEnd(13), String(r.msMediana ?? '-').padEnd(13),
     String(r.profMedia).padEnd(13), String(r.exemplMedio).padEnd(13), String(r.exercMedio).padEnd(13),
     String(r.truncados).padEnd(13), String(r.heuristicas).padEnd(13), String(r.fatos).padEnd(13)].join(''),
  );
}

console.log('\n=== FALHAS DETALHADAS ===');
for (const f of dados.filter((d) => !d.ok)) {
  console.log(`[${f.modeloSlug}] ${f.materia}/${f.topico} #${f.run} — ${f.motivo} (${f.ms}ms)`);
  if (f.erros?.length) console.log(`    schema: ${f.erros.slice(0, 3).join(' | ').slice(0, 190)}`);
  if (f.debug_last) console.log(`    detalhe: ${String(f.debug_last).replace(/\s+/g, ' ').slice(0, 190)}`);
}
console.log('\n=== PROBLEMAS HEURISTICOS NAS APROVADAS ===');
for (const d of dados.filter((x) => x.auditoria?.problemas?.length)) {
  console.log(`[${d.modeloSlug}] ${d.materia}/${d.topico} #${d.run}: ${d.auditoria.problemas.join(' | ')}`);
}
console.log('\n=== ALERTAS FACTUAIS AUTOMATICOS ===');
for (const d of dados.filter((x) => x.auditoria?.fatos?.length)) {
  console.log(`[${d.modeloSlug}] ${d.materia}/${d.topico} #${d.run}: ${d.auditoria.fatos.join(' | ')}`);
}

fs.writeFileSync(path.join(SAIDA, 'analise.json'), JSON.stringify({ resumo, dados }, null, 2), 'utf8');
console.log(`\nAnalise completa em ${SAIDA}/analise.json`);