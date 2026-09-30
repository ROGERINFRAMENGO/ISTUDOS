import { useEffect, useMemo, useRef, useState } from 'react';
import {
  askTutorStream,
  AI_DISCONNECTED_MESSAGE,
  AI_RATE_LIMIT_MESSAGE,
  isAiConfigured,
} from '../services/aiChat';
import { buildSimulado, loadSimulados, parseSimuladoIntent, saveSimulados } from '../services/simulados';
import { isSyncConfigured, mergeChat, nowIso, pullShared, pushShared } from '../services/sync';
import { subjects } from '../data/mockData';
import { DAY_LABELS, formatDateBR, getDateKey, getDayKey } from '../data/lessons';

// ============================================================
// TutorChat - o chat da Tutora IA em componente reutilizavel
// ------------------------------------------------------------
// Usado em dois lugares:
//  1. Aba "Tutor IA" (AiChatPage)
//  2. Dentro da licao (LessonPage), para tirar duvidas do conteudo
// Quando recebe `lessonContext`, a IA responde sobre a licao aberta.
//
// FASE 2: a resposta chega em STREAMING (o texto cresce na tela).
// Estados: EMPTY, GENERATING, STREAMING, SUCCESS, ERROR, RATE_LIMITED.

const CHAT_STORAGE_KEY = 'istudos_chat_history';

export const CHAT_SUGGESTIONS = [
  'O que eu estudo hoje?',
  'Como esta minha sequencia?',
  'Me explica o que eu ainda nao entendi',
  'Me da um exemplo',
];

// Sugestoes focadas no conteudo, para quem esta no meio da licao.
export const LESSON_SUGGESTIONS = [
  'Explica essa parte de novo, mais devagar',
  'Me da um exemplo parecido com o da aula',
  'Quais sao os erros mais comuns nesse tema?',
  'Me faz uma pergunta parecida pra eu treinar',
];

