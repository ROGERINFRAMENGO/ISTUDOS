// ============================================================
// Serviço do Tutor IA — camada única de conversação com a IA
// ============================================================
// COMO LIGAR A IA DE VERDADE (passo a passo na resposta/README):
// 1. Crie uma Edge Function no Supabase (ex.: "ai-tutor") que chama o modelo
//    com a chave da API GUARDADA NO SERVIDOR (nunca no navegador).
// 2. Declare no .env:  VITE_AI_API_URL=https://<ref>.supabase.co/functions/v1/ai-tutor
// 3. Enquanto a URL estiver vazia, o chat roda em modo demonstração com
//    respostas locais que já usam o contexto do site (XP, sequência, aulas de hoje).

const AI_API_URL =
  import.meta.env.VITE_AI_API_URL ||
  'https://ehuwpvgcmssxrafsmtfo.supabase.co/functions/v1/ai-tutor';

export const isAiConfigured = Boolean(AI_API_URL);

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

// Ponto único de entrada usado pela página do chat.
// messages: [{ role: 'user' | 'assistant', content: string }]
// context:  dados do site (aluno, aulas de hoje, matérias) para a IA "entender" o usuário.
export async function askTutor({ messages = [], context = {} } = {}) {
  if (!isAiConfigured) {
    return { content: await localTutorReply(messages, context), action: null, disconnected: false };
  }

  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
    });

    if (!response.ok) {
      throw new Error(`Tutor IA respondeu com erro ${response.status}.`);
    }

    const data = await response.json().catch(() => ({}));

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
