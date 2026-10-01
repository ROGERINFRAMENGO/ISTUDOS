// ============================================================
// FASE 1C.2 - orquestrador do benchmark de geracao de aula.
// ------------------------------------------------------------
// Chama a Edge Function lesson-bench (isolada, nao faz parte do
// site) e guarda o resultado em .tmp-bench/1c2/.
//
// REGRAS DE OURO (impostas pela fase):
// - NUNCA em rajada: o Gemini free tier aguenta 20 req/min e rajada
//   queima a cota, medindo backoff em vez de qualidade.
// - Backoff real em 429 / 503 / 5xx, com teto de tentativas.
// - provider_error separado de model_output_error: indisponibilidade
//   do provider NAO pode ser contada como aula ruim.
// - A chave B do Gemini NAO entra no benchmark de qualidade: ela e
//   credencial/failover, nao modelo diferente. Comparar A e B seria
//   medir o provider, nao a configuracao.
//
// Uso:
//   node tools/bench-1c2.mjs                 (plano completo)
//   node tools/bench-1c2.mjs --plano=piloto  (1 config, 1 tema, 1 run)
//   node tools/bench-1c2.mjs --so=gemini-low (filtra config)
//   node tools/bench-1c2.mjs --so=ciencias   (filtra tema)
//   node tools/bench-1c2.mjs --limpar        (remove os dados isolados)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, '.tmp-bench', '1c2');
const DIR_AULAS = path.join(SAIDA, 'aulas');
const ARQ = path.join(SAIDA, 'resultados.json');
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

// ---------- As 4 configuracoes comparadas (FASE 1C.2) ----------
const CONFIGS = [
  { id: 'nvidia-diffusion', provider: 'nvidia', thinking: null, modelo: 'google/diffusiongemma-26b-a4b-it' },
  { id: 'nvidia-muse', provider: 'nvidia', thinking: null, modelo: 'meta/muse-glimmer-30b' },
  { id: 'gemini-low', provider: 'gemini', thinking: 'LOW', modelo: 'gemini-3.8-flash' },
  { id: 'gemini-medium', provider: 'gemini', thinking: 'MEDIUM', modelo: 'gemini-3.8-flash' },
];

// ---------- Os 6 temas: exatamente os do cronograma real ----------
const TEMAS = [
  { materia: 'Matemática', topico: 'números inteiros' },
  { materia: 'Português', topico: 'informação explícita' },
  { materia: 'Ciências', topico: 'matéria' },
  { materia: 'História', topico: 'primeiras civilizações' },
  { materia: 'Geografia', topico: 'localização' },
  { materia: 'Inglês', topico: 'interpretação básica' },
];

// 3 geracoes por config e tema (amostra controlada, conforme a fase).
const RUNS = Number(process.env.BENCH_RUNS ?? 3);

// Espacamento. 12s entre chamadas do Gemini fica bem abaixo dos 20/min
// medidos na 1C.1, entao uma chamada so, mesmo com retry, nao estoura a
// cota. A NVIDIA nao tem limite medido, entao 2s ja evita rajada.
const GAP_MS = { gemini: 12000, nvidia: 2000 };
// 503 "high demand" foi observado em ~30% das chamadas do Gemini na 1C.1.
// Sao falhas TRANSITORIAS: um pico de demanda passa. Por isso o Gemini
// ganha mais tentativas que a NVIDIA, e cada tentativa e barata (12s de
// folga entre uma e outra, entao nao existe risco de cota).
const MAX_TENTATIVAS = { gemini: 5, nvidia: 3 };

const args = process.argv.slice(2);
const flag = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.split('=').slice(1).join('=') ?? null;
const PILOTO = args.includes('--plano=piloto');

if (!KEY) {
  console.error('Defina VITE_SUPABASE_PUBLISHABLE_KEY no ambiente.');
  process.exit(1);
}

// ============================================================
// CRONOGRAMA REAL: subtopicos e objetivos vem do
// src/data/curriculum.js, o MESMO que o app usa. O benchmark nao
// inventa subtopico nem objetivo.
// ============================================================
async function carregarCronograma() {
  const entrada = path.join(RAIZ, 'tools', '_entrada-1c2.mjs');
  const bundle = path.join(os.tmpdir(), `c1c2-${Date.now()}.mjs`);
  fs.writeFileSync(entrada, "export { curriculumDays, isGeneratedDay } from '../src/data/curriculum.js';\n", 'utf8');
  const esbuild = (await import('esbuild')).default;
  await esbuild.build({ entryPoints: [entrada], bundle: true, format: 'esm', outfile: bundle, logLevel: 'silent' });
  const mod = await import(pathToFileURL(bundle).href);
  fs.rmSync(entrada, { force: true });
  fs.rmSync(bundle, { force: true });
  return mod;
}

