// ============================================================
// FASE 1D — orquestrador do benchmark de conteudo via Groq.
// ------------------------------------------------------------
// Chama a Edge Function groq-bench (isolada, nao grava no banco) e
// guarda tudo em .tmp-bench/groq/, fora do aplicativo.
//
// Regras desta etapa:
// - USA APENAS o secret GROQ_CONTENT_API_KEY. O GROQ_API_KEY do Tutor
//   nao e lido, trocado nem tocado em hipotese nenhuma.
// - Nunca rajada: as chamadas sao espacadas e o rate limit da resposta
//   e lido e registrado a cada chamada.
// - provider_error, rate_limit, timeout, schema_error, json_error e
//   validation_error sao separados: um 429 nunca conta como "o modelo
//   e pedagogicamente ruim".
// - Prompt e validador sao os de producao para TODOS os modelos.
//
// Uso:
//   node tools/bench-groq.mjs --catalogo
//   node tools/bench-groq.mjs --aulas
//   node tools/bench-groq.mjs --quizzes
//   node tools/bench-groq.mjs --aulas --so=<modelo> --tema=<slug>
//   node tools/bench-groq.mjs --sozinho=<modelo>:<tema>   (1 celula)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, '.tmp-bench', 'groq');
const DIR_AULAS = path.join(SAIDA, 'aulas');
const DIR_QUIZZES = path.join(SAIDA, 'quizzes');
const ARQ_AULAS = path.join(SAIDA, 'aulas.json');
const ARQ_QUIZZES = path.join(SAIDA, 'quizzes.json');
const ARQ_CATALOGO = path.join(SAIDA, 'catalogo.json');
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

// Espacamento dictated pela TPM, nao pela RPM.
//
// MEDIDO no catalogo real desta credencial:
//   requisicoes ..... 1000/min  (nao e o gargalo)
//   TOKENS ......... 8000/min  (e o gargalo)
// E uma aula P1A custa ~2200 tokens de prompt + ~5000 de saida, ou
// seja ~7000-9000 tokens: MAIS QUE A COTA INTEIRA DE UM MINUTO.
//
// Por isso o intervalo e de 100s e nao 6s. Um intervalo curto aqui
// nao "acelera" o benchmark: ele so troca qualidade por HTTP 413, e o
// 413 nao diz nada sobre o modelo.
const GAP_AULAS = 100000;
// Quiz e ~4x menor que aula: um quiz de 5 questoes gasta cerca de
// 2000-2500 tokens, nao 7000. Com a mesma TPM de 8000/min, 25s entre
// chamadas cabem Comfortavelmente e o benchmark de quizzes nao vira um
// teste de cota. Se aparecer 429/413, o backoff sobe sozinho.
const GAP_QUIZZES = 25000;
const MAX_TENTATIVAS = 3;

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=') ?? null;

if (!KEY) {
  console.error('Defina VITE_SUPABASE_PUBLISHABLE_KEY no ambiente.');
  process.exit(1);
}
fs.mkdirSync(DIR_AULAS, { recursive: true });
fs.mkdirSync(DIR_QUIZZES, { recursive: true });

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sessao, error: eSess2 } = await cliente.auth.signInAnonymously();
if (eSess2) throw eSess2;
const TOKEN = sessao.session.access_token;

