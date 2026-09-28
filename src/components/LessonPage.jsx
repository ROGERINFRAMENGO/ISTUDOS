export const STUDY_CONFIRM_TEXT = '';


export default function LessonPage(props) {
  const { lesson, detail, quiz } = props;
  const isQuiz = props.lessonView === 'quiz';
  const isResults = props.lessonView === 'results' && props.quizResults;

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
    </div>
  );
}

function StudyContent(props) {
  const { lesson, detail } = props;
  return (
    <>
      <section className="panel lesson-hero">
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
        {(detail?.sections || []).slice(0, 3).map((section) => (
          <article key={section.title} className="lesson-section">
            <h4>{section.title}</h4>
            {section.paragraphs.map((paragraph, index) => (
              <p key={`${section.title}-${index}`}>{paragraph}</p>
            ))}
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
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
        {(detail?.sections || []).slice(3).map((section) => (
          <article key={section.title} className="lesson-section">
            <h4>{section.title}</h4>
            {section.paragraphs.map((paragraph, index) => (
              <p key={`${section.title}-${index}`}>{paragraph}</p>
            ))}
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
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
          <button className="primary-button" onClick={props.onGoToQuiz} disabled={!props.canShowQuiz}>
            Continuar para o questionario (5 questoes)
          </button>
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
