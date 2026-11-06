import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_QUIET_HOURS, describeDevice, mergePushSettings, refreshPushDevice, appNameFromOrigin, likelyDuplicateTokens, formatLastSeen, isStaleDevice, setDevicePaused, activeDeviceCount } from './pushSettings.js'

test('Gerätebeschreibung aus dem User-Agent', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120 Mobile Safari/537'), 'Chrome · Android')
  assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Safari/604'), 'Safari · iPhone')
  assert.equal(describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'), 'Firefox · Linux')
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120'), 'Edge · Windows')
  assert.equal(describeDevice(''), 'Browser · Gerät')
})

test('Standardwerte und Token-Vereinigung', () => {
  const s = mergePushSettings({ token: 'a' }, { tokens: ['b'] })
  assert.deepEqual(s.tokens, ['a', 'b'])
  assert.equal(s.token, 'a')
  assert.deepEqual(s.quietHours, DEFAULT_QUIET_HOURS)
  assert.deepEqual(s.mutedClients, [])
  assert.equal(s.clientWorkoutMode, 'all')
  assert.equal(s.reminderTime, '18:00')
})

test('Geräteliste: neues Gerät kommt dazu, doppelter Token ersetzt, verwaiste fallen weg', () => {
  const base = mergePushSettings({}, { token: 'a', devices: [{ token: 'a', label: 'alt' }, { token: 'weg', label: 'verwaist' }] })
  assert.deepEqual(base.devices.map((d) => d.token), ['a'])
  const next = mergePushSettings(base, { token: 'b', devices: [{ token: 'b', label: 'neu' }, { token: 'a', label: 'aktualisiert' }] })
  assert.deepEqual(next.devices.map((d) => [d.token, d.label]), [['a', 'aktualisiert'], ['b', 'neu']])
})

test('Patch überschreibt Panel-Felder, ohne Tokens zu verlieren', () => {
  const base = mergePushSettings({}, { enabled: true, token: 'a', mutedClients: ['U1'] })
  const next = mergePushSettings(base, { quietHours: { enabled: true, start: '21:00', end: '06:30' }, mutedClients: [] })
  assert.deepEqual(next.tokens, ['a'])
  assert.equal(next.quietHours.start, '21:00')
  assert.deepEqual(next.mutedClients, [])
  assert.equal(next.enabled, true)
})

test('Aktuelles Gerät erhält einen Namen; andere Geräte und Registrierungsdatum bleiben erhalten', () => {
  const base = mergePushSettings({}, { enabled: true, tokens: ['a', 'b'], devices: [
    { token: 'a', label: 'Gerät', addedAt: '2026-01-01' },
    { token: 'b', label: 'Mein PC' },
  ] })
  const T = Date.parse('2026-11-05T12:00:00Z')
  const next = refreshPushDevice(base, 'a', 'Safari · iPhone', {}, T)
  assert.deepEqual(next.devices, [
    { token: 'a', label: 'Safari · iPhone', addedAt: '2026-01-01', lastSeenAt: '2026-11-05T12:00:00.000Z' },
    { token: 'b', label: 'Mein PC' },
  ])
  assert.equal(refreshPushDevice(next, 'a', 'Safari · iPhone', {}, T + 1000), next)
  const legacy = refreshPushDevice({ enabled: true, tokens: ['a'] }, 'a', 'Safari · iPhone')
  assert.equal(legacy.devices[0].label, 'Safari · iPhone')
  const disabled = { ...base, enabled: false }
  assert.equal(refreshPushDevice(disabled, 'a', 'Safari · iPhone'), disabled)
  assert.equal(refreshPushDevice(base, null, 'Safari · iPhone'), base)
})

const NOW = Date.parse('2026-11-05T12:00:00Z')

