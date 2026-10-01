// ============================================================
// BENCHMARK DE MODELOS PARA GERACAO DE AULAS (P1B) — ISOLADO.
// ------------------------------------------------------------
// REGRA DE OURO: todos os modelos recebem EXATAMENTE o mesmo
// tema, materia, subtopicos, objetivo, nivel, prompt P1, schema,
// regras e validacao. Nada disso e favorificado a ninguem.
//
// COMO ISSO E GARANTIDO: o benchmark NAO tem prompt proprio. Ele
// chama a Edge Function de producao `generate-lesson` com
// forceModel=<candidato>. Assim o prompt, o max_tokens, a ordem de
// tentativa e o validateLesson() sao os de producao, por
// construcao — nao por copia.
//
// ISOLAMENTO:
//   - nunca toca app_state.sections.aiCache (o cache real);
//   - grava em generated_lessons apenas com dateKey "bench-*",
//     chave que o app NUNCA consulta (ele deriva de datas reais);
//   - as linhas bench-* sao removidas no fim (--limpar);
//   - nada de migracao de modelo, nada de mudanca em producao.
//
// Uso:
//   node tools/bench-modelos.mjs --probe
//   node tools/bench-modelos.mjs --full
//   node tools/bench-modelos.mjs --limpar
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const SAIDA = '.tmp-bench';

// ---- Candidatos: base, fallback de producao e os pedidos ------
const MODELOS = [
  { slug: 'diffusiongemma', id: 'google/diffusiongemma-26b-a4b-it', papel: 'ATUAL (principal)' },
  { slug: 'muse-glimmer', id: 'meta/muse-glimmer-30b', papel: 'ATUAL (fallback)' },
  // FASE 1 usou os nomes SEM o prefixo da organizacao e todos os
  // tres falharam em ~500ms (modelo inexistente no catalogo).
  // A verificacao no catalogo da NVIDIA mostrou o id correto.
  { slug: 'deepseek-errado', id: 'deepseek-v4.1-flash', papel: 'CANDIDATO (id errado)' },
  { slug: 'glm-errado', id: 'glm-5-3-flash', papel: 'CANDIDATO (id errado)' },
  { slug: 'gemini-errado', id: 'gemini-3.8-flash', papel: 'CANDIDATO (id errado)' },
];

// FASE 2: ids corrigidos, confirmados no catalogo NVIDIA, mais um
// candidato do mesmo provider (nenhuma mudanca de infra).
// O slug leva o prefixo da organizacao de proposito: na fase 1 o
// slug "deepseek-v4.1-flash" ja foi usado com o id ERRADO, e um
// slug igual faria o benchmark pular o teste do id correto.
const MODELOS_FASE2 = [
  { slug: 'deepseek-ai-v4.1-flash', id: 'deepseek-ai/deepseek-v4.1-flash', papel: 'CANDIDATO NVIDIA' },
  { slug: 'z-ai-glm-5-3-flash', id: 'z-ai/glm-5-3-flash', papel: 'CANDIDATO NVIDIA' },
  { slug: 'nemotron-3-ultra', id: 'nvidia/nemotron-3-ultra-550b-a55b', papel: 'CANDIDATO NVIDIA (extra)' },
];

// ---- Temas: 4 do conjunto auditado + 2 diferentes, do cronograma
const TEMAS = [
  { materia: 'Matemática', topico: 'números inteiros' },
  { materia: 'Português', topico: 'informação explícita' },
  { materia: 'Ciências', topico: 'matéria' },
  { materia: 'História', topico: 'primeiras civilizações' },
  { materia: 'Geografia', topico: 'localização' },
  { materia: 'Inglês', topico: 'interpretação básica' },
];

const RUNS_POR_TEMA = 2;
const args = process.argv.slice(2);
const MODO = args.find((a) => a.startsWith('--'))?.replace('--', '') ?? 'probe';
const SO_UMA = (args.find((a) => a.startsWith('--solo=')) ?? '').replace('--solo=', '');
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- Carrega o cronograma real (fonte dos subtopicos) ---------
const entrada = path.join(RAIZ, 'tools', '_entrada-bench.mjs');
const bundle = path.join(os.tmpdir(), `bench-${Date.now()}.mjs`);
fs.writeFileSync(
  entrada,
  "export { curriculumDays, isGeneratedDay } from '../src/data/curriculum.js';\n",
  'utf8',
);
const esbuild = (await import('esbuild')).default;
await esbuild.build({ entryPoints: [entrada], bundle: true, format: 'esm', outfile: bundle, logLevel: 'silent' });
const { curriculumDays, isGeneratedDay } = await import(pathToFileURL(bundle).href);
fs.rmSync(entrada, { force: true });
fs.rmSync(bundle, { force: true });

