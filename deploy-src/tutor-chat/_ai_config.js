// ============================================================
// Configuração central de provider/modelo.
// ------------------------------------------------------------
// A chave NUNCA entra aqui: NVIDIA_API_KEY vive somente como
// secret da Edge Function. Este arquivo decide QUAL modelo chamar,
// e permite trocar o principal e o fallback sem mexer no resto.
//
// IMPORTANTE: o chat (Tutor IA) NAO usa este bloco. Ele tem a sua
// propria configuração, ao final deste arquivo (TUTOR_*), porque
// usa o Gemini e nao a NVIDIA. Trocar o modelo da aula nunca pode
// mexer no modelo do chat, e vice-versa.
// ============================================================

export const AI_PROVIDER = "nvidia";
export const AI_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * RESULTADO DA FASE 1 (18 geracoes reais, sem cache):
 *   diffusiongemma .... 8.1s (port) / 6.6s (cie) · JSON e schema OK
 *   muse-glimmer ...... 58.8s (port) / 56.4s (cie) · JSON e schema OK
 *   nemotron-lightning  ~56s · JSON invalido em 4 de 6 geracoes
 * Busca de fallback (FASE 1b, 6 geracoes por modelo, sem cache):
 *   gpt-oss-20b ........ 0/6 no validateLesson (JSON truncado)
 *   gemma-4-31b-it ..... 3/4 no validateLesson, porem 84-132s e 1 timeout
 *   muse-glimmer ....... mais rapido e mais estavel que o gemma neste prompt
 * O DiffusionGemma entrega a mesma qualidade pedagogica com ~8x menos
 * latencia, entao vira o PRINCIPAL. O Muse continua como FALLBACK.
 */
export const AI_PRIMARY_MODEL = "google/diffusiongemma-26b-a4b-it";
export const AI_FALLBACK_MODEL = "meta/muse-glimmer-30b";

/** Candidatos a fallback ja medidos (nao entram sozinhos no fluxo). */
export const BENCH_MODELS = [
  "openai/gpt-oss-20b",
  "google/gemma-4-31b-it",
  "meta/muse-glimmer-30b",
];

export const AI_TEMPERATURE = 0.55;
export const AI_MAX_TOKENS = 2400;
export const AI_REQUEST_TIMEOUT_MS = 140000;

// ============================================================
// TUTOR IA (chat) — provider SEPARADO da geracao de aulas.
// ------------------------------------------------------------
// Provider: Gemini (Google AI Studio / Generative Language API).
// A chave vive SOMENTE no secret GEMINI_API_KEY da Edge Function.
//
// SONDAGEM REAL desta chave (scripts/sondar-gemini.mjs):
//   gemini-2.5-flash ...... 404 (bloqueado para contas novas)
//   gemini-3.8-flash ...... OK, ~1-4s, mas 503 intermittently (demanda)
//   gemini-flash-lite-latest . OK, ~0.9-1s, o mais estavel
//   streamGenerateContent . OK (SSE), confirmado nas duas respostas
// A ordem abaixo reflete a sondagem: tenta o 3.8 (qualidade), cai no
// flash-lite (rapidez/estabilidade) se o primeiro estiver com demanda.
// ============================================================

export const TUTOR_PROVIDER = "gemini";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Ordem de tentativa. O primeiro que responder vence; os proximos
 * so entram quando o anterior falha de forma TRANSITORIA (429/5xx).
 * Erro permanente (400/404) cai direto para o proximo sem insistir.
 */
export const TUTOR_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-lite-latest",
];

export const TUTOR_PRIMARY_MODEL = TUTOR_MODELS[0];
export const TUTOR_FALLBACK_MODEL = TUTOR_MODELS[1] ?? TUTOR_MODELS[0];

export const TUTOR_TEMPERATURE = 0.6;
export const TUTOR_MAX_TOKENS = 1500;

// Timeout generoso: o chat tem de parecer instantaneo, mas uma travada
// nao pode deixar a Edge Function pendurada ate o limite do gateway.
export const TUTOR_TIMEOUT_MS = 45000;

// Tentativas por modelo, apenas para erro transitorio (429/5xx/rede).
// Com 2 modelos e 2 tentativas o pior caso e 4 chamadas, e ainda assim
// cada uma respeita o timeout acima.
export const TUTOR_MAX_ATTEMPTS = 2;
export const TUTOR_BACKOFF_MS = 700;

/**
 * Rate limit por usuario (janela deslizante em memoria da instancia).
 * 20 mensagens por minuto e folgado para uma sessao normal de estudo,
 * mas corta loop/spam acidental antes de gastar cota do Gemini.
 */
export const TUTOR_RATE_LIMIT_MAX = 20;
export const TUTOR_RATE_LIMIT_WINDOW_MS = 60000;

/** Mensagem da aluna: acima disso truncamos em vez de mandar tudo. */
export const TUTOR_MAX_MESSAGE_CHARS = 2000;

/**
 * Janela de contexto da conversa. 16 mensagens cobrem o par
 * pergunta/resposta recente (o caso "e gene?" depois de "não entendi
 * DNA") sem inflar o prompt. O modelo le as duas ultimas sempre.
 */
export const TUTOR_HISTORY_LIMIT = 16;
