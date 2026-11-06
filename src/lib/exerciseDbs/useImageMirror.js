import { useCallback, useEffect, useRef, useState } from 'react'
import { clearImages, downloadImages, getImageStatus, imagesSupported } from './images.js'

// Status + Aktionen für den Bild-Spiegel einer Quelle. `urls` = alle Bild-URLs
// aus dem geladenen Mirror (leer, solange die Quelle nicht geladen ist).
export function useImageMirror(sourceId, urls) {
  const [status, setStatus] = useState({ cached: 0, total: urls.length, bytes: 0 })
  const [progress, setProgress] = useState(null) // null = läuft nicht
  const [result, setResult] = useState(null)
  const abortRef = useRef(null)
  const urlsRef = useRef(urls)
  urlsRef.current = urls

  const refresh = useCallback(async () => {
    setStatus(await getImageStatus(sourceId, urlsRef.current).catch(() => ({ cached: 0, total: urlsRef.current.length, bytes: 0 })))
  }, [sourceId])

  useEffect(() => { refresh() }, [refresh, urls.length])
  useEffect(() => () => abortRef.current?.abort(), [])

  const start = useCallback(async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setResult(null)
    setProgress({ done: 0, failed: 0, total: urlsRef.current.length, bytes: 0 })
    try {
      const outcome = await downloadImages(sourceId, urlsRef.current, { onProgress: setProgress, signal: controller.signal })
      setResult(outcome)
    } catch (err) {
      setResult({ error: err?.message || 'Fehlgeschlagen' })
    } finally {
      abortRef.current = null
      setProgress(null)
      refresh()
    }
  }, [sourceId, refresh])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const clear = useCallback(async () => {
    await clearImages(sourceId, urlsRef.current)
    setResult(null)
    refresh()
  }, [sourceId, refresh])

  return { supported: imagesSupported(), status, progress, result, start, stop, clear }
}