function acharPlano(materia, topico) {
  return curriculumDays.find(
    (p) =>
      isGeneratedDay(p) &&
      String(p.subject).toLowerCase() === materia.toLowerCase() &&
      String(p.topic).toLowerCase() === String(topico).toLowerCase(),
  );
}

// Payload = o mesmo que src/services/ai.js monta. A unica diferenca
// e dateKey "bench-*", que isola a gravacao sem mudar o prompt.
function payloadDe(plan, run) {
  const dia = String(plan.dateKey).replace(/-/g, '');
  return {
    curriculumVersion: plan.curriculumVersion || 'v1',
    week: plan.week ?? null,
    weekTitle: plan.weekTitle ?? null,
    weekGoal: plan.weekGoal ?? null,
    day: plan.day ?? null,
    dateKey: `bench-${plan.benchSlug}-${dia}-r${run}`,
    weekday: plan.weekday ?? null,
    phase: plan.phase ?? null,
    phaseLabel: plan.phaseLabel ?? null,
    block: plan.block ?? null,
    blockCount: plan.blockCount ?? null,
    blockLabel: plan.blockLabel ?? null,
    breakAfterMinutes: plan.breakAfterMinutes ?? 0,
    dayBreakMinutes: plan.dayBreakMinutes ?? 0,
    dayTotalMinutes: plan.dayTotalMinutes ?? null,
    kind: plan.kind ?? 'lesson',
    subject: plan.subject,
    topic: plan.topic,
    subtopics: plan.subtopics ?? [],
    objectives: [plan.objective].filter(Boolean),
    durationMinutes: plan.durationMinutes ?? 55,
    studentLevel: plan.studentLevel ?? 'Fundamental II',
    force: true,
  };
}

const ARQ = path.join(SAIDA, 'resultados.json');
fs.mkdirSync(path.join(SAIDA, 'aulas'), { recursive: true });
const previous = fs.existsSync(ARQ) ? JSON.parse(fs.readFileSync(ARQ, 'utf8')) : [];
const salvos = new Map(previous.map((r) => [`${r.modeloSlug}|${r.temaSlug}|${r.run}`, r]));
const chave = (r) => `${r.modeloSlug}|${r.temaSlug}|${r.run}`;
const salvar = () => fs.writeFileSync(ARQ, JSON.stringify([...salvos.values()], null, 2), 'utf8');
const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) throw eSess;

async function gerar(modelo, plan, run) {
  const payload = { ...payloadDe(plan, run), forceModel: modelo.id };
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(`${BASE}/functions/v1/generate-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${sess.session.access_token}`,
        Origin: 'https://rogerinframengo.github.io',
      },
      body: JSON.stringify(payload),
    });
  } catch (erro) {
    return { ok: false, motivo: 'rede', detalhe: erro.message, ms: Date.now() - t0 };
  }
  const ms = Date.now() - t0;
  const bruto = await r.text();

  if (!r.ok) {
    let corpo = {};
    try {
      corpo = JSON.parse(bruto);
    } catch {
      corpo = { bruto: bruto.slice(0, 300) };
    }
    return {
      ok: false,
      http: r.status,
      motivo: corpo.error ?? `http_${r.status}`,
      detalhe: String(corpo.message ?? corpo.detail ?? corpo.bruto ?? '').slice(0, 300),
      // A Edge Function devolve o motivo real aqui. Sem isso o
      // benchmark so sabe que "falhou", nao POR QUE.
      debug_last: String(corpo.debug_last ?? '').slice(0, 500),
      chain_tried: corpo.chain_tried ?? null,
      ms,
    };
  }

  let saida;
  try {
    saida = JSON.parse(bruto);
  } catch {
    return { ok: false, motivo: 'resposta_nao_json', ms };
  }
  if (!saida.lesson) {
    return { ok: false, motivo: 'sem_aula', erros: saida.errors ?? [], ms, modeloUsado: saida.model };
  }
  return { ok: true, aula: saida.lesson, ms, modeloUsado: saida.model, id: saida.id, cached: saida.cached };
}

// Metricas calculadas SEM depender do modelo: o mesmo codigo
// avalia a aula de qualquer gerador.
function metricas(aula) {
  const secs = aula.sections ?? [];
  const chars = secs.map((s) => (s.explanation?.length ?? 0));
  const completo = (aula.summary?.length ?? 0) > 0 && (aula.commonMistakes?.length ?? 0) > 0;
  return {
    bytes: JSON.stringify(aula).length,
    secoes: secs.length,
    exemplos: secs.reduce((n, s) => n + (s.examples?.length ?? 0), 0),
    exercicios: aula.guidedPractice?.length ?? 0,
    errosComuns: aula.commonMistakes?.length ?? 0,
    resumo: aula.summary?.length ?? 0,
    introChars: (aula.introduction ?? '').length,
    mediaExplicacao: chars.length ? Math.round(chars.reduce((a, b) => a + b, 0) / chars.length) : 0,
    menorExplicacao: chars.length ? Math.min(...chars) : 0,
    // truncamento: a aula prometeu campos e veio incompleta.
    truncado: !completo || (aula.guidedPractice?.length ?? 0) < 3,
  };
}

