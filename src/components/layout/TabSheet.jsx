/**
 * TabSheet — großes Bottom-Sheet für Haupt-Tabs auf Mobil (Quick-Entrance-Portal).
 *
 * Die Session bleibt die Basis, jeder andere Tab fährt als Sheet darüber hoch und
 * lässt sich nach unten wegwischen (useSwipeToDismiss, Scroll hat Vorrang) bzw. per
 * X schließen → zurück auf die Session. Der Inhalt scrollt im Sheet selbst
 * (inneres Scroll-Element), damit "ganz oben" für die Geste zuverlässig erkennbar ist.
 * Portal in document.body: horizontale Tab-Wisch-Navigation von <main> sieht die
 * Touch-Events des Sheets dadurch nicht.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss.js'

export function useIsMobile(query = '(max-width: 1023px)') {
  const [match, setMatch] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

// Zurück-Taste: Beim Öffnen kommt ein History-Eintrag dazu, Zurück (popstate) schließt das
// Sheet. Wird es per Wischen/X geschlossen, räumt der Cleanup den Eintrag mit history.back()
// wieder ab; das dabei ausgelöste hashchange darf App.jsx nicht als Navigation lesen
// (`suppressUntil`), sonst ginge das Sheet sofort wieder auf.
export const tabSheetHistory = { suppressUntil: 0 }

export default function TabSheet({ open, title, onClose, children }) {
  const backdropRef = useRef(null)
  const sheetRef = useSwipeToDismiss(onClose, { enabled: open, backdropRef })
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    let pushed = true
    history.pushState({ tabSheet: true }, '', window.location.href)
    const onPop = () => {
      if (!pushed) return
      pushed = false
      closeRef.current?.()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (pushed && history.state?.tabSheet) {
        tabSheetHistory.suppressUntil = Date.now() + 600
        history.back()
      }
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center animate-in fade-in duration-200" role="dialog" aria-label={title}>
      <div ref={backdropRef} className="absolute inset-0 bg-fit-scrim backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        style={{ height: 'min(94dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 1.5rem))' }}
        className="relative w-full max-w-3xl flex flex-col bg-fit-bg border-t border-fit-line rounded-t-[32px] shadow-2xl animate-in slide-in-from-bottom duration-300"
      >
        <div className="shrink-0 relative pt-3 pb-2 flex flex-col items-center">
          <span className="w-10 h-1 rounded-full bg-fit-line" />
          <span className="mt-2 text-[10px] font-black uppercase tracking-widest text-fit-dim">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="absolute right-4 top-3 p-1.5 rounded-lg text-fit-dim hover:text-fit-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
