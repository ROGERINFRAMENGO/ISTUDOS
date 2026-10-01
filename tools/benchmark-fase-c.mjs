// ============================================================
// FASE B — auditoria do validateLesson().
//
// Roda os MESMOS casos do benchmark FASE 1D (3 modelos x 4 temas x
// 2 runs) e, desta vez, GUARDA A AULA INTEIRA de cada geracao.
//
// Motivo: no benchmark anterior so foi salvo um pedaco de 1500
// caracteres das aulas reprovadas. Com isso nao da para auditar o
// que realmente causou a reprovacao — so o primeiro erro aparecia.
//
// Esta tool classifica TODOS os erros de cada aula por categoria
// (tamanho / estrutura / conteudo / qualidade), e nao apenas o
// primeiro, porque uma aula pode ter varios problemas.
//
// Nao altera nenhuma regra de producao. Roda com o codigo atual.
//
//   node tools/auditar-fase-b.mjs
//   node tools/auditar-fase-b.mjs --so=<modelo> --tema=<slug>
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, '.tmp-bench', 'fase-c');
const DIR_AULAS = path.join(SAIDA, 'aulas');
const ARQ = path.join(SAIDA, 'auditoria-fase-c.json');
const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

fs.mkdirSync(DIR_AULAS, { recursive: true });
if (!KEY) { console.error('Defina VITE_SUPABASE_PUBLISHABLE_KEY.'); process.exit(1); }

// Os mesmos modelos, temas e runs da FASE 1D.
const MODELOS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
// A cota de conteudo e de 8000 tokens/min e uma aula do gpt-oss-120b
// gasta ~4500. Com 25s de intervalo a TPM estoura; o padrao e 70s.
const GAP_MS = Number(process.env.BENCH_GAP_MS ?? 70000);

// Acents escaped as \uXXXX on purpose: writing them literally made
// PowerShell save Latin-1, and the text stopped matching the
// curriculum, so the tool reported 'tema sem plano'.
const TEMAS = [
  { materia: 'Matem\u00e1tica', topico: 'n\u00fameros inteiros' },
  { materia: 'Portugu\u00eas', topico: 'informa\u00e7\u00e3o expl\u00edcita' },
  { materia: 'Ci\u00eancias', topico: 'mat\u00e9ria' },
  { materia: 'Hist\u00f3ria', topico: 'primeiras civiliza\u00e7\u00f5es' },
  { materia: 'Geografia', topico: 'mapas' },
];
const RUNS = Number(process.env.BENCH_RUNS ?? 2);

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? null;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- cronograma real ----------
async function carregarCronograma() {
  const entrada = path.join(RAIZ, 'tools', '_entrada-faseb.mjs');
  const bundle = path.join(process.env.TEMP ?? '.', `fb-${Date.now()}.mjs`);
  fs.writeFileSync(entrada, "export { curriculumDays, isGeneratedDay } from '../src/data/curriculum.js';\n", 'utf8');
  const esbuild = (await import('esbuild')).default;
  await esbuild.build({ entryPoints: [entrada], bundle: true, format: 'esm', outfile: bundle, logLevel: 'silent' });
  const mod = await import(pathToFileURL(bundle).href);
  fs.rmSync(entrada, { force: true });
  fs.rmSync(bundle, { force: true });
  return mod;
}
const { curriculumDays, isGeneratedDay } = await carregarCronograma();

const acharPlano = (materia, topico) => curriculumDays.find(
  (p) => isGeneratedDay(p)
    && String(p.subject).toLowerCase() === materia.toLowerCase()
    && String(p.topic).toLowerCase() === String(topico).toLowerCase(),
);

const slug = (t) => `${t.materia}-${t.topico}`
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

const { createClient } = await import('@supabase/supabase-js');
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data: sess, error: eSess } = await cliente.auth.signInAnonymously();
if (eSess) throw eSess;
const TOKEN = sess.session.access_token;

async function chamar(body) {
  const r = await fetch(`${BASE}/functions/v1/lesson-bench`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: KEY,
      Authorization: `Bearer ${TOKEN}`, Origin: 'https://rogerinframengo.github.io',
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, error_kind: 'nao_json' }; }
}

