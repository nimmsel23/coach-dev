import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import { getAllUserProfiles } from '@db'

function clientLabel(profile, uid) {
  return profile?.displayName || profile?.email || uid
}

function clientStatus(profile) {
  return profile?.clientStatus || (profile?.authUserOnly ? 'hidden' : 'friend')
}

export default function ClientQuickMenu({ menu, unreadByClient = {}, onClose, onSelect }) {
  const menuRef = useRef(null)
  const [profiles, setProfiles] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!menu) return undefined
    let alive = true
    setError('')
    setQuery('')
    getAllUserProfiles()
      .then((data) => {
        if (alive) setProfiles(data || {})
      })
      .catch((err) => {
        if (alive) setError(err?.message || 'Klienten konnten nicht geladen werden')
      })
    return () => {
      alive = false
    }
  }, [menu])

  useEffect(() => {
    if (!menu) return undefined
    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) onClose?.()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    const onScroll = () => onClose?.()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu, onClose])

  const clients = useMemo(() => {
    if (!profiles) return []
    const q = query.trim().toLowerCase()
    return Object.keys(profiles)
      .filter((uid) => clientStatus(profiles[uid]) !== 'hidden')
      .map((uid) => ({
        uid,
        name: clientLabel(profiles[uid], uid),
        status: clientStatus(profiles[uid]),
        unread: unreadByClient[uid] || 0,
      }))
      .filter((item) => !q || item.name.toLowerCase().includes(q) || item.uid.toLowerCase().includes(q))
      .sort((a, b) => {
        if ((b.unread > 0) !== (a.unread > 0)) return b.unread > 0 ? 1 : -1
        return a.name.localeCompare(b.name)
      })
  }, [profiles, query, unreadByClient])

  if (!menu) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-[90] flex max-h-[min(70vh,420px)] w-[min(280px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-fit-line bg-fit-card shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label="Klient auswählen"
    >
      <div className="border-b border-fit-line/40 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-fit-dim">
          <Users size={12} /> Klient wählen
        </div>
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen…"
          className="mt-2 w-full rounded-xl border border-fit-line bg-fit-bg px-2.5 py-1.5 text-sm text-fit-ink outline-none focus:border-fit-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!profiles && !error && (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-fit-dim">
            <Loader2 size={14} className="animate-spin text-fit-accent" /> Lade…
          </div>
        )}
        {error && <p role="alert" className="px-3 py-3 text-sm text-fit-red">{error}</p>}
        {profiles && clients.length === 0 && (
          <p className="px-3 py-4 text-sm text-fit-dim">Keine sichtbaren Klienten.</p>
        )}
        <ul className="py-1">
          {clients.map((client) => (
            <li key={client.uid}>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fit-ink hover:bg-fit-bg2"
                onClick={() => {
                  onSelect?.(client.uid)
                  onClose?.()
                }}
              >
                <span className={`vos-led ${client.status} shrink-0`} />
                <span className="min-w-0 flex-1 truncate font-semibold">{client.name}</span>
                {client.unread > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-fit-accent">
                    {client.unread >= 100 ? '99+' : client.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function placeContextMenu(event, { width = 280, height = 360 } = {}) {
  const pad = 8
  const x = Math.min(event.clientX, window.innerWidth - width - pad)
  const y = Math.min(event.clientY, window.innerHeight - height - pad)
  return { x: Math.max(pad, x), y: Math.max(pad, y) }
}
