// ============================================================
// GROQ — CONTEUDO ESTRUTURADO
// ------------------------------------------------------------
// Chamada OpenAI-compatible com JSON Schema estrito.
//
// POR QUE EXISTE SEPARADO DE _shared/groq.js
// _shared/groq.js e do TUTOR: ele le GROQ_API_KEY, tem
// TUTOR_MODELS, temperatura e personality proprias. Este arquivo nao
// importa aquele, nao le GROQ_API_KEY e nao conhece TUTOR_*. A chave
// chega como PARAMETRO, sempre vinda do chamador, de modo que a
// separacao de credenciais fica visivel no codigo e nao em comentario.
//
// Diante de metodos, a FASE D usa GROQ_CUSTOM_LESSON_API_KEY e a
// FASE A usa GROQ_CONTENT_API_KEY. Os dois nomes aparecem aqui como
// texto, e nenhum dos dois cai para o outro.
//
// Sem eval, sem Function: o texto do modelo so e JSON.parse, e o
// resultado passa pelo mesmo validateLesson() das aulas do
// cronograma. ============================================================

const GROQ_BASE = "https://api.groq.com/openai/v1";

export class ContentError extends Error {
  constructor(kind, message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "ContentError";
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Traduz falha do provider em `kind` distinguivel. O front precisa
 * separar "a cota acabou" de "a IA errou" de "a rede caiu", porque a
 * mensagem para a aluna e diferente em cada caso.
 */
function classificarErro(status, mensagem) {
  const m = String(mensagem ?? "");
  if (/tokens per day|TPD/i.test(m)) return "quota_diaria";
  if (/tokens per minute|TPM|output tokens per minute|OTPM/i.test(m)) return "quota_minuto";
  if (status === 429) return "quota_minuto";
  if (status === 401 || status === 403) return "credencial";
  if (status === 400) return "schema";
  if (status >= 500) return "provider";
  if (status === 0) return "rede";
  return "http";
}

/**
 * Uma chamada ao modelo. Nao repete: o retry fica em quem chama, para
 * nao criar loop escondido.
 *
 * @returns {Promise<{ok:true, data:object, usage:object}|{ok:false, kind:string, detail:string, status:number}>}
 */
export async function gerarConteudoEstruturado({
  apiKey,
  model,
  system,
  user,
  schema,
  maxTokens = 8192,
  temperature = 0.55,
  reasoning = "low",
  timeoutMs = 150000,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature,
        max_tokens: maxTokens,
        ...(reasoning ? { reasoning_effort: reasoning } : {}),
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: { name: "aula", strict: true, schema },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const cancelado = error?.name === "AbortError";
    return {
      ok: false,
      kind: cancelado ? "timeout" : "rede",
      detail: cancelado ? "a IA demorou demais" : String(error?.message ?? "falha de rede").slice(0, 200),
      status: 0,
    };
  }
  clearTimeout(timer);

  const bruto = await response.text();
  let data = null;
  try { data = JSON.parse(bruto); } catch { /* resposta nao-JSON */ }

  if (!response.ok) {
    const mensagem = String(data?.error?.message ?? bruto ?? "");
    const kind = classificarErro(response.status, mensagem);
    return {
      ok: false,
      kind,
      detail: mensagem.slice(0, 300),
      status: response.status,
    };
  }

  const texto = String(data?.choices?.[0]?.message?.content ?? "");
  if (!texto.trim()) {
    return { ok: false, kind: "vazio", detail: "o modelo devolveu resposta sem conteudo", status: response.status };
  }
  try {
    return {
      ok: true,
      data: JSON.parse(texto.trim()),
      usage: {
        prompt: data?.usage?.prompt_tokens ?? null,
        saida: data?.usage?.completion_tokens ?? null,
        total: data?.usage?.total_tokens ?? null,
      },
      finish: data?.choices?.[0]?.finish_reason ?? null,
    };
  } catch {
    return { ok: false, kind: "json", detail: "a IA devolveu texto que nao e JSON", status: response.status };
  }
}