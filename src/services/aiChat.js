// ============================================================
// Servico do Tutor IA - camada unica de conversa com a IA
// ------------------------------------------------------------
// FASE 2: o chat usa a Edge Function "tutor-chat", que fala com o
// GROQ (o navegador NUNCA recebe a chave). A sessao (login anonimo)
// e garantida por src/services/ai.js.
// A geracao de aulas segue separada, na NVIDIA, via "generate-lesson".
//
// Resposta em STREAMING: onDelta recebe o texto enquanto ele chega.
// A funcao guarda o historico no banco; o navegador so envia a janela
// recente para dar contexto a conversa.
// ============================================================

import { streamTutor } from './ai';

export const isAiConfigured = true;

/** Mensagem exibida quando a IA fica indisponivel (rede/timeout/5xx). */
export const AI_DISCONNECTED_MESSAGE =
  'A tutora nao respondeu agora. Sua aula continua salva aqui - tente de novo em um minuto.';

/** Mensagem exibida quando o limite de mensagens foi atingido. */
export const AI_RATE_LIMIT_MESSAGE =
  'Voce mandou varias mensagens muito rapido. Espera alguns segundos para a tutora respirar.';

/**
 * Envia a mensagem e devolve a resposta em streaming.
 * @param {object} opcoes
 * @param {Array}  opcoes.messages  janela de mensagens [{role, content}]
 * @param {object} opcoes.context   contexto minimo da aula
 * @param {string} opcoes.conversationId  conversa atual (para o historico)
 * @param {Function} opcoes.onDelta      recebe o texto parcial
 * @param {Function} opcoes.onDone       recebe { reply, model, conversationId }
 * @param {Function} opcoes.onError      recebe o erro
 */
export async function askTutorStream({
  messages = [],
  context = {},
  conversationId,
  onStart,
  onDelta,
  onDone,
  onError,
}) {
  return streamTutor({ messages, context, conversationId }, { onStart, onDelta, onDone, onError });
}
