// ============================================================
// Rate limit do Tutor IA (FASE 2, Etapa 13).
// ------------------------------------------------------------
// O estado fica NO BANCO, e nao em memoria, por um motivo medido:
// as Edge Functions do Supabase rodam em varias instancias, cada uma
// em seu processo. Um Map em memoria nunca acumula entre elas, entao o
// limite simplesmente nunca disparava (40 chamadas em rajada, zero 429).
// No Postgres o contador e unico, e o RLS garante que cada aluna so
// conta (e apaga) os proprios eventos.
//
// Fallback: se a tabela nao existir/falhar, usamos o Map em memoria e
// logamos, para o chat continuar funcionando em vez de cair.
import { TUTOR_RATE_LIMIT_MAX, TUTOR_RATE_LIMIT_WINDOW_MS } from "./_ai_config.js";

/** userId -> timestamps (ms). So e usado se o Postgres falhar. */
const janela = new Map();

function fallback(userId) {
  const agora = Date.now();
  const vivas = (janela.get(userId) ?? []).filter((t) => agora - t < TUTOR_RATE_LIMIT_WINDOW_MS);
  if (vivas.length >= TUTOR_RATE_LIMIT_MAX) {
    const retryAfterMs = Math.max(0, TUTOR_RATE_LIMIT_WINDOW_MS - (agora - vivas[0]));
    janela.set(userId, vivas);
    return { ok: false, remaining: 0, retryAfterMs };
  }
  vivas.push(agora);
  janela.set(userId, vivas);
  return { ok: true, remaining: TUTOR_RATE_LIMIT_MAX - vivas.length, retryAfterMs: 0 };
}

/**
 * Conta uma requisicao do usuario.
 * @param {{url:string, anonKey:string, token:string}} db  credenciais da chamada
 * @returns {Promise<{ok:boolean, remaining:number, retryAfterMs:number, via:string}>}
 */
export async function consumir(userId, db) {
  if (!db?.url || !db?.token) {
    return { ...fallback(userId), via: "memoria" };
  }

  try {
    const response = await fetch(
      `${db.url}/rest/v1/rpc/tutor_rate_check`,
      {
        method: "POST",
        headers: {
          apikey: db.anonKey ?? "",
          Authorization: `Bearer ${db.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_max: TUTOR_RATE_LIMIT_MAX, p_window_ms: TUTOR_RATE_LIMIT_WINDOW_MS }),
      },
    );
    if (!response.ok) throw new Error(`rpc_${response.status}`);

    const linha = (await response.json())?.[0];
    if (!linha) throw new Error("rpc_vazia");

    return {
      ok: Boolean(linha.allowed),
      remaining: Math.max(0, TUTOR_RATE_LIMIT_MAX - Number(linha.used ?? 0)),
      retryAfterMs: Number(linha.retry_after_ms ?? 0),
      via: "postgres",
    };
  } catch (error) {
    console.warn(`[rate-limit] usando memoria (${String(error?.message ?? error).slice(0, 80)})`);
    return { ...fallback(userId), via: "memoria" };
  }
}

/** So para teste: esvazia o estado em memoria de um usuario. */
export function zerar(userId) {
  janela.delete(userId);
}
