import { useCallback, useEffect, useRef, useState } from 'react'
import { EXERCISE_DB_SOURCES } from './sources.js'
import {
  checkMirrorUpdate,
  downloadMirror,
  getMirrorStatus,
  loadMirrorItems,
  removeMirror,
  subscribeMirror,
} from './mirror.js'

// Hält Status + normalisierte Einträge aller Quellen und bietet die Aktionen
// Laden / Aktualisieren / Entfernen. Prüft einmal pro geladener Quelle im
// Hintergrund, ob upstream eine neuere Version hat.
export function useExerciseMirrors() {
  const [ready, setReady] = useState(false)
  const [statuses, setStatuses] = useState({})
  const [items, setItems] = useState({})
  const [busy, setBusy] = useState({})
  const [errors, setErrors] = useState({})
  const [updates, setUpdates] = useState({})
  const checkedRef = useRef(new Set())

  const refresh = useCallback(async () => {
    const nextStatuses = {}
    const nextItems = {}
    for (const source of EXERCISE_DB_SOURCES) {
      const status = await getMirrorStatus(source.id)
      nextStatuses[source.id] = status
      if (status) nextItems[source.id] = (await loadMirrorItems(source.id)) || []
    }
    setStatuses(nextStatuses)
    setItems(nextItems)
    setReady(true)
  }, [])

  useEffect(() => {
    refresh()
    return subscribeMirror(refresh)
  }, [refresh])

  useEffect(() => {
    for (const source of EXERCISE_DB_SOURCES) {
      if (!statuses[source.id] || checkedRef.current.has(source.id)) continue
      checkedRef.current.add(source.id)
      checkMirrorUpdate(source.id)
        .then((result) => setUpdates((prev) => ({ ...prev, [source.id]: result })))
        .catch(() => {})
    }
  }, [statuses])

  const run = useCallback(async (sourceId, action) => {
    setBusy((prev) => ({ ...prev, [sourceId]: true }))
    setErrors((prev) => ({ ...prev, [sourceId]: null }))
    try {
      await action()
      setUpdates((prev) => ({ ...prev, [sourceId]: { available: false, latest: null } }))
    } catch (err) {
      setErrors((prev) => ({ ...prev, [sourceId]: err?.message || 'Fehlgeschlagen' }))
    } finally {
      setBusy((prev) => ({ ...prev, [sourceId]: false }))
    }
  }, [])

  return {
    ready,
    statuses,
    items,
    busy,
    errors,
    updates,
    download: (id) => run(id, () => downloadMirror(id)),
    remove: (id) => run(id, () => removeMirror(id)),
  }
}
