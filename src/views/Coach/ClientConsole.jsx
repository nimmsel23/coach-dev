import { useEffect, useRef, useState } from 'react'
import { getClientJournalFeed, getClientNutritionDays, saveCoachFeedback } from '@db'
import { buildClientConsole, scopeFeedToClient } from './clientConsoleStats.js'
import ClientConsoleView from './ClientConsoleView.jsx'

export default function ClientConsole(props) {
  return <ClientConsoleData key={props.clientUid} {...props} />
}

function ClientConsoleData({ clientUid, highlightDate = '', onDismissHighlight }) {
  const [entries, setEntries] = useState([])
  const [nutrition, setNutrition] = useState({ access: 'ok', days: [] })
  const [drafts, setDrafts] = useState({})
  const [submittingIds, setSubmittingIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const mounted = useRef(true)
  const saving = useRef(new Set())
  const model = buildClientConsole(entries, nutrition.days)
  const comments = {
    ...Object.fromEntries(model.workouts.map((item) => [item.id, item.coachFeedback || ''])),
    ...drafts,
  }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    let alive = true
    let refreshed = false
    let refreshFailed = false
    const key = `feed:client:${clientUid}:100`
    const acceptFeed = (feed) => {
      if (!Array.isArray(feed)) throw new Error('Ungültige Antwort beim Laden der Trainingslogs.')
      setEntries(scopeFeedToClient(feed, clientUid))
      setLoading(false)
    }
    const onCache = (event) => {
      if (!alive || event.detail?.key !== key) return
      try {
        acceptFeed(event.detail.data)
        refreshed = true
        refreshFailed = false
        setError('')
      } catch (err) {
        refreshFailed = true
        setError(err.message)
      }
    }
    const onCacheError = (event) => {
      if (!alive || event.detail?.key !== key) return
      refreshFailed = true
      setError(event.detail.message || 'Die Trainingslogs konnten nicht aktualisiert werden.')
      setLoading(false)
    }
    window.addEventListener('vos-coach-cache', onCache)
    window.addEventListener('vos-coach-cache-error', onCacheError)
    setLoading(true)
    getClientJournalFeed(clientUid).then((feed) => {
      if (!alive || refreshed) return
      acceptFeed(feed)
      if (!refreshFailed) setError('')
    }).catch((err) => {
      if (!alive || refreshed) return
      setError(err?.message || 'Die Konsole konnte nicht geladen werden.')
      setLoading(false)
    })
    getClientNutritionDays(clientUid).then((days) => {
      if (alive) setNutrition(days || { access: 'error', days: [] })
    }).catch(() => {
      if (alive) setNutrition({ access: 'error', days: [] })
    })
    return () => {
      alive = false
      window.removeEventListener('vos-coach-cache', onCache)
      window.removeEventListener('vos-coach-cache-error', onCacheError)
    }
  }, [clientUid, reloadKey])

  async function submitComment(log) {
    const text = comments[log.id] || ''
    if (!text.trim() || saving.current.has(log.id)) return
    saving.current.add(log.id)
    setSubmittingIds((previous) => [...previous, log.id])
    setCommentError('')
    try {
      const saved = await saveCoachFeedback(log.userId || clientUid, log.id, log.type || 'workout', text)
      if (saved?.ok !== true) throw new Error('Kommentar konnte nicht gespeichert werden.')
      if (!mounted.current) return
      setEntries((previous) => previous.map((item) => item.id === log.id && (item.type || 'workout') === (log.type || 'workout') ? { ...item, coachFeedback: text } : item))
      setDrafts((previous) => {
        if (previous[log.id] !== text) return previous
        const next = { ...previous }
        delete next[log.id]
        return next
      })
    } catch (err) {
      if (mounted.current) setCommentError(err?.message || 'Kommentar konnte nicht gespeichert werden.')
    } finally {
      saving.current.delete(log.id)
      if (mounted.current) setSubmittingIds((previous) => previous.filter((id) => id !== log.id))
    }
  }

  return (
    <ClientConsoleView
      model={model}
      loading={loading}
      error={error}
      commentError={commentError}
      nutritionAccess={nutrition.access}
      comments={comments}
      submittingIds={submittingIds}
      onCommentChange={(id, text) => setDrafts((prev) => ({ ...prev, [id]: text }))}
      onCommentSubmit={submitComment}
      onRetry={() => setReloadKey((value) => value + 1)}
      highlightDate={highlightDate}
      onDismissHighlight={onDismissHighlight}
    />
  )
}
