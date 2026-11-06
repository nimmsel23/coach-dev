import { useCallback, useEffect, useState } from 'react'
import { isLocalMode, getPushSettings, savePushSettings } from '@db'
import { getMessagingIfSupported, functionsInstance, httpsCallable } from '@cloud/firebase.js'
import { getToken } from 'firebase/messaging'
import { VAPID_KEY } from '@firebase-config'
import { DEFAULT_QUIET_HOURS, describeDevice, mergePushSettings, refreshPushDevice, appNameFromOrigin, likelyDuplicateTokens, formatLastSeen, isStaleDevice, setDevicePaused, activeDeviceCount } from './pushSettings.js'

export { DEFAULT_QUIET_HOURS, describeDevice, mergePushSettings, appNameFromOrigin, likelyDuplicateTokens, formatLastSeen, isStaleDevice, activeDeviceCount }

const PUSH_SW_URL = '/fitness-messaging-sw.js'
const PUSH_SW_SCOPE = '/fitness-push/'

// Bildschirmgröße in CSS-Pixeln (kürzere Seite zuerst, unabhängig von der Drehung), z. B. "390×844" (iPhone) gegen "820×1180" (iPad).
function screenSize() {
  if (typeof screen === 'undefined' || !screen.width || !screen.height) return null
  const [w, h] = [Math.min(screen.width, screen.height), Math.max(screen.width, screen.height)]
  return `${w}×${h}`
}

// Hostname ohne ".web.app" (fitness-aos = klassisch, fitness-vos = Pulse); auf localhost leer.
function originName() {
  const host = typeof location !== 'undefined' ? location.hostname.replace(/\.web\.app$/, '') : ''
  return host && host !== 'localhost' ? host : null
}

export function usePushNotifications(user) {
  const [settings, setSettings] = useState(null)
  const [permission, setPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [busy, setBusy] = useState(false)
  const [currentToken, setCurrentToken] = useState(null)
  const [notice, setNotice] = useState(null) // { kind: 'ok' | 'error', text }

  useEffect(() => {
    if (isLocalMode() || !user) return
    let alive = true
    getPushSettings().then((s) => alive && setSettings(mergePushSettings({}, s)))
    return () => { alive = false }
  }, [user])

  const persist = useCallback(async (next) => {
    setSettings(next)
    await savePushSettings(next)
    return next
  }, [])

  // Welches der registrierten Geräte ist dieses? (nur wenn Push hier schon erlaubt ist)
  useEffect(() => {
    if (isLocalMode() || !user || !settings || permission !== 'granted') return
    let alive = true
    ;(async () => {
      try {
        const messaging = await getMessagingIfSupported()
        if (!messaging) return
        const registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE })
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
        if (!alive) return
        setCurrentToken(token || null)
        const next = refreshPushDevice(settings, token, describeDevice(), { origin: originName(), screen: screenSize() })
        if (next !== settings) await persist(next)
      } catch {
        // Gerät nicht erkennbar → die Liste kommt ohne "Dieses Gerät"-Markierung aus
      }
    })()
    return () => { alive = false }
  }, [user, permission, settings, persist])

  const enable = useCallback(async () => {
    if (isLocalMode() || !user) return
    setBusy(true)
    try {
      const messaging = await getMessagingIfSupported()
      if (!messaging) throw new Error('Push wird auf diesem Gerät/Browser nicht unterstützt')

      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return

      const registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE })
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
      if (!token) throw new Error('Kein Push-Token erhalten')

      setCurrentToken(token)
      await persist(mergePushSettings(settings, {
        enabled: true,
        token,
        devices: [{ token, label: describeDevice(), ...(originName() ? { origin: originName() } : {}), ...(screenSize() ? { screen: screenSize() } : {}), addedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }],
      }))
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Aktivieren fehlgeschlagen' })
    } finally {
      setBusy(false)
    }
  }, [user, settings, persist])

  // Allgemeiner Weg für alle Panel-Schalter (Typen, Ruhezeiten, stumme Klienten, Modus …)
  const update = useCallback(async (patch) => {
    if (isLocalMode() || !user) return
    await persist(mergePushSettings(settings, patch))
  }, [user, settings, persist])

  const disable = useCallback(() => update({ enabled: false }), [update])
  const updateTypes = useCallback((types) => update({ types: { ...(settings?.types || {}), ...types } }), [update, settings])
  const updateReminderTime = useCallback((reminderTime) => update({ reminderTime }), [update])

  const removeDevice = useCallback(async (token) => {
    if (isLocalMode() || !user || !token) return
    setBusy(true)
    try {
      const tokens = (settings?.tokens || []).filter((t) => t !== token)
      // Bewusst ohne mergePushSettings: dessen Token-Vereinigung würde das Gerät zurückholen
      await persist({
        ...settings,
        token: tokens[0] || null,
        tokens,
        devices: (settings?.devices || []).filter((d) => d.token !== token),
        enabled: tokens.length > 0 ? settings.enabled : false,
      })
      if (token === currentToken) setCurrentToken(null)
    } finally {
      setBusy(false)
    }
  }, [user, settings, persist, currentToken])

  // Pro Gerät ein/aus (z. B. altes iPhone stummschalten), unabhängig vom globalen Schalter.
  const pauseDevice = useCallback(async (token, paused) => {
    if (isLocalMode() || !user) return
    await persist(setDevicePaused(settings, token, paused))
  }, [user, settings, persist])

  const sendTest = useCallback(async (kind = 'reminder', token = null) => {
    if (isLocalMode() || !user) return
    setBusy(true)
    setNotice(null)
    try {
      const call = httpsCallable(functionsInstance, 'sendTestPush')
      const { data } = await call({ kind, ...(token ? { token } : {}) })
      setNotice(data?.sent > 0
        ? { kind: 'ok', text: `Test gesendet an ${data.sent} Gerät${data.sent === 1 ? '' : 'e'}${data.removed ? ` · ${data.removed} abgemeldete entfernt` : ''}` }
        : { kind: 'error', text: 'Kein Gerät hat den Test angenommen' })
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Test fehlgeschlagen' })
    } finally {
      setBusy(false)
    }
  }, [user])

  return {
    settings, permission, busy, notice, currentToken,
    enable, disable, update, updateTypes, updateReminderTime, removeDevice, pauseDevice, sendTest,
  }
}
