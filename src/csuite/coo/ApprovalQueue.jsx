import { useState } from 'react'

function badgeClass(status) {
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'rejected'
  if (status === 'ready') return 'ready'
  return ''
}

function badgeLabel(status) {
  if (status === 'pending_approval') return 'Freigabe'
  if (status === 'ready') return 'Bereit'
  if (status === 'approved') return 'Freigegeben'
  if (status === 'rejected') return 'Verworfen'
  return status
}

export default function ApprovalQueue({ items, busy, onApprove, onReject, onSaveEdit }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

  const pending = items.filter((i) => i.status === 'pending_approval')
  const others = items.filter((i) => i.status !== 'pending_approval').slice(0, 12)

  return (
    <section className="coo-panel" aria-label="Freigabe-Queue">
      <h2>Human-in-the-Loop</h2>
      <div className="coo-panel-body">
        {!pending.length && <p className="coo-empty">Keine offenen Freigaben.</p>}
        {pending.map((item) => (
          <article key={item.id} className="coo-card">
            <h3>
              {item.title}
              <span className={`coo-badge ${badgeClass(item.status)}`}>{badgeLabel(item.status)}</span>
            </h3>
            <p className="sub">{item.skillId}{item.clientName ? ` · ${item.clientName}` : ''}</p>
            {editingId === item.id ? (
              <textarea className="coo-edit" value={draft} onChange={(e) => setDraft(e.target.value)} />
            ) : (
              <pre className="coo-preview">{item.preview}</pre>
            )}
            <div className="coo-actions">
              {editingId === item.id ? (
                <>
                  <button
                    type="button"
                    className="coo-btn"
                    disabled={busy}
                    onClick={async () => {
                      await onSaveEdit(item.id, draft)
                      setEditingId(null)
                    }}
                  >
                    Speichern
                  </button>
                  <button type="button" className="coo-btn ghost" onClick={() => setEditingId(null)}>
                    Abbrechen
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="coo-btn ghost"
                    onClick={() => {
                      setEditingId(item.id)
                      setDraft(item.preview || '')
                    }}
                  >
                    Bearbeiten
                  </button>
                  <button type="button" className="coo-btn" disabled={busy} onClick={() => onApprove(item.id)}>
                    Freigeben
                  </button>
                  <button type="button" className="coo-btn danger" disabled={busy} onClick={() => onReject(item.id)}>
                    Verwerfen
                  </button>
                </>
              )}
            </div>
          </article>
        ))}

        {others.length > 0 && (
          <>
            <p className="coo-status">Zuletzt erledigt</p>
            {others.map((item) => (
              <article key={item.id} className="coo-card">
                <h3>
                  {item.title}
                  <span className={`coo-badge ${badgeClass(item.status)}`}>{badgeLabel(item.status)}</span>
                </h3>
                <pre className="coo-preview">{item.preview}</pre>
              </article>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
