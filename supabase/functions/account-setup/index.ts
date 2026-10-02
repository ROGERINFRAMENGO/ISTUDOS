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
//  4. NAO vincula o app_state. O vinculo e do ADMIN.
//
// POR QUE O PASSO 4 SUMIU
//
// A versao anterior tentava dar o dono da linha aqui, via
// vincularDono() com o filtro `owner_id is null`. Em 02/10/2026 a
// janela de bootstrap foi FECHADA: as politicas do app_state-passaram
// a exigir `owner_id = auth.uid()` sem excecao para linha sem dono.
// Com isso, o PATCH por uma sessao anonima ou por conta nao-dona
// volta 0 linhas — o vinculo por aqui ja era imposible, e insistir
// seria so uma porta que parece aberta e nao esta.
//
// O vinculo e agora uma operacao unica do admin:
//   tools/vincular-dono-app-state.sql
// Isso remove a necessidade de qualquer segredo de bootstrap no
// frontend, no localStorage ou no corpo de uma requisicao.
//
// SEGURANCA — TOMADA DE CONTA
//
// E-mail que JA EXISTE nao tem a senha alterada. A versao anterior
// fazia PUT /admin/users/:id com a senha vinda no corpo sempre que a
// criacao respondia "already registered": qualquer pessoa que
// soubesse o e-mail de outra tomava a conta dela. Nao existe nenhum
// PUT de senha neste arquivo. Para entrar numa conta existente a
// aluna faz login normal no Supabase.
//
// O QUE NAO FAZ
//  - Nao apaga nem sobrescreve a linha existente.
//  - Nao redefine senha de conta existente.
//  - Nao vincula o app_state.
//  - Nao devolve service_role, senha nem o segredo administrativo.
//
// A service_role fica NESTA funcao, no backend. O bundle do cliente
// nunca ve essa chave.
// ============================================================

// NOTA DE BUILD
//
// Os helpers de CORS/auth estao replicados aqui em vez de importados
// de `_shared/http.js`: o bundler do deploy resolve o caminho
// relativo para fora da pasta de source, e um arquivo de seguranca
// nao deve depender de um import que pode ou nao resolver.
//
// ----------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const DEFAULT_ORIGINS = [
  "https://rogerinframengo.github.io",
  "https://ehuwpvgcmssxrafsmtfo.supabase.co",
];

function allowedOrigins() {
  const extra = String(Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

function isRedePrivada(origin) {
  return /^https?:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
}

function corsHeaders(req) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const echo = origin && (allowed.includes(origin) || isRedePrivada(origin)) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": echo,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status, req) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Verifica o JWT no servico de auth do proprio Supabase. */
async function authenticate(req) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !SUPABASE_URL || !ANON_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = await response.json();
    if (!user?.id) return null;
    return {
      userId: String(user.id),
      email: user.email ?? null,
      isAnonymous: Boolean(user.is_anonymous),
    };
  } catch (error) {
    console.error("[account-setup] falha ao verificar o token", String(error?.message ?? error).slice(0, 120));
    return null;
  }
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const auth = await authenticate(req);
  if (!auth) {
    return json({ error: "unauthorized", message: "Faca login antes de criar a conta." }, 401, req);
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

  // Passo 1: conta permanente.
  //
  // REGRA INEGOCIAVEL: e-mail que JA EXISTE nao tem a senha mexida.
  // A versao anterior tratava o "already registered" como um sinal
  // para fazer PUT /admin/users/:id com a senha que chegou no corpo
  // da requisicao. Isso dava tomada de conta de qualquer conta: bastava
  // saber o e-mail da pessoa e escolher a senha. Aqui a conta
  // existente simplesmente NAO e tocada.
  //
  // Como a aluna entra na conta que ja existe? Fazendo login normal
  // no Supabase com a senha dela. A sessao permanente resultante e
  // que prova a posse no passo 2.
  const existente = await buscarConta(email);

  let userId;
  if (existente) {
    // So a propria sessao permanente da conta alvo pode seguir.
    if (auth.isAnonymous || auth.userId !== existente.id) {
      return json({
        error: "account_exists",
        message: "Ja existe uma conta com esse e-mail. Entre com sua senha.",
      }, 409, req);
    }
    userId = existente.id;
  } else {
    const criado = await criarConta(email, senha);
    if (criado.error) {
      return json({ error: criado.error, message: criado.message }, criado.status, req);
    }
    userId = criado.id;
  }

  // O estado NAO e vinculado aqui. Ver o cabecalho: o vinculo e do
  // admin, em operacao unica e auditavel.
  //
  // devolvemos o userId porque e ele que o admin precisa para rodar
  // tools/vincular-dono-app-state.sql. Nao e segredo: e o proprio
  // identificador da conta que a pessoa acabou de criar.
  return json({
    ok: true,
    userId,
    contaCriada: !existente,
    vinculado: false,
    proximoPasso: "o administrador vincula o estado com tools/vincular-dono-app-state.sql",
  }, 200, req);
});
/**
 * Procura a conta pelo e-mail. Usado ANTES de qualquer escrita: e o
 * que permite recusar um e-mail ja existente em vez de tomar conta
 * dele. Le SOMENTE — nunca altera nada.
 */
async function buscarConta(email) {
  const resposta = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`,
    { headers: adminHeaders() },
  );
  if (!resposta.ok) return null;
  const dados = await resposta.json().catch(() => ({ users: [] }));
  return (dados.users ?? []).find(
    (u) => String(u.email ?? "").toLowerCase() === email,
  ) ?? null;
}

/**
 * Cria a conta ja com e-mail confirmado.
 *
 * So chega aqui quando `buscarConta` NAO achou o e-mail, ou seja,
 * quando o e-mail estava livre. Nao existe redefinicao de senha
 * neste arquivo: nao ha nenhum PUT /admin/users/:id.
 *
 * Usar a API de administracao (e nao signUp) e proposital: o projeto
 * esta com o limite de e-mails do Supabase esgotado e sem SMTP, e o
 * signUp do cliente nao passaria por esse limite.
 */
async function criarConta(email, senha) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  });

  if (resposta.ok) {
    const u = await resposta.json();
    return { id: u.id };
  }

  const body = await resposta.json().catch(() => ({}));
  const msg = String(body?.msg ?? body?.message ?? body?.error_description ?? "");

  // Corrida: outra requisicao criou a conta entre a busca e a criacao.
  // Nao tentamos de novo com PUT — devolvemos para o cliente entrar
  // com a senha que ela ja conhece.
  if (/already|registered|exists/i.test(msg)) {
    return { error: "account_exists", message: "Ja existe uma conta com esse e-mail. Entre com sua senha.", status: 409 };
  }

  // Sem mensagem de e-mail, limite, etc. Nao e bloqueio de arquitetura:
  // a API de administracao nao passa pelo limite do projeto.
  console.error(`[account-setup] admin create falhou: ${msg.slice(0, 180)}`);
  return { error: "create_failed", message: "Nao consegui criar a conta.", status: 502 };
}