// ============================================================
// Configuração central de provider/modelo.
// ------------------------------------------------------------
// A chave NUNCA entra aqui: NVIDIA_API_KEY vive somente como
// secret da Edge Function. Este arquivo decide QUAL modelo chamar,
// e permite trocar o principal e o fallback sem mexer no resto.
//
// IMPORTANTE: o chat (Tutor IA) NAO usa este bloco. Ele tem a sua
// propria configuração, ao final deste arquivo (TUTOR_*), porque
// usa a Groq e nao a NVIDIA. Trocar o modelo da aula nunca pode
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
// PROVIDER ATUAL: GROQ (API compativel com OpenAI).
// A chave vive SOMENTE no secret GROQ_API_KEY da Edge Function e
// nunca chega ao navegador, nem entra em log ou resposta.
//
// TROCA DE PROVIDER (FASE 3): o Tutor usava o Gemini. A chave do
// Gemini ficou com 429 em todos os modelos, entao migramos para a
// Groq, que responde em ~0,3-0,6s. A GEMINI_API_KEY continua
// guardada no Supabase por seguranca, mas o TutorChat nao a usa.
//
// SONDAGEM REAL (tools/sondar-groq.mjs, 29/09/2026):
//   openai/gpt-oss-20b ... HTTP 200, text/event-stream
//   124-235 pedacos SSE por resposta
//   primeiro token ....... 287ms (reasoning_effort=low)
//   tempo total ......... 538-644ms
//   reasoning ........... o modelo emite campo proprio (38-66 chars)
//   rate limit .......... 1000 req/min, exposto em x-ratelimit-*
//
// O chat (Tutor IA) NAO usa o bloco AI_* acima: trocar o modelo da
// aula nunca pode mexer no modelo do chat, e vice-versa.
// ============================================================

export const TUTOR_PROVIDER = "groq";

/** API compativel com OpenAI. */
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Nome do secret que guarda a chave. */
export const TUTOR_API_KEY_SECRET = "GROQ_API_KEY";

/**
 * Ordem de tentativa. O primeiro que responder vence; os proximos so
 * entram quando o anterior falha de forma TRANSITORIA (429/5xx/rede).
 * Erro permanente (400/401/404) cai direto sem insistir.
 *
 * Medido na sondagem: o gpt-oss-20b respondeu em 287-496ms, entao
 * ele ja e o principal. O llama e apenas rede de seguranca.
 */
export const TUTOR_MODELS = [
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
];

export const TUTOR_PRIMARY_MODEL = TUTOR_MODELS[0];
export const TUTOR_FALLBACK_MODEL = TUTOR_MODELS[1] ?? TUTOR_MODELS[0];

export const TUTOR_TEMPERATURE = 0.6;
export const TUTOR_MAX_TOKENS = 1500;

/**
 * Reasoning do gpt-oss-20b: "low" prioriza latencia, que e o que a
 * aluna sente. Medido: 287ms de primeiro token com "low" contra 496ms
 * sem configuracao. Para duvida de prova complexa a aluna pode pedir
 * "pense com calma" no texto e a Tutora sobe para "medium".
 */
export const TUTOR_REASONING_DEFAULT = "low";
export const TUTOR_REASONING_ALTO = "medium";

/**
 * Timeout generoso: o chat tem de parecer instantaneo, mas uma travada
 * nao pode deixar a Edge Function pendurada ate o limite do gateway.
 */
export const TUTOR_TIMEOUT_MS = 45000;

/**
 * Tentativas por modelo, apenas para erro transitorio (429/5xx/rede).
 * Com 2 modelos e 2 tentativas o pior caso e 4 chamadas, e ainda assim
 * cada uma respeita o timeout acima.
 */
export const TUTOR_MAX_ATTEMPTS = 2;
export const TUTOR_BACKOFF_MS = 700;

