import { useState, useEffect } from 'react'
import { RotateCcw } from 'lucide-react'

export default function PwaUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    // Falls das Update schon beim Laden da ist
    if (window.swUpdateWaiting) setUpdateAvailable(true)
    
    // Listener für das Custom Event aus der index.html
    const onUpdate = () => setUpdateAvailable(true)
    window.addEventListener('sw-update-available', onUpdate)
    return () => window.removeEventListener('sw-update-available', onUpdate)
  }, [])

  const handleUpdate = async () => {
    setApplying(true)
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    }
    // Kurz warten, bis der neue SW übernimmt, dann Reload
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-[80px] left-0 right-0 z-[100] mx-auto w-full max-w-md px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:w-auto sm:px-0">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-500/30 bg-slate-900/95 p-3 shadow-glow backdrop-blur-md">
        <span className="text-sm font-medium text-slate-200">
          Neue Version verfügbar!
        </span>
        <button
          onClick={handleUpdate}
          disabled={applying}
          className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold tracking-wide text-white transition hover:bg-indigo-400 active:scale-95 disabled:opacity-50 shadow-[0_0_15px_rgba(99,102,241,0.4)]"
        >
          <RotateCcw className={`h-4 w-4 ${applying ? 'animate-spin' : ''}`} />
          {applying ? 'Lädt...' : 'Update'}
        </button>
      </div>
    </div>
  )
}
