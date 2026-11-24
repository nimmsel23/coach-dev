import { useState } from 'react'

export default function SkillConsole({ messages, busy, onChat, onSkill }) {
  const [chatInput, setChatInput] = useState('')
  const [transcript, setTranscript] = useState('')
  const [transcriptClient, setTranscriptClient] = useState('')
  const [onboard, setOnboard] = useState({ name: '', email: '', package: '10er Coaching' })

  return (
    <section className="coo-panel" aria-label="Skill-Konsole">
      <h2>Interaktion &amp; Skills</h2>
      <div className="coo-panel-body">
        <div className="coo-workflows">
          <div className="coo-card">
            <h3>Call-Transkript verarbeiten</h3>
            <label>
              Klient-ID (optional)
              <input
                value={transcriptClient}
                onChange={(e) => setTranscriptClient(e.target.value)}
                placeholder="z. B. matthias-mayer"
              />
            </label>
            <label>
              Transkript
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Zoom / Fireflies Text hier einfügen…"
              />
            </label>
            <button
              type="button"
              className="coo-btn"
              disabled={busy || !transcript.trim()}
              onClick={() =>
                onSkill('process_call_transcript', {
                  clientId: transcriptClient || null,
                  clientName: transcriptClient || 'Session',
                  transcript,
                })
              }
            >
              Verarbeiten
            </button>
          </div>

          <div className="coo-card">
            <h3>Neuen Klienten onboarden</h3>
            <label>
              Name
              <input
                value={onboard.name}
                onChange={(e) => setOnboard({ ...onboard, name: e.target.value })}
              />
            </label>
            <label>
              E-Mail
              <input
                type="email"
                value={onboard.email}
                onChange={(e) => setOnboard({ ...onboard, email: e.target.value })}
              />
            </label>
            <label>
              Paket
              <input
                value={onboard.package}
                onChange={(e) => setOnboard({ ...onboard, package: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="coo-btn"
              disabled={busy || !onboard.name.trim()}
              onClick={() => onSkill('onboard_client', { ...onboard })}
            >
              Onboarding vorbereiten
            </button>
          </div>
        </div>

        <div className="coo-chat">
          <div className="coo-chat-log" aria-live="polite">
            {!messages.length && (
              <p className="coo-empty">Kontext-Chat — freie Rückfragen an den COO-Stub.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`coo-chat-msg ${m.role}`}>
                <strong>{m.role === 'user' ? 'Du' : 'COO'}:</strong> {m.content}
              </div>
            ))}
          </div>
          <form
            className="coo-chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              const text = chatInput.trim()
              if (!text || busy) return
              setChatInput('')
              onChat(text)
            }}
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Aufgabe an COO…"
              aria-label="Nachricht an COO"
            />
            <button type="submit" className="coo-btn" disabled={busy || !chatInput.trim()}>
              Senden
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
