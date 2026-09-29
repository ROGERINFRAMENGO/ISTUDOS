// ============================================================
// Serviço do Tutor IA — camada única de conversação com a IA
// ============================================================
// A conversa passa pela Edge Function "tutor" do Supabase (ver
// supabase/functions/tutor). O navegador NUNCA recebe a chave da
// NVIDIA: quem fala com o modelo é a função, usando o secret dela.
// A sessão (login anônimo) é garantida por src/services/ai.js.
//
// Enquanto a função não estiver deployada (ou o login anônimo
// desativado), o chat continua funcionando: cai na mensagem de
// IA desconectada ou no modo demonstração local.

import { callTutor } from './ai';

export const isAiConfigured = true;

// Mensagem exata exibida QUANDO A IA ESTIVER DESCONECTADA (erro de qualquer tipo).
export const AI_DISCONNECTED_MESSAGE =
  'meu amor essa mensagem e automatica quando a ia deu algum problema mim avisa no coisa meu amor srsrsrsrsrsr';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMinutes(total) {
  const minutes = Number(total) || 0;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function todayLessonsFromContext(context) {
  const lessons = context?.today?.lessons || [];
  if (!lessons.length) {
    return 'Nenhuma aula cadastrada para hoje. Cadastre em src/data/lessons.js usando a data de hoje.';
  }
  return lessons
    .map(
      (lesson, index) =>
        `${index + 1}. ${lesson.subject} — ${lesson.topic} (${lesson.time})${lesson.done ? ' ✅ concluída' : ''}`
    )
    .join('\n');
}

// Resposta local enquanto o modelo real não está conectado.
// Já "conversa com o site" usando o contexto enviado pela página.
async function localTutorReply(messages = [], context = {}) {
  await wait(350);

  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const text = (lastUser?.content || '').toLowerCase();
  const student = context.student || {};
  const today = context.today || {};

  if (text.includes('hoje') || text.includes('aula') || text.includes('estud')) {
    return `📅 Hoje é ${today.label || 'hoje'} e seu plano é:\n\n${todayLessonsFromContext(context)}\n\nAbra "Estudo de hoje" e clique em Começar para manter sua sequência. 🔥`;
  }

  if (text.includes('sequencia') || text.includes('streak') || text.includes('consecutiv')) {
    return `🔥 Você está com ${student.streak || 0} dia(s) de sequência (recorde: ${student.longestStreak || 0}).\n\nA regra aqui é estilo Duolingo: conclua 1 aula por dia. Se faltar 1 dia, a sequência zera — mas hoje ainda dá tempo de manter!`;
  }

  if (text.includes('xp') || text.includes('nivel')) {
    return `⭐ Você tem ${student.xp || 0} XP no nível ${student.level || 1}. Cada aula concluída soma XP e cada questão certa vale mais pontos.`;
  }

  if (text.includes('progresso') || text.includes('quest') || text.includes('acerto') || text.includes('tempo')) {
    return `📊 Seu painel agora:\n• Progresso geral: ${Math.round(student.overallProgress || 0)}%\n• Aulas concluídas: ${student.lessonsCompleted || 0}\n• Questões: ${student.questionsAnswered || 0} respondidas (${student.questionsCorrect || 0} corretas)\n• Tempo estudado: ${formatMinutes(student.studyMinutes)}`;
  }

  return `Estou em modo demonstração — minha resposta ainda não vem de um modelo de IA de verdade. 😅\n\nPara me "ligar", configure VITE_AI_API_URL apontando para uma Edge Function do Supabase (o código de integração já está pronto neste arquivo).\n\nEnquanto isso, posso falar sobre seu site: pergunte "o que eu estudo hoje?", "como está minha sequência?" ou "quanto XP eu tenho?".`;
}

// Uma chamada à Edge Function "tutor" (com o JWT da sessão).
async function requestTutor(messages, context) {
  const data = await callTutor({ messages, context });
  if (!data || (!data.reply && !data.content && !data.message)) {
    const error = new Error('Tutor IA voltou sem resposta.');
    error.status = 502;
    throw error;
  }
  return data;
}

// Ponto único de entrada usado pela página do chat.
// messages: [{ role: 'user' | 'assistant', content: string }]
// context:  dados do site (aluno, aulas de hoje, matérias) para a IA "entender" o usuário.
export async function askTutor({ messages = [], context = {} } = {}) {
  if (!isAiConfigured) {
    return { content: await localTutorReply(messages, context), action: null, disconnected: false };
  }

  try {
    let data;
    try {
      data = await requestTutor(messages, context);
    } catch (error) {
      // 5xx (pico de demanda / cota por minuto do modelo) e falha de rede são
      // passageiros: uma segunda tentativa costuma resolver. Erro 4xx é do
      // pedido em si e não vale repetir.
      const transient = !error?.status || error.status >= 500;
      if (!transient) throw error;
      console.warn('Tutor IA: primeira tentativa falhou, tentando de novo...', error);
      await wait(1200);
      data = await requestTutor(messages, context);
    }

    // Aceita os formatos mais comuns de resposta de APIs de chat.
    const raw =
      data.reply ||
      data.message ||
      data.content ||
      data?.choices?.[0]?.message?.content ||
      '';

    if (!raw) {
      throw new Error('Tutor IA voltou sem resposta.');
    }

    // A IA pode responder texto puro OU um JSON com ação estruturada:
    // { "reply": "...", "action": { "type": "create_simulado", "params": {...} } }
    const trimmed = String(raw).trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && (parsed.reply || parsed.message)) {
          return {
            content: parsed.reply || parsed.message,
            action: parsed.action || null,
            disconnected: false,
          };
        }
      } catch {
        // não era JSON — segue como texto normal
      }
    }

    return { content: trimmed, action: null, disconnected: false };
  } catch (error) {
    // QUALQUER erro (rede, 4xx/5xx, resposta vazia) = IA desconectada
    // → mensagem combinada com o usuário, sem quebrar o chat.
    console.error('Tutor IA desconectada:', error);
    return { content: AI_DISCONNECTED_MESSAGE, action: null, disconnected: true };
  }
}
