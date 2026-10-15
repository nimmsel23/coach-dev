import { useEffect, useRef } from 'react'

// Bottom-Sheet nach unten wegwischen (iOS-Geste).
//
// SSOT für alle VOS-Apps: die vitalos-Shell, habit-app und fuel-app
// importieren diese Datei per `@fitness/hooks/useSwipeToDismiss.js`.
//
// Ref an das Sheet-Element hängen. Ein Drag startet nur, wenn der Finger
// nach unten zieht UND der scrollbare Inhalt unter dem Finger ganz oben
// steht — sonst scrollt der Inhalt ganz normal. Loslassen nach genug Weg
// oder mit genug Tempo schließt das Sheet (rausgleiten, dann onDismiss),
// sonst federt es zurück.
const DISTANCE = 110   // px
const VELOCITY = 0.6   // px/ms
const OUT_MS = 220

function scrollableAncestor(node, root) {
  let el = node
  while (el && el !== root) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY
      if (oy === 'auto' || oy === 'scroll') return el
    }
    el = el.parentElement
  }
  return null
}

function isInteractive(node) {
  return Boolean(node?.closest?.('input, textarea, select, [contenteditable="true"], [data-no-swipe]'))
}

// media: Geste nur aktiv, solange die Media-Query matcht (z. B. wenn das
// Sheet auf Desktop ein zentriertes Modal oder Seiten-Drawer ist).
export function useSwipeToDismiss(onDismiss, { enabled = true, backdropRef = null, media = null } = {}) {
  const sheetRef = useRef(null)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    const el = sheetRef.current
    if (!el || !enabled) return undefined

    let state = null

    function setOffset(dy, animate) {
      el.style.transition = animate ? `transform ${OUT_MS}ms cubic-bezier(.2,.8,.2,1)` : 'none'
      el.style.transform = dy ? `translateY(${dy}px)` : ''
      const backdrop = backdropRef?.current
      if (backdrop) {
        backdrop.style.transition = animate ? `opacity ${OUT_MS}ms ease-out` : 'none'
        backdrop.style.opacity = dy ? String(Math.max(0, 1 - dy / (el.offsetHeight || 1))) : ''
      }
    }

    function onStart(event) {
      if (media && !window.matchMedia(media).matches) { state = null; return }
      if (event.touches.length !== 1 || isInteractive(event.target)) { state = null; return }
      const scroller = scrollableAncestor(event.target, el)
      if (scroller && scroller.scrollTop > 0) { state = null; return }
      const touch = event.touches[0]
      state = { y: touch.clientY, x: touch.clientX, t: performance.now(), dy: 0, dragging: false, lastY: touch.clientY, lastT: performance.now(), v: 0 }
    }

    function onMove(event) {
      if (!state) return
      const touch = event.touches[0]
      const dy = touch.clientY - state.y
      const dx = touch.clientX - state.x
      if (!state.dragging) {
        // Hoch oder seitwärts: dem Inhalt überlassen (Scrollen, Karussells)
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dy) > 6 || Math.abs(dx) > 6) state = null
          return
        }
        if (dy < 6) return
        state.dragging = true
        // vos-sheet-in hält transform per fill-mode fest — abschalten
        el.style.animation = 'none'
      }
      event.preventDefault()
      const now = performance.now()
      state.v = (touch.clientY - state.lastY) / Math.max(1, now - state.lastT)
      state.lastY = touch.clientY
      state.lastT = now
      state.dy = Math.max(0, dy)
      setOffset(state.dy, false)
    }

    function onEnd() {
      if (!state?.dragging) { state = null; return }
      const { dy, v } = state
      state = null
      if (dy > DISTANCE || v > VELOCITY) {
        setOffset(el.offsetHeight || window.innerHeight, true)
        window.setTimeout(() => dismissRef.current?.(), OUT_MS)
      } else {
        setOffset(0, true)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      // Für Sheets, die gemountet bleiben (translate-y-full statt unmount):
      // Inline-Styles vom Wegwischen zurücksetzen, sonst klebt das Offset.
      el.style.transform = ''
      el.style.transition = ''
      el.style.animation = ''
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, backdropRef, media])

  return sheetRef
}
