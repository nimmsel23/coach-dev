import { useEffect, useState } from 'react'
import { getClientJournalFeed, getClientNutritionDays, saveCoachFeedback } from '@db'
import { buildClientConsole } from './clientConsoleStats.js'
import ClientConsoleView from './ClientConsoleView.jsx'

export default function ClientConsole({ clientUid, highlightDate = '', onDismissHighlight }) {
  const [entries, setEntries] = useState([])
  const [nutrition, setNutrition] = useState({ access: 'ok', days: [] })
  const [comments, setComments] = useState({})
  const [submittingId, setSubmittingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Promise.all([
      getClientJournalFeed(clientUid),
      getClientNutritionDays(clientUid),
    ]).then(([feed, days]) => {
      if (!alive) return
      const list = Array.isArray(feed) ? feed : []
      setEntries(list)
      setNutrition(days || { access: 'error', days: [] })
      setComments(Object.fromEntries(list.filter((item) => item.coachFeedback).map((item) => [item.id, item.coachFeedback])))
      setLoading(false)
    }).catch((err) => {
      if (!alive) return
      setError(err?.message || 'Die Konsole konnte nicht geladen werden.')
      setLoading(false)
    })
    return () => { alive = false }
  }, [clientUid, reloadKey])

  async function submitComment(log) {
    const text = comments[log.id] || ''
    if (!text.trim()) return
    setSubmittingId(log.id)
    setCommentError('')
    try {
      const saved = await saveCoachFeedback(log.userId || clientUid, log.id, log.type || 'workout', text)
      if (saved && saved.ok === false) throw new Error('Kommentar konnte nicht gespeichert werden.')
    } catch (err) {
      setCommentError(err?.message || 'Kommentar konnte nicht gespeichert werden.')
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <ClientConsoleView
      model={buildClientConsole(entries, nutrition.days)}
      loading={loading}
      error={error}
      commentError={commentError}
      nutritionAccess={nutrition.access}
      comments={comments}
      submittingId={submittingId}
      onCommentChange={(id, text) => setComments((prev) => ({ ...prev, [id]: text }))}
      onCommentSubmit={submitComment}
      onRetry={() => setReloadKey((value) => value + 1)}
      highlightDate={highlightDate}
      onDismissHighlight={onDismissHighlight}
    />
  )
}
