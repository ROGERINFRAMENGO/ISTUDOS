import { useEffect, useMemo, useRef, useState } from 'react';
import { askTutor, AI_DISCONNECTED_MESSAGE, isAiConfigured } from '../services/aiChat';
import { buildSimulado, loadSimulados, parseSimuladoIntent, saveSimulados } from '../services/simulados';
import { isSyncConfigured, mergeChat, nowIso, pullShared, pushShared } from '../services/sync';
import { subjects } from '../data/mockData';
import { DAY_LABELS, formatDateBR, getDateKey, getDayKey } from '../data/lessons';

// ============================================================
// TutorChat — o chat da Tutora IA em componente reutilizável
// ============================================================
// Usado em dois lugares:
//  1. Aba "Tutor IA" (AiChatPage)
//  2. Dentro da lição (LessonPage), para tirar dúvidas do conteúdo
// Quando recebe `lessonContext`, a IA passa a responder sobre a lição aberta.

const CHAT_STORAGE_KEY = 'istudos_chat_history';

export const CHAT_SUGGESTIONS = [
  'O que eu estudo hoje?',
  'Como está minha sequência?',
  'Quanto XP eu tenho?',
  'Me dá uma dica de interpretação',
];

// Sugestões focadas no conteúdo, para quem está no meio da lição.
export const LESSON_SUGGESTIONS = [
  'Explique essa aula de novo, mais devagar',
  'Me dá um exemplo parecido com o da aula',
  'Quais são os erros mais comuns nesse tema?',
  'Me faz uma pergunta para eu treinar',
];

function welcomeMessage(lessonContext) {
  if (lessonContext) {
    return {
      role: 'assistant',
      content: `Oi! Eu sou sua Tutora IA 💜\n\nEstou aqui do seu lado nesta aula de ${lessonContext.subject} — ${lessonContext.topic}. Se travar em alguma parte do texto, do vídeo ou de uma questão, é só me perguntar que eu explico com outras palavras.`,
      at: Date.now(),
    };
  }

  const mode = isAiConfigured
    ? 'Estou conectada e pronta para te ajudar a estudar.'
    : 'Ainda estou em modo demonstração (sem modelo de IA conectado), mas já sei responder sobre o seu progresso no site.';
  return {
    role: 'assistant',
    content: `Oi! Eu sou sua Tutora IA 💜\n\n${mode}\n\nPode perguntar sobre o cronograma, o que estudar hoje, seu XP ou qualquer dúvida de estudo.`,
    at: Date.now(),
  };
}

function loadChat() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null');
    return Array.isArray(raw) && raw.length ? raw : null;
  } catch {
    return null;
  }
}

function saveChat(messages) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-60)));
  } catch {
    // ignore
  }
}

