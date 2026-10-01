// ============================================================
// Helpers HTTP das Edge Functions (CORS + autenticacao + JSON).
// A autenticacao e real: o user_id vem do JWT verificado pelo Supabase,
// nunca do corpo da requisicao.
// ============================================================

const DEFAULT_ORIGINS = [
  "https://rogerinframengo.github.io",
  "https://ehuwpvgcmssxrafsmtfo.supabase.co",
];

function allowedOrigins() {
  const extra = String(Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

/**
 * Desenvolvimento local: o Vite abre em http://192.168.x.x:5173 quando a
 * aluna acessa pelo celular ou por outro aparelho na mesma rede. O
 * regex antigo so aceitava "localhost" e "127.0.0.1", entao a origem
 * real caia na allowlist e o navegador abortava o fetch com
 * "TypeError: Failed to fetch" - sem a requisicao chegar na Edge
 * Function. O sintoma era "a tutora nao responde no site".
 *
 * Aqui liberamos 127.0.0.0/8, 10.x, 172.16-31.x e 192.168.x, que sao
 * faixas privadas e nunca publicas. A origem continua sendo devolvida
 * (echo), nunca "*", porque a requisicao leva o header Authorization.
 */
function isRedePrivada(origin) {
  return /^https?:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
    origin,
  );
}

/** Devolve a origem da requisicao se ela estiver na allowlist. */
export function corsHeaders(req) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const isLocal = isRedePrivada(origin);
  const echo = origin && (allowed.includes(origin) || isLocal) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": echo,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export function json(body, status, req) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function handleOptions(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  return null;
}

/**
 * Verifica o JWT chamando o servico de auth do proprio Supabase.
 * @returns {Promise<{userId:string, email:string|null, isAnonymous:boolean}|null>}
 */
export async function authenticate(req) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!token || !url || !anonKey) return null;

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = await response.json();
    if (!user?.id) return null;
    return {
      userId: String(user.id),
      email: user.email ?? null,
      isAnonymous: Boolean(user.is_anonymous),
      token,
    };
  } catch (error) {
    console.error("[auth] falha ao verificar o token", error);
    return null;
  }
}

export function readEnv(name) {
  return Deno.env.get(name) ?? "";
}
