// ============================================================
// Configuração central de provider/modelo.
// ------------------------------------------------------------
// A chave NUNCA entra aqui: NVIDIA_API_KEY vive somente como
// secret da Edge Function. Este arquivo decide QUAL modelo chamar,
// e permite trocar o principal e o fallback sem mexer no resto.
// ============================================================

export const AI_PROVIDER = "nvidia";
export const AI_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * RESULTADO DA FASE 1 (18 geracoes reais, sem cache):
 *   diffusiongemma .... 8.1s (port) / 6.6s (cie) · JSON e schema OK
 *   muse-glimmer ...... 58.8s (port) / 56.4s (cie) · JSON e schema OK
 *   nemotron-lightning  ~56s · JSON invalido em 4 de 6 geracoes
 * O DiffusionGemma entrega a mesma qualidade pedagogica com ~8x menos
 * latencia, entao vira o PRINCIPAL. O Muse continua como FALLBACK:
 * e o modelo que hoje sustenta a geracao de aulas, entao se o rapido
 * falhar (timeout/JSON) a aula continua sendo gerada por ele.
 */
export const AI_PRIMARY_MODEL = "google/diffusiongemma-26b-a4b-it";
export const AI_FALLBACK_MODEL = "meta/muse-glimmer-30b";

/** Candidatos a fallback, medidos pelo ai-bench (busca de um fallback
 *  mais rapido que o Muse Glimmer). Nao entram sozinhos no fluxo. */
export const BENCH_MODELS = [
  "openai/gpt-oss-20b",
  "google/gemma-4-31b-it",
  "meta/muse-glimmer-30b",
];

export const AI_TEMPERATURE = 0.55;
export const AI_MAX_TOKENS = 2400;
export const AI_REQUEST_TIMEOUT_MS = 140000;
