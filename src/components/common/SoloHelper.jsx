import { useEffect, useState } from 'react'
import { LogIn, LogOut, RefreshCw, RotateCcw, User } from 'lucide-react'
import { isLocalMode } from '@db'
import { useUser } from '../../contexts/UserContext.jsx'

// Kleiner Login- und Update-Helfer der Solo-Mini-Apps (vos-training, vos-logbuch, …). Dort gibt es weder Sidebar noch
// Settings, also keinen sichtbaren Ort für Anmeldung, Abmeldung und Update. Eine Pille oben rechts:
//   - abgemeldet: "Anmelden" öffnet das bestehende AuthGateModal (Event fitness-auth-gate-trigger)
//   - angemeldet: Initiale, Klick öffnet Mini-Menü (E-Mail, Nach Updates suchen, Abmelden)
//   - Update bereit (Event sw-update-available / reg.waiting): Punkt an der Pille, Menü bietet "Update installieren"
// Die Update-Leiste unten (PwaUpdateBanner) bleibt unverändert; der Helfer nutzt dieselbe Mechanik (SKIP_WAITING + Reload).
export default function SoloHelper() {
  const { user, signOut } = useUser()
  const [open, setOpen] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (window.swUpdateWaiting) setUpdateReady(true)
    navigator.serviceWorker?.getRegistration().then((reg) => { if (reg?.waiting) setUpdateReady(true) }).catch(() => {})
    const onUpdate = () => setUpdateReady(true)
    window.addEventListener('sw-update-available', onUpdate)
    return () => window.removeEventListener('sw-update-available', onUpdate)
  }, [])

  if (isLocalMode()) return null

  const applyUpdate = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    } catch { /* Reload genügt */ }
    setTimeout(() => window.location.reload(), 500)
  }

  const checkUpdate = async () => {
    setBusy(true)
    setStatus('Suche …')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (!reg) { setStatus('Kein Service Worker aktiv'); return }
      await reg.update()
      if (reg.waiting || reg.installing) { setUpdateReady(true); setStatus('Update gefunden') }
      else setStatus('Aktuell')
    } catch {
      setStatus('Offline oder nicht erreichbar')
    } finally {
      setBusy(false)
    }
  }

  const onPill = () => {
    if (!user) { window.dispatchEvent(new CustomEvent('fitness-auth-gate-trigger')); return }
    setOpen((v) => !v)
    setStatus('')
  }

  const label = user ? (user.displayName || user.email || 'Konto') : 'Anmelden'
  const initial = String(label).trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="fixed right-3 top-3 z-[90] text-sm" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <button
        type="button"
        onClick={onPill}
        aria-label={user ? 'Konto-Menü' : 'Anmelden'}
        className="relative flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 font-semibold text-slate-200 shadow-lg backdrop-blur-md transition hover:bg-slate-800 active:scale-95"
      >
        {user ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[11px] text-white">{initial}</span> : <LogIn className="h-4 w-4" />}
        {!user && <span>Anmelden</span>}
        {updateReady && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900" aria-label="Update bereit" />}
      </button>

      {user && open && (
        <div className="mt-2 w-60 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{user.email || user.displayName}</span>
          </div>
          {updateReady && (
            <button type="button" disabled={busy} onClick={applyUpdate} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left font-semibold text-amber-300 hover:bg-white/5 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> Update installieren
            </button>
          )}
          <button type="button" disabled={busy} onClick={checkUpdate} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-200 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Nach Updates suchen
            {status && <span className="ml-auto text-xs text-slate-400">{status}</span>}
          </button>
          <button type="button" onClick={() => { setOpen(false); signOut?.() }} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-200 hover:bg-white/5">
            <LogOut className="h-4 w-4" /> Abmelden
          </button>
        </div>
      )}
    </div>
  )
}
