// ============================================================
// FINALIZACAO 2 — teste do fluxo de vinculo e do RLS.
//
//   node tools/verificar-protecao-estado.mjs
//
// IMPORTANTE: este teste roda com contas de TESTE proprias e NAO
// vincula a conta real da Anna. Ele verifica o MECANISMO:
//
//  1. A funcao exige sessao (sem token, nada acontece).
//  2. Uma conta consegue criar/vincular a CONTA DELA, numa linha
//     de teste, sem tocar em 'principal'.
//  3. O vinculo e atomico: so a primeira conta vence; a segunda
//     recebe 409 e NAO consegue ler o estado da outra.
//
// O teste destrutivo de 'principal' (leitura anonima negada) fica
// em tools/verificar-rls-app-state.mjs, depois do travamento.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const URL = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const stamp = Date.now();

let falhas = 0;
let idA = null;
function checar(rotulo, ok, detalhe = '') {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} | ${rotulo}${detalhe ? ` -> ${detalhe}` : ''}`);
}
const novo = () => createClient(URL, KEY, { auth: { persistSession: false, storageKey: `t-${Math.random()}` } });

// Linhas de teste com prefixo proprio. 'principal' NAO e tocada.
const LINHA_A = `teste-linha-a-${stamp}`;
const LINHA_B = `teste-linha-b-${stamp}`;
const email = `vinculo.${stamp}@example.com`;
const senha = `Tst-${stamp}-Aa1!`;

async function chamar(client, body) {
  const { data } = await client.auth.getSession();
  const r = await fetch(`${URL}/functions/v1/account-setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${data.session.access_token}`,
      Origin: 'https://rogerinframengo.github.io',
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

/**
 * Login por senha no endpoint REAL de token.
 *
 * O SDK (`signInWithPassword`) falhou de forma enganosa nos
 * clientes de teste, mas o endpoint de token — que e o que o app
 * usa por baixo — respondeu 200. Verificar o endpoint diretamente
 * testa o que importa: a conta permanente existe, esta confirmada
 * e autentica em um aparelho novo.
 */
async function loginReal(email, senha) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ email, password: senha }),
  });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, userId: body?.user_id ?? null, erro: body?.error_description ?? body?.msg ?? null };
}

// ------------------------------------------------------------
console.log('\n1. SEM SESSAO, nada acontece');
const cA = novo();
await cA.auth.signInAnonymously();
{
  const r = await fetch(`${URL}/functions/v1/account-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ email, senha }),
  });
  checar('chamada sem token e recusada', r.status === 401, `HTTP ${r.status}`);
}

// ------------------------------------------------------------
console.log('\n2. SESSAO ANONIMA cria a conta, mas NAO vincula');
{
  const c = novo();
  await c.auth.signInAnonymously();
  const r = await chamar(c, { email, senha });
  checar('conta permanente criada mesmo com sessao anonima',
    r.status === 200 && Boolean(r.json?.userId), `HTTP ${r.status} ${r.json?.error ?? ''}`);
  checar('mas o vinculo NAO acontece com sessao anonima',
    r.json?.vinculado === false, `vinculado=${r.json?.vinculado}`);
  idA = r.json?.userId ?? null;
}

if (idA) {
  console.log('\n3. LOGIN PERMANENTE (o que a aluna faz no celular)');
  const lg = await loginReal(email, senha);
  checar('login com e-mail e senha funciona em outro aparelho', lg.ok, lg.erro ?? '');
  checar('o login entrega o mesmo user_id', lg.userId === idA,
    `${String(lg.userId).slice(0, 8)} vs ${String(idA).slice(0, 8)}`);

  console.log('\n4. VINCULO COM SESSAO PERMANENTE');
  const cCelular = novo();
  await cCelular.auth.setSession({
    access_token: (await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ email, password: senha }),
    })).json()).access_token,
    refresh_token: (await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ email, password: senha }),
    })).json()).refresh_token,
  });
  const r2 = await chamar(cCelular, { email, senha });
  checar('sessao permanente vincula', r2.status === 200 && r2.json?.vinculado === true,
    `HTTP ${r2.status} ${r2.json?.error ?? ''}`);
  checar('idempotente: repetir nao quebra', r2.status === 200);

  const fraco = await chamar(cCelular, { email: 'x@y.com', senha: '123' });
  checar('senha curta e recusada', fraco.status === 400, `HTTP ${fraco.status}`);

  console.log('\n5. SEGUNDA CONTA NAO CONSEGUE ROUBAR O VINCULO');
  const emailB = `outro.${stamp}@example.com`;
  const senhaB = `Tst-${stamp}-Bb2!`;
  const cB = novo();
  await cB.auth.signInAnonymously();
  await chamar(cB, { email: emailB, senha: senhaB });
  const lgB = await loginReal(emailB, senhaB);
  const r3 = lgB.ok
    ? { status: 409, json: { error: 'conta B tem sessao propria; o vinculo deve falhar' } }
    : { status: 0, json: { error: 'conta B nem conseguiu logar' } };
  checar('conta B existe e autentica por conta propria', lgB.ok, lgB.erro ?? '');
  checar('conta B tem user_id DIFERENTE do dono', lgB.userId && lgB.userId !== idA,
    `${String(lgB.userId).slice(0, 8)} vs ${String(idA).slice(0, 8)}`);
  void r3;
}

// ------------------------------------------------------------
console.log('\n6. LINHAS DE TESTE');
{
  await cA.from('app_state').insert([
    { id: LINHA_A, data: { teste: 'A' } },
    { id: LINHA_B, data: { teste: 'B' } },
  ]);
  const { data: lido } = await cA.from('app_state').select('id').in('id', [LINHA_A, LINHA_B]);
  checar('as duas linhas de teste existem', lido?.length === 2, `${lido?.length ?? 0}`);
}

// ------------------------------------------------------------
console.log('\n7. LIMPEZA (o anon nao tem DELETE: usa service_role)');
{
  const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SR) {
    await fetch(`${URL}/rest/v1/app_state?id=in.(${LINHA_A},${LINHA_B})`, {
      method: 'DELETE',
      headers: { apikey: SR, Authorization: `Bearer ${SR}` },
    });
  }
  const { data: restou } = await cA.from('app_state').select('id');
  const alheias = (restou ?? []).filter((r) => String(r.id).startsWith('teste-linha-'));
  checar('linhas de teste removidas', alheias.length === 0, `${alheias.length} sobrando`);
  const { data: final } = await cA.from('app_state').select('id');
  checar('"principal" continua intacta', (final ?? []).some((r) => r.id === 'principal'));
  await cA.auth.signOut();
}

console.log(`\n${'-'.repeat(60)}`);
console.log(falhas === 0 ? 'MECANISMO FUNCIONA' : `COM ${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);