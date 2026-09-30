// Teste REAL da Edge Function tutor-chat, exatamente como o site chama:
// sessao anonima -> JWT -> /functions/v1/tutor-chat -> SSE.
// Percorre a cadeia do inicio ao fim e mostra em que etapa falha.
// Uso: node scripts/diag-tutor-real.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const BASE = env.VITE_SUPABASE_URL;
const FN = `${BASE}/functions/v1/tutor-chat`;

const PERGUNTA = 'Explique o que e uma celula de forma simples, com 3 exemplos e um exercicio.';

const etapa = (nome, ok, detalhe = '') =>
  console.log(`  ${ok ? '[OK]    ' : '[FALHA] '} ${nome}${detalhe ? ` - ${detalhe}` : ''}`);

console.log('\n=== CADEIA DO TUTOR (request real) ===\n');

// 1. Sessao anonima (com cache: o projeto ja teve limite de criacao)
const CACHE = path.join(raiz, 'scripts', '.tutor-sessao.json');
let token = null;
try {
  token = JSON.parse(fs.readFileSync(CACHE, 'utf8'))?.access_token ?? null;
} catch { /* sem cache */ }

if (token) {
  const check = await fetch(`${BASE}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: `Bearer ${token}` },
  });
  etapa('JWT em cache ainda valido', check.ok, `HTTP ${check.status}`);
  if (!check.ok) token = null;
}

if (!token) {
  const client = createClient(BASE, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data?.session) {
    etapa('sessao anonima', false, error?.message ?? 'sem sessao');
    process.exit(1);
  }
  token = data.session.access_token;
  fs.writeFileSync(CACHE, JSON.stringify({ access_token: token, user: data.session.user }));
  etapa('sessao anonima criada', true, `user ${data.session.user.id.slice(0, 8)}`);
}

// 2. Chamada real com SSE
const started = Date.now();
const res = await fetch(FN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
  body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: PERGUNTA }] }),
});

etapa('HTTP status', res.ok, `${res.status}`);
etapa('content-type', (res.headers.get('content-type') ?? '').includes('text/event-stream'), res.headers.get('content-type') ?? 'vazio');
etapa('response.body disponivel', Boolean(res.body), res.body ? 'sim' : 'NAO (sem streaming)');
etapa('CORS liberado', Boolean(res.headers.get('access-control-allow-origin')), res.headers.get('access-control-allow-origin') ?? 'ausente');

if (!res.ok) {
  const erro = await res.json().catch(() => null);
  console.log(`  corpo do erro: ${JSON.stringify(erro)}`);
  process.exit(1);
}

// 3. Leitura do SSE
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let evento = null;
let primeiroTokenMs = null;
let texto = '';
let done = null;
let erroEvento = null;
const eventos = [];
const tempos = [];

while (true) {
  const { done: fim, value } = await reader.read();
  if (fim) break;
  const agora = Date.now() - started;
  buffer += decoder.decode(value, { stream: true });
  console.log('    [chegou ' + value.byteLength + ' bytes @' + agora + 'ms] eventos ate agora: ' + eventos.length);
  const blocos = buffer.split('\n\n');
  buffer = blocos.pop() ?? '';
  for (const bloco of blocos) {
    for (const linha of bloco.split('\n')) {
      const limpa = linha.trim();
      if (limpa.startsWith('event:')) { evento = limpa.slice(6).trim(); continue; }
      if (!limpa.startsWith('data:')) continue;
      let dados;
      try { dados = JSON.parse(limpa.slice(5).trim()); } catch { continue; }
      eventos.push(evento);
      tempos.push(`${evento}@${agora}ms`);
      if (evento === 'delta') {
        if (primeiroTokenMs === null) primeiroTokenMs = agora;
        texto += dados.text ?? '';
      } else if (evento === 'done') { done = dados; }
      else if (evento === 'error') { erroEvento = dados; }
    }
  }
  // SÓ depois de consumir o bloco inteiro: o runtime entrega varios
  // eventos de uma vez, e parar no primeiro `done` descartava os deltas
  // que vinham na mesma leitura de rede.
  if (done || erroEvento) {
    try { await reader.cancel(); } catch { /* ja fechado */ }
    break;
  }
}

const total = Date.now() - started;
etapa('SSE start recebido', eventos.includes('start'));
etapa('SSE delta recebido', eventos.includes('delta'), `${eventos.filter((e) => e === 'delta').length} pedacos`);
etapa('SSE done recebido', eventos.includes('done'));
if (erroEvento) etapa('SSE error', false, JSON.stringify(erroEvento));

console.log(`\n  tempo ate 1o token: ${primeiroTokenMs ?? '-'}ms`);
console.log(`  tempo total: ${total}ms`);
console.log(`  modelo: ${done?.model ?? '-'}`);
console.log(`  retries: ${done?.retries ?? '-'}`);
console.log('  pedacos vistos pelo backend: ' + (done ? done.debugParts : 'n/a'));
console.log(`  caracteres: ${(done?.reply ?? texto).length}`);
console.log(`  timeline: ${tempos.join(', ')}`);
console.log(`\n  RESPOSTA:\n  "${String(done?.reply ?? texto).slice(0, 400)}"`);

process.exit(done?.reply ? 0 : 1);
