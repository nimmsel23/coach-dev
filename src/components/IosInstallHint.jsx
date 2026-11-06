import { useEffect, useState } from 'react'

export function IosInstallHint() {
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    // Nur auf iOS Safari zeigen (nicht im Standalone-Modus)
    const isIos = /iP(hone|od|ad)/.test(navigator.userAgent)
    const isStandalone = navigator.standalone === true
    const isDismissed = localStorage.getItem('fitness-ios-hint-dismissed')

    if (isIos && !isStandalone && !isDismissed) {
      setShowHint(true)
    }
  }, [])

  if (!showHint) return null

  const handleDismiss = () => {
    localStorage.setItem('fitness-ios-hint-dismissed', 'true')
    setShowHint(false)
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white p-3 flex items-center justify-between gap-3 z-50 text-sm">
      <div className="flex-1">
        <p className="font-medium">App installieren</p>
        <p className="text-blue-100 text-xs mt-0.5">
          Teilen-Symbol → „Zum Home-Bildschirm" für Push-Benachrichtigungen
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded text-xs font-medium whitespace-nowrap"
      >
        OK
      </button>
    </div>
  )
}
