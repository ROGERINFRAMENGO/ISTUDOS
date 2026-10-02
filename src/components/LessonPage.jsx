import { useMemo, useState } from 'react';
import TutorChat, { LESSON_SUGGESTIONS } from './TutorChat';

export const STUDY_CONFIRM_TEXT = '';

export default function LessonPage(props) {
  const { lesson, detail, quiz } = props;
  const isQuiz = props.lessonView === 'quiz';
  const isResults = props.lessonView === 'results' && props.quizResults;
  // Chat de dúvidas dentro da lição (abre pelo botão flutuante).
  const [chatOpen, setChatOpen] = useState(false);

  // O que a IA precisa saber para responder dúvidas DESTA lição.
  const lessonContext = useMemo(
    () => ({
      subject: lesson.subject,
      topic: lesson.topic,
      objective: lesson.objective,
      explanation: lesson.explanation,
      time: lesson.time,
      stage: isQuiz
        ? 'respondendo o questionario da aula'
        : isResults
          ? 'acabou de ver o resultado do questionario'
          : 'lendo o conteudo e assistindo ao video',
      sections: (detail?.sections || []).slice(0, 5).map((section) => ({
        title: section.title,
        bullets: (section.bullets || []).slice(0, 4),
      })),
      // Numera as questões ("Questão 1: ...") para a IA ligar quando o aluno
      // disser "travei na questão 3".
      quiz: (quiz || []).map((question, index) => ({
        question: `Questão ${index + 1}: ${question.question}`,
        options: question.options,
      })),
    }),
    [lesson, detail, quiz, isQuiz, isResults]
  );

  return (
    <div className="app-shell lesson-page-shell">
      <main className="main-panel lesson-page">
        <header className="topbar lesson-topbar">
          <div>
            <p className="eyebrow">{lesson.subject} · {lesson.time}</p>
            <h2>Aula: {lesson.topic}</h2>
            <p className="lesson-subtitle">🎯 {lesson.objective}</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={props.onBack}>Voltar para a pagina principal</button>
          </div>
        </header>

        {props.quizError && <p className="quiz-error">{props.quizError}</p>}
        {props.aiStatus && (
          <p className="quiz-error" role="status">
            ⏳ {props.aiStatus}
          </p>
        )}
        {props.aiError && (
          <p className="quiz-error">
            {props.aiError}{' '}
            {props.onRetryLesson && (
              <button type="button" className="ghost-button" onClick={props.onRetryLesson}>
                Tentar de novo
              </button>
            )}
          </p>
        )}

        {!isQuiz && !isResults && (
          <StudyContent {...props} />
        )}

        {isQuiz && !props.quizResults && (
          <QuizContent {...props} />
        )}

        {isResults && (
          <ResultsContent {...props} />
        )}
      </main>

      {/* Tutor IA dentro da lição: tira dúvidas sem sair da aula */}
      {chatOpen ? (
        <aside className="lesson-chat-drawer">
          <TutorChat
            title="Dúvida nesta aula"
            className="lesson-chat-panel"
            lessonContext={lessonContext}
            suggestions={LESSON_SUGGESTIONS}
            studentState={props.studentState}
            todayLessons={props.todayLessons}
            completedLessonIds={props.completedLessonIds}
            onOpenSimulado={props.onOpenSimulado}
            onClose={() => setChatOpen(false)}
          />
        </aside>
      ) : (
        <button type="button" className="lesson-chat-fab" onClick={() => setChatOpen(true)}>
          💬 Tirar dúvida com a IA
        </button>
      )}
    </div>
  );
}

/**
 * Botao de advancing para o questionario.
 *
 * A unica regra de liberacao e o TEMPO na aula (LESSON_MIN_SECONDS).
 * O quiz NUNCA e requisito para habilitar: quando ainda nao existe, o
 * proprio handleGoToQuiz() o gera no clique. Exigir o quiz aqui era o
 * que travava a aluna (botao desabilitado -> nada gerava -> botao
 * continuava desabilitado).
 *
 * Estados do rotulo:
 *   < 10s .............. "Continue estudando..."
 *   >= 10s, quiz pronto  "Continuar para o questionario"
 *   >= 10s, quiz ausente "Preparar questionario"
 *   gerando ............. "Preparando questionario..."
 *   falhou .............. "Tentar novamente"
 */
function GoToQuizButton({ canShowQuiz, isPreparingQuiz, quizReady, quizError, quizCount = 5, onGoToQuiz }) {
  if (isPreparingQuiz) {
    return (
      <button className="primary-button" type="button" disabled>
        Preparando questionario...
      </button>
    );
  }
  if (quizError && canShowQuiz) {
    return (
      <button className="primary-button" type="button" onClick={onGoToQuiz}>
        Tentar novamente
      </button>
    );
  }
  if (!canShowQuiz) {
    return (
      <button className="primary-button" type="button" disabled>
        Continue estudando...
      </button>
    );
  }
  return (
    <button className="primary-button" type="button" onClick={onGoToQuiz}>
      {quizReady
        ? `Continuar para o questionario (${quizCount} questoes)`
        : 'Preparar questionario'}
    </button>
  );
}

