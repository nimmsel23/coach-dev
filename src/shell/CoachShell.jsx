import { useCallback, useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import Coach from '../views/Coach/index.jsx'
import { useCoachRoute } from '../views/Coach/useCoachRoute.js'
import ExerciseInsightModal from '../components/ExerciseInsightModal.jsx'
import AuthGateModal from '../components/AuthGateModal.jsx'
import ErrorBoundary from '../components/common/ErrorBoundary.jsx'
import { useUser } from '../contexts/UserContext.jsx'
import { useSettingsStore } from '../store/index.js'
import { useCoachAccess } from '../hooks/useCoachAccess.js'
import { getAnatomy, watchCoachInbox } from '@db'
import { getStaticMuscleTaxonomy } from '../lib/kb/muscles.js'
import CoachSidebar from './CoachSidebar.jsx'
import CoachTabBar from './CoachTabBar.jsx'
import CoachHeader from './CoachHeader.jsx'
import WorkerChip from './WorkerChip.jsx'
import ThemeSheet from './ThemeSheet.jsx'
import { findNavItem } from './NavigationItems.js'
import { useCoachUnreadCounts } from '../views/Coach/useCoachUnreadCounts.js'

export default function CoachShell() {
  const { user, authLoading, signIn, signInEmail, signUpEmail, signOut } = useUser()
  const allowed = useCoachAccess(user)
  const { sidebarPinned, setSidebarPinned } = useSettingsStore()
  const pinned = sidebarPinned !== false && sidebarPinned !== 'false'
  const [route, navigateRoute] = useCoachRoute()
  const unread = useCoachUnreadCounts(allowed && !authLoading ? user?.uid : null)

  const [navExpanded, setNavExpanded] = useState(true)
  const [themeOpen, setThemeOpen] = useState(false)
  const [counts, setCounts] = useState({})
  const [inboxItems, setInboxItems] = useState([])
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authRegistering, setAuthRegistering] = useState(false)
  const [showEmailAuth, setShowEmailAuth] = useState(false)
  const [inspectorExercise, setInspectorExercise] = useState(null)
  const [taxonomy] = useState(() => getStaticMuscleTaxonomy())

  const reportExerciseCount = useCallback((n) => setCounts((prev) => (prev.exercises === n ? prev : { ...prev, exercises: n })), [])
  const reportUnreadCount = useCallback((n) => setCounts((prev) => (prev.clients === n ? prev : { ...prev, clients: n })), [])
  const goTo = (sub) => navigateRoute({ sub, client: '', date: '' })
  const selectClient = useCallback((uid) => {
    navigateRoute({ sub: 'clients', client: uid, detail: 'workouts', date: '', planId: '' })
  }, [navigateRoute])
  const selectClientChat = useCallback((uid) => {
    navigateRoute({ sub: 'clients', client: uid, detail: 'messages', date: '', planId: '' })
  }, [navigateRoute])
  const selectClientDetail = useCallback((detail) => {
    navigateRoute({
      sub: 'clients',
      client: route.client || '',
      detail,
      date: '',
      planId: '',
    })
  }, [navigateRoute, route.client])
  const refresh = () => window.location.reload()

  useEffect(() => {
    if (!allowed) {
      setInboxItems([])
      return undefined
    }
    let primed = false
    let prevSig = ''
    return watchCoachInbox((items) => {
      const list = Array.isArray(items) ? items : []
      const sig = list.map((item) => item.file_id || item.id || '').join('|')
      setInboxItems(list)
      setCounts((prev) => (prev.exercises === list.length ? prev : { ...prev, exercises: list.length }))
      if (primed && sig !== prevSig) window.dispatchEvent(new CustomEvent('fitness-inbox-updated'))
      primed = true
      prevSig = sig
    })
  }, [allowed])

  async function inspectExercise(exercise) {
    if (!exercise) return
    setInspectorExercise(exercise)
    const id = exercise.exercise_id || exercise.id
    if (!id || exercise.lesson) return
    try {
      const lesson = await getAnatomy(id)
      if (lesson) setInspectorExercise((prev) => (prev ? { ...prev, lesson } : prev))
    } catch {}
  }

  const selectInbox = useCallback(async (exercise) => {
    navigateRoute({ sub: 'exercises', client: '', date: '' })
    if (!exercise) return
    const githubUrl = typeof exercise.html_url === 'string' && exercise.html_url.startsWith('https://')
      ? exercise.html_url
      : null
    if (githubUrl && (exercise.cache_source === 'github_pr' || String(exercise.file_id || '').startsWith('pr-'))) {
      window.open(githubUrl, '_blank', 'noopener')
      return
    }
    setInspectorExercise(exercise)
    const id = exercise.exercise_id || exercise.id
    if (!id || exercise.lesson) return
    try {
      const lesson = await getAnatomy(id)
      if (lesson) setInspectorExercise((prev) => (prev ? { ...prev, lesson } : prev))
    } catch {}
  }, [navigateRoute])

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-fit-bg">
        <div className="spinner" />
      </div>
    )
  }

  const current = findNavItem(route.sub)
  const subtitle = route.sub === 'exercises'
    ? (counts.exercises > 0 ? `${counts.exercises} offen` : 'Alles freigegeben')
    : route.sub === 'traction' ? 'Live-Nutzung' : 'Verwaltung & Freigaben'

  return (
    <ErrorBoundary>
      <div
        className="min-h-[100dvh] bg-fit-bg text-fit-ink"
        style={{ '--mobile-nav-height': `calc(var(--nav-grip-h) + var(--safe-bottom)${navExpanded ? ' + var(--tabbar-h)' : ''})` }}
      >
        {allowed ? (
          <>
            <CoachSidebar
              active={route.sub}
              onNavigate={goTo}
              counts={counts}
              pinned={pinned}
              setPinned={setSidebarPinned}
              user={user}
              onTheme={() => setThemeOpen(true)}
              onRefresh={refresh}
              onSignOut={signOut}
              onSelectClient={selectClient}
              onSelectClientChat={selectClientChat}
              unreadByClient={unread.byClient}
              unreadClients={unread.unreadClients}
              onSelectInbox={selectInbox}
              inboxItems={inboxItems}
              activeInboxId={inspectorExercise?.file_id || inspectorExercise?.id || null}
              clientDetail={route.detail || 'workouts'}
              onSelectClientDetail={selectClientDetail}
              activeClient={route.client || ''}
            />
            <div className={`min-w-0 transition-all duration-500 ease-in-out ${pinned ? 'lg:ml-[304px]' : 'lg:ml-[108px]'}`}>
              <CoachHeader title={current.title} subtitle={subtitle} actions={<WorkerChip />} />
              <main
                className="mx-auto max-w-[1600px] pb-[calc(var(--mobile-nav-height)+12px)] lg:pb-6"
                style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}
              >
                <Coach sub={route.sub} onInspectExercise={inspectExercise} onInboxCount={reportExerciseCount} onUnreadCount={reportUnreadCount} />
              </main>
            </div>
            <CoachTabBar
              active={route.sub}
              onNavigate={goTo}
              counts={counts}
              expanded={navExpanded}
              onExpandedChange={setNavExpanded}
              user={user}
              onTheme={() => setThemeOpen(true)}
              onRefresh={refresh}
              onSignOut={signOut}
              onSelectClient={selectClient}
              onSelectClientChat={selectClientChat}
              unreadByClient={unread.byClient}
              unreadClients={unread.unreadClients}
              onSelectInbox={selectInbox}
              inboxItems={inboxItems}
              clientDetail={route.detail || 'workouts'}
              onSelectClientDetail={selectClientDetail}
            />
          </>
        ) : (
          <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-4 py-12 text-center" style={{ paddingTop: 'var(--safe-top)' }}>
            <div className="card w-full p-8">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fit-accent text-black shadow-xl shadow-fit-accent/30">
                <Shield size={26} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Coach-Zugang</h1>
              <p className="mt-3 text-sm text-fit-dim">
                Melde dich mit einem Coach-Account an, um Klienten, Katalog und Freigaben zu verwalten.
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
                Mit Google anmelden
              </button>
              <button type="button" onClick={() => { setAuthError(''); setShowEmailAuth(true) }} className="vos-btn mt-2 w-full">
                Mit E-Mail anmelden
              </button>
              {authError && <p className="mt-3 text-xs text-fit-red">{authError}</p>}
            </div>
          </main>
        )}

        <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
        <AuthGateModal
          productName="VitalOS Coach"
          requiredAccess
          open={showEmailAuth}
          onClose={() => { setAuthError(''); setShowEmailAuth(false) }}
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
        <ExerciseInsightModal
          exercise={inspectorExercise}
          onClose={() => setInspectorExercise(null)}
          onExerciseChange={setInspectorExercise}
          taxonomy={taxonomy}
        />
      </div>
    </ErrorBoundary>
  )
}
