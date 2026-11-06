// Reine Hilfen für das Notification-Panel (ohne Firebase/Vite-Aliase, damit mit `node --test` prüfbar).

export const DEFAULT_QUIET_HOURS = { enabled: false, start: '22:00', end: '07:00' }

export { describeDevice } from '../lib/deviceInfo.js'

export function mergePushSettings(base = {}, patch = {}) {
  const merged = { ...base, ...patch }
  const tokens = Array.from(new Set([
    ...(Array.isArray(base?.tokens) ? base.tokens : []),
    ...(base?.token ? [base.token] : []),
    ...(Array.isArray(patch?.tokens) ? patch.tokens : []),
    ...(patch?.token ? [patch.token] : []),
  ].filter(Boolean)))

  // Geräteliste: nur Einträge, deren Token noch existiert; der neueste Eintrag je Token gewinnt
  const devices = new Map()
  for (const device of [...(base?.devices || []), ...(patch?.devices || [])]) {
    if (device?.token && tokens.includes(device.token)) devices.set(device.token, device)
  }

  return {
    enabled: false,
    types: {},
    reminderTime: '18:00',
    quietHours: DEFAULT_QUIET_HOURS,
    mutedClients: [],
    clientWorkoutMode: 'all',
    ...merged,
    token: tokens[0] || merged.token || null,
    tokens,
    devices: Array.from(devices.values()),
  }
}

// Welche App hinter einem Eintrag steckt: dieselbe Hardware kann mehrere installierte Apps (je eigene Origin, eigener Token) haben.
const APP_NAMES = { 'fitness-aos': 'Klassisch', 'fitness-vos': 'Pulse', 'vitalos': 'VitalOS' }
export function appNameFromOrigin(origin) {
  if (!origin) return null
  return APP_NAMES[origin] || origin
}

// Nur das aktuell identifizierte Gerät aktualisieren, fremde Geräte unverändert lassen.
// `origin` (Hostname ohne ".web.app") hält fest, aus welcher App der Token stammt, `screen` die Bildschirmgröße (trennt iPhone/iPad). `lastSeenAt` wird höchstens
// alle LAST_SEEN_REFRESH_MS neu geschrieben (kein Firestore-Write bei jedem Öffnen).
export const LAST_SEEN_REFRESH_MS = 12 * 60 * 60 * 1000
// `extra`: { origin, screen } — nur gesetzte Felder werden übernommen.
export function refreshPushDevice(settings, token, label, extra = {}, now = Date.now()) {
  if (!token || !settings?.enabled) return settings
  const existing = settings.devices?.find((device) => device.token === token)
  const info = Object.fromEntries(Object.entries(extra || {}).filter(([, v]) => v))
  const infoUnchanged = Object.entries(info).every(([k, v]) => existing?.[k] === v)
  const seenAt = Date.parse(existing?.lastSeenAt || '')
  const seenFresh = Number.isFinite(seenAt) && now - seenAt < LAST_SEEN_REFRESH_MS
  if ((settings.tokens || []).includes(token) && existing?.label === label && infoUnchanged && seenFresh) return settings
  return mergePushSettings(settings, {
    token,
    devices: [{ ...existing, token, label, ...info, lastSeenAt: new Date(now).toISOString() }],
  })
}

// Einträge mit gleicher Hardware-Beschreibung ("Safari · iPhone") sind entweder dasselbe Gerät mit mehreren Apps (je ein Token),
// dasselbe Gerät nach Neuinstallation (alter Token bleibt, bis FCM ihn meldet) oder ein altes zweites Gerät.
// Liefert je Token den Grund: 'apps' (verschiedene Apps) oder 'same' (gleiche/unbekannte App).
export function likelyDuplicateTokens(devices = []) {
  const groups = new Map()
  for (const device of devices) {
    if (!device?.token || !device.label) continue
    const list = groups.get(device.label) || []
    list.push(device)
    groups.set(device.label, list)
  }
  const out = new Map()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const origins = new Set(list.map((d) => d.origin).filter(Boolean))
    list.forEach((d) => out.set(d.token, origins.size > 1 ? 'apps' : 'same'))
  }
  return out
}

// Ein Eintrag, der seit dem Update nie mehr gesehen wurde, gehört meist zu einem alten Gerät/einer alten Installation.
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000
export function isStaleDevice(device, now = Date.now()) {
  const t = Date.parse(device?.lastSeenAt || '')
  return Number.isFinite(t) && now - t > STALE_AFTER_MS
}

// "vor 5 Min" / "vor 3 Std" / "vor 2 Tagen"; ohne Zeitstempel null.
export function formatLastSeen(iso, now = Date.now()) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return null
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 2) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std`
  const d = Math.round(h / 24)
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`
}

// Ein einzelnes Gerät pausieren/fortsetzen, ohne den globalen Schalter (settings.enabled) anzufassen.
export function setDevicePaused(settings, token, paused) {
  if (!token || !(settings?.devices || []).some((d) => d.token === token)) return settings
  return {
    ...settings,
    devices: settings.devices.map((d) => (d.token === token ? { ...d, paused: Boolean(paused) } : d)),
  }
}

// Wie viele Geräte bekommen tatsächlich Meldungen (global an, Gerät nicht pausiert)?
export function activeDeviceCount(settings) {
  if (!settings?.enabled) return 0
  const devices = settings.devices?.length ? settings.devices : (settings.tokens || []).map((token) => ({ token }))
  return devices.filter((d) => d.paused !== true).length
}