function StudyContent(props) {
  const { lesson, detail } = props;
  // Aula do cronograma gerada pela IA tem layout proprio (sem video obrigatorio).
  if (detail?.generated) return <GeneratedStudy {...props} />;
  return (
    <>
      <section className="panel lesson-hero">
        {lesson.videoUrl ? (
          <div className="study-video-wrap lesson-video">
            <iframe
              src={lesson.videoUrl}
              title={lesson.topic}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : null}
        <div className="lesson-hero-copy">
          <span className="tag" style={{ background: `${lesson.color}1a`, color: lesson.color }}>
            Video da aula · {lesson.duration} min
          </span>
          <h3>Assista primeiro, depois leia tudo com calma</h3>
          <p>{lesson.explanation}</p>
          <p className="lesson-timer">Tempo nesta aula: {props.lessonSeconds}s (minimo 10s)</p>
        </div>
      </section>

      <section className="panel lesson-content">
        <h3>Aula completa e detalhada</h3>
        {detail?.images?.[0] && (
          <figure className="lesson-figure">
            <img src={detail.images[0].src} alt={detail.images[0].caption} loading="lazy" />
            <figcaption>{detail.images[0].caption}</figcaption>
          </figure>
        )}
        {(detail?.sections || []).slice(0, 3).map((section, sectionIndex) => (
          <article key={'secao-' + sectionIndex} className="lesson-section">
            <h4>{section.title}</h4>
            {(section.paragraphs || []).map((paragraph, index) => (
              <p key={'p-' + sectionIndex + '-' + index}>{paragraph}</p>
            ))}
            <ul>
              {(section.bullets || []).map((bullet, bulletIndex) => (
                <li key={'b-' + bulletIndex}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
        {detail?.images?.[1] && (
          <figure className="lesson-figure">
            <img src={detail.images[1].src} alt={detail.images[1].caption} loading="lazy" />
            <figcaption>{detail.images[1].caption}</figcaption>
          </figure>
        )}
        {(detail?.sections || []).slice(3).map((section, sectionIndex) => (
          <article key={'secao-' + sectionIndex} className="lesson-section">
            <h4>{section.title}</h4>
            {(section.paragraphs || []).map((paragraph, index) => (
              <p key={'p-' + sectionIndex + '-' + index}>{paragraph}</p>
            ))}
            <ul>
              {(section.bullets || []).map((bullet, bulletIndex) => (
                <li key={'b-' + bulletIndex}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
        {detail?.images?.[2] && (
          <figure className="lesson-figure">
            <img src={detail.images[2].src} alt={detail.images[2].caption} loading="lazy" />
            <figcaption>{detail.images[2].caption}</figcaption>
          </figure>
        )}
      </section>

      <section className="panel lesson-confirm">
        <h3>Terminei de estudar, ir para o questionario</h3>
        <p>Quando terminar de ler tudo e assistir ao video, clique abaixo para responder as 5 questoes.</p>
        <div className="hero-actions">
          <GoToQuizButton {...props} quizCount={5} />
        </div>
      </section>
    </>
  );
}

function QuizContent(props) {
  const { lesson, quiz } = props;
  return (
    <section className="panel lesson-quiz-wrap">
      <div className="quiz-header">
        <h3>Questionario: {lesson.topic}</h3>
        <span className="tag">{quiz.length} questoes de multipla escolha</span>
      </div>
      <p>Responda as 5 questoes. Depois clique em finalizar para ver se acertou ou errou e o porque.</p>
      {quiz.map((question, index) => (
        <div key={question.id} className="quiz-question">
          <p className="quiz-question-number">Questao {index + 1} de {quiz.length}</p>
          <h4>{question.question}</h4>
          <div className="quiz-options">
            {question.options.map((option, optionIndex) => {
              const letter = ['A', 'B', 'C', 'D'][optionIndex] || optionIndex + 1;
              return (
                <button
                  key={`${question.id}-${optionIndex}`}
                  className={`quiz-option ${props.quizAnswers[question.id] === optionIndex ? 'selected' : ''}`}
                  onClick={() => props.setQuizAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
                >
                  <strong>{letter})</strong> {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="hero-actions">
        <button className="ghost-button" onClick={props.onBackToLesson}>Voltar para a aula</button>
        <button className="primary-button" onClick={props.onSubmitQuiz}>Finalizar questionario</button>
      </div>
    </section>
  );
}

function ResultsContent(props) {
  return (
    <section className="panel lesson-quiz-wrap quiz-results-wrap">
      <div className="quiz-header">
        <h3>Resultado do questionario</h3>
        <span className="tag">{props.lessonHits}/{props.quizResults.length} acertos</span>
      </div>
      <div className="quiz-result-summary">
        {props.quizResults.map((question, index) => (
          <div key={`${question.id}-summary`} className={`result-item ${question.isCorrect ? 'correct' : 'wrong'}`}>
            <p className="quiz-question-number">Questao {index + 1}</p>
            <h5>{question.question}</h5>
            <p>Sua resposta: <strong>{question.options[question.selectedIndex]}</strong></p>
            {!question.isCorrect && (
              <p>Resposta correta: <strong>{question.options[question.correct]}</strong></p>
            )}
            <p className={question.isCorrect ? 'success-text' : 'error-text'}>
              {question.isCorrect ? 'Voce acertou! Muito bem.' : 'Voce errou. Leia o porque abaixo.'}
            </p>
            <p className="explain-box"><strong>Por que? </strong>{question.explanation}</p>
          </div>
        ))}
      </div>
      <div className="hero-actions">
        <button className="ghost-button" onClick={props.onBack}>Voltar sem concluir</button>
        <button className="primary-button" onClick={props.onFinish} disabled={props.isSavingLesson}>
          {props.isSavingLesson ? 'Salvando...' : 'Voltar a pagina principal e contar o dia da sequencia'}
        </button>
      </div>
    </section>
  );
}

// Aula do topico do cronograma, escrita pela IA e validada no backend.
function GeneratedStudy(props) {
  const { lesson, detail } = props;
  const quizCount = props.quiz?.length || 5;
  return (
    <>
      <section className="panel lesson-hero">
        <div className="lesson-hero-copy">
          <span className="tag" style={{ background: `${lesson.color || '#a377ff'}1a`, color: lesson.color || '#a377ff' }}>
            {lesson.isCustom
              ? `Aula personalizada · ${lesson.duration} min · criada pela IA para voce`
              : `Aula do cronograma · ${lesson.duration} min · feita pela IA para voce`}
          </span>
          {/*
            A introduction e um PARAGRAFO (o gancho da aula), nao um
            titulo. Antes ela entrava num <h3> e o bloco inteiro
            aparecia em negrito gigante, como se fosse o nome da aula.
            O titulo de verdade e o topico do cronograma, que ja esta no
            cabecalho da tela; aqui a introducao entra como texto de
            leitura, com o topico como apoio.
          */}
          {detail.introduction ? (
            <>
              <h3 className="lesson-intro-topic">{lesson.topic}</h3>
              <p className="lesson-introduction">{detail.introduction}</p>
            </>
          ) : (
            <h3>{lesson.topic}</h3>
          )}
          {detail.objectives?.length ? (
            <>
              <h4>🎯 Ao final desta aula voce consegue</h4>
              <ul>
                {detail.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="lesson-timer">Tempo nesta aula: {props.lessonSeconds}s (minimo 10s)</p>
        </div>
      </section>

      <section className="panel lesson-content">
        <h3>Aula completa e detalhada</h3>
        {(detail.sections || []).map((section, sectionIndex) => (
          <article key={'secao-' + sectionIndex} className="lesson-section">
            <h4>{section.title}</h4>
            {(section.paragraphs || []).map((paragraph, index) => (
              <p key={'p-' + sectionIndex + '-' + index}>{paragraph}</p>
            ))}
            {section.bullets?.length ? (
              <ul>
                {(section.bullets || []).map((bullet, bulletIndex) => (
                  <li key={'b-' + bulletIndex}>{bullet}</li>
                ))}
              </ul>
            ) : null}
            {(section.examples || []).map((example, index) => (
              <div key={'ex-' + sectionIndex + '-' + index} className="lesson-section">
                <strong>✍️ Exemplo resolvido</strong>
                <p>{example.problem}</p>
                <p>{example.solution}</p>
                {example.explanation ? (
                  <p className="explain-box">
                    <strong>Por que? </strong>
                    {example.explanation}
                  </p>
                ) : null}
              </div>
            ))}
          </article>
        ))}
      </section>

      {detail.guidedPractice?.length ? (
        <section className="panel lesson-content">
          <h3>Pratique comigo (tap para ver a resposta)</h3>
          {detail.guidedPractice.map((item, index) => (
            <article key={`${item.question}-${index}`} className="lesson-section">
              <h4>
                {index + 1}. {item.question}
              </h4>
              {item.hint ? (
                <p>
                  <strong>Dica: </strong>
                  {item.hint}
                </p>
              ) : null}
              <details>
                <summary>Ver resposta</summary>
                <p>
                  <strong>{item.answer}</strong>
                </p>
                {item.explanation ? <p className="explain-box">{item.explanation}</p> : null}
              </details>
            </article>
          ))}
        </section>
      ) : null}

      {detail.commonMistakes?.length ? (
        <section className="panel lesson-content">
          <h3>⚠️ Onde a galera erra</h3>
          <ul>
            {detail.commonMistakes.map((mistake) => (
              <li key={mistake}>{mistake}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.summary?.length ? (
        <section className="panel lesson-content">
          <h3>📌 Resumo para levar</h3>
          <ul>
            {detail.summary.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel lesson-confirm">
        <h3>Terminei de estudar, ir para o questionario</h3>
        <p>
          Quando terminar de ler tudo, clique abaixo para responder as {quizCount} questoes desta aula
          {!props.quiz?.length ? ' (a IA prepara na hora)' : ''}.
        </p>
        <div className="hero-actions">
          <GoToQuizButton {...props} quizCount={quizCount} />
        </div>
      </section>
    </>
  );
}
