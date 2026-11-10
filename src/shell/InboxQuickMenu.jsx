import { useEffect, useMemo, useRef, useState } from 'react'
import { Inbox, Loader2 } from 'lucide-react'
import { getGlobalInbox } from '@db'
import { inboxPayload, inboxStatus, inboxStatusTone, inboxTitle } from './inboxPreview.js'

export default function InboxQuickMenu({ menu, onClose, onSelect, items: itemsProp = null }) {
  const menuRef = useRef(null)
  const [items, setItems] = useState(itemsProp)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (itemsProp) setItems(itemsProp)
  }, [itemsProp])

  useEffect(() => {
    if (!menu) return undefined
    if (itemsProp) return undefined
    let alive = true
    setError('')
    setQuery('')
    setItems(null)
    getGlobalInbox()
      .then((data) => {
        if (alive) setItems(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (alive) setError(err?.message || 'Anfragen konnten nicht geladen werden')
      })
    return () => {
      alive = false
    }
  }, [menu, itemsProp])

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

  const rows = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    return items
      .map((ex) => ({
        key: ex.file_id || inboxTitle(ex),
        title: inboxTitle(ex),
        status: inboxStatus(ex),
        source: ex.cache_source || ex.source || '',
        payload: inboxPayload(ex),
      }))
      .filter((row) => !q || row.title.toLowerCase().includes(q) || row.status.toLowerCase().includes(q) || String(row.key).toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [items, query])

  if (!menu) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-[90] flex max-h-[min(70vh,420px)] w-[min(300px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-fit-line bg-fit-card shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label="Anfragen"
    >
      <div className="border-b border-fit-line/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-fit-dim">
            <Inbox size={12} /> Anfragen
          </div>
          {items && (
            <span className="text-[11px] font-semibold text-fit-dim">{items.length}</span>
          )}
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
        {!items && !error && (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-fit-dim">
            <Loader2 size={14} className="animate-spin text-fit-accent" /> Lade…
          </div>
        )}
        {error && <p role="alert" className="px-3 py-3 text-sm text-fit-red">{error}</p>}
        {items && rows.length === 0 && (
          <p className="px-3 py-4 text-sm text-fit-dim">Keine offenen Anfragen.</p>
        )}
        <ul className="py-1">
          {rows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                role="menuitem"
                className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-fit-bg2"
                onClick={() => {
                  onSelect?.(row.payload)
                  onClose?.()
                }}
              >
                <span className="truncate text-sm font-semibold text-fit-ink">{row.title}</span>
                <span className={`truncate text-[11px] font-medium ${inboxStatusTone(row.status)}`}>
                  {row.status}{row.source ? ` · ${row.source}` : ''}
                  {row.payload?.html_url ? ' · GitHub' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
