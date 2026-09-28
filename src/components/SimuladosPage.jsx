import { useEffect, useState } from 'react';
import { BANK_SUBJECTS, DIFFICULTY_LABELS } from '../data/simuladoBank';
import { buildSimulado, loadSimulados, saveSimulados } from '../services/simulados';

function bestPercent(sim) {
  const attempts = sim?.attempts || [];
  if (!attempts.length) return null;
  const best = attempts.reduce((max, item) => {
    const pct = Math.round(((item.hits || 0) / Math.max(1, item.total || 1)) * 100);
    return Math.max(max, pct);
  }, 0);
  return best;
}

export default function SimuladosPage({ initialId, onInitialIdConsumed, onResult }) {
  const [simulados, setSimulados] = useState(() => loadSimulados());
  const [view, setView] = useState('list'); // list | take | result
  const [activeSim, setActiveSim] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [form, setForm] = useState({ title: '', subject: 'Todas', count: 10, difficulty: 'qualquer' });

  const persistNext = (next) => {
    setSimulados(next);
    saveSimulados(next);
  };

  const startSimulado = (sim) => {
    setActiveSim(sim);
    setIndex(0);
    setAnswers({});
    setResults(null);
    setView('take');
  };

  // Botão "Abrir simulado" da Tutoria IA navega direto para a prova.
  useEffect(() => {
    if (!initialId) return;
    const found = loadSimulados().find((sim) => sim.id === initialId);
    if (found) startSimulado(found);
    onInitialIdConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const handleCreate = (event) => {
    event.preventDefault();
    const sim = buildSimulado(form);
    persistNext([sim, ...loadSimulados()]);
    setForm((prev) => ({ ...prev, title: '' }));
    startSimulado(sim);
  };

  const handleDelete = (id) => {
    persistNext(simulados.filter((sim) => sim.id !== id));
  };

  const handleAnswer = (questionId, optionIndex) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleFinish = () => {
    if (!activeSim) return;
    const evaluated = activeSim.questions.map((question) => ({
      ...question,
      selectedIndex: answers[question.id],
      isCorrect: answers[question.id] === question.correct,
    }));
    const hits = evaluated.filter((item) => item.isCorrect).length;

    setResults(evaluated);
    setView('result');

    const next = simulados.map((sim) =>
      sim.id === activeSim.id
        ? { ...sim, attempts: [...(sim.attempts || []), { at: Date.now(), hits, total: evaluated.length }] }
        : sim
    );
    persistNext(next);

    // XP/estatísticas: Atualiza o painel da página inicial.
    onResult?.({ subject: activeSim.subject, results: evaluated });
  };

  // ------------------------- TELA DA PROVA -------------------------
  if (view === 'take' && activeSim) {
    const question = activeSim.questions[index];
    const total = activeSim.questions.length;
    const selected = answers[question.id];
    const answeredCount = Object.keys(answers).length;
    const isLast = index === total - 1;

    return (
      <section className="panel simulados-panel">
        <div className="panel-head">
          <h3>{activeSim.title}</h3>
          <span className="tag">Questão {index + 1} de {total}</span>
        </div>

        <div className="sim-progress">
          <span style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        <div className="quiz-question sim-question">
          <p className="quiz-question-number">
            {question.subject} · {question.topic} · {DIFFICULTY_LABELS[question.difficulty] || question.difficulty}
          </p>
          <h4>{question.question}</h4>
          <div className="quiz-options">
            {question.options.map((option, optionIndex) => (
              <button
                key={`${question.id}-${optionIndex}`}
                className={`quiz-option ${selected === optionIndex ? 'selected' : ''}`}
                onClick={() => handleAnswer(question.id, optionIndex)}
              >
                <strong>{['A', 'B', 'C', 'D'][optionIndex] || optionIndex + 1})</strong> {option}
              </button>
            ))}
          </div>
        </div>

        <div className="hero-actions sim-nav">
          <button className="ghost-button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            Anterior
          </button>
          {isLast ? (
            <button className="primary-button" disabled={answeredCount < total} onClick={handleFinish}>
              {answeredCount < total ? `Faltam ${total - answeredCount} questão(ões)` : 'Finalizar prova'}
            </button>
          ) : (
            <button className="primary-button" onClick={() => setIndex((i) => i + 1)}>
              Próxima
            </button>
          )}
          <button className="ghost-button" onClick={() => setView('list')}>
            Sair da prova
          </button>
        </div>
      </section>
    );
  }

  // ------------------------- TELA DO RESULTADO -------------------------
  if (view === 'result' && results) {
    const hits = results.filter((item) => item.isCorrect).length;
    const percent = Math.round((hits / Math.max(1, results.length)) * 100);

    return (
      <section className="panel simulados-panel">
        <div className="panel-head">
          <h3>Resultado — {activeSim?.title}</h3>
          <span className="tag tag-hot">{hits}/{results.length} acertos · {percent}%</span>
        </div>

        <div className={`sim-score ${percent >= 70 ? 'sim-score-good' : 'sim-score-low'}`}>
          <strong>{percent}%</strong>
          <span>{percent >= 70 ? 'Muito bem! 🎉' : 'Quase lá — continue praticando 💪'}</span>
          <small>Cada acerto vale XP e já somou no seu painel (seções: XP total e Questões resolvidas).</small>
        </div>

        <div className="quiz-results-wrap">
          {results.map((item, itemIndex) => (
            <div key={`${item.id}-result`} className={`result-item ${item.isCorrect ? 'correct' : 'wrong'}`}>
              <p className="quiz-question-number">Questão {itemIndex + 1} · {item.topic}</p>
              <h5>{item.question}</h5>
              <p>
                Sua resposta: <strong>{item.options[item.selectedIndex] ?? 'Não respondida'}</strong>
              </p>
              {!item.isCorrect && (
                <p>Resposta correta: <strong>{item.options[item.correct]}</strong></p>
              )}
              <p className={item.isCorrect ? 'success-text' : 'error-text'}>
                {item.isCorrect ? 'Você acertou!' : 'Você errou.'}
              </p>
              <p className="explain-box"><strong>Por quê? </strong>{item.explanation}</p>
            </div>
          ))}
        </div>

        <div className="hero-actions">
          <button className="primary-button" onClick={() => startSimulado(activeSim)}>
            Refazer este simulado
          </button>
          <button className="ghost-button" onClick={() => setView('list')}>
            Voltar aos simulados
          </button>
        </div>
      </section>
    );
  }

  // ------------------------- TELA DA LISTA -------------------------
  return (
    <section className="panel simulados-panel">
      <div className="panel-head">
        <h3>Simulados e mini-provas</h3>
        <span className="tag">{simulados.length} criado(s)</span>
      </div>

      <p className="sim-intro">
        Crie sua própria prova abaixo — ou peça para a <strong>Tutora IA</strong> criar uma no chat:
        “cria um simulado de matemática com 10 questões difícil”.
      </p>

      <form className="sim-create" onSubmit={handleCreate}>
        <label>
          Matéria
          <select value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}>
            <option value="Todas">Misto (todas)</option>
            {BANK_SUBJECTS.map((subject) => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
        </label>
        <label>
          Dificuldade
          <select value={form.difficulty} onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}>
            {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Questões
          <input
            type="number"
            min="2"
            max="30"
            value={form.count}
            onChange={(e) => setForm((p) => ({ ...p, count: e.target.value }))}
          />
        </label>
        <label className="sim-title-field">
          Título (opcional)
          <input
            type="text"
            maxLength="60"
            placeholder="Ex.: Revisão de frações"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
        </label>
        <button type="submit" className="primary-button">Criar simulado</button>
      </form>

      {simulados.length === 0 ? (
        <p className="quiz-error">Nenhum simulado ainda. Crie o primeiro acima ou peça para a Tutora IA!</p>
      ) : (
        <div className="sim-list">
          {simulados.map((sim) => {
            const best = bestPercent(sim);
            return (
              <article key={sim.id} className="sim-card">
                <div className="sim-card-head">
                  <h4>{sim.title}</h4>
                  <span className="tag">{sim.questions.length} questões</span>
                </div>
                <p className="sim-meta">
                  {sim.subject} · {DIFFICULTY_LABELS[sim.difficulty] || 'Qualquer'} ·{' '}
                  {new Date(sim.createdAt).toLocaleDateString('pt-BR')}
                  {(sim.attempts || []).length > 0 ? ` · ${sim.attempts.length} tentativa(s)` : ''}
                </p>
                {best !== null && <p className="sim-best">🏆 Melhor resultado: {best}%</p>}
                <div className="sim-card-actions">
                  <button className="primary-button small-button" onClick={() => startSimulado(sim)}>
                    Começar
                  </button>
                  <button className="ghost-button small-button" onClick={() => handleDelete(sim.id)}>
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
