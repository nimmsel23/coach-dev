import { useState, useEffect, useRef } from "react";
import { Settings2 } from "lucide-react";
import { api, isLocalMode } from "@db";
import AppearanceSection from "./AppearanceSection";
import TrainingSection from "./TrainingSection";
import UpdateSection from "./UpdateSection";
import AdvancedSection from "./AdvancedSection";
import LocalDevSection from "./LocalDevSection";
import ProfileSection from "./ProfileSection";
import NotificationsSection from "./NotificationsSection";


import { useUser } from "../../contexts/UserContext";
import { useSettings } from "../../contexts/SettingsContext";
import { THEMES } from "../../constants/Themes";

// hideAppearance: Themes-Auswahl ausblenden (vos-fitness/Pulse hat ein festes eigenes Design).
export default function Settings({ hideAppearance = false } = {}) {
  const { user, gender, setGender, split, setSplit, cycleLength, setCycleLength, defaultLocation, setDefaultLocation } = useUser();
  const {
    layoutScale, setLayoutScale,
    recentDays, setRecentDays,
    coverageThreshold, setCoverageThreshold,
    showAdvanced, setShowAdvanced,
    themeMode, setModeState, circLight, setCircLight, circDark, setCircDark,
    theme, setThemeState,
    navMode, setNavMode,
    sidebarPinned, setSidebarPinned,
    muscleLanguage, setMuscleLanguage,
    swipeEnabled, setSwipeEnabled
  } = useSettings();

  const [health, setHealth] = useState(null)
  const [wger, setWger] = useState(null)
  const [firestoreStatus, setFirestoreStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [swVersion, setSwVersion] = useState(null)
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false)
  const [swChecking, setSwChecking] = useState(false)
  const [swCheckResult, setSwCheckResult] = useState(null)
  const [swLastChecked, setSwLastChecked] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker
    const askVersion = () => { if (sw.controller) sw.controller.postMessage({ type: 'GET_VERSION' }) }
    const onMsg = (e) => { if (e.data?.type === 'VERSION') setSwVersion(e.data.version) }
    sw.addEventListener('message', onMsg)
    askVersion()
    const reg = window.__swRegistration
    if (reg?.waiting) setSwUpdateAvailable(true)
    const onUpdate = () => setSwUpdateAvailable(true)
    window.addEventListener('sw-update-available', onUpdate)
    return () => {
      sw.removeEventListener('message', onMsg)
      window.removeEventListener('sw-update-available', onUpdate)
    }
  }, [])

  async function handleSwCheck() {
    setSwChecking(true)
    setSwCheckResult(null)
    try {
      const reg = window.__swRegistration || await navigator.serviceWorker?.getRegistration()
      if (reg) {
        await reg.update()
        if (reg.waiting) {
          setSwUpdateAvailable(true)
        } else {
          setSwCheckResult('up-to-date')
          setSwLastChecked(new Date())
        }
      } else {
        setSwCheckResult('error')
      }
    } catch {
      setSwCheckResult('error')
    }
    setTimeout(() => { if (mountedRef.current) setSwChecking(false) }, 600)
  }

  function handleSwApply() {
    const reg = window.__swRegistration
    if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    else window.location.reload()
  }

  useEffect(() => {
    if (!isLocalMode()) {
      setFirestoreStatus({ ok: true, project: 'fitness-aos', source: 'native' })
      return
    }
    if (!api) return;
    let alive = true;
    api.get('/health').then(d => alive && setHealth(d)).catch(() => alive && setHealth({ ok: false }))
    fetch('http://localhost/api/v2/language/?format=json')
      .then(r => alive && setWger(r.ok))
      .catch(() => alive && setWger(false))
    api.get('/firestore/status').then(d => alive && setFirestoreStatus(d)).catch(() => alive && setFirestoreStatus({ ok: false }))
    return () => { alive = false }
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      await api.post('/firestore/sync', {})
      const s = await api.get('/firestore/status')
      setFirestoreStatus(s)
    } catch {
      setFirestoreStatus({ ok: false })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-8 pb-32 max-w-5xl mx-auto">
      <header className="mb-4 animate-in fade-in duration-700">
        <h2 className="text-xl font-bold text-fit-ink">Setup</h2>
        <p className="text-sm font-medium" style={{ color: 'var(--dim)', opacity: 0.7 }}>Konfiguriere dein VitalOS Fitness-Erlebnis.</p>
      </header>

      <ProfileSection />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {!hideAppearance && (
          <AppearanceSection
            themeMode={themeMode} setModeState={setModeState}
            circLight={circLight} setCircLight={setCircLight}
            circDark={circDark} setCircDark={setCircDark}
            themes={THEMES} theme={theme} setThemeState={setThemeState}
          />
        )}
        <TrainingSection
          split={split} setSplit={setSplit}
          gender={gender} setGender={setGender}
          defaultLocation={defaultLocation} setDefaultLocation={setDefaultLocation}
          cycleLength={cycleLength} setCycleLength={setCycleLength}
          recentDays={recentDays} setRecentDays={setRecentDays}
          coverageThreshold={coverageThreshold} setCoverageThreshold={setCoverageThreshold}
        />
      </div>

      {!isLocalMode() && <NotificationsSection user={user} />}

      <UpdateSection

        swVersion={swVersion}
        swUpdateAvailable={swUpdateAvailable}
        swChecking={swChecking}
        swCheckResult={swCheckResult}
        swLastChecked={swLastChecked}
        onSwCheck={handleSwCheck}
        onSwApply={handleSwApply}
      />

      {isLocalMode() && (
        <LocalDevSection
          firestoreStatus={firestoreStatus}
          syncing={syncing} onSync={handleSync}
          health={health} wger={wger}
        />
      )}

      <div className="flex justify-center pt-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-xs font-semibold ${showAdvanced ? 'border-fit-accent bg-fit-accent/5 text-fit-accent' : 'border-fit-line bg-fit-bg2 text-fit-dim hover:text-fit-ink'}`}
        >
          <Settings2 size={13} />
          {showAdvanced ? 'Erweiterte Optionen: ein' : 'Erweiterte Optionen: aus'}
        </button>
      </div>

      {showAdvanced && (
        <AdvancedSection
          swipeEnabled={swipeEnabled} setSwipeEnabled={setSwipeEnabled}
          navMode={navMode} setNavMode={setNavMode}
          sidebarPinned={sidebarPinned} setSidebarPinned={setSidebarPinned}
          layoutScale={layoutScale} setLayoutScale={setLayoutScale}
          muscleLanguage={muscleLanguage} setMuscleLanguage={setMuscleLanguage}
          user={user}
        />
      )}
    </div>
  );
}
