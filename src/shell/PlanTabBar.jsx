import { useId, useRef, useState } from 'react'
import { LogOut, MoreHorizontal, Palette, RefreshCw, X } from 'lucide-react'
import { useEscapeKey } from '../hooks/useEscapeKey.js'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss.js'
import { NAV_ITEMS } from './NavigationItems.js'

// iOS-artige Tab-Bar — Fork von ~/vitalos/src/shell/layout/MobileNav.jsx.
// Feste Slots (Plan-Bereiche + Mehr), einklappbar ueber den Griff. Der Content
// reserviert Platz ueber --mobile-nav-height (siehe PlanShell).

function SheetRow({ Icon, label, hint, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="vos-press flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-white/5"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'color-mix(in srgb, var(--ink) 7%, transparent)', color: tone || 'var(--ink)' }}
      >
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-fit-ink">{label}</span>
        {hint ? <span className="block truncate text-[12px] text-fit-dim">{hint}</span> : null}
      </span>
    </button>
  )
}

export default function PlanTabBar({ active, onNavigate, counts = {}, expanded = true, onExpandedChange, user, onTheme, onRefresh, onSignOut }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [dragY, setDragY] = useState(null)
  const tabsId = useId()
  const tabsRef = useRef(null)
  const gripRef = useRef(null)
  const gestureRef = useRef(null)
  const suppressClickRef = useRef(false)
  const backdropRef = useRef(null)

  const close = () => setMoreOpen(false)
  useEscapeKey(close, moreOpen)
  const sheetRef = useSwipeToDismiss(close, { enabled: moreOpen, backdropRef })

  function setExpanded(next) {
    if (!next) {
      close()
      if (tabsRef.current?.contains(document.activeElement)) gripRef.current?.focus({ preventScroll: true })
    }
    onExpandedChange?.(next)
  }

  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return
    suppressClickRef.current = false
    gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, dragging: false }
  }

  function moveDrag(event) {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId) return
    const dy = event.clientY - gesture.y
    const dx = event.clientX - gesture.x
    if (!gesture.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return
      if (Math.abs(dx) > Math.abs(dy)) {
        suppressClickRef.current = true
        gestureRef.current = null
        return
      }
      gesture.dragging = true
      suppressClickRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      close()
    }
    const distance = tabsRef.current.offsetHeight
    setDragY(Math.max(0, Math.min(distance, (expanded ? 0 : distance) + dy)))
  }

  function endDrag(event, cancelled = false) {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId) return
    gestureRef.current = null
    setDragY(null)
    if (!gesture.dragging || cancelled) return
    const delta = (event.clientY - gesture.y) * (expanded ? 1 : -1)
    const velocity = delta / Math.max(1, event.timeStamp - gesture.time)
    if (delta > tabsRef.current.offsetHeight / 2 || (delta > 10 && velocity > 0.5)) setExpanded(!expanded)
  }

  const slots = [...NAV_ITEMS, { id: 'more', label: 'Mehr', Icon: MoreHorizontal }]

  return (
    <>
      {moreOpen ? (
        <>
          <button ref={backdropRef} aria-label="Menü schließen" className="vos-fade-in fixed inset-0 z-[55] bg-black/40 lg:hidden" onClick={close} />
          <div
            ref={sheetRef}
            className="vos-sheet vos-sheet-in fixed inset-x-2 z-[56] max-h-[70dvh] overflow-y-auto overscroll-contain rounded-[28px] px-3 pb-3 pt-2 shadow-2xl lg:hidden"
            style={{ bottom: 'calc(var(--mobile-nav-height) + 8px)', border: '1px solid color-mix(in srgb, var(--ink) 8%, transparent)' }}
          >
            <div className="mx-auto mb-1 h-[5px] w-9 rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 20%, transparent)' }} />
            <div className="mb-1 flex items-center justify-between px-2 pb-1">
              <div className="min-w-0">
                <div className="text-[17px] font-semibold text-fit-ink">Mehr</div>
                {user?.email ? <div className="truncate text-[12px] text-fit-dim">{user.email}</div> : null}
              </div>
              <button onClick={close} aria-label="Schließen" className="vos-press vos-fill flex h-8 w-8 items-center justify-center rounded-full text-fit-dim">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-0.5">
              <SheetRow Icon={Palette} label="Erscheinungsbild" hint="Theme wählen" onClick={() => { close(); onTheme() }} />
              <SheetRow Icon={RefreshCw} label="Neu laden" hint="App und Daten aktualisieren" onClick={onRefresh} />
              {user ? <SheetRow Icon={LogOut} label="Abmelden" tone="var(--red)" onClick={() => { close(); onSignOut() }} /> : null}
            </div>
          </div>
        </>
      ) : null}

      <nav
        aria-label="Hauptnavigation"
        className="vos-nav-sheet vos-bar vos-hairline-t fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl lg:hidden"
        style={{
          paddingBottom: 'var(--safe-bottom)',
          transform: dragY === null ? (expanded ? 'translateY(0)' : 'translateY(var(--tabbar-h))') : `translateY(${dragY}px)`,
          transition: dragY === null ? undefined : 'none',
          touchAction: 'none',
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={(event) => endDrag(event, true)}
        onLostPointerCapture={(event) => {
          if (event.target === event.currentTarget) endDrag(event, true)
        }}
        onClickCapture={(event) => {
          if (suppressClickRef.current && event.detail !== 0) {
            event.preventDefault()
            event.stopPropagation()
            suppressClickRef.current = false
          }
        }}
      >
        <button
          ref={gripRef}
          type="button"
          aria-label={expanded ? 'Navigation ausblenden' : 'Navigation einblenden'}
          aria-expanded={expanded}
          aria-controls={tabsId}
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center"
          style={{ height: 'var(--nav-grip-h)' }}
        >
          <span className="h-[5px] w-9 rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 25%, transparent)' }} />
        </button>
        <div
          id={tabsId}
          ref={tabsRef}
          aria-hidden={!expanded}
          {...(!expanded ? { inert: '' } : {})}
          className="mx-auto grid max-w-xl grid-cols-5"
          style={{ height: 'var(--tabbar-h)', visibility: expanded || dragY !== null ? 'visible' : 'hidden' }}
        >
          {slots.map(({ id, label, Icon }) => {
            const isMore = id === 'more'
            const isActive = isMore ? moreOpen : active === id
            const count = counts[id]
            return (
              <button
                key={id}
                onClick={() => (isMore ? setMoreOpen((v) => !v) : (close(), onNavigate(id)))}
                aria-current={isActive ? 'page' : undefined}
                className="vos-press group flex flex-col items-center justify-center gap-1"
              >
                <span
                  className="relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200"
                  style={{ background: isActive ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent' }}
                >
                  <Icon size={21} strokeWidth={isActive ? 2.3 : 1.8} style={{ color: isActive ? 'var(--accent)' : 'var(--dim)' }} />
                  {count > 0 ? (
                    <span
                      className="absolute right-1.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                      style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                    >
                      {count}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10.5px] font-medium leading-none" style={{ color: isActive ? 'var(--ink)' : 'var(--dim)' }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
