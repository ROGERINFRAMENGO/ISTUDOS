export default function SchedulePage(props) {
  return (
    <section className="panel schedule-panel">
      <div className="panel-head">
        <h3>Cronograma 28/09 a 05/12</h3>
        <span className="tag">10 semanas · 5 fases</span>
      </div>
      <p className="schedule-intro">Cada dia mostra o conteúdo planejado. O botão Começar aparece no Estudo de hoje quando a aula do dia estiver cadastrada.</p>
      <div className="schedule-list">
        {props.weeks.map((week) => (
          <article key={week.id} className="schedule-week">
            <header className="schedule-week-head">
              <div>
                <strong>{week.title}</strong>
                <small>{week.range}</small>
              </div>
              <span className={`tag ${week.days.some((d) => d.key === props.todayDateKey) ? 'tag-hot' : ''}`}>
                {week.days.some((d) => d.key === props.todayDateKey) ? 'Semana atual' : week.range}
              </span>
            </header>
            <p className="schedule-goal">{week.goal}</p>
            <div className="schedule-table-wrap">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Conteúdo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {week.days.map((day) => {
                    const doneIds = day.lessonIds || [];
                    const done = doneIds.length > 0 && doneIds.every((id) => (props.completedIds || []).includes(id));
                    const isToday = day.key === props.todayDateKey;
                    return (
                      <tr key={day.key} className={`${isToday ? 'schedule-today' : ''} ${done ? 'schedule-done' : ''}`}>
                        <td className="schedule-day"><strong>{day.weekday}</strong></td>
                        <td>{day.content}</td>
                        <td>
                          {done ? (<span className="tag lesson-done-tag">Feita</span>)
                            : doneIds.length ? (<span className="tag">Aula pronta</span>)
                            : isToday ? (<span className="tag tag-hot">Hoje</span>)
                            : (<span className="tag schedule-planned">Planejada</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        ))}
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