function formatTime(at) {
  if (!at) return '';
  try {
    return new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function TutorChat({
  title = 'Tutor IA',
  studentState = {},
  todayLessons = [],
  completedLessonIds = [],
  lessonContext = null,
  suggestions = CHAT_SUGGESTIONS,
  onOpenSimulado,
  onClose,
  className = '',
}) {
  const [messages, setMessages] = useState(() => loadChat() || [welcomeMessage(lessonContext)]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [aiOffline, setAiOffline] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    saveChat(messages);
  }, [messages]);

  // ---------- Sincronização do chat entre celular e computador ----------
  const [syncReady, setSyncReady] = useState(!isSyncConfigured);
  const lastPushedRef = useRef('');

  useEffect(() => {
    if (!isSyncConfigured) return undefined;
    let cancelled = false;

    const boot = async () => {
      const remote = await pullShared();
      if (cancelled) {
        return;
      }
      const remoteChat = remote?.data?.chat;
      if (Array.isArray(remoteChat) && remoteChat.length) {
        setMessages((prev) => mergeChat(prev, remoteChat));
      }
      setSyncReady(true);
    };

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSyncConfigured || !syncReady) return undefined;
    const serialized = JSON.stringify(messages);
    if (serialized === lastPushedRef.current) return undefined;

    const timer = setTimeout(async () => {
      const result = await pushShared({ chat: messages }, { chat: nowIso() });
      lastPushedRef.current = serialized;
      // Se a conversa do outro aparelho for mais nova, ela vence aqui também.
      const remoteChat = result?.data?.chat;
      if (Array.isArray(remoteChat) && remoteChat.length) {
        setMessages((prev) => mergeChat(prev, remoteChat));
      }
    }, 1500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncReady, messages]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isThinking]);

  // Contexto do site enviado junto com a conversa: é o que permite a IA falar
  // "você está com 7 dias de sequência" em vez de respostas genéricas. Com
  // `lessonContext`, ela também sabe qual lição está aberta agora.
  const context = useMemo(() => {
    const dateKey = getDateKey(new Date());
    return {
      student: {
        name: studentState.name,
        xp: studentState.xp || 0,
        level: studentState.level || 1,
        streak: studentState.current_streak || 0,
        longestStreak: studentState.longest_streak || 0,
        lessonsCompleted: studentState.lessons_completed || 0,
        questionsAnswered: studentState.questions_answered || 0,
        questionsCorrect: studentState.questions_correct || 0,
        studyMinutes: studentState.study_minutes || 0,
        overallProgress: studentState.overall_progress || 0,
      },
      today: {
        dateKey,
        label: `${DAY_LABELS[getDayKey(new Date())]}, ${formatDateBR(dateKey)}`,
        lessons: (todayLessons || []).map((lesson) => ({
          id: lesson.id,
          subject: lesson.subject,
          topic: lesson.topic,
          objective: lesson.objective,
          time: lesson.time,
          done: (completedLessonIds || []).includes(lesson.id),
        })),
      },
      subjects: (subjects || []).map((subject) => ({
        id: subject.id,
        name: subject.name,
        progress: subject.progress,
      })),
      lesson: lessonContext || undefined,
    };
  }, [studentState, todayLessons, completedLessonIds, lessonContext]);

  const handleSend = async (text) => {
    const clean = String(text || '').trim();
    if (!clean || isThinking) return;

    const nextMessages = [...messages, { role: 'user', content: clean, at: Date.now() }];
    setInput('');

    // Pedido de simulado/mini prova → cria na hora, sem depender da IA online.
    const intent = parseSimuladoIntent(clean);
    if (intent) {
      const sim = buildSimulado(intent);
      saveSimulados([sim, ...loadSimulados()]);
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: `Criei o simulado "${sim.title}" com ${sim.questions.length} questão(ões) 💪\n\nMatéria: ${sim.subject} · Dificuldade: ${sim.difficulty === 'qualquer' ? 'qualquer' : sim.difficulty}${sim.week ? ` · Semana ${sim.week} (conteúdo do cronograma)` : ''}.\n\nClique em "Abrir simulado" para começar agora!`,
          action: { type: 'create_simulado', id: sim.id, title: sim.title },
          at: Date.now(),
        },
      ]);
      return;
    }

    setMessages(nextMessages);
    setIsThinking(true);

    try {
      const reply = await askTutor({ messages: nextMessages, context });
      let action = reply.action || null;
      let content = reply.content;

      // A IA pediu para criar um simulado → monta aqui e vira botão no chat.
      if (action?.type === 'create_simulado') {
        const sim = buildSimulado(action.params || {});
        saveSimulados([sim, ...loadSimulados()]);
        action = { type: 'create_simulado', id: sim.id, title: sim.title };
        content = `${content}\n\n✅ Simulado "${sim.title}" criado com ${sim.questions.length} questões${sim.week ? ` (Semana ${sim.week})` : ''} — clique em "Abrir simulado".`;
      }

      setAiOffline(Boolean(reply.disconnected));
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content, action, disconnected: Boolean(reply.disconnected), at: Date.now() },
      ]);
    } catch {
      // Erro inesperado fora do serviço → mesma mensagem de desconexão.
      setAiOffline(true);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: AI_DISCONNECTED_MESSAGE, disconnected: true, at: Date.now() },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const clearChat = () => {
    setMessages([welcomeMessage(lessonContext)]);
  };

  return (
    <section className={`panel chat-panel ${className}`.trim()}>
      <div className="panel-head">
        <h3>{title}</h3>
        <div className="chat-head-actions">
          <span className={`tag ${isAiConfigured && !aiOffline ? 'tag-hot' : ''}`}>
            {!isAiConfigured ? '○ Modo demonstração' : aiOffline ? '○ IA desconectada' : '● IA conectada'}
          </span>
          {onClose && (
            <button type="button" className="ghost-button small-button chat-close" onClick={onClose}>
              Fechar
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.map((message, index) => (
          <div key={`${message.at}-${index}`} className={`chat-message ${message.role}`}>
            <div className={`chat-bubble ${message.error ? 'chat-error' : ''}`}>
              {message.content}
              {message.action?.type === 'create_simulado' && onOpenSimulado && (
                <button
                  type="button"
                  className="primary-button small-button chat-action"
                  onClick={() => onOpenSimulado(message.action.id)}
                >
                  Abrir simulado
                </button>
              )}
              <small className="chat-meta">
                {message.role === 'user' ? 'Você' : 'Tutora IA'} · {formatTime(message.at)}
              </small>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="chat-message assistant">
            <div className="chat-bubble">
              <span className="chat-typing">
                <span />
                <span />
                <span />
                pensando...
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="chat-suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="chat-chip"
            disabled={isThinking}
            onClick={() => handleSend(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          handleSend(input);
        }}
      >
        <textarea
          className="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend(input);
            }
          }}
          placeholder={
            lessonContext
              ? 'Pergunte sobre esta aula... (Enter envia, Shift+Enter quebra linha)'
              : 'Pergunte algo... (Enter envia, Shift+Enter quebra linha)'
          }
          rows={2}
        />
        <div className="chat-buttons">
          <button type="submit" className="primary-button chat-send" disabled={isThinking || !input.trim()}>
            Enviar
          </button>
          <button type="button" className="ghost-button chat-clear" onClick={clearChat}>
            Limpar
          </button>
        </div>
      </form>
    </section>
  );
}


