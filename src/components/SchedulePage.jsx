import { Fragment } from 'react';
import { getPlanDaysForDate, isGeneratedDay } from '../data/curriculum';

const KIND_TAGS = {
  lesson: null,
  review: 'Revisão',
  questions: 'Questões',
};

export default function SchedulePage(props) {
  return (
    <section className="panel schedule-panel">
      <div className="panel-head">
        <h3>Cronograma 28/09 a 05/12</h3>
        <span className="tag">10 semanas · 2 blocos por dia · 2 horas</span>
      </div>
      <p className="schedule-intro">
        Cada dia tem dois blocos de 55 minutos com 10 minutos de intervalo (2 horas no total).
        Clique em "Abrir aula da IA" no bloco que quiser estudar — a aula e o quiz são escritos
        pelo conteúdo exato que está aqui.
      </p>
      <div className="schedule-list">
        {props.weeks.map((week) => {
          const isCurrentWeek = week.days.some((d) => d.key === props.todayDateKey);
          return (
            <article key={week.id} className="schedule-week">
              <header className="schedule-week-head">
                <div>
                  <strong>{week.title}{week.subtitle ? ` — ${week.subtitle}` : ''}</strong>
                  <small>{week.range}</small>
                </div>
                <span className={`tag ${isCurrentWeek ? 'tag-hot' : ''}`}>
                  {isCurrentWeek ? 'Semana atual' : week.range}
                </span>
              </header>
              <p className="schedule-goal">{week.goal}</p>
              <div className="schedule-table-wrap">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Bloco</th>
                      <th>Matéria e conteúdo</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {week.days.map((day) => {
                      const isToday = day.key === props.todayDateKey;
                      // Os planos vêm do cronograma (fonte de verdade), não de lessonIds.
                      const plans = getPlanDaysForDate(day.key);
                      return (
                        <Fragment key={day.key}>
                          {plans.map((plan, index) => {
                            const done = (props.completedIds || []).includes(plan.id);
                            const canOpen = isGeneratedDay(plan);
                            const kindTag = KIND_TAGS[plan.kind];
                            return (
                              <tr key={plan.id} className={isToday ? 'schedule-today' : ''}>
                                {index === 0 ? (
                                  <td className="schedule-day" rowSpan={plans.length || 1}>
                                    <strong>{day.weekday}</strong>
                                    <small className="schedule-day-total">
                                      {day.totalMinutes} min
                                      {day.blocks.length > 1 ? ` · ${day.blocks.length} blocos` : ''}
                                    </small>
                                  </td>
                                ) : null}
                                <td className="schedule-block">
                                  <span className="tag">{plan.blockLabel}</span>
                                  <small>{plan.durationMinutes} min</small>
                                </td>
                                <td>
                                  <strong style={{ color: plan.color }}>{plan.subject}</strong>
                                  <small className="schedule-block-subtopics">
                                    {plan.subtopics.join(' · ')}
                                  </small>
                                </td>
                                <td>
                                  {done ? (<span className="tag lesson-done-tag">Feita</span>)
                                    : isToday ? (<span className="tag tag-hot">Hoje</span>)
                                    : (<span className="tag schedule-planned">Planejada</span>)}
                                  {kindTag ? (<span className="tag schedule-kind">{kindTag}</span>) : null}
                                  {canOpen && props.onOpenPlanDay ? (
                                    <button
                                      type="button"
                                      className="ghost-button schedule-open"
                                      onClick={() => props.onOpenPlanDay(plan.id)}
                                    >
                                      Abrir aula da IA
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                          {plans.length === 0 && (
                            <tr className={isToday ? 'schedule-today' : ''}>
                              <td className="schedule-day"><strong>{day.weekday}</strong></td>
                              <td className="schedule-block">—</td>
                              <td colSpan={2}>{day.content}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function SettingsPage(props) {
  return (
    <section className="panel config-panel-page">
      <div className="panel-head">
        <h3>Configurações</h3>
        <span className="tag">Tema do site</span>
      </div>
      <p>Escolha a cor do tema. Fica salva neste dispositivo.</p>
      <div className="theme-grid">
        {Object.entries(props.themes).map(([key, theme]) => (
          <button key={key} className={`theme-option ${props.active === key ? 'selected' : ''}`} onClick={() => props.onSelect(key)}>
            <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }} />
            <strong>{theme.label}</strong>
            {props.active === key && <small>Ativo</small>}
          </button>
        ))}
      </div>
    </section>
  );
}
