import { useCallback, useEffect, useState } from 'react'
import { buildCoachHash, parseCoachHash } from './coachRoute.js'

// Hält die Coach-Ansicht (Sub-Tab, Klient, Detail-Tab) im URL-Hash.
// Zurück-Taste und Push-Links funktionieren, ein Reload bleibt an derselben Stelle.
export function useCoachRoute() {
  const [route, setRoute] = useState(() => parseCoachHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(parseCoachHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((patch) => {
    const next = { ...parseCoachHash(window.location.hash), ...patch }
    const hash = buildCoachHash(next)
    if (hash !== window.location.hash) window.location.hash = hash
    else setRoute(parseCoachHash(hash))
  }, [])

  return [route, navigate]
}