const { curriculumDays, isGeneratedDay } = await carregarCronograma();

function acharPlano(materia, topico) {
  return curriculumDays.find(
    (p) => isGeneratedDay(p)
      && String(p.subject).toLowerCase() === materia.toLowerCase()
      && String(p.topic).toLowerCase() === String(topico).toLowerCase(),
  );
}

/**
 * Payload = o mesmo que src/services/ai.js monta para o app.
 * A unica diferenca e o dateKey prefixado com "bench-1c2-", que isola
 * a gravacao sem mudar uma virgula do prompt.
 */
function payloadDe(plan, config, run) {
  const dia = String(plan.dateKey).replace(/-/g, '');
  return {
    curriculumVersion: plan.curriculumVersion || 'v1',
    week: plan.week ?? null,
    weekTitle: plan.weekTitle ?? null,
    weekGoal: plan.weekGoal ?? null,
    day: plan.day ?? null,
    dateKey: `bench-1c2-${config.id}-${dia}-r${run}`,
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
// ============================================================
// Chamada + separacao de erros
// ============================================================
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Erro TRANSITORIO = vale repetir.
 *
 * 429/503/timeout/rede/5xx sao do PROVIDER: repetir e o certo.
 *
 * json_invalido ENTRA tambem, e nao e concessao: e exatamente o que a
 * producao faz. O generate-lesson chama tryModel(), que da UMA segunda
 * tentativa no MESMO modelo quando o JSON volta malformado, so antes de
 * partir para o fallback (achado de 29/09: o DiffusionGemma encerra no
 * meio de uma palavra e ainda reporta finish="stop"). Medir o
 * DiffusionGemma SEM essa retentativa seria medir um modelo diferente
 * do que a producao realmente usa, e o benchmark sairia injusto.
 */
function transitorio(row) {
  return row.provider_error === 'cota_429'
    || row.provider_error === 'demanda_503'
    || row.provider_error === 'timeout'
    || row.provider_error === 'rede'
    || row.model_output_error === 'json_invalido'
    || Number(row.http) >= 500
    // Resposta sem nenhum campo nosso = a Edge Function foi cortada pelo
    // gateway (150s) ou devolveu erro antes do handler. Nao sabemos a
    // causa, entao tratamos como transitoria: repetir e mais honesto do
    // que contar como falha definitiva do modelo.
    || (!row.provider_error && !row.model_output_error);
}

/**
 * Uma geracao, com retry so em erro transitorio.
 * O retry entra na contagem de "tentativas" e nao no placar de qualidade:
 * quem falhou de verdade continua tendo falhado.
 */
async function gerar(config, input, etiqueta) {
  const maxTentativas = MAX_TENTATIVAS[config.provider];
  let ultima = null;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    const t0 = Date.now();
    let row;
    try {
      const r = await fetch(`${BASE}/functions/v1/lesson-bench`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: KEY,
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://rogerinframengo.github.io',
        },
        body: JSON.stringify({ config: config.id, input, chave: flag('chave') ?? 'A' }),
      });
      const ms = Date.now() - t0;
      const bruto = await r.text();
      try {
        row = JSON.parse(bruto);
      } catch {
        row = { ok: false, provider_error: `http_${r.status}`, http: r.status, erro: bruto.slice(0, 300) };
      }
      row.wallMs = ms;
      if (row.config === undefined) row.config = config.id;
      // Guarda o status HTTP mesmo quando o corpo nao tem os campos
      // nossos (ex.: o gateway corta e devolve corpo vazio). Sem isso a
      // falha fica sem causa e parece "modelo ruim".
      if (row.http === undefined || row.http === 0) row.http = r.status;
      if (!row.provider_error && !row.model_output_error && r.status >= 400) {
        row.provider_error = `http_${r.status}`;
      }
    } catch (error) {
      row = { ok: false, provider_error: 'rede', http: 0, erro: String(error?.message ?? error).slice(0, 200), wallMs: Date.now() - t0 };
    }

    row.tentativas = tentativa;
    ultima = row;

    const precisaRetry = !row.ok && transitorio(row) && tentativa < maxTentativas;
    if (!precisaRetry) {
      row.retries = tentativa - 1;
      return row;
    }

    // Backoff por TIPO de erro, porque cada um pede uma espera diferente:
    //
    // 429 -> o proprio Google declara "retry in Ns" e esse numero manda:
    //        respeita-lo evita queimar a cota de novo logo em seguida.
    // 503 -> a mensagem oficial e "high demand... usually temporary": e um
    //        pico de demanda, nao uma falha. Espera curta nao resolve e ainda
    //        gasta tentativa, entao aqui a espera e longa e com jitter.
    // json_invalido -> nao ha cota nem provider envolvido: o modelo so
    //        precisa de nova tentativa, entao a espera e minima.
    const jitter = Math.floor(Math.random() * 4000);
    let espera;
    if (row.provider_error === 'cota_429') {
      espera = Math.max(20000, Number(row.retry_em_s ?? 0) * 1000 + 5000);
    } else if (row.provider_error === 'demanda_503') {
      espera = 45000 * tentativa + jitter;
    } else if (row.model_output_error === 'json_invalido') {
      espera = 1500;
    } else {
      espera = 10000 * tentativa + jitter;
    }
    const motivo = row.provider_error ?? row.model_output_error ?? 'erro';
    console.log(`      [retry ${tentativa}] ${etiqueta} ${motivo} -> espera ${Math.round(espera / 1000)}s`);
    await dormir(espera);
  }
  ultima.retries = maxTentativas - 1;
  return ultima;
}

