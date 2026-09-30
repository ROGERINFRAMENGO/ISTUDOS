// Helpers dos testes do tutor-chat (FASE 2).
// Sessao anonima com cache em disco: a cota de sign-in anonimo do
// Supabase e do projeto inteiro, e nao-renewavel na hora.
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
const URL_BASE = env.VITE_SUPABASE_URL;
const FN = `${URL_BASE}/functions/v1/tutor-chat`;
const CACHE_SESSAO = path.join(raiz, 'scripts', '.tutor-sessao.json');

let passou = 0;
let falhou = 0;

function ok(nome, condicao, detalhe = '') {
  if (condicao) { passou += 1; console.log(`  [OK]     ${nome}${detalhe ? ` - ${detalhe}` : ''}`); }
  else { falhou += 1; console.log(`  [FALHOU] ${nome}${detalhe ? ` - ${detalhe}` : ''}`); }
}

function contagem() {
  return { passou, falhou };
}

async function sessaoDeCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_SESSAO, 'utf8'));
    if (!raw?.access_token || !raw?.user?.id) return null;
    const res = await fetch(`${URL_BASE}/auth/v1/user`, {
      headers: { apikey: KEY, Authorization: `Bearer ${raw.access_token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    // O client PRECISA da sessao: sem ela o RLS nao devolve nada e
    // o teste juraria que o historico nao foi gravado.
    const client = createClient(URL_BASE, KEY, { auth: { persistSession: false } });
    await client.auth.setSession({
      access_token: raw.access_token,
      refresh_token: raw.refresh_token ?? raw.access_token,
    });
    return { client, token: raw.access_token, userId: user.id };
  } catch {
    return null;
  }
}

function guardarSessao(session) {
  try {
    fs.writeFileSync(CACHE_SESSAO, JSON.stringify({ access_token: session.access_token, user: session.user }));
  } catch {
    // ignore
  }
}

/**
 * Sessao anonima. Reusa a sessao guardada em disco, a nao ser que o
 * rotulo comece com "nova:" (usado no teste de isolamento, que precisa
 * de um usuario realmente diferente).
 */
async function sessaoAnonima(label = '') {
  if (!label.startsWith('nova:')) {
    const emCache = await sessaoDeCache();
    if (emCache) return emCache;
  }
  const client = createClient(URL_BASE, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data?.session) {
    console.log(`  [ERRO] sessao anonima (${label}): ${error?.message}`);
    return null;
  }
  guardarSessao(data.session);
  await client.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  return { client, token: data.session.access_token, userId: data.session.user.id };
}

async function chamar(token, body) {
  const started = Date.now();
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: Date.now() - started };
}

/**
 * Le o SSE e mede o tempo do primeiro token.
 * A conexao fica aberta (keep-alive), entao paramos quando chega o
 * evento done/error em vez de esperar o fim do corpo.
 */
async function chamarStream(token, body) {
  const started = Date.now();
  const controller = new AbortController();
  let reader = null;
  let evento = null;
  let primeiroTokenMs = null;
  let done = null;
  let erro = null;
  let terminou = false;
  const eventos = [];

  try {
    const res = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.body) return { status: res.status, eventos, ms: Date.now() - started };

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!terminou) {
      const { done: fim, value } = await reader.read();
      if (fim) break;
      buffer += decoder.decode(value, { stream: true });
      const blocos = buffer.split(/\r?\n\r?\n/);
      buffer = blocos.pop() ?? '';
      for (const bloco of blocos) {
        for (const linha of bloco.split(/\r?\n/)) {
          if (linha.startsWith('event:')) { evento = linha.slice(6).trim(); continue; }
          if (!linha.startsWith('data:')) continue;
          let dados;
          try { dados = JSON.parse(linha.slice(5).trim()); } catch { continue; }
          eventos.push(evento);
          if (evento === 'delta' && primeiroTokenMs === null) primeiroTokenMs = Date.now() - started;
          else if (evento === 'done') { done = dados; terminou = true; }
          else if (evento === 'error') { erro = dados; terminou = true; }
        }
      }
    }
  } finally {
    controller.abort();
    try { await reader?.cancel(); } catch { /* ja fechado */ }
  }

  return { status: 200, eventos, done, erro, primeiroTokenMs, ms: Date.now() - started };
}

export { FN, ok, contagem, sessaoAnonima, chamar, chamarStream };


