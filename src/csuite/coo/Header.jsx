const FALLBACK_ENGINES = [
  { id: 'claude', label: 'claude CLI' },
  { id: 'agy', label: 'agy' },
  { id: 'cursor-agent', label: 'cursor-agent' },
  { id: 'codex', label: 'codex' },
  { id: 'gemini', label: 'Gemini API' },
  { id: 'issue', label: 'Oneshot → GitHub Issue' },
  { id: 'stub', label: 'Stub (offline)' },
]

export default function Header({
  versionLabel,
  engine,
  onEngineChange,
  engines,
  kpis,
  dataSource,
}) {
  const options = (engines?.length ? engines : FALLBACK_ENGINES).map((e) => {
    if (typeof e === 'string') return { id: e, label: e, available: true }
    const base = FALLBACK_ENGINES.find((f) => f.id === e.id)
    const mark = e.available === false ? ' (n/a)' : ''
    return {
      id: e.id,
      label: `${base?.label || e.id}${mark}`,
      available: e.available !== false,
    }
  })

  return (
    <header className="coo-header">
      <div>
        <h1>COO · Coaching-Delivery</h1>
        <p className="meta">
          {versionLabel}
          {' · Brain: workspaces/coo/'}
          {dataSource ? ` · Daten: ${dataSource}` : null}
        </p>
      </div>
      <div className="coo-header-controls">
        <label>
          <span className="coo-status">Engine </span>
          <select
            value={engine}
            onChange={(e) => onEngineChange(e.target.value)}
            aria-label="Agent-Engine wählen"
          >
            {options.map((m) => (
              <option key={m.id} value={m.id} disabled={m.available === false}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="coo-kpis" aria-label="KPIs">
          <div className="coo-kpi">
            <span className="n">{kpis.activeClients}</span>
            <span className="l">Aktive</span>
          </div>
          <div className="coo-kpi">
            <span className="n">{kpis.sessionsToday}</span>
            <span className="l">Sessions</span>
          </div>
          <div className="coo-kpi">
            <span className="n">{kpis.openFollowups}</span>
            <span className="l">Follow-ups</span>
          </div>
        </div>
      </div>
    </header>
  )
}
