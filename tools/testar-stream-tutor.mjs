// ============================================================
// Testa o streamTutor (src/services/ai.js) com fetch SIMULADO.
// ------------------------------------------------------------
// O que precisa ficar garantido: em TODO cenario, onDone OU onError
// e chamado exatamente UMA vez (nenhuma tela presa em
// "Respondendo..." e nenhum duplo disparo).
//
// Nao ha framework de teste no projeto, entao seguimos a mesma
// receita dos outros scripts de tools/: recortar a funcao do fonte e
// executa-la com as dependencias injetadas (fetch, sessao, relogio).
//
// Uso: node tools/testar-stream-tutor.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realSetTimeout = globalThis.setTimeout;
const OCIOSO_MS = 50000; // mesmo valor de TUTOR_IDLE_TIMEOUT_MS no fonte
const STREAM_MS = 30000; // mesmo valor de TUTOR_STREAM_TIMEOUT_MS no fonte

// ---- recorta o streamTutor do fonte --------------------------
const src = fs.readFileSync(path.join(raiz, 'src/services/ai.js'), 'utf8');
const inicio = src.indexOf('export async function streamTutor');
if (inicio < 0) {
  console.error('ERRO: nao achei streamTutor em src/services/ai.js');
  process.exit(1);
}
const corpo = src.slice(inicio).replace(/^export\s+/, '').trimEnd();
if (!corpo.endsWith('}')) {
  console.error('ERRO: o recorte do streamTutor nao termina em "}"');
  process.exit(1);
}

const montarStreamTutor = new Function(
  'fetch',
  'ensureAiSession',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'AI_MESSAGES',
  'diag',
  'TUTOR_IDLE_TIMEOUT_MS',
  'TUTOR_STREAM_TIMEOUT_MS',
  'setTimeout',
  'clearTimeout',
  `${corpo}\nreturn streamTutor;`,
);

const AI_MESSAGES = {
  noSession: 'sem sessao',
  offline: 'A IA nao respondeu agora.',
};

// ---- relogio falso (para o timeout nao esperar 50s de verdade) -
function criarRelogio() {
  let agora = 0;
  let seq = 0;
  const alvos = new Map();
  const flush = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => realSetTimeout(resolve, 0));
  };
  return {
    setTimeout: (fn, ms) => {
      const id = ++seq;
      alvos.set(id, { at: agora + Number(ms || 0), fn });
      return id;
    },
    clearTimeout: (id) => {
      alvos.delete(id);
    },
    async avancar(ms) {
      const limite = agora + Number(ms);
      // Deixa o streamTutor comecar de fato (o timer de inatividade e
      // armado dentro do laco de leitura) antes de mover o relogio.
      await flush();
      for (;;) {
        const pendentes = [...alvos.entries()].filter(([, t]) => t.at <= limite).sort((a, b) => a[1].at - b[1].at);
        if (!pendentes.length) break;
        const [id, timer] = pendentes[0];
        alvos.delete(id);
        agora = timer.at;
        timer.fn();
        await flush();
      }
      agora = limite;
      await flush();
    },
  };
}

