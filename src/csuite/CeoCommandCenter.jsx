import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from '../firebase.js'

/**
 * CEO Command Center — embeds Git-brain HTML dashboards from /workspaces/<role>/.
 * Auth: Firebase Google. Brain SOT remains Git (dashboards fetch ./system-prompt.md + ./skills.json).
 */

const C_SUITE_ROLES = [
  {
    id: 'coo',
    label: 'KI-COO (Operations)',
    shortTitle: 'COO',
    mark: '◎',
    dashboardPath: '/coach/workspaces/coo/dashboard.html',
    description: 'Session-Prep, Onboarding & Klienten-Erfolg',
  },
  {
    id: 'cmo',
    label: 'KI-CMO (Marketing)',
    shortTitle: 'CMO',
    mark: '◈',
    dashboardPath: '/coach/workspaces/cmo/dashboard.html',
    description: 'Content-Pipeline, Leads & Sichtbarkeit',
  },
  {
    id: 'cso',
    label: 'KI-CSO (Sales)',
    shortTitle: 'CSO',
    mark: '◉',
    dashboardPath: '/coach/workspaces/cso/dashboard.html',
    description: 'Lead-Qualifizierung & Call-Briefings',
  },
  {
    id: 'cpo',
    label: 'KI-CPO (Product)',
    shortTitle: 'CPO',
    mark: '◇',
    dashboardPath: '/coach/workspaces/cpo/dashboard.html',
    description: 'Angebot, Coach-Produkt & Backlog',
  },
  {
    id: 'cto',
    label: 'KI-CTO (Technik)',
    shortTitle: 'CTO',
    mark: '⬡',
    dashboardPath: '/coach/workspaces/cto/dashboard.html',
    description: 'Werkstatt, Schreibpfade & CI',
  },
  {
    id: 'cfo',
    label: 'KI-CFO (Finance)',
    shortTitle: 'CFO',
    mark: '▣',
    dashboardPath: '/coach/workspaces/cfo/dashboard.html',
    description: 'Umsatz, Posten & Belege',
  },
]

const ALLOWED_CEO_EMAIL = (import.meta.env.VITE_CEO_EMAIL || '').trim()
const googleProvider = new GoogleAuthProvider()

export default function CeoCommandCenter() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [activeRoleId, setActiveRoleId] = useState('coo')
  const [iframeKey, setIframeKey] = useState(0)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Same-origin iframes share Auth persistence; postMessage nudges dashboards + logs identity.
  useEffect(() => {
    if (!user) return undefined
    const post = () => {
      const frame = document.querySelector('iframe.ceo-frame')
      frame?.contentWindow?.postMessage(
        {
          type: 'csuite-auth',
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
        },
        window.location.origin,
      )
    }
    post()
    const t = window.setTimeout(post, 400)
    return () => window.clearTimeout(t)
  }, [user, activeRoleId, iframeKey])

  const handleLogin = async () => {
    setAuthError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      console.error('Login fehlgeschlagen:', error)
      setAuthError(error?.message || String(error))
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Logout fehlgeschlagen:', error)
    }
  }

  const activeRole = C_SUITE_ROLES.find((r) => r.id === activeRoleId) || C_SUITE_ROLES[0]

  if (authLoading) {
    return (
      <div className="ceo-gate">
        <p className="ceo-muted">Prüfe CEO-Authentifizierung…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="ceo-gate">
        <div className="ceo-card">
          <p className="ceo-pill">CEO Kommandozentrale</p>
          <h1>Coaching C-Suite</h1>
          <p className="ceo-muted">
            Anmelden für isolierte Agenten-Workspaces und Freigabe-Queues. Brain bleibt Git
            (<code>workspaces/&lt;rolle&gt;/</code>).
          </p>
          {authError ? <p className="ceo-error">{authError}</p> : null}
          <button type="button" className="ceo-btn primary" onClick={handleLogin}>
            Mit Google anmelden
          </button>
          <p className="ceo-hint">
            Lokal ohne Auth-Zwang: Hub unter <a href="/coach/">/coach/</a> oder Direkt-Dashboards.
          </p>
        </div>
      </div>
    )
  }

  if (
    ALLOWED_CEO_EMAIL &&
    user.email?.toLowerCase() !== ALLOWED_CEO_EMAIL.toLowerCase()
  ) {
    return (
      <div className="ceo-gate">
        <div className="ceo-card danger">
          <h1>Zugriff verweigert</h1>
          <p className="ceo-muted">
            Der Account <strong>{user.email}</strong> ist nicht als CEO freigeschaltet
            (<code>VITE_CEO_EMAIL</code>).
          </p>
          <button type="button" className="ceo-btn" onClick={handleLogout}>
            Abmelden
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ceo-shell">
      <header className="ceo-top">
        <div className="ceo-brand">
          <strong>CEO Cockpit</strong>
          <span className="ceo-muted">C-Suite Agenten · Git-Brain</span>
        </div>

        <nav aria-label="C-Suite Workspaces" className="ceo-tabs">
          {C_SUITE_ROLES.map((role) => {
            const isActive = role.id === activeRole.id
            return (
              <button
                key={role.id}
                type="button"
                title={role.description}
                className={`ceo-tab${isActive ? ' active' : ''}`}
                onClick={() => setActiveRoleId(role.id)}
              >
                <span aria-hidden="true">{role.mark}</span>
                <span>{role.shortTitle}</span>
              </button>
            )
          })}
        </nav>

        <div className="ceo-actions">
          <button
            type="button"
            className="ceo-btn ghost"
            title="Aktuelles Rollen-Dashboard neu laden"
            onClick={() => setIframeKey((k) => k + 1)}
          >
            Reload
          </button>
          <a
            className="ceo-btn ghost"
            href={activeRole.dashboardPath}
            target="_blank"
            rel="noopener noreferrer"
            title="In eigenem Tab öffnen"
          >
            Tab
          </a>
          <a className="ceo-btn ghost" href="/coach/" title="Coach Hub">
            Hub
          </a>
          <div className="ceo-user">
            <span>{user.displayName || 'CEO'}</span>
            <span className="ceo-muted">{user.email}</span>
          </div>
          <button type="button" className="ceo-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="ceo-main">
        <iframe
          key={`${activeRole.id}-${iframeKey}`}
          src={activeRole.dashboardPath}
          title={activeRole.label}
          className="ceo-frame"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </main>
    </div>
  )
}
