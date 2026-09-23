import { useState, useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import Session from './views/Session/index.jsx'
import Learn   from '@learn/views/Learn/index.jsx'
import WeeklyReview from './views/WeeklyReview/index.jsx'
import Settings from './views/Settings/index.jsx'
import Anamnese from './views/Anamnese/index.jsx'
import Fokus from './views/Fokus/index.jsx'
import Inbox from './views/Inbox/index.js'
import ExerciseInsightModal from './components/ExerciseInsightModal.jsx'
import { isLocalMode, getAnatomy, getAllMuscles } from '@db'

import { getNavItems, VALID_TABS } from './constants/NavigationItems.js'

import Sidebar from './components/layout/Sidebar.jsx'
import MobileNav from './components/layout/MobileNav.jsx'
import UserProfile from './components/common/UserProfile.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import PwaUpdateBanner from './components/common/PwaUpdateBanner.jsx'
import { IosInstallHint } from './components/IosInstallHint.jsx'
import { InstallPromptHandler } from './components/InstallPromptHandler.jsx'
import AuthGateModal from './components/AuthGateModal.jsx'

import AppGate from './views/AppGate.jsx'

import { useUser } from './contexts/UserContext'
import { useSettings } from './contexts/SettingsContext'
import { useSwipeNavigation } from './hooks/useSwipeNavigation'
import { getStaticMuscleTaxonomy } from './lib/kb/muscles.js'

const SESSION_SUB_TABS = new Set(['today', 'timer', 'skills', 'plan', 'history'])
const REVIEW_SUB_TABS = new Set(['report', 'muscles', 'readiness', 'strength', 'verlauf'])
const LEARN_SUB_TABS = new Set(['exercises', 'anatomy', 'quiz'])
const FOCUS_LAYERS = new Set(['focus', 'anamnese', 'freedom'])

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function localToday() {
  return new Date().toISOString().slice(0, 10)
}

function parseHashRoute({ resolveFlowTab, navMode }) {
  const fallbackTab = resolveFlowTab(navMode === 'home' ? 'gate' : 'session')
  const rawHash = window.location.hash.replace(/^#\/?/, '')
  const [pathPart = '', queryPart = ''] = rawHash.split('?')
  const [rawTab = '', rawSub = ''] = pathPart.split('/').filter(Boolean)
  const params = new URLSearchParams(queryPart)
  const legacyDate = params.get('date')
  const view = params.get('view')
  const id = params.get('id')
  const normalizedPathDate = rawSub === 'today'
    ? localToday()
    : isIsoDate(rawSub)
      ? rawSub
      : null
  const normalizedLegacyDate = rawSub === 'today'
    ? (isIsoDate(legacyDate) ? legacyDate : localToday())
    : (isIsoDate(legacyDate) ? legacyDate : null)

  const next = {
    tab: fallbackTab,
    subTab: null,
    sessionDate: normalizedPathDate || normalizedLegacyDate,
    focusLayer: null,
    // Nur relevant für tab=session/subTab=plan — welche Unteransicht des
    // Plan-Tabs offen ist (routine/workout) + welches Template/Workout,
    // damit ein Link direkt dorthin führt statt immer auf die Liste.
    planView: null,
    planId: null,
  }

  if (VALID_TABS.has(rawTab)) {
    next.tab = resolveFlowTab(rawTab)
  }

  if (next.tab === 'session') {
    const explicitDate = isIsoDate(rawSub) || (!rawSub && isIsoDate(legacyDate))
    if (SESSION_SUB_TABS.has(rawSub) && rawSub !== 'today') {
      next.subTab = rawSub
    } else if (explicitDate) {
      // Deep-Link mit explizitem Datum (z.B. von Dashboard/Review) — kein Gate
      next.sessionDate = next.sessionDate || localToday()
    } else {
      // Kein Datum angegeben: frischer Einstieg (leerer Hash, PWA-Start_url)
      // oder explizit #session/today — hier soll das Session-Gate aufgehen
      next.subTab = 'today'
      next.sessionDate = next.sessionDate || localToday()
    }
    if (next.subTab === 'plan' && (view === 'routine' || view === 'workout') && id) {
      next.planView = view
      next.planId = id
    }
    return next
  }

  if (next.tab === 'review') {
    if (REVIEW_SUB_TABS.has(rawSub) && rawSub !== 'report') next.subTab = rawSub
    return next
  }

  if (next.tab === 'learn') {
    if (LEARN_SUB_TABS.has(rawSub)) next.subTab = rawSub
    return next
  }

  if (next.tab === 'focus') {
    if (rawTab === 'anamnese') {
      next.focusLayer = 'anamnese'
      return next
    }
    if (FOCUS_LAYERS.has(rawSub) && rawSub !== 'focus') {
      next.focusLayer = rawSub
    }
  }

  return next
}

function buildHashRoute({ tab, subTab, sessionDate, focusLayer, planView, planId }) {
  const segments = [tab]
  const params = new URLSearchParams()

  if (tab === 'session') {
    if (SESSION_SUB_TABS.has(subTab) && subTab !== 'today') {
      segments.push(subTab)
    } else if (sessionDate) {
      segments.push(sessionDate)
    }
    if (subTab === 'plan' && (planView === 'routine' || planView === 'workout') && planId) {
      params.set('view', planView)
      params.set('id', planId)
    }
  } else if (tab === 'review') {
    if (REVIEW_SUB_TABS.has(subTab) && subTab !== 'report') segments.push(subTab)
  } else if (tab === 'learn') {
    if (LEARN_SUB_TABS.has(subTab)) segments.push(subTab)
  } else if (tab === 'focus') {
    if (FOCUS_LAYERS.has(focusLayer) && focusLayer !== 'focus') segments.push(focusLayer)
  }

  const query = params.toString()
  return `#${segments.join('/')}${query ? `?${query}` : ''}`
}

export default function App() {
  const {
    user, authLoading,
    gender, split, cycleLength, defaultLocation,
    hit1Fact, hit1Obstacle, hit1Strike, hit1Responsibility,
    hit2Fact, hit2Obstacle, hit2Strike, hit2Responsibility,
    hit3Fact, hit3Obstacle, hit3Strike, hit3Responsibility,
    hit4Fact, hit4Obstacle, hit4Strike, hit4Responsibility,
    signIn, signInEmail, signUpEmail, signOut
  } = useUser();
  const devBypassFlow = isLocalMode();

  const {
    theme, setThemeState, themeMode, setModeState,
    circDark, setCircDark, circLight, setCircLight,
    recentDays, setRecentDays,
    coverageThreshold, setCoverageThreshold, showAdvanced, setShowAdvanced,
    sidebarPinned, setSidebarPinned,
    swipeEnabled, setSwipeEnabled, muscleLanguage, setMuscleLanguage,
    navMode, setNavMode
  } = useSettings();

  const hasCompleteHit = (...values) => values.every((value) => value?.trim());
  const focusReady = (
    hasCompleteHit(hit1Fact, hit1Obstacle, hit1Strike, hit1Responsibility) ||
    hasCompleteHit(hit2Fact, hit2Obstacle, hit2Strike, hit2Responsibility) ||
    hasCompleteHit(hit3Fact, hit3Obstacle, hit3Strike, hit3Responsibility) ||
    hasCompleteHit(hit4Fact, hit4Obstacle, hit4Strike, hit4Responsibility)
  );
  const navItems = getNavItems({ focusReady, devBypass: devBypassFlow });
  const resolveFlowTab = (id) => {
    if (devBypassFlow) return id;
    if (id === 'anamnese' && focusReady) return 'focus';
    if (id === 'focus' && !focusReady) return 'anamnese';
    return id;
  };

  const initialRoute = parseHashRoute({
    resolveFlowTab,
    navMode: localStorage.getItem('fitness-navMode') || 'tabs',
  })

  const [tab, setTab]             = useState(() => {
     if (window.location.pathname === '/catalog-ui') return 'coach';
     return initialRoute.tab;
  });
  const [subTab, setSubTab] = useState(() => initialRoute.subTab);

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authRegistering, setAuthRegistering] = useState(false);
  const [showAuthGateModal, setShowAuthGateModal] = useState(false);
  const [authGateTriggerCount, setAuthGateTriggerCount] = useState(0);
  const [authGateDismissedAt, setAuthGateDismissedAt] = useState(0);

  const [sessionDate, setSessionDate]   = useState(() => initialRoute.sessionDate)
  const [sessionDraft, setSessionDraft] = useState(null)
  const [planView, setPlanView] = useState(() => initialRoute.planView)
  const [planId, setPlanId] = useState(() => initialRoute.planId)
  const [inspectorExercise, setInspectorExercise] = useState(null)
  const [taxonomy] = useState(() => getStaticMuscleTaxonomy());
  const [focusLayer, setFocusLayer] = useState(() => initialRoute.focusLayer);

  const { mainRef, swipeHint, slideDirection, setSlideDirection } = useSwipeNavigation({
    navMode, tab, swipeEnabled, setTab, NAV_ITEMS: navItems
  });

  useEffect(() => {
    if (!user) return;
    getAllMuscles().catch(() => {});
  }, [user]);

  useEffect(() => {
    if (isLocalMode()) return undefined;

    const timer = window.setTimeout(() => {
      setAuthGateTriggerCount((count) => count + 1);
    }, 60000);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (isLocalMode()) return undefined;

    const handleAuthGateTrigger = () => {
      setAuthGateTriggerCount((count) => count + 1);
    };

    window.addEventListener('fitness-auth-gate-trigger', handleAuthGateTrigger);
    return () => {
      window.removeEventListener('fitness-auth-gate-trigger', handleAuthGateTrigger);
    };
  }, []);

  useEffect(() => {
    if (isLocalMode() || user) {
      setShowAuthGateModal(false);
      return;
    }
    if (authGateTriggerCount > authGateDismissedAt) {
      setShowAuthGateModal(true);
    }
  }, [user, authGateTriggerCount, authGateDismissedAt]);

  const navigateToTab = (newTabId) => {
    const targetTabId = resolveFlowTab(newTabId);
    const isSpecialTab = targetTabId === 'inbox';
    if (targetTabId === 'gate') {
      setSubTab(null);
      setTab('gate');
      return;
    }
    if (!isSpecialTab && !navItems.some((item) => item.id === targetTabId)) return;
    if (targetTabId === tab) return;
    const oldIdx = navItems.findIndex(i => i.id === tab);
    const newIdx = navItems.findIndex(i => i.id === targetTabId);
    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
      setSlideDirection(newIdx > oldIdx ? 'left' : 'right');
    } else {
      setSlideDirection('bottom');
    }
    setSubTab(null);
    setSessionDraft(null);
    if (targetTabId !== 'session') setSessionDate(null);
    if (targetTabId !== 'focus') setFocusLayer(null);
    setTab(targetTabId);
  };

  function navigate(id) { navigateToTab(id) }
  function navigateSub(id) { setSubTab(id) }
  function navigateFocusLayer(id) { setFocusLayer(id) }
  // Plan ist kein eigener "tab"-Wert (bleibt technisch Session-Subtab, teilt
  // sich Route/State mit Training), soll aber von überall aus direkt
  // erreichbar sein wie ein normaler Tab — kombiniert Tab-Wechsel +
  // Subtab-Wechsel in einem Klick. navigateToTab() setzt subTab synchron
  // auf null; der Aufruf danach im selben Tick gewinnt (React batcht beide
  // setSubTab-Aufrufe, letzter Wert zählt).
  function navigateToPlan() { navigateToTab('session'); setSubTab('plan') }

  // App-weite Tab-Navigation per Tastatur: Alt+Pfeil links/rechts wechselt
  // zyklisch durch NAV_ITEMS. Alt statt Ctrl/Cmd, weil Ctrl/Cmd+Zahl vom
  // Browser für echten Tab-Wechsel reserviert ist (würde kollidieren) —
  // Alt+Pfeil ist frei. Nur aktiv wenn kein Input/Textarea/ContentEditable
  // fokussiert ist (sonst würde z.B. ein Reps-Feld die Navigation
  // triggern statt Cursor zu bewegen) und kein Modal offen ist —
  // App-weite (ExerciseInsightModal, AuthGateModal) per State hier, Session-
  // lokale (SessionModalsLayer/activeModal aus useSession.js, App.jsx sieht
  // diesen State nicht) per DOM-Flag auf document.body, das
  // SessionModalsLayer.jsx selbst setzt/räumt — kein Prop-Lifting durch
  // views/Session/index.jsx nötig für einen einzelnen Boolean.
  useEffect(() => {
    function handleKeyDown(event) {
      if (!event.altKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      if (inspectorExercise || showAuthGateModal) return
      if (document.body.dataset.sessionModalOpen) return
      const currentIdx = navItems.findIndex((item) => item.id === tab)
      if (currentIdx === -1) return // z.B. Gate-Homescreen, kein Tab-Zyklus-Kontext
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      const nextIdx = (currentIdx + delta + navItems.length) % navItems.length
      navigate(navItems[nextIdx].id)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navItems, tab, inspectorExercise, showAuthGateModal])

  useEffect(() => {
    if (subTab !== 'plan' && (planView || planId)) {
      setPlanView(null)
      setPlanId(null)
    }
  }, [subTab])

  // Session-Gate-Sheet soll nur beim tatsächlichen Navigieren auf den
  // "Heute"-Subtab aufgehen, nicht bei jedem Datumswechsel — Session (siehe
  // key={sessionDate || 'today'} unten) remountet komplett bei jedem
  // Datumswechsel, ein lokaler useEffect in SessionEditor würde also auch
  // bei bloßem Datumswechsel erneut feuern. Dieses Flag lebt hier in App
  // (remountet nicht) und wird als One-Shot-Signal nach unten gereicht.
  const prevSubTabForGateRef = useRef(null)
  const [gateAutoOpenFlag, setGateAutoOpenFlag] = useState(false)
  useEffect(() => {
    // Gate darf nur für HEUTE aufpoppen — ein explizit gewähltes Datum
    // (Day-Strip, Kalender-Icon) darf subTab zwar weiterhin 'today' halten,
    // soll das Gate aber nicht erneut öffnen (User-Feedback 2026-09-07).
    const isActuallyToday = !sessionDate || sessionDate === localToday()
    if (tab === 'session' && subTab === 'today' && prevSubTabForGateRef.current !== 'today' && isActuallyToday) {
      setGateAutoOpenFlag(true)
    }
    prevSubTabForGateRef.current = subTab
  }, [tab, subTab, sessionDate])

  useEffect(() => {
    const targetHash = buildHashRoute({ tab, subTab, sessionDate, focusLayer, planView, planId })
    if (window.location.hash !== targetHash) {
      history.replaceState(null, '', targetHash)
    }
  }, [tab, subTab, sessionDate, focusLayer, planView, planId])

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.pathname === '/catalog-ui') {
        setSubTab(null)
        setSessionDate(null)
        setFocusLayer(null)
        setTab('coach')
        return
      }
      const route = parseHashRoute({ resolveFlowTab, navMode })
      setTab(route.tab)
      setSubTab(route.subTab)
      setSessionDate(route.sessionDate)
      setSessionDraft(null)
      setFocusLayer(route.focusLayer)
      setPlanView(route.planView)
      setPlanId(route.planId)
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [navMode, focusReady]);

  useEffect(() => {
    const resolvedTab = resolveFlowTab(tab);
    if (resolvedTab !== tab) {
      setSubTab(null);
      setFocusLayer(resolvedTab === 'focus' ? 'anamnese' : null);
      setTab(resolvedTab);
    }
  }, [tab, focusReady]);

  function openSession(date, draft = null) {
    setSessionDate(date || null)
    setSessionDraft(draft || null)
    setSubTab(null)
    setFocusLayer(null)
    navigate('session')
  }

  async function inspectExercise(exercise) {
    if (!exercise) return
    setInspectorExercise(exercise)
    const id = exercise.exercise_id || exercise.id
    if (!id || exercise.lesson) return
    try {
      const lesson = await getAnatomy(id)
      if (lesson)
        setInspectorExercise(prev => prev ? { ...prev, lesson } : prev)
    } catch {}
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError('');
    try {
      if (authRegistering) await signUpEmail(authEmail, authPassword);
      else                 await signInEmail(authEmail, authPassword);
      setShowAuthGateModal(false);
    } catch {
      setAuthError('Anmeldung fehlgeschlagen.');
    }
  }

  function handleDismissAuthGate() {
    setShowAuthGateModal(false);
    setAuthGateDismissedAt(authGateTriggerCount);
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-fit-bg">
      <div className="text-fit-dim text-xs font-black uppercase tracking-widest">…</div>
    </div>
  );

  return (
    <>
      <InstallPromptHandler />
      <IosInstallHint />
      <PwaUpdateBanner />
      <AuthGateModal
        open={!isLocalMode() && !user && showAuthGateModal}
        onClose={handleDismissAuthGate}
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
            setAuthError('');
            await signIn();
            setShowAuthGateModal(false);
          } catch {
            setAuthError('Anmeldung fehlgeschlagen.');
          }
        }}
      />
      <ErrorBoundary>
        <div className="app-shell isolate flex min-h-screen overflow-x-hidden w-full bg-fit-bg text-fit-ink font-sans transition-colors duration-500">

        <Sidebar
          tab={tab}
          navigate={navigate}
          subTab={subTab}
          navigateSub={navigateSub}
          navigateToPlan={navigateToPlan}
          pinned={sidebarPinned}
          setPinned={setSidebarPinned}
          user={user}
          navItems={navItems}
        >
          <UserProfile user={user} subtitle={isLocalMode() ? `${user?.email || 'localhost'} · localhost` : (user?.email || 'Demo-Modus · lokal gespeichert')} />
          {!isLocalMode() && user && (
            <button onClick={signOut} className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest text-fit-red bg-fit-red/5 border border-fit-red/10 rounded-xl hover:bg-fit-red/10 transition-all">
              Logout
            </button>
          )}
          {!isLocalMode() && !user && (
            <button onClick={() => setShowAuthGateModal(true)} className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest text-fit-accent bg-fit-accent/10 border border-fit-accent/20 rounded-xl hover:bg-fit-accent/15 transition-all">
              Login öffnen
            </button>
          )}
          <button onClick={() => window.location.reload()} className="w-full flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest text-fit-dim bg-fit-bg2 rounded-xl hover:bg-white/5 transition-all">
            <RefreshCw size={14} /> Refresh
          </button>
        </Sidebar>

        <div className={`flex-1 min-w-0 transition-all duration-500 ease-in-out ${sidebarPinned ? 'lg:ml-[280px]' : 'lg:ml-24'}`}>
          <main ref={mainRef} className={`relative min-w-0 ${navMode === 'tabs' ? 'pb-28' : ''} sm:pb-10 lg:pb-16 min-h-[100dvh] overflow-x-hidden`}>
              {/* Background Gate - only mounted in home mode */}
              {navMode === 'home' && (
                <div className={`transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] max-w-[1600px] mx-auto min-h-[100dvh] flex flex-col ${tab !== 'gate' ? 'scale-[0.98] opacity-30 blur-[2px] pointer-events-none' : 'scale-100 opacity-100'}`}>
                   <AppGate navigate={navigate} navItems={navItems} />
                </div>
              )}

              {/* Foreground Sheet (or normal Tab content) */}
              <div 
                className={`
                  ${navMode === 'home' ? 'fixed inset-0 z-30 overflow-x-hidden transform transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]' : 'p-4 sm:p-10 lg:p-16 max-w-[1600px] mx-auto'}
                  ${navMode === 'home' && tab === 'gate' ? 'translate-y-full pointer-events-none' : 'translate-y-0'}
                `}
              >
                <div className={`${navMode === 'home' ? 'alpha-glass h-full w-full overflow-y-auto overflow-x-hidden rounded-t-[40px] border-t border-[var(--line)]/30 shadow-[0_-20px_50px_rgba(0,0,0,0.3)] relative pt-6 lg:m-4 lg:h-[calc(100dvh-2rem)] lg:rounded-[32px] lg:border lg:border-[var(--line)]/30 lg:shadow-[0_24px_80px_rgba(0,0,0,0.32)]' : ''}`}>
                  {/* Back-to-Gate handle (only in home mode, when not on gate) */}
                  {navMode === 'home' && tab !== 'gate' && (
                    <button
                      onClick={() => navigate('gate')}
                      aria-label="Zurück zum Menü"
                      className="sticky top-0 z-30 mx-auto flex w-full flex-col items-center gap-1 pt-2 pb-3 active:opacity-60 transition-opacity bg-gradient-to-b from-[color:var(--glass)] via-[color:var(--glass)] to-transparent backdrop-blur-md"
                    >
                      <div className="w-10 h-1.5 rounded-full bg-fit-line" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-fit-dim opacity-60">Menü</span>
                    </button>
                  )}
                  <div key={tab} className={`${navMode === 'home' && tab !== 'gate' ? 'p-4 pb-20 sm:p-10' : ''} animate-in fade-in ${slideDirection === 'left' ? 'slide-in-from-right-8' : slideDirection === 'right' ? 'slide-in-from-left-8' : 'slide-in-from-bottom-4'} duration-500`}>
                      {/* Render content */}
                      {tab === 'session'  && <Session key={sessionDate || 'today'} initialDate={sessionDate} initialDraft={sessionDraft} onInspectExercise={inspectExercise} onOpenSession={openSession} recentDays={recentDays} coverageThreshold={coverageThreshold} subTab={subTab} onDateChange={setSessionDate} onSubNav={navigateSub} planView={planView} planId={planId} onPlanRouteChange={(view, id) => { setPlanView(view); setPlanId(id); }} gateAutoOpenFlag={gateAutoOpenFlag} onGateAutoOpenConsumed={() => setGateAutoOpenFlag(false)} />}
                      {tab === 'review'   && <WeeklyReview onOpenSession={openSession} onInspectExercise={inspectExercise} muscleLanguage={muscleLanguage} taxonomy={taxonomy} gender={gender} recentDays={recentDays} subTab={subTab} onSubNav={navigateSub} />}
                      {tab === 'learn'    && <Learn subTab={subTab} />}
                      {tab === 'inbox'    && (user ? <Inbox /> : (
                        <div className="card mx-auto max-w-2xl p-6 text-center">
                          <h2 className="text-lg font-black tracking-tight">Inbox nur mit Login</h2>
                          <p className="mt-2 text-sm text-fit-dim">
                            Der Demo-Modus bleibt lokal. Für Inbox- und Coach-Daten brauchst du einen angemeldeten Cloud-User.
                          </p>
                          <button onClick={() => setShowAuthGateModal(true)} className="mt-4 btn btn-primary px-5 py-3 text-[10px] font-black uppercase tracking-widest">
                            Login öffnen
                          </button>
                        </div>
                      ))}
                      {tab === 'anamnese' && <Anamnese />}
                      {tab === 'focus'    && <Fokus initialLayer={focusLayer} onLayerChange={navigateFocusLayer} />}
                      {tab === 'settings' && <Settings />}
                  </div>
                </div>
              </div>
            </main>

            {navMode === 'tabs' && <MobileNav tab={tab} subTab={subTab} navigate={navigate} navigateSub={navigateSub} swipeHint={swipeHint} navItems={navItems} />}
          </div>
        </div>
      </ErrorBoundary>
      <ExerciseInsightModal
        exercise={inspectorExercise}
        onClose={() => setInspectorExercise(null)}
        onExerciseChange={setInspectorExercise}
        muscleLanguage={muscleLanguage}
        taxonomy={taxonomy}
      />
    </>
  );
}