async function chamarGroqBench(payload) {
  const r = await fetch(`${BASE}/functions/v1/groq-bench`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${TOKEN}`,
      Origin: 'https://rogerinframengo.github.io',
    },
    body: JSON.stringify(payload),
  });
  const bruto = await r.text();
  try { return JSON.parse(bruto); } catch { return { ok: false, error_kind: 'resposta_nao_json', http: r.status, erro: bruto.slice(0, 300) }; }
}

// ============================================================
// 1. CATALOGO
// ============================================================
if (args.includes('--catalogo')) {
  const dados = await chamarGroqBench({ modo: 'catalogo' });
  fs.writeFileSync(ARQ_CATALOGO, JSON.stringify(dados, null, 2), 'utf8');
  if (!dados.ok) {
    console.error(`catalogo falhou: http ${dados.http} — ${dados.erro}`);
    process.exit(1);
  }
  console.log(`\n===== CATALOGO REAL (credencial de conteudo) =====`);
  console.log(`total: ${dados.total} · familias: ${(dados.familias ?? []).join(', ')}`);
  console.log(`cota observada: ${JSON.stringify(dados.rate)}\n`);
  console.log('modelo                              ctx     saida  ativo');
  for (const m of dados.modelos) {
    console.log(`${m.id.padEnd(36)} ${String(m.contexto ?? '-').padStart(7)} ${String(m.max_saida ?? '-').padStart(7)}  ${m.ativo}`);
  }
  console.log(`\n(completo em ${path.relative(RAIZ, ARQ_CATALOGO)})`);
  process.exit(0);
}
// ============================================================
// Cronograma real: subtopicos e objetivos vem do MESMO modulo que o
// app usa. O benchmark nao inventa subtopico nem objetivo.
// ============================================================
async function carregarCronograma() {
  const entrada = path.join(RAIZ, 'tools', '_entrada-groq.mjs');
  const bundle = path.join(os.tmpdir(), `groq-${Date.now()}.mjs`);
  fs.writeFileSync(entrada, "export { curriculumDays, isGeneratedDay } from '../src/data/curriculum.js';\n", 'utf8');
  const esbuild = (await import('esbuild')).default;
  await esbuild.build({ entryPoints: [entrada], bundle: true, format: 'esm', outfile: bundle, logLevel: 'silent' });
  const mod = await import(pathToFileURL(bundle).href);
  fs.rmSync(entrada, { force: true });
  fs.rmSync(bundle, { force: true });
  return mod;
}

const { curriculumDays, isGeneratedDay } = await carregarCronograma();

// Modelos de TEXTO do catalogo real. Os de TTS, guard e arabe foram
// descartados por serem inuteis para aula/quiz — e isso esta registrado
// no relatorio, e nao escondido.
const MODELOS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

const TEMAS_BASE = [
  { materia: 'Matemática', topico: 'números inteiros' },
  { materia: 'Português', topico: 'informação explícita' },
  { materia: 'Ciências', topico: 'matéria' },
  { materia: 'História', topico: 'primeiras civilizações' },
];
const TEMAS_EXTRAS = [
  { materia: 'Geografia', topico: 'localização' },
  { materia: 'Inglês', topico: 'interpretação básica' },
];

const RUNS = 2; // 2 geracoes independentes por tema e por modelo.

const slug = (t) => `${t.materia}-${t.topico}`
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

function acharPlano(materia, topico) {
  return curriculumDays.find(
    (p) => isGeneratedDay(p)
      && String(p.subject).toLowerCase() === materia.toLowerCase()
      && String(p.topic).toLowerCase() === String(topico).toLowerCase(),
  );
}

/**
 * Payload = o mesmo que src/services/ai.js monta para o app. Nao muda
 * uma virgula: o prompt precisa ser identico ao de producao para que
 * a comparacao com a NVIDIA (FASE 1C.2) valha.
 */
function payloadDe(plan) {
  return {
    curriculumVersion: plan.curriculumVersion || 'v1',
    week: plan.week ?? null,
    weekTitle: plan.weekTitle ?? null,
    weekGoal: plan.weekGoal ?? null,
    day: plan.day ?? null,
    dateKey: plan.dateKey,
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
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Erro TRANSITORIO = vale repetir.
 * 429 (cota), 5xx (provider), timeout e rede sao do ambiente.
 * schema_error (400) NAO e repetido: repetir so gasta cota para provar
 * de novo que o modelo nao aceita aquele schema.
 * json_error e repetido, porque e o que a producao faz.
 */
function transitorio(row) {
  return row.error_kind === 'rate_limit'
    || row.error_kind === 'provider_error'
    || row.error_kind === 'timeout'
    || row.error_kind === 'rede'
    || row.error_kind === 'json_error'
    // 413 = TPM estourada. E quota, e transitorio: vale esperar a janela
    // abrir. "truncamento_orcamento" tambem e repetivel com teto maior.
    || row.error_kind === 'truncamento_orcamento'
    || row.http === 413;
}

async function umaGeracao(payload) {
  let ultima = null;
  for (let t = 1; t <= MAX_TENTATIVAS; t += 1) {
    const t0 = Date.now();
    const row = await chamarGroqBench(payload);
    row.wallMs = Date.now() - t0;
    row.tentativas = t;
    ultima = row;

    if (!transitorio(row) || t >= MAX_TENTATIVAS) {
      row.retries = t - 1;
      return row;
    }
    // No 429 o proprio header retry-after manda; respeitar evita martelar.
    const retryAfter = Number(row.rate?.retry_after ?? 0) * 1000;
    const espera = (row.error_kind === 'rate_limit' || row.http === 413)
      ? Math.min(180000, Math.max(70000, retryAfter || 70000))
      : row.error_kind === 'truncamento_orcamento' ? 3000
        : row.error_kind === 'json_error' ? 2000 : 8000 * t;
    console.log(`      [retry ${t}] ${row.error_kind} -> espera ${Math.round(espera / 1000)}s`);
    await dormir(espera);
  }
  ultima.retries = MAX_TENTATIVAS - 1;
  return ultima;
}
// ============================================================
// AULAS
// ============================================================
if (args.includes('--aulas')) {
  const comExtras = args.includes('--com-extras');
  const brutos = [...TEMAS_BASE, ...(comExtras ? TEMAS_EXTRAS : [])];

  let temas = brutos.map((t) => ({ ...t, slug: slug(t), plan: acharPlano(t.materia, t.topico) }));
  const semPlano = temas.filter((t) => !t.plan);
  if (semPlano.length) {
    console.error(`tema sem plano no cronograma: ${semPlano.map((t) => `${t.materia}/${t.topico}`).join(', ')}`);
    process.exit(1);
  }
  const soTema = flag('tema');
  if (soTema) temas = temas.filter((t) => t.slug.includes(soTema) || t.materia.toLowerCase().includes(soTema.toLowerCase()));

  let modelos = MODELOS;
  const soModelo = flag('so');
  if (soModelo) modelos = modelos.filter((m) => m.includes(soModelo));
  if (!modelos.length) { console.error('modelo nao encontrado'); process.exit(1); }

  const arq = flag('arq');
  const alvo = arq ? ARQ_AULAS.replace('.json', `-${arq}.json`) : ARQ_AULAS;
  const dir = arq ? path.join(SAIDA, `aulas-${arq}`) : DIR_AULAS;
  fs.mkdirSync(dir, { recursive: true });
  const anteriores = fs.existsSync(alvo) ? JSON.parse(fs.readFileSync(alvo, 'utf8')) : [];
  const salvos = new Map(anteriores.map((r) => [`${r.modelo}|${r.temaSlug}|${r.run}`, r]));
  const salvar = () => fs.writeFileSync(alvo, JSON.stringify([...salvos.values()], null, 2), 'utf8');

  const trabalhos = [];
  for (const tema of temas) {
    for (const modelo of modelos) {
      for (let run = 1; run <= RUNS; run += 1) trabalhos.push({ tema, modelo, run });
    }
  }
  const total = trabalhos.length;
  console.log(`AULAS · ${total} geracoes · ${modelos.length} modelo(s) x ${temas.length} tema(s) x ${RUNS} run(s)`);
  console.log(`gap ${GAP_AULAS / 1000}s · tentativas ${MAX_TENTATIVAS} · schema estrito: sim\n`);

  let feito = 0;
  let ultimaChamada = 0;
  for (const { tema, modelo, run } of trabalhos) {
    const id = `${modelo}|${tema.slug}|${run}`;
    if (salvos.has(id)) { console.log(`  [ja existe] ${modelo} / ${tema.slug} / r${run}`); feito += 1; continue; }

    const falta = GAP_AULAS - (Date.now() - ultimaChamada);
    if (falta > 0) await dormir(falta);

    console.log(`  [${feito + 1}/${total}] ${modelo} / ${tema.slug} / r${run} ...`);
    // --nao-estrito mede se o modelo FALHA por causa do modo estrito ou
    // porque o schema da aula e grande demais. Sem esse teste, "7 de 8
    // schema_error" e um diagnostico, nao uma conclusao.
    const estrito = !args.includes('--nao-estrito');
    const row = await umaGeracao({
      modo: 'aula', modelo, schemaEstrito: estrito, input: payloadDe(tema.plan),
      gapMs: args.includes('--nao-estrito') ? 60000 : GAP_AULAS,
    });
    ultimaChamada = Date.now();

    const reg = {
      modelo, temaSlug: tema.slug, materia: tema.materia, topico: tema.topico, run,
      schemaEstrito: estrito,
      reasoning: row.reasoning ?? null,
      maxTokens: row.maxTokens ?? null,
      ok: row.ok, json_ok: row.json_ok ?? false, validate_ok: row.validate_ok ?? false,
      validate_errors: row.validate_errors ?? [],
      validate_ok_1a: row.validate_ok_1a ?? null,
      correcao: row.correcao ?? null,
      error_kind: row.error_kind ?? null, http: row.http ?? 0,
      finish: row.finish ?? null, truncado: row.truncado ?? false,
      usage: row.usage ?? null, rate: row.rate ?? null,
      metricas: row.metricas ?? null, ms: row.wallMs ?? null,
      retries: row.retries ?? 0, tentativas: row.tentativas ?? 1,
      erro: row.erro ?? null,
    };
    salvos.set(id, reg);

    const nomeAula = `${modelo.replace(/\//g, '_')}__${tema.slug}__r${run}`;
    if (row.content) {
      fs.writeFileSync(path.join(dir, `${nomeAula}.json`), JSON.stringify({ modelo, run, tema: tema.slug, aula: row.content }, null, 2), 'utf8');
    } else if (row.bruto_quando_invalido) {
      fs.writeFileSync(path.join(dir, `${nomeAula}.INVALIDA.json`), JSON.stringify({ modelo, run, tema: tema.slug, bruto: row.bruto_quando_invalido, erros: row.validate_errors }, null, 2), 'utf8');
    }
    salvar();
    feito += 1;

    const m = row.metricas;
    const st = !row.ok ? `FALHOU(${row.error_kind})`
      : row.validate_ok ? 'VALIDA'
        : `INVALIDA(${row.validate_errors?.[0] ?? ''})`;
    const rate = row.rate?.restante_req ? ` · restam ${row.rate.restante_req} req` : '';
    console.log(`      ${st} · ${(row.wallMs / 1000).toFixed(1)}s`
      + (m ? ` · ${m.secoes}sec ${m.exemplos}ex ${m.exercicios}exerc ${m.errosComuns}err ${m.resumo}res` : '')
      + (row.usage ? ` · ${row.usage.total} tok` : '')
      + (row.retries ? ` · ${row.retries} retry` : '') + rate);
  }

  console.log(`\nconcluido ${feito}/${total} · ${path.relative(RAIZ, alvo)}`);
  console.log('agora: node tools/analisar-groq.mjs');
  process.exit(0);
}

// ============================================================
// QUIZZES
// ------------------------------------------------------------
// Contexto = as 4 aulas P1 REAIS que a aluna ja usa. Elas sao lidas
// de app_state.sections.aiCache pela MESMA sessao anonima que o app
// usa (esta rota ja e publica para o app; nenhuma chave nova, nenhum
// service_role, nenhuma tabela nova). As aulas NAO sao alteradas.
// ============================================================
if (args.includes('--quizzes')) {
  const arq = flag('arq');
  const alvo = arq ? ARQ_QUIZZES.replace('.json', `-${arq}.json`) : ARQ_QUIZZES;
  const dir = arq ? path.join(SAIDA, `quizzes-${arq}`) : DIR_QUIZZES;
  fs.mkdirSync(dir, { recursive: true });

  // 1. Le as aulas reais.
  const { data: st, error: eSt } = await cliente.from('app_state').select('data').eq('id', 'principal').single();
  if (eSt) { console.error(`nao consegui ler app_state: ${eSt.message}`); process.exit(1); }
  const cache = st?.data?.sections?.aiCache ?? {};

  const AULAS = [];
  for (const [chave, entrada] of Object.entries(cache)) {
    if (!chave.includes('p1-aulas-2026-09-30')) continue;
    const aula = entrada?.lesson;
    if (!aula?.sections?.length) continue;
    const materia = chave.split('|').at(-2);
    const topico = chave.split('|').at(-1);
    AULAS.push({ materia, topico, aula, chave });
  }
  // Uma aula por materia: o tema Historia aparece com duas entradas.
  const porMateria = new Map();
  for (const a of AULAS) if (!porMateria.has(a.materia)) porMateria.set(a.materia, a);
  const aulas = [...porMateria.values()];

  console.log(`QUIZZES · contexto: ${aulas.length} aulas P1 reais de app_state.aiCache`);
  for (const a of aulas) {
    const campos = Object.keys(a.aula).sort().join(',');
    console.log(`  · ${a.materia}/${a.topico} · ${a.aula.sections.length} secoes · ${(a.aula.guidedPractice ?? []).length} exercicios`);
    console.log(`    campos: ${campos}`);
  }
  if (!aulas.length) { console.error('nenhuma aula P1 encontrada no cache'); process.exit(1); }

  const anteriores = fs.existsSync(alvo) ? JSON.parse(fs.readFileSync(alvo, 'utf8')) : [];
  const salvos = new Map(anteriores.map((r) => [`${r.modelo}|${r.materia}|${r.run}`, r]));
  const salvar = () => fs.writeFileSync(alvo, JSON.stringify([...salvos.values()], null, 2), 'utf8');

  const total = aulas.length * MODELOS.length * RUNS;
  console.log(`\n${total} geracoes · ${MODELOS.length} modelo(s) x ${aulas.length} aula(s) x ${RUNS} run(s)`);
  console.log(`gap ${GAP_QUIZZES / 1000}s · schema estrito: sim\n`);

  let feito = 0;
  let ultimaChamada = 0;
  for (const ctx of aulas) {
    for (const modelo of MODELOS) {
      for (let run = 1; run <= RUNS; run += 1) {
        const id = `${modelo}|${ctx.materia}|${run}`;
        if (salvos.has(id)) { console.log(`  [ja existe] ${modelo} / ${ctx.materia} / r${run}`); feito += 1; continue; }

        const falta = GAP_QUIZZES - (Date.now() - ultimaChamada);
        if (falta > 0) await dormir(falta);

        console.log(`  [${feito + 1}/${total}] ${modelo} / ${ctx.materia} / r${run} ...`);
        // O MESMO formato que generate-quiz monta: subject, topic,
        // difficulty, questionCount e a aula REAL.
        const row = await umaGeracao({
          modo: 'quiz',
          modelo,
          schemaEstrito: true,
          input: {
            subject: ctx.materia,
            topic: ctx.topico,
            difficulty: 'medium',
            questionCount: 5,
            lesson: ctx.aula,
            studentPerformance: {},
          },
        });
        ultimaChamada = Date.now();

        salvos.set(id, {
          modelo, materia: ctx.materia, topico: ctx.topico, run,
          aulaOrigem: ctx.chave, schemaEstrito: true,
          reasoning: row.reasoning ?? null, maxTokens: row.maxTokens ?? null,
          ok: row.ok, json_ok: row.json_ok ?? false, validate_ok: row.validate_ok ?? false,
          validate_errors: row.validate_errors ?? [],
          validate_ok_1a: row.validate_ok_1a ?? null,
          correcao: row.correcao ?? null,
          error_kind: row.error_kind ?? null, http: row.http ?? 0,
          finish: row.finish ?? null, truncado: row.truncado ?? false,
          usage: row.usage ?? null, rate: row.rate ?? null,
          metricas: row.metricas ?? null, ms: row.wallMs ?? null,
          retries: row.retries ?? 0, tentativas: row.tentativas ?? 1,
          erro: row.erro ?? null,
        });

        if (row.content) {
          fs.writeFileSync(path.join(dir, `${modelo.replace(/\//g, '_')}__${slug({ materia: ctx.materia, topico: ctx.topico })}__r${run}.json`), JSON.stringify({ modelo, run, aulaOrigem: ctx.chave, quiz: row.content }, null, 2), 'utf8');
        }
        salvar();
        feito += 1;

        const m = row.metricas;
        const st2 = !row.ok ? `FALHOU(${row.error_kind})` : row.validate_ok ? 'VALIDO' : `INVALIDO(${row.validate_errors?.[0] ?? ''})`;
        console.log(`      ${st2} · ${(row.wallMs / 1000).toFixed(1)}s`
          + (m ? ` · ${m.questoes}q ${m.alternativasMedias}alt ${m.comExplicacao}comExp [${(m.niveis ?? []).join('/')}]` : '')
          + (row.usage ? ` · ${row.usage.total} tok` : '')
          + (row.retries ? ` · ${row.retries} retry` : ''));
      }
    }
  }

  console.log(`\nconcluido ${feito}/${total} · ${path.relative(RAIZ, alvo)}`);
  process.exit(0);
}

// Modo SO LEITURA: mostra as aulas P1 reais que serao usadas como
// contexto dos quizzes. Nao chama a Groq, nao gasta cota.
if (args.includes('--contexto')) {
  const { data: st, error: eSt } = await cliente.from('app_state').select('data').eq('id', 'principal').single();
  if (eSt) { console.error(`nao consegui ler app_state: ${eSt.message}`); process.exit(1); }
  const cache = st?.data?.sections?.aiCache ?? {};
  const porMateria = new Map();
  for (const [chave, entrada] of Object.entries(cache)) {
    if (!chave.includes('p1-aulas-2026-09-30')) continue;
    const aula = entrada?.lesson;
    if (!aula?.sections?.length) continue;
    const materia = chave.split('|').at(-2);
    if (!porMateria.has(materia)) porMateria.set(materia, { materia, topico: chave.split('|').at(-1), aula, chave });
  }
  const aulas = [...porMateria.values()];
  console.log(`aulas P1 disponiveis: ${aulas.length}`);
  for (const a of aulas) {
    console.log(`\n· ${a.materia} / ${a.topico}`);
    console.log(`  chave: ${a.chave}`);
    console.log(`  campos: ${Object.keys(a.aula).sort().join(', ')}`);
    console.log(`  secoes=${a.aula.sections.length} exemplos=${(a.aula.sections ?? []).reduce((n, s) => n + (s.examples?.length ?? 0), 0)} exercicios=${(a.aula.guidedPractice ?? []).length} erros=${(a.aula.commonMistakes ?? []).length} resumo=${(a.aula.summary ?? []).length}`);
    console.log(`  titulo: ${String(a.aula.title ?? '').slice(0, 90)}`);
    const s0 = a.aula.sections?.[0];
    console.log(`  1a secao: ${String(s0?.title ?? '').slice(0, 80)}`);
  }
  // O que lessonDigest() vai entregar ao prompt do quiz:
  console.log('\n--- campos que o lessonDigest() usa (precisa existir) ---');
  for (const a of aulas) {
    const tem = ['title', 'objectives', 'sections', 'guidedPractice'].filter((k) => a.aula[k] !== undefined);
    console.log(`  ${a.materia}: ${tem.join(', ')}`);
  }
  process.exit(0);
}

console.log('use --catalogo | --contexto | --aulas | --quizzes');
process.exit(0);