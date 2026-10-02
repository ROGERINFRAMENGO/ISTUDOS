// ============================================================
// account.js — identidade permanente do ISTUDOS.
//
// FINALIZACAO 2. Ate aqui o app usava so senha de dispositivo (que
// nao e seguranca: e texto no JavaScript) e sessao anonima do
// Supabase (que cria um user_id diferente em cada aparelho). Com as
// politicas de app_state agora vinculadas a um dono, e obrigatorio
// que a sessao do sync seja a MESMA em computador e celular — e o
// unico jeito e uma conta permanente.
//
// A senha NAO e guardada em localStorage: a sessao do Supabase ja
// persiste o refresh token, e e isso que faz o aparelho lembrar da
// conta. Nada de senha em disco pelo nosso codigo.
// ============================================================

import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';

const EMAIL_KEY = 'istudos_conta_email';

/** A sessao atual e permanente (nao anonima)? */
export async function currentAccount() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const u = data?.session?.user;
    if (!u) return null;
    return { userId: u.id, email: u.email ?? null, anonima: Boolean(u.is_anonymous) };
  } catch {
    return null;
  }
}

/**
 * Entra com e-mail e senha. E o caminho do celular: a mesma conta,
 * o mesmo user_id, o mesmo estado.
 */
export async function entrar(email, senha) {
  if (!isSupabaseConfigured) return { ok: false, erro: 'Supabase nao configurado.' };
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email ?? '').trim().toLowerCase(),
    password: String(senha ?? ''),
  });
  if (error) return { ok: false, erro: 'E-mail ou senha incorretos.' };
  try { localStorage.setItem(EMAIL_KEY, data.user.email ?? ''); } catch { /* modo privado */ }
  return { ok: true, userId: data.user.id, email: data.user.email };
}

/**
 * Cria (ou recupera) a conta permanente e devolve o user_id.
 *
 * Chama a Edge Function account-setup, que usa a service_role no
 * servidor. O motivo de nao criar a conta direto daqui: o projeto
 * esta com o limite de e-mails do Supabase esgotado e nao tem SMTP,
 * entao o signUp do cliente falha. A API de administracao nao passa
 * por esse limite, e confirma o e-mail no servidor — por isso o
 * login funciona depois em qualquer aparelho sem depender de
 * e-mail nenhum.
 */
export async function criarConta(email, senha) {
  if (!isSupabaseConfigured) return { ok: false, erro: 'Supabase nao configurado.' };
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return { ok: false, erro: 'Sem sessao. Recarregue a pagina.' };

  const r = await fetch(`${SUPABASE_URL}/functions/v1/account-setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, senha }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 409) return { ok: false, erro: 'Esse estado ja pertence a outra conta.' };
    return { ok: false, erro: j?.message ?? 'Nao consegui criar a conta.' };
  }
  try { localStorage.setItem(EMAIL_KEY, j.email ?? ''); } catch { /* modo privado */ }
  return { ok: true, userId: j.userId, vinculado: Boolean(j.vinculado) };
}

/**
 * A conta e criada junto com o vinculo, em uma unica chamada. Nao ha
 * atalho seguro para "criar agora, vincular depois": o vinculo exige
 * sessao permanente, e a sessao permanente so existe depois do login.
 */
export async function entrarEOuCriar(email, senha, { criando = false } = {}) {
  if (criando) return criarConta(email, senha);
  return entrar(email, senha);
}

export async function sair() {
  if (!isSupabaseConfigured) return;
  try { await supabase.auth.signOut(); } catch { /* ignora */ }
}