// ============================================================
// QUIZ (provider SEPARADO do Tutor e da geracao de aulas)
// ------------------------------------------------------------
// PROVIDER: GROQ, mas com a CREDENCIAL DE CONTEUDO.
//
// REGRA: este bloco nao pode ser confundido com o Tutor. O Tutor usa
// GROQ_API_KEY (TUTOR_API_KEY_SECRET) e NAO MUDA. O quiz usa
// GROQ_CONTENT_API_KEY, que tem cota propria. Trocar o modelo do quiz
// nunca pode mexer no chat, e vice-versa.
//
// O modelo foi escolhido pelo benchmark FASE 1D: 8 de 8 quizzes
// passaram no validateQuiz de producao, com mediana de 2,8s, contra
// 134s do muse-glimmer da NVIDIA.
// ============================================================

export const QUIZ_PROVIDER = "groq";

/** API compativel com OpenAI. */
export const QUIZ_BASE_URL = "https://api.groq.com/openai/v1";

/** Nome do secret exclusivo de conteudo. NUNCA o do Tutor. */
export const QUIZ_API_KEY_SECRET = "GROQ_CONTENT_API_KEY";

export const QUIZ_MODEL = "openai/gpt-oss-120b";

/**
 * Versao do CONTEUDO do quiz. Entra no cache junto com a aula e a
 * dificuldade. Bump aqui faz todos os quizzes virarem cache miss e
 * serem regerados, sem apagar nada: tentativas, acertos, XP e historico
 * vivem em question_attempts, nao em generated_quizzes.
 *
 * O CLIENTE (src/services/ai.js) tem a MESMA constante. Se as duas
 * divergirem, o app pede um quiz de uma versao, a Edge Function
 * responde com outra, e o cache local fica inutil.
 */
export const QUIZ_CONTENT_VERSION = "gpt-oss-120b-v1";

/**
 * Numero de questoes. A interface pede 5 ("Responda as 5 questoes", em
 * LessonPage.jsx) e o validateQuiz() recusa menos que isso.
 */
export const QUIZ_QUESTION_COUNT = 5;

export const QUIZ_TEMPERATURE = 0.5;

/**
 * Orcamento de tokens. Medido: um quiz do gpt-oss-120b gasta ~2700
 * tokens. A cota observada da credencial e de 8000 TPM, entao dois
 * quizzes seguidos ja consomem dois tercos do minuto. Nao baixar muito
 * abaixo de 1500: com teto curto o modelo fecha o JSON pela metade e a
 * chamada vira "max completion tokens reached".
 */
export const QUIZ_MAX_TOKENS = 8192;

/**
 * Raciocinio. Os modelos gpt-oss gastam tokens pensando, e isso conta
 * no mesmo teto. A producao de aulas desliga o raciocinio
 * (enable_thinking:false no lado NVIDIA); "low" mantem o modelo proximo
 * desse comportamento sem perder a correcao do gabarito.
 */
export const QUIZ_REASONING = "low";

/** Timeout: quiz de 2 a 6s na medicao, mas pico de demanda nao pode
 * deixar a Edge Function pendurada ate o limite do gateway. */
export const QUIZ_TIMEOUT_MS = 60000;

/** Tentativas so para erro TRANSITORIO (429 de cota, 5xx, timeout, rede).
 * Erro permanente (400 de schema, 401/403 de chave) cai direto. */
export const QUIZ_MAX_ATTEMPTS = 3;
export const QUIZ_BACKOFF_MS = 6000;

/** Espera maxima de uma retentativa. No 429 o proprio Groq manda um
 * "retry-after" e ele manda: respeitar evita martelar a cota. */
export const QUIZ_MAX_BACKOFF_MS = 60000;

/**
 * Rate limit por usuario (janela deslizante no Postgres).
 * 20 mensagens por minuto e folgado para uma sessao normal de estudo,
 * mas corta loop/spam acidental antes de gastar cota do provider.
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
