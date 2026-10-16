import { useEffect, useState } from 'react'
import { watchCoachWorker } from '@db'

// Statuschip für den Coach-Rechner (coach-sync.service). Freigaben, Neu-Anreicherung
// u. a. laufen dort; ist er offline, werden Befehle gar nicht erst abgeschickt.
function ago(ms) {
  const min = Math.round(ms / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} Tagen`
}

export default function WorkerChip() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    try {
      return watchCoachWorker(setStatus)
    } catch {
      return undefined
    }
  }, [])

  if (!status || status.state === 'unknown') return null
  const online = status.state === 'online'
  const waiting = (status.queued || 0) + (status.stale || 0)
  const label = online
    ? (waiting ? `Coach-Rechner online · ${waiting} wartend` : 'Coach-Rechner online')
    : `Coach-Rechner offline seit ${ago(status.ageMs)}`
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${online ? 'text-fit-green' : 'text-fit-red'}`}
      style={{ border: '1px solid color-mix(in srgb, currentColor 30%, transparent)' }}
      title={status.lastSeen ? `Letztes Lebenszeichen: ${status.lastSeen.toLocaleString('de-AT')}` : ''}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="truncate">{label}</span>
    </span>
  )
}
