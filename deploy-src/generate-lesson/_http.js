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

/** Devolve a origem da requisicao se ela estiver na allowlist. */
export function corsHeaders(req) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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