// ============================================================
// CLASSIFICACAO DE CADA ERRO
// ------------------------------------------------------------
// Uma aula pode falhar por varios motivos ao mesmo tempo, e o que
// interessa e a CAUSA, nao a ordem em que o validador reclamou.
// ============================================================
// A lista de COLISOES foi auditada contra as aulas reais e "nesses"
// saiu daqui. Ver commentário em textCheck.js.
const CATEGORIAS = [
  { id: 'matematica', rotulo: 'ERRO MATEMATICO (novo)',
    teste: (e) => /vale \d|, e nao |, mas a resposta e/.test(e) },
  { id: 'texto_corrompido', rotulo: 'TEXTO CORROMPIDO (novo)',
    teste: (e) => /palavra corrompida|pontuacao quebrada|texto cortado/.test(e) },
  { id: 'tamanho_maximo', rotulo: 'tamanho: acima do maximo',
    teste: (e) => /muito longo \(/.test(e) || /maximo \d+ itens/.test(e) },
  { id: 'tamanho_minimo', rotulo: 'tamanho: abaixo do minimo',
    teste: (e) => /muito curto \(/.test(e) || /texto vazio/.test(e) },
  { id: 'estrutura', rotulo: 'estrutura (contagem de campos)',
    teste: (e) => /minimo \d+ secoes|minimo \d+ itens|precisa de \d+ exemplo|maximo \d+ secoes|maximo \d+ exemplos/.test(e) },
  { id: 'conteudo', rotulo: 'conteudo (vazamento, fora do tema, generico)',
    teste: (e) => /vazou metadado|fora do tema|conteudo generico|mand[aá] pesquisar|profundidade insuficiente/.test(e) },
  { id: 'qualidade', rotulo: 'qualidade (corte, repeticao, coerencia, frase, markdown)',
    teste: (e) => /texto cortado|repeticao artificial|coerencia|explicao nao corresponde|frase quebrada|markdown/.test(e) },
  { id: 'formato', rotulo: 'formato (HTML, placeholder, duplicata)',
    teste: (e) => /contem HTML|contem placeholder|duplicad/.test(e) },
];

function classificar(erros) {
  const cats = new Map();
  const naoClassificados = [];
  for (const e of erros) {
    const achada = CATEGORIAS.find((c) => c.teste(e));
    if (achada) {
      if (!cats.has(achada.id)) cats.set(achada.id, []);
      cats.get(achada.id).push(e);
    } else naoClassificados.push(e);
  }
  return { cats, naoClassificados };
}

/** Extrai (medido, limite) de um erro de tamanho. */
function tamanhoDoErro(erro) {
  const m = String(erro).match(/\((\d+) caracteres?, m[aá]ximo (\d+)\)/);
  if (m) return { medido: Number(m[1]), limite: Number(m[2]), excesso: Number(m[1]) - Number(m[2]) };
  const v = String(erro).match(/maximo (\d+) itens, veio (\d+)/);
  if (v) return { itens: Number(v[2]), limite: Number(v[1]) };
  return null;
}

function estatisticasTamanho(aula) {
  if (!aula) return null;
  const secs = Array.isArray(aula.sections) ? aula.sections : [];
  const expl = secs.map((s) => String(s?.explanation ?? '').length);
  const exExpl = secs.flatMap((s) => (s.examples ?? []).map((e) => String(e?.explanation ?? '').length));
  const exSol = secs.flatMap((s) => (s.examples ?? []).map((e) => String(e?.solution ?? '').length));
  const gpAns = (Array.isArray(aula.guidedPractice) ? aula.guidedPractice : []).map((g) => String(g?.answer ?? '').length);
  const est = (a) => (a.length ? { min: Math.min(...a), max: Math.max(...a), media: Math.round(a.reduce((x, y) => x + y, 0) / a.length) } : null);
  return {
    explicacoes: est(expl), exemplos_explicacao: est(exExpl),
    exemplos_solucao: est(exSol), respostas_exercicio: est(gpAns),
    chars_totais: JSON.stringify(aula).length,
  };
}
// ============================================================
// EXECUCAO
// ============================================================
let modelos = MODELOS;
const soModelo = flag('so');
if (soModelo) modelos = modelos.filter((m) => m.includes(soModelo));

let temas = TEMAS.map((t) => ({ ...t, slug: slug(t), plan: acharPlano(t.materia, t.topico) }));
const semPlano = temas.filter((t) => !t.plan);
if (semPlano.length) { console.error(`tema sem plano: ${semPlano.map((t) => t.materia).join(', ')}`); process.exit(1); }
const soTema = flag('tema');
if (soTema) temas = temas.filter((t) => t.slug.includes(soTema));

const anteriores = fs.existsSync(ARQ) ? JSON.parse(fs.readFileSync(ARQ, 'utf8')) : [];
const salvos = new Map(anteriores.map((r) => [`${r.modelo}|${r.temaSlug}|${r.run}`, r]));
const salvar = () => fs.writeFileSync(ARQ, JSON.stringify([...salvos.values()], null, 2), 'utf8');

const trabalhos = [];
for (const t of temas) for (const m of modelos) for (let run = 1; run <= RUNS; run += 1) trabalhos.push({ t, m, run });

console.log(`AUDITORIA FASE B · ${trabalhos.length} geracoes · ${modelos.length} modelo(s) x ${temas.length} tema(s) x ${RUNS} run(s)`);
console.log(`gap ${GAP_MS / 1000}s (cota de conteudo: 8000 tokens/min)\n`);

let feito = 0;
let ultima = 0;
for (const { t, m, run } of trabalhos) {
  const id = `${m}|${t.slug}|${run}`;
  if (salvos.has(id)) { console.log(`  [ja existe] ${m} / ${t.slug} / r${run}`); feito += 1; continue; }

  const falta = GAP_MS - (Date.now() - ultima);
  if (falta > 0) await dormir(falta);

  console.log(`  [${feito + 1}/${trabalhos.length}] ${m} / ${t.slug} / r${run} ...`);
  // `config` e o rotulo aceito pela funcao; `modelo`/`provider` sao o
  // override que permite medir os tres modelos da FASE 1D com o MESMO
  // prompt e o MESMO validador.
  const row = await chamar({
    modo: 'aula', config: 'gemini-low', modelo: m, provider: 'groq', reasoning: 'low',
    input: {
      curriculumVersion: t.plan.curriculumVersion || 'v1',
      week: t.plan.week ?? null, day: t.plan.day ?? null, dateKey: t.plan.dateKey,
      block: t.plan.block ?? null, blockCount: t.plan.blockCount ?? null,
      dayTotalMinutes: t.plan.dayTotalMinutes ?? null, dayBreakMinutes: t.plan.dayBreakMinutes ?? 0,
      kind: t.plan.kind ?? 'lesson', subject: t.plan.subject, topic: t.plan.topic,
      subtopics: t.plan.subtopics ?? [], objectives: [t.plan.objective].filter(Boolean),
      durationMinutes: t.plan.durationMinutes ?? 55,
      studentLevel: t.plan.studentLevel ?? 'Fundamental II',
    },
  });
  ultima = Date.now();

  const erros = row.auditoria?.erros_todos ?? [];
  const aulaBruta = row.auditoria?.aula_bruta ?? row.lesson ?? null;
  const { cats, naoClassificados } = classificar(erros);
  const catIds = [...cats.keys()];

  const registro = {
    modelo: m, temaSlug: t.slug, materia: t.materia, topico: t.topico, run,
    ok: row.ok ?? false,
    validate_ok: row.validate_ok ?? false,
    error_kind: row.error_kind ?? null,
    erro: row.erro ?? null,
    validate_errors: row.validate_errors ?? [],
    total_erros: erros.length,
    erros,
    categorias: catIds,
    nao_classificados: naoClassificados,
    tamanhos: erros.map(tamanhoDoErro).filter(Boolean),
    estatisticas: estatisticasTamanho(aulaBruta),
    chars_totais: aulaBruta ? JSON.stringify(aulaBruta).length : null,
    ms: row.totalMs ?? null,
    usage: row.usage ?? null,
  };
  salvos.set(id, registro);

  // Guarda a aula INTEIRA, inclusive das reprovadas. E isto que faltava
  // na FASE 1D para auditar a causa real.
  if (aulaBruta) {
    fs.writeFileSync(
      path.join(DIR_AULAS, `${m.replace(/\//g, '_')}__${t.slug}__r${run}${registro.validate_ok ? '' : '.REPROVADA'}.json`),
      JSON.stringify({ modelo: m, run, tema: t.slug, validate_ok: registro.validate_ok, erros, aula: aulaBruta }, null, 2),
      'utf8',
    );
  }
  salvar();
  feito += 1;

  const catsTxt = catIds.length ? catIds.join('+') : (row.ok ? 'VALIDA' : (row.error_kind ?? 'falhou'));
  console.log(`      ${catsTxt} · ${erros.length} erro(s) · ${Math.round((row.totalMs ?? 0) / 1000)}s${row.usage?.total ? ` · ${row.usage.total} tok` : ''}`);
}

console.log(`\nconcluido ${feito}/${trabalhos.length} · ${path.relative(RAIZ, ARQ)}`);
console.log('agora: node tools/relatorio-fase-b.mjs');