export default function TodayLane({ cards, loading, error, busySkill, onSkill }) {
  return (
    <section className="coo-panel" aria-label="Heute im Fokus">
      <h2>Heute im Fokus</h2>
      <div className="coo-panel-body">
        {loading && <p className="coo-empty">Klienten &amp; Plan-Heute werden geladen…</p>}
        {error && <p className="coo-empty">API: {error}</p>}
        {!loading && !error && !cards.length && (
          <p className="coo-empty">Keine deliverbaren Klienten. Prüfe `/api/clients` auf :9150.</p>
        )}
        {cards.map((card) => (
          <article key={card.clientId} className="coo-card">
            <h3>{card.name}</h3>
            <p className="sub">{card.sessionLabel}</p>
            <ul>
              {card.briefing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="coo-actions">
              <button
                type="button"
                className="coo-btn"
                disabled={busySkill}
                onClick={() =>
                  onSkill('deep_dive_notes', {
                    clientId: card.clientId,
                    clientName: card.name,
                  })
                }
              >
                Deep-Dive Notizen
              </button>
              <button
                type="button"
                className="coo-btn ghost"
                disabled={busySkill}
                onClick={() =>
                  onSkill('create_exercise_sheet', {
                    clientId: card.clientId,
                    clientName: card.name,
                    agenda: card.sessionLabel,
                    sessionLabel: card.sessionLabel,
                  })
                }
              >
                Übungsblatt
              </button>
              <button
                type="button"
                className="coo-btn ghost"
                disabled={busySkill}
                onClick={() =>
                  onSkill('draft_followup_email', {
                    clientId: card.clientId,
                    clientName: card.name,
                    sessionSummary: card.briefing.join('\n'),
                  })
                }
              >
                Follow-up Entwurf
              </button>
              <button
                type="button"
                className="coo-btn ghost"
                disabled={busySkill}
                onClick={() =>
                  onSkill('draft_checkin_reminder', {
                    clientId: card.clientId,
                    clientName: card.name,
                    daysSince: 10,
                    channel: 'auto',
                  })
                }
              >
                Check-in
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
