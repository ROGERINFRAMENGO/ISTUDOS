// Sondagem real da API da Groq: confirma o modelo, o streaming SSE, o
// formato dos pedacos e o suporte a reasoning_effort.
// Uso: GROQ_API_KEY=<chave> node tools/sondar-groq.mjs
const KEY = process.env.GROQ_API_KEY;
if (!KEY) {
  console.error('defina GROQ_API_KEY no ambiente antes de rodar');
  process.exit(1);
}
const BASE = 'https://api.groq.com/openai/v1';

async function sondar(label, extra = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: 'Voce e uma professora de Fundamental II. Responda em portugues do Brasil, sem markdown.' },
        { role: 'user', content: 'Explique o que e uma celula, de forma simples.' },
      ],
      temperature: 0.6,
      max_tokens: 800,
      stream: true,
      ...extra,
    }),
  });

  const limites = {
    limite: res.headers.get('x-ratelimit-limit-requests'),
    restante: res.headers.get('x-ratelimit-remaining-requests'),
    reset: res.headers.get('x-ratelimit-reset-requests'),
  };

  if (!res.ok) {
    console.log(`\n${label}: HTTP ${res.status}`);
    console.log('  erro:', (await res.text()).slice(0, 250));
    return;
  }
  console.log(`\n${label}: HTTP 200 | ${res.headers.get('content-type')}`);
  console.log(`  rate-limit: ${limites.restante}/${limites.limite} (reset ${limites.reset})`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let n = 0;
  let chars = 0;
  let primeiro = null;
  let raciocinio = 0;
  let finish = '';
  let amostra = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const partes = buf.split('\n\n');
    buf = partes.pop() ?? '';
    for (const p of partes) {
      for (const linha of p.split('\n')) {
        const t = linha.trim();
        if (!t.startsWith('data:')) continue;
        const bruto = t.slice(5).trim();
        if (!bruto || bruto === '[DONE]') continue;
        let j;
        try {
          j = JSON.parse(bruto);
        } catch {
          continue;
        }
        n += 1;
        if (n === 1) primeiro = Date.now() - t0;
        const delta = j.choices?.[0]?.delta ?? {};
        if (delta.content) {
          chars += delta.content.length;
          if (chars < 90) amostra += delta.content;
        }
        if (delta.reasoning) raciocinio += delta.reasoning.length;
        if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
      }
    }
  }
  console.log(`  pedacos SSE: ${n} | 1o token: ${primeiro}ms | total: ${Date.now() - t0}ms`);
  console.log(`  conteudo: ${chars} chars | reasoning: ${raciocinio} chars | finish: ${finish || '-'}`);
  console.log(`  amostra: "${amostra}"`);
}

await sondar('padrao (stream)');
await sondar('reasoning_effort=low', { reasoning_effort: 'low' });
