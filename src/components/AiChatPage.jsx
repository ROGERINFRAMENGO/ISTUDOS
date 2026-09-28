import { useEffect, useMemo, useRef, useState } from 'react';
import { askTutor, AI_DISCONNECTED_MESSAGE, isAiConfigured } from '../services/aiChat';
import { buildSimulado, loadSimulados, parseSimuladoIntent, saveSimulados } from '../services/simulados';
import { subjects } from '../data/mockData';
import { DAY_LABELS, formatDateBR, getDateKey, getDayKey } from '../data/lessons';

const CHAT_STORAGE_KEY = 'istudos_chat_history';

const SUGGESTIONS = [
  'O que eu estudo hoje?',
  'Como está minha sequência?',
  'Quanto XP eu tenho?',
  'Me dá uma dica de interpretação',
];

function welcomeMessage() {
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

export default function AiChatPage({
  studentState = {},
  todayLessons = [],
  completedLessonIds = [],
  onOpenSimulado,
}) {
  const [messages, setMessages] = useState(() => loadChat() || [welcomeMessage()]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [aiOffline, setAiOffline] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    saveChat(messages);
  }, [messages]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isThinking]);

  // Contexto do site enviado junto com a conversa: é o que permite a IA
  // falar "você está com 7 dias de sequência" em vez de respostas genéricas.
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
    };
  }, [studentState, todayLessons, completedLessonIds]);

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
    setMessages([welcomeMessage()]);
  };

  return (
    <section className="panel chat-panel">
      <div className="panel-head">
        <h3>Tutor IA</h3>
        <span className={`tag ${isAiConfigured && !aiOffline ? 'tag-hot' : ''}`}>
          {!isAiConfigured ? '○ Modo demonstração' : aiOffline ? '○ IA desconectada' : '● IA conectada'}
        </span>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.map((message, index) => (
          <div key={`${message.at}-${index}`} className={`chat-message ${message.role}`}>
            <div className={`chat-bubble ${message.error ? 'chat-error' : ''}`}>
              {message.content}
              {message.action?.type === 'create_simulado' && (
                <button
                  type="button"
                  className="primary-button small-button chat-action"
                  onClick={() => onOpenSimulado?.(message.action.id)}
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
        {SUGGESTIONS.map((suggestion) => (
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
          placeholder="Pergunte algo... (Enter envia, Shift+Enter quebra linha)"
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