function welcomeMessage(lessonContext) {
  if (lessonContext) {
    return {
      role: 'assistant',
      content: `Oi! Eu sou sua Tutora IA\n\nEstou aqui do seu lado nesta aula de ${lessonContext.subject} - ${lessonContext.topic}. Se travar em alguma parte do texto ou de uma questao, e so me perguntar que eu explico com outras palavras.`,
      at: Date.now(),
    };
  }
  return {
    role: 'assistant',
    content: 'Oi! Eu sou sua Tutora IA\n\nPode perguntar sobre o cronograma, o que estudar hoje, seu XP ou qualquer duvida de estudo. Se nao entender alguma coisa, me fala que eu explico de outro jeito.',
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
  // 'idle' | 'generating' | 'streaming' | 'error' | 'rate_limited'
  const [status, setStatus] = useState('idle');
  const [streamText, setStreamText] = useState('');
  const [aiOffline, setAiOffline] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const listRef = useRef(null);

  const isThinking = status === 'generating' || status === 'streaming';

  useEffect(() => {
    saveChat(messages);
  }, [messages]);

  // ---------- Sincroniza o chat entre celular e computador ----------
  const [syncReady, setSyncReady] = useState(!isSyncConfigured);
  const lastPushedRef = useRef('');

  useEffect(() => {
    if (!isSyncConfigured) return undefined;
    let cancelled = false;

    const boot = async () => {
      const remote = await pullShared();
      if (cancelled) return;
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
      const remoteChat = result?.data?.chat;
      if (Array.isArray(remoteChat) && remoteChat.length) {
        setMessages((prev) => mergeChat(prev, remoteChat));
      }
    }, 1500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncReady, messages]);

  // Rola para o fim a cada pedaco novo: o texto tem que crescer visivel.
  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, streamText, isThinking]);

  // ---------- Contexto MINIMO enviado a tutora ----------
  // So o que ajuda a responder: quem e a aluna, o plano de hoje e a
  // licao aberta. Nao mandamos o cronograma inteiro nem todas as aulas.
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
      // Contexto da licao: materia, tema, secao e exercicio atual.
      subject: lessonContext?.subject ?? undefined,
      topic: lessonContext?.topic ?? undefined,
      lessonId: lessonContext?.lessonId ?? null,
      lesson: lessonContext || undefined,
    };
  }, [studentState, todayLessons, completedLessonIds, lessonContext]);

  // Janela curta: o backend tem o historico completo, mas Mandar tudo
  // a cada chamada so gastaria token. As ultimas 12 bastam para a
  // conversa continuar ("e gene?" depois de "nao entendi DNA").
  const janela = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-12)
      .map((m) => ({ role: m.role, content: m.content })),
    [messages],
  );

  // ---------- Envio com streaming ----------
  const handleSend = async (text) => {
    const clean = String(text || '').trim();
    if (!clean || isThinking) return;

    setInput('');
    setAiOffline(false);
    setRetryAfter(0);
    setStreamText('');

    const minhasMensagens = [...messages, { role: 'user', content: clean, at: Date.now() }];

    // Simulado/mini prova e montado aqui mesmo, sem depender da IA.
    const intent = parseSimuladoIntent(clean);
    if (intent) {
      const sim = buildSimulado(intent);
      saveSimulados([sim, ...loadSimulados()]);
      setMessages([
        ...minhasMensagens,
        {
          role: 'assistant',
          content: `Criei o simulado "${sim.title}" com ${sim.questions.length} questao(oes).\n\nMateria: ${sim.subject} - Dificuldade: ${sim.difficulty}${sim.week ? ` - Semana ${sim.week} (conteudo do cronograma)` : ''}.\n\nClique em "Abrir simulado" para comecar agora!`,
          action: { type: 'create_simulado', id: sim.id, title: sim.title },
          at: Date.now(),
        },
      ]);
      return;
    }

    setMessages(minhasMensagens);
    setStatus('generating');

    // Mensagem provisoria que vai recebendo o texto do Tutor.
    const idProvisoria = `parcial-${Date.now()}`;
    let recebeuAlgo = false;

    try {
      await askTutorStream(
        { messages: [...janela, { role: 'user', content: clean }], context, conversationId },
        {
          onStart: () => setStatus('streaming'),
          onDelta: (_pedaco, acumulado) => {
            recebeuAlgo = true;
            setStatus('streaming');
            setStreamText(acumulado);
            setMessages((prev) => {
              const existe = prev.some((m) => m.id === idProvisoria);
              if (existe) {
                return prev.map((m) => (m.id === idProvisoria ? { ...m, content: acumulado } : m));
              }
              return [...prev, { id: idProvisoria, role: 'assistant', content: acumulado, at: Date.now() }];
            });
          },
          onDone: (dados) => {
            if (dados?.conversationId) setConversationId(dados.conversationId);
            // O "done" leva o texto completo: reconcilia caso algum
            // pedaco tenha se perdido no caminho.
            const final = dados?.reply ?? streamText;
            setMessages((prev) => {
              const existe = prev.some((m) => m.id === idProvisoria);
              const base = existe
                ? prev.map((m) => (m.id === idProvisoria ? { ...m, content: final } : m))
                : [...prev, { id: idProvisoria, role: 'assistant', content: final, at: Date.now() }];
              return base.map((m) =>
                m.id === idProvisoria ? { ...m, id: undefined, streaming: false, model: dados?.model } : m,
              );
            });
            setStreamText('');
            setStatus('idle');
          },
          onError: (error) => {
            // Rate limit: mostra o tempo de espera e nao trata como falha.
            if (error?.status === 429 || error?.code === 'rate_limited') {
              setStatus('rate_limited');
              setRetryAfter(error.retryAfterMs ?? 30000);
              return;
            }
            setAiOffline(true);
            setStatus('error');
            setMessages((prev) => {
              const temProvisoria = prev.some((m) => m.id === idProvisoria);
              // Texto parcial continua util: nao apagamos o que a aluna leu.
              const aviso = { role: 'assistant', content: AI_DISCONNECTED_MESSAGE, disconnected: true, at: Date.now() };
              return temProvisoria ? [...prev, aviso] : [...prev, aviso];
            });
            if (recebeuAlgo) setStreamText('');
          },
        },
      );
    } catch {
      if (status !== 'rate_limited') {
        setStatus('error');
        setMessages((prev) => [...prev, {
          role: 'assistant', content: AI_DISCONNECTED_MESSAGE, disconnected: true, at: Date.now(),
        }]);
      }
    }
  };

  const clearChat = () => {
    setMessages([welcomeMessage(lessonContext)]);
    setConversationId(null);
    setStreamText('');
    setStatus('idle');
    setAiOffline(false);
  };

  // Reenvia a ultima pergunta depois de um erro (retry manual).
  const retryLast = () => {
    const ultima = [...messages].reverse().find((m) => m.role === 'user');
    if (!ultima) return;
    setMessages((prev) => prev.filter((m) => m.content !== ultima.content || m.role !== 'user'));
    handleSend(ultima.content);
  };

  return (
    <section className={`panel chat-panel ${className}`.trim()}>
      <div className="panel-head">
        <h3>{title}</h3>
        <div className="chat-head-actions">
          <span className={`tag ${isAiConfigured && !aiOffline ? 'tag-hot' : ''}`}>
            {!isAiConfigured ? 'o Modo local' : aiOffline ? 'o IA instavel' : 'o IA conectada'}
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
              {message.streaming && <span className="chat-caret" aria-hidden="true" />}
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
                {message.role === 'user' ? 'Voce' : 'Tutora IA'} - {formatTime(message.at)}
              </small>
            </div>
          </div>
        ))}

        {/* GERATING: a aluna mandou e ainda nao chegou texto */}
        {status === 'generating' && (
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

        {/* RATE_LIMITED: espera o cooldown */}
        {status === 'rate_limited' && (
          <div className="chat-message assistant">
            <div className="chat-bubble chat-error">
              {AI_RATE_LIMIT_MESSAGE}
              <small className="chat-meta">Espera {Math.ceil(retryAfter / 1000)}s para continuar</small>
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
            {isThinking ? 'Respondendo...' : 'Enviar'}
          </button>
          {status === 'error' && (
            <button type="button" className="ghost-button chat-clear" onClick={retryLast}>
              Tentar de novo
            </button>
          )}
          <button type="button" className="ghost-button chat-clear" onClick={clearChat} disabled={isThinking}>
            Limpar
          </button>
        </div>
      </form>
    </section>
  );
}