const enc = new TextEncoder();
const evento = (nome, dados) => `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;

/** Resposta de sucesso: corpo SSE em pedacos, como a rede entrega. */
function respostaSSE(trechos, { silencioso = false } = {}) {
  const bytes = trechos.map((t) => enc.encode(t));
  let i = 0;
  let sinal = null;
  const reader = {
    read() {
      if (sinal?.aborted) return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (i < bytes.length) return Promise.resolve({ done: false, value: bytes[i++] });
      if (silencioso) {
        // stream mudo: so resolve quando o abort chegar (como na rede real)
        return new Promise((_, reject) => {
          const abortar = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          if (sinal) sinal.addEventListener('abort', abortar, { once: true });
        });
      }
      return Promise.resolve({ done: true, value: undefined });
    },
    cancel() {
      return Promise.resolve();
    },
  };
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream; charset=utf-8' },
    body: { getReader: () => reader },
    _sinal: (s) => {
      sinal = s;
    },
  };
}

/** Resposta de erro HTTP: status + corpo cru (texto ou HTML). */
function respostaErro(status, corpoTexto, contentType) {
  return {
    ok: false,
    status,
    headers: { get: () => contentType },
    body: null,
    text: async () => corpoTexto,
    _sinal: () => {},
  };
}

async function rodarCaso(resposta, { avancarMs = 0, fetchPendurado = false } = {}) {
  const chamadas = { start: 0, delta: 0, done: 0, error: 0 };
  const logs = [];
  const relogio = criarRelogio();

  const fetchSimulado = async (url, init) => {
    logs.push(`fetch http-method=${init.method} stream=${JSON.parse(init.body).stream}`);
    // Conexao que nunca devolve nem o cabecalho: o `await fetch` fica
    // pendurado e so o abort do controller desfaz (como na rede real).
    if (fetchPendurado) {
      return new Promise((_, reject) => {
        const abortar = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (init.signal?.aborted) abortar();
        else init.signal?.addEventListener('abort', abortar, { once: true });
      });
    }
    resposta._sinal?.(init.signal);
    return resposta;
  };

  const streamTutor = montarStreamTutor(
    fetchSimulado,
    async () => 'jwt.falso.para.teste',
    'https://exemplo.supabase.co',
    'anon-key-publica',
    AI_MESSAGES,
    (etapa, detalhe) => logs.push(`${etapa}${detalhe ? ` ${detalhe}` : ''}`),
    OCIOSO_MS,
    STREAM_MS,
    relogio.setTimeout,
    relogio.clearTimeout,
  );

  const handler = {
    onStart: () => {
      chamadas.start += 1;
    },
    onDelta: (pedaco, acumulado) => {
      chamadas.delta += 1;
      chamadas.ultimoAcumulado = acumulado;
    },
    onDone: (dados) => {
      chamadas.done += 1;
      chamadas.reply = dados?.reply ?? '';
      chamadas.doneDados = dados;
    },
    onError: (erro) => {
      chamadas.error += 1;
      chamadas.erro = erro;
    },
  };

  const rodando = streamTutor(
    { messages: [{ role: 'user', content: 'Oi' }], context: {}, conversationId: 'c1' },
    handler,
  );

  if (avancarMs) await relogio.avancar(avancarMs);

  // Vigia real: se algo travar, o teste falha em vez de pendurar.
  const prazo = new Promise((_, reject) =>
    realSetTimeout(() => reject(new Error('streamTutor nao finalizou em 3s (pendurado)')), 3000),
  );
  try {
    await Promise.race([rodando, prazo]);
  } catch (error) {
    return { chamadas, logs, erroTeste: error };
  }
  return { chamadas, logs };
}

const casos = [];
function registrar(nome, esperado, resultado) {
  const total = resultado.chamadas.done + resultado.chamadas.error;
  const motivos = [];
  if (resultado.erroTeste) motivos.push(`pendurado: ${resultado.erroTeste.message}`);
  if (total !== 1) motivos.push(`callbacks terminais = ${total} (esperado exatamente 1)`);
  if (esperado.done && resultado.chamadas.done !== 1) motivos.push('onDone nao foi chamado');
  if (esperado.error && resultado.chamadas.error !== 1) motivos.push('onError nao foi chamado');
  if (esperado.done && resultado.chamadas.error !== 0) motivos.push('onError rodou junto com onDone');
  if (esperado.error && resultado.chamadas.done !== 0) motivos.push('onDone rodou junto com onError');
  if (esperado.codigo && resultado.chamadas.erro?.code !== esperado.codigo) {
    motivos.push(`code = ${resultado.chamadas.erro?.code} (esperado "${esperado.codigo}")`);
  }
  if (esperado.status && resultado.chamadas.erro?.status !== esperado.status) {
    motivos.push(`status = ${resultado.chamadas.erro?.status} (esperado ${esperado.status})`);
  }
  if (esperado.reply && !String(resultado.chamadas.reply ?? '').includes(esperado.reply)) {
    motivos.push(`reply = ${JSON.stringify(String(resultado.chamadas.reply ?? '').slice(0, 60))}`);
  }
  if (esperado.parcial === true && resultado.chamadas.doneDados?.parcial !== true) {
    motivos.push('faltou a marca parcial no onDone');
  }
  casos.push({ nome, ok: motivos.length === 0, motivos, resultado });
}

// 1) stream normal: start + deltas + done
registrar(
  'stream normal start+delta+done',
  { done: true, reply: 'Uma fracao parte de um todo' },
  await rodarCaso(
    respostaSSE([
      evento('start', { conversationId: 'c1' }),
      evento('delta', { text: 'Uma ' }),
      evento('delta', { text: 'fracao parte de um todo.' }),
      evento('done', { reply: 'Uma fracao parte de um todo.', model: 'openai/gpt-oss-20b', conversationId: 'c1' }),
      evento('delta', { text: 'NAO-DEVE-PROCESSAR-DEPOIS-DO-DONE' }),
    ]),
  ),
);

// 2) HTTP 503 com corpo em texto puro
registrar(
  'HTTP 503 com corpo texto',
  { error: true, status: 503, codigo: 'http_error' },
  await rodarCaso(respostaErro(503, 'Service Unavailable - upstream groq 503', 'text/plain; charset=utf-8')),
);

// 3) HTTP 502 com corpo HTML (gateway)
registrar(
  'HTTP 502 com corpo HTML',
  { error: true, status: 502, codigo: 'http_error' },
  await rodarCaso(respostaErro(502, '<html><body><h1>502 Bad Gateway</h1></body></html>', 'text/html; charset=UTF-8')),
);

// 4) stream fecha depois de start+delta sem done -> onDone com o acumulado
registrar(
  'stream fecha sem done (recupera o parcial)',
  { done: true, reply: 'fracao e', parcial: true },
  await rodarCaso(
    respostaSSE([
      evento('start', { conversationId: 'c1' }),
      evento('delta', { text: 'fracao ' }),
      evento('delta', { text: 'e' }),
    ]),
  ),
);

// 5) stream fecha vazio -> onError
registrar('stream fecha vazio', { error: true }, await rodarCaso(respostaSSE([])));

// 6) stream mudo ate estourar o timeout de inatividade -> onError code timeout
registrar(
  'stream mudo ate o timeout de inatividade',
  { error: true, codigo: 'timeout', status: 408 },
  await rodarCaso(respostaSSE([evento('start', { conversationId: 'c1' })], { silencioso: true }), {
    avancarMs: OCIOSO_MS + 1000,
  }),
);

// 7) o fetch NUNCA responde (conexao SSE morta, proxy engolindo a
// requisicao). Antes nao havia timer nenhum nesse caminho - o reader
// nem existia, entao o `armarOcioso` nunca rodava e o chat ficava em
// "Respondendo..." para sempre. Agora o prazo de 30s aborta e o
// AbortError vira onError com code=timeout.
registrar(
  'fetch pendurado (nem a resposta chega)',
  { error: true, codigo: 'timeout', status: 408 },
  await rodarCaso(null, { avancarMs: STREAM_MS + 1000, fetchPendurado: true }),
);

let falhas = 0;
for (const c of casos) {
  const ch = c.resultado.chamadas;
  console.log(`${c.ok ? '[OK]    ' : '[FALHA] '} ${c.nome}`);
  console.log(
    `        start=${ch.start} delta=${ch.delta} done=${ch.done} error=${ch.error}` +
      (ch.erro ? ` | erro code=${ch.erro.code ?? '-'} status=${ch.erro.status ?? '-'}` : '') +
      (ch.done ? ` | reply="${String(ch.reply).slice(0, 42)}"` : ''),
  );
  console.log(`        diag: ${c.resultado.logs.join(' | ')}`);
  for (const m of c.motivos) {
    falhas += 1;
    console.log(`        -> ${m}`);
  }
}

console.log(`\nRESULTADO: ${falhas === 0 ? `os ${casos.length} cenarios passaram` : falhas + ' falha(s)'}`);
process.exit(falhas === 0 ? 0 : 1);


