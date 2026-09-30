// ============================================================
// ETAPA 1 da FASE 2: sondar a API do Gemini antes de codar.
// Mede: modelo existe, formato do corpo, e se streamGenerateContent
// funciona de verdade (SSE) - disso depende a Etapa 9 (streaming).
// A chave vem da variavel de ambiente GEMINI_API_KEY; nunca do codigo.
//
// Uso: node scripts/sondar-gemini.mjs
// ============================================================

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('Defina GEMINI_API_KEY no ambiente antes de rodar este script.');
  process.exit(1);
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const CORPO = {
  systemInstruction: { parts: [{ text: 'Voce explica matters de estudo em portugues do Brasil, de forma curta.' }] },
  contents: [{ role: 'user', parts: [{ text: 'Explique em 2 frases o que e DNA.' }] }],
  generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
};

async function listarModelos() {
  const res = await fetch(`${BASE}?key=${KEY}`);
  const data = await res.json();
  if (!res.ok) {
    console.log(`listagem falhou (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
    return [];
  }
  return (data.models ?? []).map((m) => m.name.replace('models/', ''));
}

async function gerarContent(modelo) {
  const started = Date.now();
  const res = await fetch(`${BASE}/${modelo}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CORPO),
  });
  const data = await res.json().catch(() => null);
  const ms = Date.now() - started;
  if (!res.ok) {
    console.log(`  [${modelo}] HTTP ${res.status} em ${ms}ms: ${JSON.stringify(data).slice(0, 220)}`);
    return null;
  }
  const texto = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  console.log(`  [${modelo}] OK ${ms}ms | finish=${data?.candidates?.[0]?.finishReason} | ${texto.length} chars`);
  console.log(`     "${texto.slice(0, 110)}"`);
  return texto;
}

async function gerarStream(modelo) {
  const started = Date.now();
  const res = await fetch(`${BASE}/${modelo}:streamGenerateContent?alt=sse&key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CORPO),
  });
  if (!res.ok) {
    const erro = await res.text().catch(() => '');
    console.log(`  [stream ${modelo}] HTTP ${res.status}: ${erro.replace(/\s+/g, ' ').slice(0, 200)}`);
    return null;
  }
  console.log(`  [stream ${modelo}] content-type=${res.headers.get('content-type')}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let partes = 0;
  let primeiraParteMs = null;
  let acumulado = '';
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n\n');
    buffer = linhas.pop() ?? '';
    for (const bloco of linhas) {
      const linha = bloco.split('\n').find((l) => l.startsWith('data:'));
      if (!linha) continue;
      const bruto = linha.slice(5).trim();
      if (!bruto || bruto === '[DONE]') continue;
      try {
        const json = JSON.parse(bruto);
        const pedaco = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
        if (pedaco) {
          partes += 1;
          acumulado += pedaco;
          if (primeiraParteMs === null) primeiraParteMs = Date.now() - started;
        }
      } catch {
        // fragmento parcial: ignorado
      }
    }
  }

  const total = Date.now() - started;
  console.log(`  [stream ${modelo}] ${partes} partes | 1o token em ${primeiraParteMs}ms | total ${total}ms | ${bytes} bytes | ${acumulado.length} chars`);
  console.log(`     "${acumulado.slice(0, 110)}"`);
  return { partes, primeiraParteMs, totalMs: total, chars: acumulado.length };
}

// DUMP opcional: imprime o SSE cru para conferir o formato exato.
// GEMINI_DUMP=1 node scripts/sondar-gemini.mjs
if (process.env.GEMINI_DUMP === '1') {
  const modeloDump = process.env.GEMINI_DUMP_MODEL || 'gemini-3.8-flash';
  console.log(`\n=== SSE CRU de ${modeloDump} (primeiros 1200 chars) ===`);
  const resDump = await fetch(`${BASE}/${modeloDump}:streamGenerateContent?alt=sse&key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CORPO),
  });
  console.log((await resDump.text()).slice(0, 1200));
  console.log('=== fim do dump ===\n');
}

const modelos = await listarModelos();
console.log(`MODELOS DISPONIVEIS (${modelos.length}): ${modelos.filter((m) => m.startsWith('gemini')).slice(0, 12).join(', ')}\n`);

const candidatos = [
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.5-flash',
];
const existe = (m) => modelos.includes(m);
const alvo = candidatos.find((m) => existe(m)) ?? candidatos[0];

console.log(`ALVO: ${alvo}\n`);
console.log('1) generateContent (sem streaming):');
for (const modelo of candidatos.filter(existe)) {
  await gerarContent(modelo);
}
// Streaming e testado em CADA modelo utilizavel: a escolha do provider
// depende de o modelo suportar resposta rapida E streaming estavel.
console.log('\n2) streamGenerateContent (streaming SSE):');
const alvosStream = candidatos.filter((m) => existe(m) && m !== 'gemini-2.5-flash');
let melhor = null;
for (const modelo of alvosStream) {
  const r = await gerarStream(modelo);
  if (r && r.partes > 3 && (!melhor || r.primeiraParteMs < melhor.primeiraParteMs)) {
    melhor = { ...r, modelo };
  }
  if (r?.partes > 0) break; // ja achamos streaming de verdade
}
console.log('\nCONCLUSAO DA SONDAGEM:');
if (melhor) {
  console.log(`  streaming OK em ${melhor.modelo}: 1o token ${melhor.primeiraParteMs}ms, total ${melhor.totalMs}ms`);
} else {
  console.log('  nenhum modelo devolveu streaming utilizavel');
}
