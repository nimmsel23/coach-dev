import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  Brain,
  Copy,
  Download,
  FileSearch,
  Loader2,
  PencilLine,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  approveInbox,
  describeCoachError,
  deleteInbox,
  downloadText,
  exportFitnessData,
  getAnatomy,
  linkInboxSource,
  reenrichInbox,
  saveAnatomy,
  saveExercise,
} from '@db'
import { buildExerciseCoachSheet, buildExerciseInsights } from '../lib/exerciseInsights.js'
import { translateMuscle } from '../lib/kb/muscles.js'
import { useEscapeKey } from '../hooks/useEscapeKey.js'

function linesToText(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function textToLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function errorsToText(value) {
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return String(item || '').trim()
      return [
        item.error || '',
        item.anatomical_reason || item.anatomicalReason || '',
        item.correction || '',
        item.coaching_cue || item.coachingCue || '',
      ].join(' | ')
    })
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function textToErrors(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [error = '', anatomical_reason = '', correction = '', coaching_cue = ''] = line.split('|').map((part) => part.trim())
      return { error, anatomical_reason, correction, coaching_cue }
    })
    .filter((item) => item.error || item.anatomical_reason || item.correction || item.coaching_cue)
}

function buildLessonDraft(exercise, lesson) {
  const record = exercise && typeof exercise === 'object' ? exercise : {}
  const source = lesson && typeof lesson === 'object' ? lesson : {}
  const quizSource = Array.isArray(source.quiz) ? source.quiz[0] || {} : (source.quiz || {})
  return {
    title: source.title || record.display_name || record.displayName || record.name || '',
    learning_goal_short: source.learning_goal?.short || '',
    learning_goal_detailed: source.learning_goal?.detailed || '',
    movement_pattern: typeof source.movement_pattern === 'string'
      ? source.movement_pattern
      : source.movement_pattern?.primary || '',
    trainer_simple: source.trainer_explanation?.simple || '',
    trainer_technical: source.trainer_explanation?.technical || '',
    trainer_client_friendly: source.trainer_explanation?.client_friendly || '',
    coaching_cues: linesToText(source.coaching_cues),
    feel_cues: linesToText(source.feel_cues),
    common_errors: errorsToText(source.common_errors),
    quiz_question: quizSource.question || '',
    quiz_answer: quizSource.answer || '',
    muscle_anatomy: source.muscle_anatomy || {},
    joint_actions: source.joint_actions || {},
    body_highlighter_regions: source.body_highlighter_regions || {},
    muscle_roles: source.muscle_roles || {},
  }
}

function lessonDraftToPayload(exerciseId, draft) {
  return {
    exercise_id: exerciseId,
    title: draft.title,
    learning_goal: {
      short: draft.learning_goal_short,
      detailed: draft.learning_goal_detailed,
    },
    movement_pattern: draft.movement_pattern,
    trainer_explanation: {
      simple: draft.trainer_simple,
      technical: draft.trainer_technical,
      client_friendly: draft.trainer_client_friendly,
    },
    coaching_cues: textToLines(draft.coaching_cues),
    feel_cues: textToLines(draft.feel_cues),
    common_errors: textToErrors(draft.common_errors),
    quiz: {
      question: draft.quiz_question,
      answer: draft.quiz_answer,
    },
    muscle_anatomy: draft.muscle_anatomy,
    joint_actions: draft.joint_actions,
    body_highlighter_regions: draft.body_highlighter_regions,
    muscle_roles: draft.muscle_roles,
  }
}

function toneColor(tone) {
  if (tone === 'accent') return {
    background: 'rgba(94,234,212,0.12)',
    border: '1px solid rgba(94,234,212,0.24)',
    color: 'var(--accent)',
  }
  if (tone === 'warn') return {
    background: 'rgba(251,191,36,0.12)',
    border: '1px solid rgba(251,191,36,0.24)',
    color: '#fbbf24',
  }
  return {
    background: 'var(--bg2)',
    border: '1px solid var(--line)',
    color: 'var(--ink)',
  }
}

function ShellCard({ title, eyebrow = null, children, tone = 'default', actions = null }) {
  const toneStyle = toneColor(tone)
  return (
    <section className="rounded-[24px] p-4 md:p-5" style={toneStyle}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {eyebrow && (
            <div className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--muted)' }}>
              {eyebrow}
            </div>
          )}
          <div className="text-sm md:text-base font-black mt-1" style={{ color: toneStyle.color }}>
            {title}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function Field({ label, value, onChange, placeholder = '', rows = 3, disabled = false }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-2xl px-3 py-2.5 text-sm outline-none resize-y"
        style={{
          background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)',
          color: disabled ? 'var(--muted)' : 'var(--ink)',
          border: '1px solid var(--line)',
          opacity: disabled ? 0.85 : 1,
        }}
      />
    </label>
  )
}

function MetaPill({ children, tone = 'default' }) {
  const toneStyle = toneColor(tone)
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold" style={toneStyle}>
      {children}
    </span>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-sm text-right leading-5 max-w-[70%]" style={{ color: 'var(--ink)' }}>{value || 'n/a'}</div>
    </div>
  )
}

