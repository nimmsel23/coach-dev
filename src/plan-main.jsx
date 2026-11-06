import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ClipboardList } from 'lucide-react'
import StrongApp from './views/Plan/StrongApp.jsx'
import AuthGateModal from './components/AuthGateModal.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import '@src/plan.styles.css'
import { UserProvider, useUser } from './contexts/UserContext.jsx'
import { SettingsProvider } from './contexts/SettingsContext.jsx'

function PlanShell() {
  const { user, authLoading, signIn, signInEmail, signUpEmail, signOut } = useUser()
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authRegistering, setAuthRegistering] = useState(false)
  const [showEmailAuth, setShowEmailAuth] = useState(false)

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    try {
      if (authRegistering) await signUpEmail(authEmail, authPassword)
      else await signInEmail(authEmail, authPassword)
      setShowEmailAuth(false)
    } catch {
      setAuthError('Anmeldung fehlgeschlagen.')
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fit-bg text-fit-ink">
        <div className="text-fit-dim text-xs font-black uppercase tracking-widest">...</div>
      </div>
    )
  }

  const allowed = Boolean(user)

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-fit-bg text-fit-ink">

        {allowed ? (
          <main className="min-w-0">
            <StrongApp key={user.uid || "local"} user={user} onSignOut={signOut} />
          </main>
        ) : (
          <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-lg flex-col items-center justify-center px-4 py-12 text-center">
            <div className="vos-surface w-full rounded-[28px] p-8">
              <ClipboardList size={34} className="mx-auto mb-4 text-fit-accent" />
              <h1 className="text-2xl font-semibold tracking-tight">Plan-Zugang</h1>
              <p className="mt-3 text-sm text-fit-dim">
                Melde dich an, um Workouts zu protokollieren und deine Trainingspläne zu öffnen.
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setAuthError('')
                    await signIn()
                  } catch {
                    setAuthError('Anmeldung fehlgeschlagen.')
                  }
                }}
                className="vos-btn primary mt-6 w-full"
              >
                Google Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthError('')
                  setShowEmailAuth(true)
                }}
                className="mt-3 w-full text-[10px] font-black uppercase tracking-widest text-fit-dim hover:text-fit-accent"
              >
                Email Login
              </button>
            </div>
          </main>
        )}

        {authError && !showEmailAuth && <p role="alert" className="px-4 text-center text-sm text-fit-red">{authError}</p>}
        <AuthGateModal
          open={showEmailAuth}
          onClose={() => {
            setAuthError('')
            setShowEmailAuth(false)
          }}
          authEmail={authEmail}
          setAuthEmail={setAuthEmail}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          authError={authError}
          authRegistering={authRegistering}
          setAuthRegistering={setAuthRegistering}
          onSubmit={handleAuthSubmit}
          onGoogleSignIn={async () => {
            try {
              setAuthError('')
              await signIn()
              setShowEmailAuth(false)
            } catch {
              setAuthError('Anmeldung fehlgeschlagen.')
            }
          }}
        />
      </div>
    </ErrorBoundary>
  )
}

createRoot(document.getElementById('root')).render(
  <UserProvider>
    <SettingsProvider>
      <PlanShell />
    </SettingsProvider>
  </UserProvider>
)
