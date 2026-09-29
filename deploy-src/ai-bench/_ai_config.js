// ============================================================
// Configuração central de provider/modelo.
// ------------------------------------------------------------
// A chave NUNCA entra aqui: NVIDIA_API_KEY vive somente como
// secret da Edge Function. Este arquivo decide QUAL modelo chamar,
// e permite trocar o principal e o fallback sem mexer no resto.
// ============================================================

export const AI_PROVIDER = "nvidia";
export const AI_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Modelo principal (rápido) e fallback (qualidade). */
export const AI_PRIMARY_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
export const AI_FALLBACK_MODEL = "meta/muse-glimmer-30b";

/** Lista usada pelo benchmark da FASE 1. */
export const BENCH_MODELS = [
  "meta/muse-glimmer-30b",
  "google/diffusiongemma-26b-a4b-it",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
];

export const AI_TEMPERATURE = 0.55;
export const AI_MAX_TOKENS = 2400;
export const AI_REQUEST_TIMEOUT_MS = 140000;
