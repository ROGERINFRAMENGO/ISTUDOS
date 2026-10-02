// ============================================================
// FINALIZACAO 2 — vincula a conta permanente ao estado guardado.
//
//   POST /functions/v1/account-setup   { email, senha }
//
// POR QUE EXISTE
//
// A aluna hoje usa senha de dispositivo no frontend e login anonimo
// no Supabase. Login anonimo cria um user_id DIFERENTE em cada
// aparelho, entao a linha unica de app_state (id='principal') so
// podia ser protegida por politica aberta — que e a vulnerabilidade:
// qualquer pessoa com a chave anonima lia e escrevia o estado dela.
//
// Para ter identidade estavel entre computador e celular ha duas
// saidas: e-mail com confirmacao por link (o projeto esta com o
// limite de e-mails esgotado e nao ha SMTP configurado), ou uma
// conta permanente CONFIRMADA pelo servidor. E esta segunda.
//
// O QUE FAZ
//  1. Autentica a requisicao (JWT real, mesmo authenticate() das
//     demais funcoes).
//  2. Cria a conta permanente pela API de administracao, ja com
//     e-mail confirmado — por isso nao envia e-mail e o login por
//     senha funciona depois em qualquer aparelho.
//  3. Entrega a identificacao da conta.
//  4. Vincula a linha 'principal' ao user_id, de forma ATOMICA e
//     so se ela ainda estiver sem dono. Este passo exige sessao
//     PERMANENTE: e ele que concede acesso ao historico.
//
// O QUE NAO FAZ
//  - Nao apaga nem sobrescreve a linha existente.
//  - Nao rouba: se a linha JA tem dono e o dono e outro, devolve
//    409 e nao mexe.
//  - Nao devolve service_role, senha nem o segredo administrativo.
//
// A service_role fica NESTA funcao, no backend. O bundle do cliente
// nunca ve essa chave.
// ============================================================

import { authenticate, handleOptions, json } from "../_shared/http.js";
import { createDb } from "../_shared/db.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STATE_ROW = "principal";

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) {
    return json({ error: "unauthorized", message: "Faca login antes de vincular a conta." }, 401, req);
  }

  if (!SERVICE_ROLE || !SUPABASE_URL) {
    return json({ error: "not_configured", message: "Funcao sem credencial administrativa." }, 503, req);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid_body" }, 400, req); }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const senha = String(body?.senha ?? body?.password ?? "");
  if (!email || !email.includes("@")) return json({ error: "invalid_email" }, 400, req);
  if (senha.length < 8) return json({ error: "weak_password" }, 400, req);

  // Passo 1: criar (ou confirmar) a conta permanente.
  //
  // Isto ACEITA sessao anonima de proposito. Criar conta e gratuito
  // e inofensivo, e e a unica saida quando o projeto esta com o
  // limite de e-mails esgotado e sem SMTP: o cliente nao consegue
  // fazer signUp, mas a API de administracao nao passa por esse
  // limite.
  const criado = await criarOuConfirmarConta(email, senha);
  if (criado.error) {
    return json({ error: criado.error, message: criado.message }, criado.status, req);
  }
  const userId = criado.id;

  // Passo 2: VINCULAR o estado. Aqui a sessao anonima NAO passa.
  //
  // Vincular e o ato que concede acesso ao historico da aluna, e ele
  // exige uma sessao permanente, em que auth.uid() e um
  // identificador estavel e comprovadamente o dela. Sem isso,
  // qualquer visitante anonimo poderia reivindicar a linha e passar
  // a ler o progresso e o historico da tutora.
  if (auth.isAnonymous) {
    return json({
      ok: true,
      userId,
      contaPronta: true,
      vinculado: false,
      proximoPasso: "entre com e-mail e senha para vincular o estado",
    }, 200, req);
  }

  const db = createDb({ url: SUPABASE_URL, anonKey: SERVICE_ROLE, token: SERVICE_ROLE });
  let vinculado;
  try {
    vinculado = await db.vincularDono(STATE_ROW, userId);
  } catch (error) {
    console.error("[account-setup] falha ao vincular", String(error?.message ?? error).slice(0, 160));
    return json({ error: "claim_failed", message: "Nao consegui vincular o estado." }, 502, req);
  }

  if (vinculado === "ja_tem_outro_dono") {
    return json({ error: "already_owned", message: "Esse estado ja pertence a outra conta." }, 409, req);
  }

  return json({
    ok: true,
    userId,
    vinculado: true,
    vinculadoAgora: vinculado === "vinculado",
    email,
  }, 200, req);
});
async function criarOuConfirmarConta(email, senha) {
  const criado = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  });

  if (criado.ok) {
    const u = await criado.json();
    return { id: u.id };
  }

  const body = await criado.json().catch(() => ({}));
  const msg = String(body?.msg ?? body?.message ?? body?.error_description ?? "");

  // "already registered": a conta existe. Ajusta a senha e confirma
  // o e-mail, que e o que permite login depois em outro aparelho.
  if (/already|registered|exists/i.test(msg)) {
    const lista = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: adminHeaders(),
    });
    const todos = lista.ok ? await lista.json() : { users: [] };
    const alvo = (todos.users ?? []).find((u) => String(u.email ?? "").toLowerCase() === email);
    if (!alvo) return { error: "user_not_found", message: "Conta nao encontrada.", status: 404 };

    const atualizou = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${alvo.id}`, {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ password: senha, email_confirm: true }),
    });
    if (!atualizou.ok) {
      return { error: "update_failed", message: "Nao consegui atualizar a conta.", status: 502 };
    }
    const u = await atualizou.json();
    return { id: u.id };
  }

  // Limite de e-mail do projeto, por exemplo. Nao e bloqueio de
  // arquitetura: a API de administracao nao passa por esse limite.
  console.error(`[account-setup] admin create falhou: ${msg.slice(0, 180)}`);
  return { error: "create_failed", message: "Nao consegui criar a conta.", status: 502 };
}