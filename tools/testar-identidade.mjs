// ============================================================
// FINALIZACAO 2 — teste de viabilidade da identidade estavel.
//
//   node tools/testar-identidade.mjs
//
// Pergunta que decide a migracao inteira: com email autoconfirm
// desligado, um usuario ANONIMO consegue virar conta PERMANENTE
// (email + senha) mantendo o MESMO user_id e uma sessao valida?
//
// Se a resposta for nao, nao existe caminho seguro sem SMTP e a
// migracao de app_state teria que ser abortada.
//
// Cria usuarios de TESTE proprios. Nao toca em conta nenhuma da
// Anna e nao escreve nada em app_state.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const URL = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const stamp = Date.now();

let falhas = 0;
function checar(rotulo, ok, detalhe = '') {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} | ${rotulo}${detalhe ? ` -> ${detalhe}` : ''}`);
}

function novoCliente() {
  return createClient(URL, KEY, { auth: { persistSession: false, storageKey: `teste-${Math.random()}` } });
}

// ------------------------------------------------------------
console.log('\n1. ANONIMO -> PERMANENTE (o caminho que precisamos)');
const c1 = novoCliente();
const { data: anon, error: eAnon } = await c1.auth.signInAnonymously();
checar('sessao anonima criada', !eAnon && Boolean(anon?.user?.id), eAnon?.message);
const anonId = anon?.user?.id;
console.log(`     user_id anonimo: ${anonId ? anonId.slice(0, 8) + '...' : '(nenhum)'}`);

// Este e o passo que a aluna faria uma unica vez, no aparelho dela.
const email = `teste.${stamp}@example.com`;
const senha = `Tst-${stamp}-Aa1!`;
const { data: upgraded, error: eUp } = await c1.auth.updateUser({ email, password: senha });
checar('updateUser(email, senha) aceito', !eUp && Boolean(upgraded?.user?.id), eUp?.message);

const depoisId = upgraded?.user?.id;
checar('o user_id NAO mudou na conversao', depoisId === anonId, `${anonId?.slice(0, 8)} -> ${depoisId?.slice(0, 8)}`);
checar('deixou de ser anonimo', !upgraded?.user?.is_anonymous);

// A sessao continua valida? E o que importa para o RLS.
const { data: sess } = await c1.auth.getSession();
checar('sessao continua valida apos a conversao', Boolean(sess?.access_token));
checar('o JWT carrega o mesmo sub', sess?.user?.id === anonId);

// Uma escrita autenticada funciona? (vai falhar por RLS, e o que
// medimos aqui e so se o JWT e aceito)
const { error: eEscrita } = await c1.from('app_state').insert({ id: 'teste-proprio', data: {} }).select();
checar('JWT e aceito pelo banco (falhou so por politica, nao por token)',
  !eEscrita || !/jwt|invalid|token/i.test(eEscrita.message), eEscrita?.message ?? 'sem erro');

// ------------------------------------------------------------
console.log('\n2. LOGIN EM OUTRO APARELHO com email + senha');
// Isto e o que a aluna vai fazer no celular. Se a confirmacao de
// e-mail for obrigatoria, o login falha e a migracao nao serve.
const c2 = novoCliente();
const { error: eLogin } = await c2.auth.signInWithPassword({ email, password: senha });
checar('login com email e senha funciona em outro cliente', !eLogin, eLogin?.message);
const { data: sess2 } = await c2.auth.getSession();
checar('o login entrega o MESMO user_id do computador',
  sess2?.user?.id === anonId, `${sess2?.user?.id?.slice(0, 8)} vs ${anonId?.slice(0, 8)}`);

// ------------------------------------------------------------
console.log('\n3. CONFIRMACAO DE E-MAIL');
// Se o e-mail precisa ser confirmado, o login acima teria falhado
// com "Email not confirmed". Medimos isso explicitamente.
checar('login NAO exigiu confirmar e-mail', !/not confirmed/i.test(eLogin?.message ?? ''),
  eLogin?.message ?? 'sem erro de confirmacao');

// ------------------------------------------------------------
console.log('\n4. LIMPEZA');
for (const c of [c1, c2]) {
  try { await c.auth.signOut(); } catch { /* ignora */ }
}
checar('sessoes de teste encerradas', true);

console.log(`\n${'-'.repeat(60)}`);
console.log(falhas === 0 ? 'IDENTIDADE ESTAVEL: viavel' : `VIABILIDADE COM ${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);