test('refreshPushDevice: Origin, Bildschirm und letzte Aktivität; Zeitstempel höchstens alle 12 h', () => {
  const base = { enabled: true, tokens: ['a'], devices: [{ token: 'a', label: 'Safari · iPhone' }] }
  const first = refreshPushDevice(base, 'a', 'Safari · iPhone', { origin: 'fitness-vos', screen: '390×844' }, NOW)
  assert.equal(first.devices[0].origin, 'fitness-vos')
  assert.equal(first.devices[0].screen, '390×844')
  assert.equal(first.devices[0].lastSeenAt, new Date(NOW).toISOString())
  // frisch -> keine Änderung (kein Firestore-Write)
  assert.equal(refreshPushDevice(first, 'a', 'Safari · iPhone', { origin: 'fitness-vos', screen: '390×844' }, NOW + 60_000), first)
  // älter als 12 h -> aktualisiert
  const later = refreshPushDevice(first, 'a', 'Safari · iPhone', { origin: 'fitness-vos', screen: '390×844' }, NOW + 13 * 3600_000)
  assert.notEqual(later, first)
  assert.equal(later.devices[0].lastSeenAt, new Date(NOW + 13 * 3600_000).toISOString())
  // leere Extras überschreiben nichts
  assert.equal(refreshPushDevice(first, 'a', 'Safari · iPhone', { origin: null, screen: null }, NOW + 60_000), first)
})

test('likelyDuplicateTokens: gleiche Hardware mit mehreren Apps oder gleicher App', () => {
  const apps = likelyDuplicateTokens([
    { token: 'a', label: 'Safari · iPhone', origin: 'fitness-aos' },
    { token: 'b', label: 'Safari · iPhone', origin: 'fitness-vos' },
    { token: 'c', label: 'Chrome · Windows', origin: 'fitness-vos' },
  ])
  assert.equal(apps.get('a'), 'apps')
  assert.equal(apps.get('b'), 'apps')
  assert.equal(apps.has('c'), false)
  const same = likelyDuplicateTokens([{ token: 'a', label: 'Safari · iPhone' }, { token: 'b', label: 'Safari · iPhone' }])
  assert.equal(same.get('a'), 'same')
})

test('Hilfen: App-Name, zuletzt gesehen, veraltet', () => {
  assert.equal(appNameFromOrigin('fitness-aos'), 'Klassisch')
  assert.equal(appNameFromOrigin('fitness-vos'), 'Pulse')
  assert.equal(appNameFromOrigin(null), null)
  assert.equal(formatLastSeen(new Date(NOW - 5 * 60000).toISOString(), NOW), 'vor 5 Min')
  assert.equal(formatLastSeen(new Date(NOW - 3 * 3600_000).toISOString(), NOW), 'vor 3 Std')
  assert.equal(formatLastSeen(new Date(NOW - 2 * 86400_000).toISOString(), NOW), 'vor 2 Tagen')
  assert.equal(formatLastSeen(undefined, NOW), null)
  assert.equal(isStaleDevice({ lastSeenAt: new Date(NOW - 20 * 86400_000).toISOString() }, NOW), true)
  assert.equal(isStaleDevice({ lastSeenAt: new Date(NOW - 2 * 86400_000).toISOString() }, NOW), false)
  assert.equal(isStaleDevice({}, NOW), false)
})

test('Gerät pausieren: globaler Schalter bleibt, Zählung und Merge-Verhalten', () => {
  const base = { enabled: true, tokens: ['a', 'b'], devices: [{ token: 'a', label: 'Safari · iPhone' }, { token: 'b', label: 'Safari · iPad' }] }
  const paused = setDevicePaused(base, 'b', true)
  assert.equal(paused.enabled, true)
  assert.equal(paused.devices.find((d) => d.token === 'b').paused, true)
  assert.equal(paused.devices.find((d) => d.token === 'a').paused, undefined)
  assert.equal(activeDeviceCount(base), 2)
  assert.equal(activeDeviceCount(paused), 1)
  assert.equal(activeDeviceCount({ ...paused, enabled: false }), 0)
  // unbekannter Token ändert nichts
  assert.equal(setDevicePaused(base, 'x', true), base)
  // Pause übersteht das Auffrischen (Label/Aktivität) und das Zusammenführen
  const refreshed = refreshPushDevice(paused, 'b', 'Safari · iPad', { screen: '820×1180' }, Date.parse('2026-11-05T12:00:00Z'))
  assert.equal(refreshed.devices.find((d) => d.token === 'b').paused, true)
  const merged = mergePushSettings(paused, { enabled: true })
  assert.equal(merged.devices.find((d) => d.token === 'b').paused, true)
  // Fortsetzen
  assert.equal(setDevicePaused(paused, 'b', false).devices.find((d) => d.token === 'b').paused, false)
  // Altbestand ohne devices[]: alle Tokens zählen als aktiv
  assert.equal(activeDeviceCount({ enabled: true, tokens: ['a', 'b'] }), 2)
})