// ---- Modo limpar: remove as linhas bench-* do banco -----------
if (MODO === 'limpar') {
  const { data: linhas, error: eL } = await cliente
    .from('generated_lessons')
    .select('id,cache_key')
    .like('cache_key', '%bench-%');
  if (eL) throw eL;
  const antes = (linhas ?? []).length;
  for (const linha of linhas ?? []) {
    await cliente.from('generated_lessons').delete().eq('id', linha.id);
  }
  console.log(`linhas bench-* removidas: ${antes}`);
  console.log('(o cache real app_state.sections.aiCache NAO foi tocado em nenhum momento)');
  process.exit(0);
}

// ---- Monta a lista de trabalhos -------------------------------
function temaSlugDe(materia, topico) {
  return `${materia}-${topico}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
}

const trabalhos = [];
if (MODO === 'probe') {
  // 1 geracao por candidato: revela disponibilidade e velocidade.
  const plan = acharPlano(TEMAS[0].materia, TEMAS[0].topico);
  if (!plan) throw new Error('plano nao encontrado para o tema de sondagem');
  for (const modelo of MODELOS) trabalhos.push({ modelo, plan, run: 1, temaSlug: 'sondagem' });
} else {
  const lista = MODO === 'fase2' ? MODELOS_FASE2 : MODELOS;
  // Fase 2 usa 1 geracao por tema: sao modelos grandes e a amostra
  // ja e suficiente para medir validade, tempo e qualidade. A
  // diferenca de amostra fica registrada no relatorio.
  const runs = MODO === 'fase2' ? 1 : RUNS_POR_TEMA;
  for (const modelo of lista) {
    for (const tema of TEMAS) {
      const plan = acharPlano(tema.materia, tema.topico);
      if (!plan) {
        console.log(`[AVISO] sem plano no cronograma: ${tema.materia} / ${tema.topico}`);
        continue;
      }
      for (let run = 1; run <= runs; run += 1) {
        trabalhos.push({ modelo, plan, run, temaSlug: temaSlugDe(tema.materia, tema.topico) });
      }
    }
  }
}

console.log(`modo: ${MODO} | trabalhos: ${trabalhos.length}`);
console.log(`temas: ${TEMAS.map((t) => `${t.materia}/${t.topico}`).join('  ')}\n`);

let feitos = 0;
for (const t of trabalhos) {
  const k = `${t.modelo.slug}|${t.temaSlug}|${t.run}`;
  const rotulo = `${t.modelo.slug} / ${t.plan.subject} ${t.plan.topic} #${t.run}`;
  if (salvos.has(k) && MODO !== 'reforcar') {
    console.log(`[JA EXISTE] ${rotulo}`);
    continue;
  }

  const r = await gerar(t.modelo, t.plan, t.run);
  feitos += 1;

  const registro = {
    modeloSlug: t.modelo.slug,
    modeloId: t.modelo.id,
    papel: t.modelo.papel,
    temaSlug: t.temaSlug,
    materia: t.plan.subject,
    topico: t.plan.topic,
    run: t.run,
    ok: r.ok,
    ms: r.ms,
  };

  if (r.ok) {
    Object.assign(registro, metricas(r.aula));
    registro.modeloUsado = r.modeloUsado;
    registro.cached = r.cached;
    const arquivo = path.join(SAIDA, 'aulas', `${t.modelo.slug}__${t.temaSlug}__r${t.run}.json`);
    fs.writeFileSync(arquivo, JSON.stringify(r.aula, null, 2), 'utf8');
    registro.arquivo = arquivo;
    console.log(`OK    ${rotulo} | ${r.ms}ms | ${registro.secoes}s ${registro.exemplos}ex ${registro.exercicios}exerc | ${registro.bytes}b`);
  } else {
    registro.http = r.http;
    registro.motivo = r.motivo;
    registro.detalhe = r.detalhe;
    registro.debug_last = r.debug_last;
    registro.chain_tried = r.chain_tried;
    registro.erros = r.erros;
    console.log(`FALHA ${rotulo} | ${r.ms}ms | ${r.motivo} | ${String(r.detalhe ?? (r.erros ?? []).join(' | ')).slice(0, 160)}`);
    if (r.debug_last) console.log(`        motivo real: ${r.debug_last.slice(0, 260)}`);
    if (r.chain_tried) console.log(`        tentados: ${JSON.stringify(r.chain_tried)}`);
  }
  salvos.set(k, registro);
  salvar();
}

console.log(`\ngeracoes nesta execucao: ${feitos} | total acumulado: ${salvos.size}`);
console.log(`resultados em ${ARQ}`);