// ============================================================
// Armazenamento (retomada: execucao interrompida nao perde tudo)
// ============================================================
fs.mkdirSync(DIR_AULAS, { recursive: true });
const anteriores = fs.existsSync(ARQ) ? JSON.parse(fs.readFileSync(ARQ, 'utf8')) : [];
const salvos = new Map(anteriores.map((r) => [`${r.config}|${r.temaSlug}|${r.run}`, r]));
const salvar = () => fs.writeFileSync(ARQ, JSON.stringify([...salvos.values()], null, 2), 'utf8');

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) throw eSess;
const TOKEN = sess.session.access_token;

// ============================================================
// Modo limpar: apaga TUDO que a fase gerou, isoladamente.
// Nao toca em app_state, em aiCache, em progresso, XP ou no Tutor.
// ============================================================
if (args.includes('--limpar')) {
  const { data: linhas, error: eL } = await cliente
    .from('generated_lessons')
    .select('id,cache_key')
    .like('cache_key', '%bench-1c2-%');
  if (eL) throw eL;
  for (const linha of linhas ?? []) {
    await cliente.from('generated_lessons').delete().eq('id', linha.id);
  }
  fs.rmSync(SAIDA, { recursive: true, force: true });
  console.log(`linhas bench-1c2-* removidas do banco: ${(linhas ?? []).length}`);
  console.log('pasta .tmp-bench/1c2 removida');
  console.log('(app_state.sections.aiCache NAO foi tocada em nenhum momento)');
  process.exit(0);
}
// ============================================================
// Modo carga: diagnostico de capacidade do free tier. Nao gera aula,
// nao grava nada, so responde o que o provider aceita hoje.
//   node tools/bench-1c2.mjs --carga
//   node tools/bench-1c2.mjs --carga --chave=B
// ============================================================
if (args.includes('--carga')) {
  const tema = TEMAS.find((t) => t.materia === 'Ciências');
  const plan = acharPlano(tema.materia, tema.topico);
  const input = payloadDe(plan, { id: 'carga' }, 0);
  const chave = flag('chave') ?? 'A';
  const r = await fetch(`${BASE}/functions/v1/lesson-bench`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${TOKEN}`,
      Origin: 'https://rogerinframengo.github.io',
    },
    body: JSON.stringify({ config: 'gemini-low', input, modo: 'carga', chave }),
  });
  const dados = await r.json();
  console.log(`\n===== O QUE O FREE TIER ACEITA — chave ${chave} (tema: Ciencias/materia) =====`);
  console.log('caso                          http   ms    finish  chars  detalhe');
  for (const c of dados.resultados ?? []) {
    console.log(
      `${c.caso.padEnd(29)} ${String(c.http).padStart(5)} ${String(c.ms).padStart(5)}`
      + ` ${String(c.finish ?? '-').padStart(8)} ${String(c.chars ?? '-').padStart(6)}  ${(c.erro ?? c.amostra ?? '').slice(0, 60)}`,
    );
  }
  process.exit(0);
}

// ============================================================
// Plano de trabalho
// ============================================================
const slug = (t) => `${t.materia}-${t.topico}`
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28);

let configs = CONFIGS;
const soConfig = flag('so');
if (soConfig) configs = configs.filter((c) => c.id === soConfig);
if (!configs.length) {
  console.error(`config desconhecida. Use: ${CONFIGS.map((c) => c.id).join(', ')}`);
  process.exit(1);
}

let temas = TEMAS.map((t) => ({ ...t, slug: slug(t), plan: acharPlano(t.materia, t.topico) }));
const semPlano = temas.filter((t) => !t.plan);
if (semPlano.length) {
  console.error(`tema sem plano no cronograma: ${semPlano.map((t) => `${t.materia}/${t.topico}`).join(', ')}`);
  process.exit(1);
}
const soTema = flag('tema');
if (soTema) temas = temas.filter((t) => t.slug.includes(soTema) || t.materia.toLowerCase().includes(soTema.toLowerCase()));

const runs = PILOTO ? 1 : RUNS;

const trabalhos = [];
for (const tema of temas) {
  for (const config of configs) {
    for (let run = 1; run <= runs; run += 1) trabalhos.push({ tema, config, run });
  }
}

const total = trabalhos.length;
console.log(`FASE 1C.2 · ${total} geracoes · ${configs.length} config(s) x ${temas.length} tema(s) x ${runs} run(s)`);
console.log(`gap: gemini ${GAP_MS.gemini / 1000}s / nvidia ${GAP_MS.nvidia / 1000}s · tentativas: gemini ${MAX_TENTATIVAS.gemini} / nvidia ${MAX_TENTATIVAS.nvidia}`);
if (temas.length !== TEMAS.length) console.log(`temas filtrados: ${temas.map((t) => t.slug).join(', ')}`);
if (configs.length !== CONFIGS.length) console.log(`configs filtradas: ${configs.map((c) => c.id).join(', ')}`);

let feito = 0;
const ultimoPorProvider = { gemini: 0, nvidia: 0 };

for (const { tema, config, run } of trabalhos) {
  const id = `${config.id}|${tema.slug}|${run}`;
  if (salvos.has(id)) { console.log(`  [ja existe] ${config.id} / ${tema.slug} / r${run}`); feito += 1; continue; }

  // Espera o intervalo do MESMO provider, para nunca virar rajada.
  const falta = GAP_MS[config.provider] - (Date.now() - ultimoPorProvider[config.provider]);
  if (falta > 0) await dormir(falta);

  const etiqueta = `${config.id}/${tema.slug}/r${run}`;
  console.log(`  [${feito + 1}/${total}] ${etiqueta} ...`);
  const row = await gerar(config, payloadDe(tema.plan, config, run), etiqueta);
  ultimoPorProvider[config.provider] = Date.now();

  const registro = {
    config: config.id,
    provider: config.provider,
    thinking: config.thinking,
    modelo: config.modelo,
    temaSlug: tema.slug,
    materia: tema.materia,
    topico: tema.topico,
    run,
    ok: row.ok,
    json_ok: row.json_ok ?? false,
    validate_ok: row.validate_ok ?? false,
    validate_errors: row.validate_errors ?? [],
    validate_ok_1a: row.validate_ok_1a ?? null,
    validate_errors_1a: row.validate_errors_1a ?? [],
    correcao: row.correcao ?? null,
    maxTokens: row.maxTokens ?? null,
    provider_error: row.provider_error ?? null,
    model_output_error: row.model_output_error ?? null,
    http: row.http ?? 0,
    truncado: row.truncado ?? false,
    finish: row.finish ?? null,
    usage: row.usage ?? null,
    metricas: row.metricas ?? null,
    ms: row.wallMs ?? null,
    retries: row.retries ?? 0,
    tentativas: row.tentativas ?? 1,
    erro: row.erro ?? null,
    salvoId: row.salvoId ?? null,
    saveFailed: row.saveFailed ?? false,
  };
  salvos.set(id, registro);

  // Guarda a aula INTEIRA para a comparacao lado a lado.
  const arqAula = row.lesson
    ? `${config.id}__${tema.slug}__r${run}.json`
    : row.bruto_quando_invalido ? `${config.id}__${tema.slug}__r${run}.INVALIDA.json` : null;
  if (arqAula) {
    fs.writeFileSync(
      path.join(DIR_AULAS, arqAula),
      JSON.stringify({
        config: config.id, run, tema: tema.slug,
        lesson: row.lesson ?? null,
        bruto: row.bruto_quando_invalido ?? null,
        erros: row.validate_errors ?? [],
      }, null, 2),
      'utf8',
    );
  }

  salvar();
  feito += 1;

  const m = row.metricas;
  const status = row.ok
    ? (row.validate_ok ? 'VALIDA' : `INVALIDA(${row.validate_errors?.[0] ?? ''})`)
    : `FALHOU(${row.provider_error ?? row.model_output_error})`;
  console.log(`      ${status} · ${Math.round((row.wallMs ?? 0) / 1000)}s`
    + (m ? ` · ${m.secoes}sec ${m.exemplos}ex ${m.exercicios}exerc ${m.errosComuns}erros ${m.resumo}res` : '')
    + (row.retries ? ` · ${row.retries} retry` : '')
    + (m ? ` · ${m.charsTotal} chars` : ''));
}

console.log(`\nconcluido: ${feito}/${total} · resultados em ${path.relative(RAIZ, SAIDA)}`);
console.log('agora rode: node tools/analisar-1c2.mjs');