function TagCloud({ items = [], tone = 'default', empty = 'n/a' }) {
  if (!items.length) return <div className="text-sm" style={{ color: 'var(--muted)' }}>{empty}</div>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <MetaPill key={item} tone={tone}>{item}</MetaPill>
      ))}
    </div>
  )
}

function JsonBlock({ title, value }) {
  const pretty = useMemo(() => {
    if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) return ''
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value || '')
    }
  }, [value])

  if (!pretty) return null
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--muted)' }}>{title}</div>
      <pre
        className="rounded-2xl p-3 text-xs overflow-x-auto whitespace-pre-wrap break-words"
        style={{ background: 'rgba(0,0,0,0.14)', border: '1px solid var(--line)', color: 'var(--ink)' }}
      >
        {pretty}
      </pre>
    </div>
  )
}

function MuscleAnatomySection({ muscleAnatomy, muscleLanguage = 'de', taxonomy = null }) {
  const entries = Object.entries(muscleAnatomy || {})
  if (!entries.length) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(([id, muscle]) => (
        <div key={id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
          <div className="text-sm font-black mb-2" style={{ color: 'var(--accent)' }}>
            {translateMuscle(id, taxonomy, muscleLanguage)}
          </div>
          <div className="space-y-1.5 text-xs leading-5" style={{ color: 'var(--ink)' }}>
            {muscle.origin && <div><span style={{ color: 'var(--muted)' }}>Ursprung:</span> {muscle.origin}</div>}
            {muscle.insertion && <div><span style={{ color: 'var(--muted)' }}>Ansatz:</span> {muscle.insertion}</div>}
            {muscle.innervation && <div><span style={{ color: 'var(--muted)' }}>Innervation:</span> {muscle.innervation}</div>}
            {muscle.function_in_exercise && <div style={{ color: 'var(--muted)' }}>{muscle.function_in_exercise}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function RawList({ title, items = [], empty = 'n/a' }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--muted)' }}>{title}</div>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded-2xl px-3 py-2 text-sm" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm" style={{ color: 'var(--muted)' }}>{empty}</div>
      )}
    </div>
  )
}

function cleanText(value) {
  return String(value || '').trim()
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (value === null || value === undefined || value === '') return []
  return [String(value)]
}

function sourceRefs(exercise) {
  const snapshot = exercise?.source_snapshot || {}
  const origin = exercise?.origin || {}
  const external = exercise?.external_ids || {}
  const exerciseId = String(exercise?.exercise_id || exercise?.id || '').trim()
  const directWger = exerciseId.startsWith('wger_') ? exerciseId.slice(5) : null
  const directYuhonas = exerciseId.startsWith('yuhonas_') ? exerciseId.slice(8) : null
  return {
    wger: asList(origin?.wger?.wger_id || snapshot?.wger?.wger_id || external?.wger || exercise?.wger_id || directWger),
    yuhonas: asList(origin?.yuhonas?.yuhonas_id || snapshot?.yuhonas?.yuhonas_id || external?.yuhonas || exercise?.yuhonas_id || directYuhonas),
  }
}

function hasMeaningfulLesson(lessonDraft) {
  if (!lessonDraft || typeof lessonDraft !== 'object') return false
  return [
    lessonDraft.learning_goal_short,
    lessonDraft.learning_goal_detailed,
    lessonDraft.trainer_simple,
    lessonDraft.trainer_technical,
    lessonDraft.trainer_client_friendly,
    lessonDraft.coaching_cues,
    lessonDraft.feel_cues,
    lessonDraft.common_errors,
  ].some((value) => cleanText(value))
}

function getInboxStatusMeta(status) {
  if (status === 'approved') return { label: 'Freigegeben', tone: 'accent' }
  if (status === 'ai_enriched') return { label: 'KI-Entwurf bereit', tone: 'accent' }
  if (status === 'pending' || status === 'pending_review') return { label: 'Wartet auf Enrichment', tone: 'warn' }
  if (status === 'rejected') return { label: 'Verworfen', tone: 'default' }
  if (status === 'failed_enrichment') return { label: 'Enrichment fehlgeschlagen', tone: 'warn' }
  return { label: 'Kein Inbox-Status', tone: 'default' }
}

function roleEntries(items = [], taxonomy = null, muscleLanguage = 'de') {
  return (Array.isArray(items) ? items : [])
    .map((item) => translateMuscle(item, taxonomy, muscleLanguage))
    .filter(Boolean)
}

const VIEW_OPTIONS = [
  { id: 'coach', label: 'Coach Sheet', icon: PencilLine },
  { id: 'preview', label: 'Preview', icon: Sparkles },
  { id: 'raw', label: 'Rohdaten', icon: FileSearch },
]

export default function ExerciseInsightModal({ exercise, onClose, onExerciseChange = null, muscleLanguage = 'de', taxonomy = null }) {
  const [localExercise, setLocalExercise] = useState(exercise)
  const [lessonDraft, setLessonDraft] = useState(() => buildLessonDraft(exercise, exercise?.lesson))
  const [exerciseNotes, setExerciseNotes] = useState(exercise?.notes || exercise?.description || '')
  const [loadingLesson, setLoadingLesson] = useState(false)
  const [savingLesson, setSavingLesson] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [reviewFeedback, setReviewFeedback] = useState(exercise?.coachFeedback || exercise?.feedback || '')
  const [reviewAction, setReviewAction] = useState('')
  const [notice, setNotice] = useState('')
  const [activeView, setActiveView] = useState('coach')

  useEffect(() => {
    setLocalExercise(exercise)
    setLessonDraft(buildLessonDraft(exercise, exercise?.lesson))
    setExerciseNotes(exercise?.notes || exercise?.description || '')
    setReviewFeedback(exercise?.coachFeedback || exercise?.feedback || '')
    setReviewAction('')
    setActiveView('coach')
  }, [exercise])

  useEffect(() => {
    if (!exercise) return
    const id = exercise.exercise_id || exercise.id
    if (!id || exercise.lesson) return
    let active = true
    setLoadingLesson(true)
    getAnatomy(id)
      .then((lesson) => {
        if (!active || !lesson) return
        setLocalExercise((prev) => {
          const base = prev && typeof prev === 'object' ? prev : exercise
          const next = { ...base, lesson }
          onExerciseChange?.(next)
          return next
        })
        setLessonDraft(buildLessonDraft(exercise, lesson))
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingLesson(false)
      })
    return () => {
      active = false
    }
  }, [exercise, onExerciseChange])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2400)
    return () => clearTimeout(timer)
  }, [notice])

  // ESC schließt das Coach-Sheet — global genutzt (jeder Exercise-Klick in
  // der App), hatte bisher kein Tastatur-Escape.
  useEscapeKey(onClose, !!exercise && !!localExercise)

  if (!exercise || !localExercise) return null

  const insight = buildExerciseInsights(localExercise)
  const lesson = localExercise.lesson || null
  const exerciseId = localExercise.exercise_id || localExercise.id || localExercise.name
  const displayName = localExercise.display_name || localExercise.displayName || localExercise.name || 'Übung'
  const rawInstructions = Array.isArray(insight.rawInstructions) ? insight.rawInstructions : []
  const sourceDescription = insight.rawDescription || localExercise.description || ''
  const primaryLabels = insight.primary.map((muscle) => translateMuscle(muscle, taxonomy, muscleLanguage))
  const secondaryLabels = insight.secondary.map((muscle) => translateMuscle(muscle, taxonomy, muscleLanguage))
  const stabilizerLabels = roleEntries(localExercise.stabilizers, taxonomy, muscleLanguage)
  const sourceTags = Array.isArray(localExercise.tags) ? localExercise.tags : []
  const inboxFileId = localExercise.file_id || localExercise.inbox_entry?.file_id || null
  const inboxUserId = localExercise.userId || localExercise.inbox_entry?.userId || null
  const inboxStatus = localExercise.inbox_status || localExercise.status || localExercise.inbox_entry?.status || null
  const inboxStatusMeta = getInboxStatusMeta(inboxStatus)
  const mergeCandidate = localExercise.mergeCandidate || localExercise.inbox_entry?.mergeCandidate || null
  const hasLessonDraft = hasMeaningfulLesson(lessonDraft)
  const hasOriginalSource = Boolean(sourceDescription || rawInstructions.length)
  const sourceRefMap = sourceRefs(localExercise)
  const roleBlocks = [
    { label: 'Haupttreiber', items: primaryLabels, tone: 'accent' },
    { label: 'Mitspieler / Synergisten', items: secondaryLabels, tone: 'default' },
    { label: 'Stabilisatoren', items: stabilizerLabels, tone: 'default' },
  ].filter((block) => block.items.length)

  async function copySheet() {
    try {
      await navigator.clipboard.writeText(buildExerciseCoachSheet(localExercise))
      setNotice('Coach Sheet kopiert')
    } catch {
      setNotice('Kopieren fehlgeschlagen')
    }
  }

  async function exportSheet(kind) {
    try {
      const payload = kind === 'lesson'
        ? { kind: 'exercise_lesson', exercise_id: exerciseId, mode: 'trainer', force: true }
        : { kind: 'exercise_sheet', query: exerciseId, force: true }
      const result = await exportFitnessData(payload)
      setNotice(result?.path ? `Exportiert: ${result.path}` : 'Exportiert')
    } catch {
      setNotice('Export fehlgeschlagen')
    }
  }

  function downloadSheet() {
    const slug = (insight.title || 'exercise').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    downloadText(`${slug || 'exercise'}-coach-sheet.md`, buildExerciseCoachSheet(localExercise), 'text/markdown;charset=utf-8')
    setNotice('Markdown geladen')
  }

  async function handleSaveLesson() {
    if (!exerciseId) return
    setSavingLesson(true)
    try {
      const payload = lessonDraftToPayload(exerciseId, lessonDraft)
      const result = await saveAnatomy(exerciseId, payload)
      const nextLesson = result?.lesson || payload
      const next = { ...localExercise, lesson: nextLesson }
      setLocalExercise(next)
      onExerciseChange?.(next)
      setNotice('Coach Sheet gespeichert')
    } catch {
      setNotice('Coach Sheet Save fehlgeschlagen')
    } finally {
      setSavingLesson(false)
    }
  }

  async function handleSaveNotes() {
    if (!exerciseId) return
    setSavingNotes(true)
    try {
      const payload = {
        ...localExercise,
        exercise_id: exerciseId,
        id: exerciseId,
        notes: exerciseNotes,
        description: exerciseNotes,
        display_name: displayName,
      }
      await saveExercise(exerciseId, payload)
      const next = { ...localExercise, ...payload }
      setLocalExercise(next)
      onExerciseChange?.(next)
      setNotice('Exercise gespeichert')
    } catch {
      setNotice('Exercise Save fehlgeschlagen')
    } finally {
      setSavingNotes(false)
    }
  }

  function publishInboxUpdate(status) {
    window.dispatchEvent(new CustomEvent('fitness-inbox-updated', {
      detail: { fileId: inboxFileId, status },
    }))
  }

  async function handleApproveInbox() {
    if (!inboxFileId || reviewAction) return
    setReviewAction('approve')
    try {
      const next = {
        ...localExercise,
        coachFeedback: reviewFeedback,
        feedback: reviewFeedback,
        inbox_status: 'approved',
        status: 'approved',
      }
      await approveInbox(inboxFileId, inboxUserId)
      setLocalExercise(next)
      onExerciseChange?.(next)
      publishInboxUpdate('approved')
      setNotice('Inbox-Eintrag freigegeben')
    } catch (err) {
      setNotice(describeCoachError(err, 'Freigabe fehlgeschlagen'))
    } finally {
      setReviewAction('')
    }
  }

  async function handleReenrichInbox() {
    if (!inboxFileId || reviewAction) return
    setReviewAction('reenrich')
    try {
      const payload = {
        ...localExercise,
        coachFeedback: reviewFeedback,
        feedback: reviewFeedback,
      }
      const result = await reenrichInbox(inboxFileId, inboxUserId, payload)
      if (!result?.ok) {
        setNotice('Neu-Anreicherung fehlgeschlagen')
        return
      }
      const next = {
        ...localExercise,
        coachFeedback: reviewFeedback,
        feedback: reviewFeedback,
        inbox_status: 'ai_enriched',
        status: 'ai_enriched',
        enriched: result.enriched || localExercise.enriched || null,
        ...(result.enriched || {}),
      }
      setLocalExercise(next)
      onExerciseChange?.(next)
      publishInboxUpdate('ai_enriched')
      setNotice(result?.via === 'vertex' ? 'Neu angereichert (Vertex-Fallback)' : 'Neu angereichert')
    } catch (err) {
      setNotice(describeCoachError(err, 'Neu-Anreicherung fehlgeschlagen'))
    } finally {
      setReviewAction('')
    }
  }

  async function handleLinkSource(sourceKey, candidate) {
    if (!inboxFileId || reviewAction || !candidate?.id) return
    setReviewAction(`link:${sourceKey}`)
    try {
      const payload = {
        ...localExercise,
        coachFeedback: reviewFeedback,
        feedback: reviewFeedback,
      }
      const result = await linkInboxSource(inboxFileId, sourceKey, candidate.id, inboxUserId, payload)
      if (!result?.ok || !result.exercise) {
        setNotice('Quelle konnte nicht verlinkt werden')
        return
      }
      const next = {
        ...localExercise,
        ...result.exercise,
        enriched: result.exercise,
        coachFeedback: reviewFeedback,
        feedback: reviewFeedback,
        inbox_status: 'source_linked',
        status: 'source_linked',
      }
      setLocalExercise(next)
      onExerciseChange?.(next)
      publishInboxUpdate('source_linked')
      setNotice(`${sourceKey} verlinkt`)
    } catch (err) {
      setNotice(describeCoachError(err, 'Quelle konnte nicht verlinkt werden'))
    } finally {
      setReviewAction('')
    }
  }

  async function handleRejectInbox() {
    if (!inboxFileId || reviewAction) return
    setReviewAction('reject')
    try {
      await deleteInbox(inboxFileId, inboxUserId)
      const next = {
        ...localExercise,
        inbox_status: 'rejected',
        status: 'rejected',
      }
      setLocalExercise(next)
      onExerciseChange?.(next)
      publishInboxUpdate('rejected')
      setNotice('Inbox-Eintrag verworfen')
    } catch (err) {
      setNotice(describeCoachError(err, 'Verwerfen fehlgeschlagen'))
    } finally {
      setReviewAction('')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-fit-scrim backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-x-0 bottom-0 md:inset-4 md:bottom-4">
        <div
          className="mx-auto h-[94vh] md:h-full w-full md:max-w-[1460px] rounded-t-[28px] md:rounded-[32px] overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(18,26,28,0.98) 0%, rgba(11,16,18,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex h-full flex-col">
            <header className="border-b px-5 py-4 md:px-6" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: 'var(--muted)' }}>
                    Coach Sheet Rebuild
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl md:text-3xl font-black leading-tight" style={{ color: 'var(--ink)' }}>
                      {displayName}
                    </h2>
                    <MetaPill tone={insight.isRaw ? 'warn' : 'accent'}>
                      {insight.isRaw ? 'Raw / ungeprüft' : 'Lesson vorhanden'}
                    </MetaPill>
                    {loadingLesson && (
                      <MetaPill tone="default">
                        <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> lade anatomy</span>
                      </MetaPill>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <MetaPill>{insight.category}</MetaPill>
                    <MetaPill>{insight.equipment}</MetaPill>
                    <MetaPill>{exerciseId}</MetaPill>
                    {localExercise.source && <MetaPill>{localExercise.source}</MetaPill>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={copySheet} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                    <span className="inline-flex items-center gap-2"><Copy size={14} /> Copy</span>
                  </button>
                  <button onClick={downloadSheet} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                    <span className="inline-flex items-center gap-2"><Download size={14} /> MD</span>
                  </button>
                  <button onClick={onClose} className="rounded-2xl p-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted)' }}>
                    <X size={18} />
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="grid h-full min-h-0 md:grid-cols-[340px_minmax(0,1fr)]">
                <aside className="min-h-0 overflow-y-auto p-4 md:p-5 space-y-4" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                  {inboxFileId && (
                    <ShellCard title="Review Actions" eyebrow="Coach Inbox" tone={inboxStatusMeta.tone}>
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <MetaPill tone={inboxStatusMeta.tone}>{inboxStatusMeta.label}</MetaPill>
                          {inboxUserId && <MetaPill>{inboxUserId}</MetaPill>}
                          <MetaPill>{inboxFileId}</MetaPill>
                        </div>
                        <Field
                          label="Nachfrage / Review-Fokus"
                          value={reviewFeedback}
                          onChange={setReviewFeedback}
                          rows={5}
                          placeholder="Was soll Gemini bzw. das Backend beim Re-Enrichment präzisieren?"
                        />
                        <div className="grid gap-2">
                          <button
                            onClick={handleApproveInbox}
                            disabled={Boolean(reviewAction) || inboxStatus === 'approved'}
                            className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left"
                            style={{ background: 'rgba(94,234,212,0.14)', border: '1px solid rgba(94,234,212,0.28)', color: 'var(--accent)' }}
                          >
                            <span className="inline-flex items-center gap-2">
                              {reviewAction === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Freigeben
                            </span>
                          </button>
                          <button
                            onClick={handleReenrichInbox}
                            disabled={Boolean(reviewAction)}
                            className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left"
                            style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                          >
                            <span className="inline-flex items-center gap-2">
                              {reviewAction === 'reenrich' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                              Neu anreichern
                            </span>
                          </button>
                          <button
                            onClick={handleRejectInbox}
                            disabled={Boolean(reviewAction) || inboxStatus === 'rejected'}
                            className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
                          >
                            <span className="inline-flex items-center gap-2">
                              {reviewAction === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              Verwerfen
                            </span>
                          </button>
                        </div>
                      </div>
                    </ShellCard>
                  )}

                  <ShellCard title="Exercise Snapshot" eyebrow="Overview" tone="accent">
                    <div className="space-y-2">
                      <StatRow label="Display" value={displayName} />
                      <StatRow label="German" value={localExercise.german || localExercise.display_name || 'n/a'} />
                      <StatRow label="English" value={localExercise.english || localExercise.name || 'n/a'} />
                      <StatRow label="Pattern" value={insight.movement.pattern || 'n/a'} />
                    </div>
                  </ShellCard>

                  <ShellCard title="Source Provenance" eyebrow="wger / yuhonas / schema">
                    <div className="space-y-3">
                      <StatRow label="Origin Type" value={localExercise.origin?.type || 'n/a'} />
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Source Refs</div>
                        <TagCloud
                          items={[
                            ...sourceRefMap.wger.map((id) => `wger:${id}`),
                            ...sourceRefMap.yuhonas.map((id) => `yuhonas:${id}`),
                          ]}
                          empty="Keine externen Source-Refs im aktuellen Inbox-Record."
                        />
                      </div>
	                      <div>
	                        <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Snapshot</div>
	                        <TagCloud
                          items={[
                            ...(localExercise.source_snapshot?.wger ? ['wger snapshot'] : []),
                            ...(localExercise.source_snapshot?.yuhonas ? ['yuhonas snapshot'] : []),
                          ]}
	                          empty="Kein source_snapshot vorhanden."
	                        />
	                      </div>
	                      {mergeCandidate && (
	                        <div className="space-y-2">
	                          <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>Kandidaten verbinden</div>
	                          {Object.entries(mergeCandidate).map(([sourceKey, candidate]) => (
	                            <button
	                              key={sourceKey}
	                              onClick={() => handleLinkSource(sourceKey, candidate)}
	                              disabled={Boolean(reviewAction)}
	                              className="w-full rounded-2xl px-3 py-2.5 text-left text-xs font-semibold"
	                              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.22)', color: '#fbbf24' }}
	                            >
	                              <span className="inline-flex items-center gap-2">
	                                {reviewAction === `link:${sourceKey}` ? <Loader2 size={13} className="animate-spin" /> : <FileSearch size={13} />}
	                                {sourceKey}: {candidate.display_name || candidate.id} · Score {Math.round(candidate.score || 0)}
	                              </span>
	                            </button>
	                          ))}
	                        </div>
	                      )}
	                    </div>
	                  </ShellCard>

                  <ShellCard title="Muscles" eyebrow="Targeting">
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Primär</div>
                        <TagCloud items={primaryLabels} tone="accent" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Sekundär</div>
                        <TagCloud items={secondaryLabels} />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Body Regions</div>
                        <TagCloud items={insight.regions} />
                      </div>
                    </div>
                  </ShellCard>

                  <ShellCard
                    title="Coach Notes"
                    eyebrow="Exercise Layer"
                    actions={(
                      <button onClick={handleSaveNotes} disabled={savingNotes} className="rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                        {savingNotes ? <span className="inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> save</span> : <span className="inline-flex items-center gap-2"><Save size={12} /> save</span>}
                      </button>
                    )}
                  >
                    <Field
                      label="Notes / Description"
                      value={exerciseNotes}
                      onChange={setExerciseNotes}
                      rows={8}
                      placeholder="Eigene Coach-Notizen, Qualitätsurteil, Merge-Hinweise, Kontext."
                    />
                  </ShellCard>

                  <ShellCard title="Actions" eyebrow="Export">
                    <div className="grid gap-2">
                      <button onClick={() => exportSheet('sheet')} className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                        Coach Sheet exportieren
                      </button>
                      <button onClick={() => exportSheet('lesson')} className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                        Lesson exportieren
                      </button>
                    </div>
                  </ShellCard>
                </aside>

                <main className="min-h-0 overflow-y-auto p-4 md:p-6 space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {VIEW_OPTIONS.map(({ id, label, icon: Icon }) => {
                      const active = activeView === id
                      return (
                        <button
                          key={id}
                          onClick={() => setActiveView(id)}
                          className="rounded-full px-4 py-2 text-sm font-black transition-all"
                          style={active ? {
                            background: 'rgba(94,234,212,0.14)',
                            border: '1px solid rgba(94,234,212,0.28)',
                            color: 'var(--accent)',
                          } : {
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--muted)',
                          }}
                        >
                          <span className="inline-flex items-center gap-2"><Icon size={14} /> {label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {activeView === 'coach' && (
                    <div className="space-y-5">
                      <div className="grid gap-5 xl:grid-cols-2">
                        <ShellCard title="Originalquelle" eyebrow="wger / yuhonas zuerst" tone="warn">
                          <div className="space-y-3 text-sm leading-6" style={{ color: 'var(--ink)' }}>
                            <p>
                              Der Coach soll hier nicht frei neu texten. Erst die Quellbeschreibung prüfen, dann nur gezielt nachschärfen oder freigeben.
                            </p>
                            <div className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
                              {sourceDescription || 'Im aktuellen Record fehlt `original_description`.'}
                            </div>
                            {rawInstructions.length > 0 && (
                              <ul className="space-y-2">
                                {rawInstructions.slice(0, 5).map((item, index) => (
                                  <li key={`coach-raw-${index}`} className="rounded-2xl px-3 py-2" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </ShellCard>

                        <ShellCard title="Review-Ziel" eyebrow="Was soll hier entstehen?" tone="accent">
                          <div className="space-y-3 text-sm leading-6" style={{ color: 'var(--ink)' }}>
                            <div className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
                              {cleanText(lessonDraft.trainer_technical) || cleanText(lessonDraft.learning_goal_detailed) || 'Noch kein belastbarer Lesson-Draft vorhanden.'}
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                              <StatRow label="Originalquelle" value={hasOriginalSource ? 'vorhanden' : 'lückenhaft'} />
                              <StatRow label="Lesson-Draft" value={hasLessonDraft ? 'vorhanden' : 'fehlt / sehr dünn'} />
                            </div>
                            <div className="text-sm" style={{ color: 'var(--muted)' }}>
                              Bewegungsmuster bleibt backend-/Gemini-getrieben. Hier geht es um Review, Rückfrage und Freigabe.
                            </div>
                          </div>
                        </ShellCard>
                      </div>

                      <ShellCard
                        title="Lesson Review"
                        eyebrow="AI / Backend liefert, Coach prüft"
                        tone="accent"
                        actions={(
                          <button onClick={handleSaveLesson} disabled={savingLesson || loadingLesson} className="rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--accent)' }}>
                            {savingLesson ? <span className="inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> save</span> : <span className="inline-flex items-center gap-2"><Save size={12} /> save lesson</span>}
                          </button>
                        )}
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Titel" value={lessonDraft.title} onChange={(value) => setLessonDraft((prev) => ({ ...prev, title: value }))} rows={2} />
                          <Field label="Movement Pattern (AI/Backend)" value={lessonDraft.movement_pattern} onChange={(value) => setLessonDraft((prev) => ({ ...prev, movement_pattern: value }))} rows={2} placeholder="Soll per Gemini/localhost kommen, nicht manuell ausgeschmückt." disabled />
                          <Field label="Learning Goal Kurz" value={lessonDraft.learning_goal_short} onChange={(value) => setLessonDraft((prev) => ({ ...prev, learning_goal_short: value }))} rows={4} />
                          <Field label="Learning Goal Detailliert" value={lessonDraft.learning_goal_detailed} onChange={(value) => setLessonDraft((prev) => ({ ...prev, learning_goal_detailed: value }))} rows={5} />
                        </div>
                      </ShellCard>

                      <ShellCard title="Trainer Voice" eyebrow="Explanation">
                        <div className="grid gap-4 md:grid-cols-3">
                          <Field label="Simple" value={lessonDraft.trainer_simple} onChange={(value) => setLessonDraft((prev) => ({ ...prev, trainer_simple: value }))} rows={6} />
                          <Field label="Technical" value={lessonDraft.trainer_technical} onChange={(value) => setLessonDraft((prev) => ({ ...prev, trainer_technical: value }))} rows={6} />
                          <Field label="Client Friendly" value={lessonDraft.trainer_client_friendly} onChange={(value) => setLessonDraft((prev) => ({ ...prev, trainer_client_friendly: value }))} rows={6} />
                        </div>
                      </ShellCard>

                      <ShellCard title="Coaching Payload" eyebrow="Execution">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Coaching Cues" value={lessonDraft.coaching_cues} onChange={(value) => setLessonDraft((prev) => ({ ...prev, coaching_cues: value }))} rows={7} placeholder="Eine Zeile pro Cue" />
                          <Field label="Feel Cues" value={lessonDraft.feel_cues} onChange={(value) => setLessonDraft((prev) => ({ ...prev, feel_cues: value }))} rows={7} placeholder="Eine Zeile pro Cue" />
                          <Field label="Common Errors" value={lessonDraft.common_errors} onChange={(value) => setLessonDraft((prev) => ({ ...prev, common_errors: value }))} rows={8} placeholder="error | anatomical reason | correction | cue" />
                          <div className="space-y-4">
                            <Field label="Quiz Question" value={lessonDraft.quiz_question} onChange={(value) => setLessonDraft((prev) => ({ ...prev, quiz_question: value }))} rows={3} />
                            <Field label="Quiz Answer" value={lessonDraft.quiz_answer} onChange={(value) => setLessonDraft((prev) => ({ ...prev, quiz_answer: value }))} rows={5} />
                          </div>
                        </div>
                      </ShellCard>
                    </div>
                  )}

                  {activeView === 'preview' && (
                    <div className="space-y-5">
                      <div className="grid gap-5 xl:grid-cols-2">
                        <ShellCard title="Originalbeschreibung" eyebrow="Source" tone="accent">
                          <div className="space-y-3 text-sm leading-6" style={{ color: 'var(--ink)' }}>
                            <p>{sourceDescription || 'Im aktuellen Record fehlt `original_description`.'}</p>
                            {rawInstructions.length > 0 && (
                              <div className="space-y-2 pt-2">
                                {rawInstructions.slice(0, 5).map((item, index) => (
                                  <div key={`preview-raw-${index}`} className="rounded-2xl px-3 py-2" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
                                    {item}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </ShellCard>

                        <ShellCard title="Review-Draft" eyebrow="Lesson / Coach Output">
                          <div className="space-y-3 text-sm leading-6" style={{ color: 'var(--ink)' }}>
                            <div>{cleanText(lessonDraft.learning_goal_detailed) || cleanText(lessonDraft.trainer_technical) || 'Noch kein belastbarer Review-Draft vorhanden.'}</div>
                            {cleanText(lessonDraft.trainer_client_friendly) && (
                              <div className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                                {lessonDraft.trainer_client_friendly}
                              </div>
                            )}
                            {cleanText(lessonDraft.movement_pattern) && (
                              <MetaPill tone="accent">{lessonDraft.movement_pattern}</MetaPill>
                            )}
                          </div>
                        </ShellCard>
                      </div>

                      <div className="grid gap-5 xl:grid-cols-2">
                        <ShellCard title="Coaching Cues" eyebrow="Preview">
                          <RawList title="Cues" items={insight.coachCues} empty="Keine Cues vorhanden." />
                        </ShellCard>
                        <ShellCard title="Error Patterns" eyebrow="Preview">
                          {insight.commonErrors.length ? (
                            <div className="space-y-3">
                              {insight.commonErrors.map((err) => (
                                <div key={`${err.error}-${err.correction}`} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
                                  <div className="text-sm font-black" style={{ color: 'var(--ink)' }}>{err.error}</div>
                                  {err.anatomicalReason && <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{err.anatomicalReason}</div>}
                                  {err.correction && <div className="text-sm mt-1" style={{ color: 'var(--accent)' }}>{err.correction}</div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm" style={{ color: 'var(--muted)' }}>Keine Fehlerbilder vorhanden.</div>
                          )}
                        </ShellCard>
                      </div>

                      {roleBlocks.length > 0 && (
                        <ShellCard title="Muskelrollen" eyebrow="Funktionssicht">
                          <div className="grid gap-4 md:grid-cols-3">
                            {roleBlocks.map((block) => (
                              <div key={block.label} className="space-y-2">
                                <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>
                                  {block.label}
                                </div>
                                <TagCloud items={block.items} tone={block.tone} />
                              </div>
                            ))}
                          </div>
                        </ShellCard>
                      )}

                      {(lesson?.muscle_anatomy || lessonDraft.muscle_anatomy) && (
                        <ShellCard title="Muscle Anatomy" eyebrow="Preview">
                          <MuscleAnatomySection muscleAnatomy={lesson?.muscle_anatomy || lessonDraft.muscle_anatomy} muscleLanguage={muscleLanguage} taxonomy={taxonomy} />
                        </ShellCard>
                      )}
                    </div>
                  )}

                  {activeView === 'raw' && (
                    <div className="space-y-5">
                      <ShellCard title="Source Record" eyebrow="Raw Exercise Data">
                        <div className="grid gap-4 md:grid-cols-2">
                          <RawList title="Original Instructions" items={rawInstructions} empty="Keine Instructions vorhanden." />
                          <div className="space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--muted)' }}>Original Description</div>
                            <div className="rounded-2xl p-3 text-sm leading-6" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                              {insight.rawDescription || localExercise.original_description || 'Keine Beschreibung vorhanden.'}
                            </div>
                          </div>
                        </div>
                      </ShellCard>

                      <div className="grid gap-5 xl:grid-cols-2">
                        <ShellCard title="Field Snapshot" eyebrow="Exercise">
                          <div className="space-y-2">
                            <StatRow label="Display Name" value={displayName} />
                            <StatRow label="German" value={localExercise.german || 'n/a'} />
                            <StatRow label="English" value={localExercise.english || 'n/a'} />
                            <StatRow label="Category" value={localExercise.category || 'n/a'} />
                            <StatRow label="Type" value={localExercise.type || 'n/a'} />
                            <StatRow label="Equipment" value={Array.isArray(localExercise.equipment) ? localExercise.equipment.join(', ') : (localExercise.equipment || 'n/a')} />
                          </div>
                        </ShellCard>

                        <ShellCard title="Tags & Arrays" eyebrow="Exercise">
                          <div className="space-y-3">
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Tags</div>
                              <TagCloud items={sourceTags} />
                            </div>
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Primary Raw</div>
                              <TagCloud items={(localExercise.primary_muscles || localExercise.primaryMuscles || []).map(String)} />
                            </div>
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Secondary Raw</div>
                              <TagCloud items={(localExercise.secondary_muscles || localExercise.secondaryMuscles || []).map(String)} />
                            </div>
                          </div>
                        </ShellCard>
                      </div>

                      <div className="grid gap-5 xl:grid-cols-2">
                        <ShellCard title="Lesson Structure" eyebrow="Raw JSON">
                          <JsonBlock title="lesson" value={lesson} />
                        </ShellCard>
                        <ShellCard title="Extended Anatomy Blocks" eyebrow="Raw JSON">
                          <JsonBlock title="joint_actions" value={lesson?.joint_actions || lessonDraft.joint_actions} />
                          <JsonBlock title="body_highlighter_regions" value={lesson?.body_highlighter_regions || lessonDraft.body_highlighter_regions} />
                          <JsonBlock title="muscle_roles" value={lesson?.muscle_roles || lessonDraft.muscle_roles} />
                        </ShellCard>
                      </div>

                      <div className="grid gap-5 xl:grid-cols-2">
                        <ShellCard title="Origin Metadata" eyebrow="Raw JSON">
                          <JsonBlock title="origin" value={localExercise.origin} />
                          <JsonBlock title="external_ids" value={localExercise.external_ids} />
                        </ShellCard>
                        <ShellCard title="Source Snapshot" eyebrow="Raw JSON">
                          <JsonBlock title="source_snapshot" value={localExercise.source_snapshot} />
                        </ShellCard>
                      </div>
                    </div>
                  )}

                  {notice && (
                    <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'rgba(94,234,212,0.1)', border: '1px solid rgba(94,234,212,0.22)', color: 'var(--accent)' }}>
                      {notice}
                    </div>
                  )}
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
