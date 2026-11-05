import { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, BellRing, Moon, Send, Smartphone, Trash2, Users, Volume2, VolumeX } from 'lucide-react'
import { getAllUserProfiles } from '@db'
import { DEFAULT_QUIET_HOURS, usePushNotifications, appNameFromOrigin, likelyDuplicateTokens, formatLastSeen, isStaleDevice, activeDeviceCount } from '../../hooks/usePushNotifications.js'

// Erinnerungen für alle Nutzer — functions/index.js (scheduledPushReminders)
const REMINDER_TYPES = [
  { key: 'workout', label: 'Workout-Reminder', hint: 'Zur eingestellten Zeit, wenn heute noch nicht trainiert wurde' },
  { key: 'activeWorkout', label: 'Offenes Workout', hint: '1 h nach Start, falls es nicht abgeschlossen wurde' },
  { key: 'habit', label: 'Habit-Reminder', hint: 'Habits, die heute noch offen sind' },
  { key: 'coverage', label: 'Coverage-Alert', hint: 'Muskelgruppe seit 7 Tagen kaum trainiert' },
  { key: 'pplRatio', label: 'PPL-Ratio', hint: 'Push/Pull/Legs unter 15 % der 7-Tage-Coverage' },
  { key: 'restday', label: 'Rest-Day-Check', hint: 'Lange keine Session' },
  { key: 'coachMessage', label: 'Nachrichten vom Coach', hint: 'Persönliche Mitteilungen deines Coaches' },
]

// Nur für den Coach — functions/clientWorkout.js. Gleiche UID wie firestore.rules (isCoach).
const COACH_UIDS = new Set(['59ole36uNpNwml5H6VDYCXyCME92'])

function Switch({ checked, onChange, disabled }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-[var(--accent)] w-4 h-4 shrink-0 cursor-pointer disabled:opacity-40"
    />
  )
}

function Row({ label, hint, children }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-fit-bg2 border border-fit-line cursor-pointer">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-fit-ink">{label}</span>
        {hint && <span className="block text-[11px] text-fit-dim mt-0.5" style={{ opacity: 0.7 }}>{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Group({ icon: Icon, title, hint, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 ml-1">
        <Icon size={13} className="text-fit-accent" />
        <h4 className="text-xs font-semibold text-fit-ink">{title}</h4>
      </div>
      {hint && <p className="text-[11px] text-fit-dim ml-1" style={{ opacity: 0.7 }}>{hint}</p>}
      {children}
    </div>
  )
}

const timeInput = 'bg-fit-bg border border-fit-line rounded-lg px-3 py-2 text-sm font-medium text-fit-ink focus:border-fit-accent outline-none transition-colors'
const smallButton = 'flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-lg border border-fit-line bg-fit-bg text-fit-dim hover:text-fit-ink hover:border-fit-accent/40 disabled:opacity-40 transition-all cursor-pointer'

function formatAdded(iso) {
  const date = iso ? new Date(iso) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null
}

function CoachClients({ settings, update, busy }) {
  const [profiles, setProfiles] = useState({})
  useEffect(() => {
    let alive = true
    getAllUserProfiles().then((p) => alive && setProfiles(p || {})).catch(() => {})
    return () => { alive = false }
  }, [])

  const muted = settings.mutedClients || []
  const clients = useMemo(() => Object.entries(profiles)
    .filter(([uid]) => !COACH_UIDS.has(uid))
    .map(([uid, p]) => ({ uid, name: p.displayName || p.name || p.email || uid }))
    .sort((a, b) => a.name.localeCompare(b.name)), [profiles])

  const toggleMuted = (uid, isMuted) => update({ mutedClients: isMuted ? [...new Set([...muted, uid])] : muted.filter((id) => id !== uid) })

  return (
    <>
      <Row label="Klienten-Workouts" hint="Push, sobald ein Klient ein Workout speichert (Name, Art, Dauer – keine Details)">
        <Switch checked={settings.types?.clientWorkout ?? true} onChange={(v) => update({ types: { ...(settings.types || {}), clientWorkout: v } })} disabled={busy} />
      </Row>
      <Row label="Nur abgeschlossene Workouts" hint="Keine Meldung beim ersten Speichern, erst beim Abschluss">
        <Switch checked={settings.clientWorkoutMode === 'finished'} onChange={(v) => update({ clientWorkoutMode: v ? 'finished' : 'all' })} disabled={busy} />
      </Row>
      {clients.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-medium text-fit-dim ml-1" style={{ opacity: 0.7 }}>
            Pro Klient stummschalten ({muted.length} von {clients.length})
          </div>
          {clients.map(({ uid, name }) => {
            const isMuted = muted.includes(uid)
            return (
              <label key={uid} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-fit-bg2 border border-fit-line cursor-pointer">
                <span className={`flex items-center gap-2 text-xs font-medium ${isMuted ? 'text-fit-dim line-through' : 'text-fit-ink'}`}>
                  {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} className="text-fit-accent" />}
                  {name}
                </span>
                <Switch checked={isMuted} onChange={(v) => toggleMuted(uid, v)} disabled={busy} />
              </label>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function NotificationsSection({ user }) {
  const {
    settings, permission, busy, notice, currentToken,
    enable, disable, update, updateTypes, updateReminderTime, removeDevice, pauseDevice, sendTest,
  } = usePushNotifications(user)
  const isCoach = COACH_UIDS.has(user?.uid)

  if (permission === 'unsupported') return null

  const quiet = { ...DEFAULT_QUIET_HOURS, ...(settings?.quietHours || {}) }
  const devices = settings?.devices?.length
    ? settings.devices
    : (settings?.tokens || []).map((token) => ({ token, label: 'Gerät (älter)', addedAt: null }))

  const duplicates = likelyDuplicateTokens(devices)
  const sortedDevices = [...devices].sort((a, b) => {
    if (a.token === currentToken) return -1
    if (b.token === currentToken) return 1
    return (Date.parse(b.lastSeenAt || '') || 0) - (Date.parse(a.lastSeenAt || '') || 0)
  })

  return (
    <section className="card p-6 space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-fit-accent/10 flex items-center justify-center">
          {settings?.enabled ? <BellRing size={18} className="text-fit-accent" /> : <BellOff size={18} className="text-fit-dim" />}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-fit-ink">Benachrichtigungen</h3>
          <div className="text-xs text-fit-dim" style={{ opacity: 0.6 }}>
            {settings?.enabled
              ? `Für alle deine Geräte an · ${activeDeviceCount(settings)} von ${devices.length} Gerät${devices.length === 1 ? '' : 'en'} aktiv`
              : 'Für alle deine Geräte aus'}
          </div>
        </div>
        {settings?.enabled && (
          <button onClick={disable} disabled={busy} className={smallButton}>Für alle Geräte aus</button>
        )}
      </div>

      {permission === 'denied' && (
        <div className="text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
          Benachrichtigungen sind im Browser blockiert — in den Browser-Einstellungen für diese Seite erlauben.
        </div>
      )}

      <div className="text-xs font-medium text-sky-600 bg-sky-500/10 border border-sky-500/20 px-3 py-2 rounded-xl">
        iPhone/iPad: zuerst zum Home-Bildschirm hinzufügen und dann die installierte App öffnen. Push in einem normalen Safari-Tab ist auf iOS/iPadOS nicht zuverlässig genug.
      </div>

      {notice && (
        <div className={`text-xs font-medium px-3 py-2 rounded-xl border ${notice.kind === 'ok'
          ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
          : 'text-amber-500 bg-amber-500/10 border-amber-500/20'}`}
        >
          {notice.text}
        </div>
      )}

      {!settings?.enabled ? (
        <button
          onClick={enable}
          disabled={busy || permission === 'denied'}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-fit-accent text-black rounded-xl font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
        >
          <Bell size={14} /> {busy ? 'Aktiviere…' : 'Benachrichtigungen einschalten (gilt für alle deine Geräte)'}
        </button>
      ) : (
        <div className="space-y-6">
          <Group icon={Smartphone} title="Geräte" hint="Der Schalter oben gilt für alle Geräte. Hier schaltest du einzelne Geräte (z. B. ein altes iPhone) stumm oder entfernst sie.">
            {sortedDevices.map((device) => (
              <div key={device.token} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-fit-bg2 border border-fit-line">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-fit-ink truncate">
                    {device.label || 'Gerät'}
                    {appNameFromOrigin(device.origin) && (
                      <span className="ml-2 text-[10px] font-semibold text-fit-dim bg-fit-line/40 px-1.5 py-0.5 rounded">{appNameFromOrigin(device.origin)}</span>
                    )}
                    {device.token === currentToken && (
                      <span className="ml-2 text-[10px] font-semibold text-fit-accent bg-fit-accent/10 px-1.5 py-0.5 rounded">Dieses Gerät</span>
                    )}
                  </div>
                  <div className="text-[11px] text-fit-dim" style={{ opacity: 0.7 }}>
                    {[
                      device.screen,
                      formatAdded(device.addedAt) && `seit ${formatAdded(device.addedAt)}`,
                      formatLastSeen(device.lastSeenAt) ? `zuletzt aktiv ${formatLastSeen(device.lastSeenAt)}` : 'zuletzt aktiv: unbekannt',
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {isStaleDevice(device) && (
                    <div className="text-[11px] text-fit-accent" style={{ opacity: 0.9 }}>Lange nicht gesehen – vermutlich ein altes Gerät</div>
                  )}
                  {duplicates.has(device.token) && device.token !== currentToken && (
                    <div className="text-[11px] text-fit-accent" style={{ opacity: 0.9 }}>
                      {duplicates.get(device.token) === 'apps'
                        ? 'Gleiches Gerät, andere App – Meldungen kommen evtl. doppelt'
                        : 'Gleiche Gerätebeschreibung – evtl. altes oder doppeltes Gerät (Test senden zeigt, wo es ankommt)'}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 text-[11px] text-fit-dim cursor-pointer" title="Nur dieses Gerät ein- oder ausschalten">
                    <Switch checked={device.paused !== true} onChange={(v) => pauseDevice(device.token, !v)} disabled={busy} />
                    {device.paused === true ? 'Pausiert' : 'Aktiv'}
                  </label>
                  <button onClick={() => sendTest('reminder', device.token)} disabled={busy} className={smallButton} title="Test an dieses Gerät">
                    <Send size={12} /> Test
                  </button>
                  <button onClick={() => removeDevice(device.token)} disabled={busy} className={smallButton} title="Gerät entfernen">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            {!devices.some((d) => d.token === currentToken) && currentToken === null && permission === 'granted' && (
              <button onClick={enable} disabled={busy} className={smallButton}>
                <Bell size={12} /> Dieses Gerät hinzufügen
              </button>
            )}
          </Group>

          <Group icon={Bell} title="Erinnerungen">
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-xs font-medium text-fit-dim" style={{ opacity: 0.8 }}>Erinnerungszeit</span>
              <input
                type="time"
                value={settings.reminderTime || '18:00'}
                onChange={(e) => updateReminderTime(e.target.value)}
                className={timeInput}
              />
            </div>
            {REMINDER_TYPES.map(({ key, label, hint }) => (
              <Row key={key} label={label} hint={hint}>
                <Switch checked={settings.types?.[key] ?? true} onChange={(v) => updateTypes({ [key]: v })} disabled={busy} />
              </Row>
            ))}
          </Group>

          <Group icon={Moon} title="Ruhezeiten" hint="Klienten-Meldungen kommen in dieser Zeit nicht durch (Berliner Zeit). Die zeitgesteuerten Erinnerungen nutzen weiter die Erinnerungszeit oben.">
            <Row label="Ruhezeiten aktiv">
              <Switch checked={quiet.enabled} onChange={(v) => update({ quietHours: { ...quiet, enabled: v } })} disabled={busy} />
            </Row>
            {quiet.enabled && (
              <div className="flex items-center gap-3 px-1">
                <input type="time" value={quiet.start} onChange={(e) => update({ quietHours: { ...quiet, start: e.target.value } })} className={timeInput} />
                <span className="text-xs text-fit-dim">bis</span>
                <input type="time" value={quiet.end} onChange={(e) => update({ quietHours: { ...quiet, end: e.target.value } })} className={timeInput} />
              </div>
            )}
          </Group>

          {isCoach && (
            <Group icon={Users} title="Coach" hint="Meldungen über Workouts deiner Klienten">
              <CoachClients settings={settings} update={update} busy={busy} />
              <button onClick={() => sendTest('clientWorkout')} disabled={busy} className={smallButton}>
                <Send size={12} /> Demo-Meldung „Klienten-Workout" senden
              </button>
            </Group>
          )}

          <Group icon={Send} title="Test">
            <button onClick={() => sendTest('reminder')} disabled={busy} className={smallButton}>
              <Send size={12} /> Test an alle Geräte
            </button>
          </Group>
        </div>
      )}
    </section>
  )
}
