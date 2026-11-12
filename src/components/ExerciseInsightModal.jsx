import { sourceIds } from '../lib/db/shared/catalogSources.js'
import SourceEditor from '../views/Inbox/SourceEditor.jsx'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
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
  reenrichInbox,
  saveAnatomy,
  saveExercise,
} from '@db'
import { buildExerciseCoachSheet, buildExerciseInsights } from '../lib/exerciseInsights.js'
import { translateMuscle } from '../lib/kb/muscles.js'
import { useEscapeKey } from '../hooks/useEscapeKey.js'
import { yuhonasImageUrls } from '../lib/yuhonasImage.js'

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
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
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

function formatSourceText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join('\n')
  return cleanText(value)
}

function asStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (value == null || value === '') return []
  return [String(value)]
}

function buildSourceDetail(exercise, source, mergeCandidate) {
  const ids = sourceIds(exercise, source, true)
  const selection = exercise?.source_selection
  const consciouslyUnlinked = Boolean(selection && source in selection && selection[source] == null)
  const snap = exercise?.source_snapshot?.[source]
  const candidate = mergeCandidate?.[source] || null
  const originNested = exercise?.origin?.[source]
  const nested = originNested && typeof originNested === 'object' ? originNested : null
  const primaryId = ids[0] || null

  const name = snap?.display_name || snap?.name || snap?.english || snap?.german
    || nested?.display_name || nested?.name || nested?.english
    || candidate?.display_name || candidate?.english || null
  const english = snap?.english || nested?.english || candidate?.english || null
  const german = snap?.german || nested?.german || candidate?.german || null
  const equipment = snap?.equipment || nested?.equipment || candidate?.equipment || null
  const category = snap?.category || nested?.category || candidate?.category || null
  let description = formatSourceText(
    snap?.original_description || snap?.description
    || nested?.original_description || nested?.description
    || candidate?.description,
  )
  const instructions = asStringList(snap?.instructions || nested?.instructions || candidate?.instructions)
  const muscleIds = snap?.wger_muscle_ids || nested?.wger_muscle_ids || null

  // Wenn nur diese Quelle verknüpft ist und kein Snapshot-Text existiert,
  // den Record-Level-Originaltext hier anzeigen (statt leer).
  if (!description && ids.length) {
    const other = source === 'wger' ? 'yuhonas' : 'wger'
    if (!sourceIds(exercise, other, true).length) {
      description = formatSourceText(exercise?.original_description || exercise?.description)
    }
  }

  let href = null
  if (primaryId) {
    if (source === 'wger') href = `https://wger.de/en/exercise/${encodeURIComponent(primaryId)}/view/`
    if (source === 'yuhonas') href = `https://github.com/yuhonas/free-exercise-db/blob/main/exercises/${encodeURIComponent(primaryId)}.json`
  }

  let status = 'missing'
  let statusLabel = 'Nicht verknüpft'
  if (consciouslyUnlinked) {
    status = 'unlinked'
    statusLabel = 'Bewusst getrennt'
  } else if (ids.length) {
    status = 'linked'
    statusLabel = 'Verknüpft'
  }

  return {
    source,
    ids,
    primaryId,
    consciouslyUnlinked,
    status,
    statusLabel,
    name,
    english,
    german,
    equipment,
    category,
    description,
    instructions,
    muscleIds,
    candidate,
    href,
    hasSnapshot: Boolean(snap),
  }
}

function SourceProvenanceCard({ exercise, source, mergeCandidate }) {
  const detail = buildSourceDetail(exercise, source, mergeCandidate)
  const images = source === 'yuhonas' && detail.primaryId
    ? yuhonasImageUrls({ yuhonas_id: detail.primaryId })
    : []
  const statusTone = detail.status === 'linked' ? 'accent' : detail.status === 'unlinked' ? 'warn' : 'default'

  return (
    <ShellCard
      title={source}
      eyebrow="Quelle"
      tone={detail.status === 'linked' ? 'accent' : 'default'}
      actions={<MetaPill tone={statusTone}>{detail.statusLabel}</MetaPill>}
    >
      <div className="space-y-3">
        <StatRow label="ID" value={detail.ids.length ? detail.ids.join(', ') : '—'} />
        {detail.name && <StatRow label="Name" value={detail.name} />}
        {detail.english && detail.english !== detail.name && <StatRow label="English" value={detail.english} />}
        {detail.german && detail.german !== detail.name && <StatRow label="German" value={detail.german} />}
        {detail.category && <StatRow label="Category" value={detail.category} />}
        {detail.equipment && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>Equipment</div>
            <TagCloud items={asStringList(detail.equipment)} />
          </div>
        )}
        {detail.muscleIds && (
          <div className="space-y-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>wger Primär</div>
              <TagCloud items={asStringList(detail.muscleIds.primary)} tone="accent" empty="—" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>wger Sekundär</div>
              <TagCloud items={asStringList(detail.muscleIds.secondary)} empty="—" />
            </div>
          </div>
        )}
        {detail.description && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>Original</div>
            <div
              className="rounded-2xl p-3 text-sm leading-6 whitespace-pre-wrap"
              style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)', color: 'var(--ink)' }}
            >
              {detail.description}
            </div>
          </div>
        )}
        {detail.instructions.length > 0 && (
          <RawList title="Instructions" items={detail.instructions.slice(0, 6)} />
        )}
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {images.map((src, index) => (
              <img
                key={src}
                src={src}
                alt={`${source} frame ${index + 1}`}
                className="w-full aspect-square rounded-2xl object-cover"
                style={{ border: '1px solid var(--line)' }}
                loading="lazy"
              />
            ))}
          </div>
        )}
        {detail.candidate && !detail.ids.length && !detail.consciouslyUnlinked && (
          <div
            className="rounded-2xl p-3 text-sm"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
          >
            Vorschlag: {detail.candidate.display_name || detail.candidate.id}
            {detail.candidate.id ? ` · ${detail.candidate.id}` : ''}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <MetaPill>{detail.hasSnapshot ? 'Snapshot vorhanden' : 'Kein Snapshot'}</MetaPill>
          {detail.href && (
            <a
              href={detail.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={toneColor('accent')}
            >
              <ExternalLink size={12} /> Öffnen
            </a>
          )}
        </div>
      </div>
    </ShellCard>
  )
}

const AUTO_FIT_GRID = 'grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]'

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
        setLocalExercise((prev) => ({ ...prev, lesson }))
        onExerciseChange?.((prev) => (prev === exercise ? { ...prev, lesson } : prev))
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
  const primaryLabels = insight.primary.map((muscle) => translateMuscle(muscle, taxonomy, muscleLanguage))
  const secondaryLabels = insight.secondary.map((muscle) => translateMuscle(muscle, taxonomy, muscleLanguage))
  const stabilizerLabels = roleEntries(localExercise.stabilizers, taxonomy, muscleLanguage)
  const sourceTags = Array.isArray(localExercise.tags) ? localExercise.tags : []
  const inboxFileId = localExercise.file_id || localExercise.inbox_entry?.file_id || null
  const inboxUserId = localExercise.userId || localExercise.inbox_entry?.userId || null
  const inboxStatus = localExercise.inbox_status || localExercise.status || localExercise.inbox_entry?.status || null
  const inboxStatusMeta = getInboxStatusMeta(inboxStatus)
  const mergeCandidate = localExercise.mergeCandidate || localExercise.inbox_entry?.mergeCandidate || null
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

  function handleSourceSaved(value) {
    const next = { ...value, file_id: inboxFileId, userId: inboxUserId, enriched: value }
    setLocalExercise(next)
    onExerciseChange?.(next)
    if (inboxFileId) publishInboxUpdate('source_linked')
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

      <div className="absolute inset-x-0 bottom-0 md:inset-3 md:bottom-3">
        <div
          className="mx-auto h-[94vh] md:h-full w-full max-w-none rounded-t-[28px] md:rounded-[32px] overflow-hidden shadow-2xl"
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
                    Coach Sheet
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
                    {insight.category && insight.category !== 'n/a' && <MetaPill>{insight.category}</MetaPill>}
                    {insight.equipment && insight.equipment !== 'n/a' && <MetaPill>{insight.equipment}</MetaPill>}
                    {insight.movement?.pattern && <MetaPill tone="accent">{insight.movement.pattern}</MetaPill>}
                    {exerciseId && exerciseId !== displayName && <MetaPill>{exerciseId}</MetaPill>}
                    {localExercise.origin?.type && <MetaPill>{localExercise.origin.type}</MetaPill>}
                    {localExercise.source && <MetaPill>{localExercise.source}</MetaPill>}
                    {(() => {
                      const german = cleanText(localExercise.german)
                      const english = cleanText(localExercise.english || localExercise.name)
                      const extras = [german, english].filter((value) => value && value !== displayName)
                      const unique = [...new Set(extras)]
                      return unique.length ? <MetaPill>{unique.join(' · ')}</MetaPill> : null
                    })()}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                  <button onClick={copySheet} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                    <span className="inline-flex items-center gap-2"><Copy size={14} /> Copy</span>
                  </button>
                  <button onClick={downloadSheet} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                    <span className="inline-flex items-center gap-2"><Download size={14} /> MD</span>
                  </button>
                  <button onClick={() => exportSheet('sheet')} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                    Export Sheet
                  </button>
                  <button onClick={() => exportSheet('lesson')} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                    Export Lesson
                  </button>
                  <button onClick={onClose} className="rounded-2xl p-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted)' }}>
                    <X size={18} />
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[minmax(340px,460px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(380px,560px)_minmax(0,1fr)]">
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

                  <div className="grid gap-4 grid-cols-1 min-[1700px]:grid-cols-2">
                    <SourceProvenanceCard exercise={localExercise} source="wger" mergeCandidate={mergeCandidate} />
                    <SourceProvenanceCard exercise={localExercise} source="yuhonas" mergeCandidate={mergeCandidate} />
                  </div>

                  {(inboxFileId || localExercise.approved_at || localExercise.review_state?.status === 'approved' || ['expert', 'approved'].includes(localExercise.source)) && (
                    <SourceEditor
                      key={inboxFileId || exerciseId}
                      id={inboxFileId || exerciseId}
                      target={inboxFileId ? 'inbox' : 'approved'}
                      exercise={localExercise}
                      candidates={mergeCandidate}
                      onSaved={handleSourceSaved}
                    />
                  )}

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
                      <div className="flex justify-end">
                        <button onClick={handleSaveLesson} disabled={savingLesson || loadingLesson} className="rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider" style={{ background: 'rgba(94,234,212,0.14)', border: '1px solid rgba(94,234,212,0.28)', color: 'var(--accent)' }}>
                          {savingLesson ? <span className="inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> save</span> : <span className="inline-flex items-center gap-2"><Save size={12} /> save</span>}
                        </button>
                      </div>

                      <div className={AUTO_FIT_GRID}>
                        <ShellCard title="Do" eyebrow="Cues" tone="accent">
                          <div className="space-y-4">
                            <Field label="Coaching Cues" value={lessonDraft.coaching_cues} onChange={(value) => setLessonDraft((prev) => ({ ...prev, coaching_cues: value }))} rows={8} placeholder="Eine Zeile pro Cue" />
                            <Field label="Feel Cues" value={lessonDraft.feel_cues} onChange={(value) => setLessonDraft((prev) => ({ ...prev, feel_cues: value }))} rows={6} placeholder="Eine Zeile pro Cue" />
                          </div>
                        </ShellCard>

                        <ShellCard title="Don't" eyebrow="Fehlerbilder" tone="warn">
                          <Field
                            label="Common Errors"
                            value={lessonDraft.common_errors}
                            onChange={(value) => setLessonDraft((prev) => ({ ...prev, common_errors: value }))}
                            rows={14}
                            placeholder="error | anatomical reason | correction | cue"
                          />
                        </ShellCard>
                      </div>

                      <ShellCard title="Trainer Voice" eyebrow="Erklärung">
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
                          <Field label="Simple" value={lessonDraft.trainer_simple} onChange={(value) => setLessonDraft((prev) => ({ ...prev, trainer_simple: value }))} rows={5} />
                          <Field label="Technical" value={lessonDraft.trainer_technical} onChange={(value) => setLessonDraft((prev) => ({ ...prev, trainer_technical: value }))} rows={5} />
                          <Field label="Client Friendly" value={lessonDraft.trainer_client_friendly} onChange={(value) => setLessonDraft((prev) => ({ ...prev, trainer_client_friendly: value }))} rows={5} />
                        </div>
                      </ShellCard>

                      <details className="rounded-[24px] p-4 md:p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
                        <summary className="cursor-pointer text-sm font-black" style={{ color: 'var(--muted)' }}>Titel, Ziele, Quiz</summary>
                        <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
                          <Field label="Titel" value={lessonDraft.title} onChange={(value) => setLessonDraft((prev) => ({ ...prev, title: value }))} rows={2} />
                          <Field label="Movement Pattern" value={lessonDraft.movement_pattern} onChange={(value) => setLessonDraft((prev) => ({ ...prev, movement_pattern: value }))} rows={2} disabled />
                          <Field label="Learning Goal Kurz" value={lessonDraft.learning_goal_short} onChange={(value) => setLessonDraft((prev) => ({ ...prev, learning_goal_short: value }))} rows={3} />
                          <Field label="Learning Goal Detailliert" value={lessonDraft.learning_goal_detailed} onChange={(value) => setLessonDraft((prev) => ({ ...prev, learning_goal_detailed: value }))} rows={4} />
                          <Field label="Quiz Question" value={lessonDraft.quiz_question} onChange={(value) => setLessonDraft((prev) => ({ ...prev, quiz_question: value }))} rows={3} />
                          <Field label="Quiz Answer" value={lessonDraft.quiz_answer} onChange={(value) => setLessonDraft((prev) => ({ ...prev, quiz_answer: value }))} rows={4} />
                        </div>
                      </details>
                    </div>
                  )}

                  {activeView === 'preview' && (
                    <div className="space-y-5">
                      <div className={AUTO_FIT_GRID}>
                        <ShellCard title="Do" eyebrow="Cues" tone="accent">
                          <div className="space-y-4">
                            <RawList title="Coaching Cues" items={textToLines(lessonDraft.coaching_cues)} empty="Noch keine Cues." />
                            <RawList title="Feel Cues" items={textToLines(lessonDraft.feel_cues)} empty="Noch keine Feel-Cues." />
                          </div>
                        </ShellCard>

                        <ShellCard title="Don't" eyebrow="Fehlerbilder" tone="warn">
                          {textToErrors(lessonDraft.common_errors).length ? (
                            <div className="space-y-3">
                              {textToErrors(lessonDraft.common_errors).map((err) => (
                                <div key={`${err.error}-${err.correction}`} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
                                  <div className="text-sm font-black" style={{ color: 'var(--ink)' }}>{err.error}</div>
                                  {err.anatomical_reason && <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{err.anatomical_reason}</div>}
                                  {err.correction && <div className="text-sm mt-1" style={{ color: 'var(--accent)' }}>{err.correction}</div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm" style={{ color: 'var(--muted)' }}>Noch keine Fehlerbilder.</div>
                          )}
                        </ShellCard>
                      </div>

                      {roleBlocks.length > 0 && (
                        <ShellCard title="Muskelrollen" eyebrow="Funktionssicht">
                          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
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
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
                          <RawList title="Original Instructions" items={rawInstructions} empty="Keine Instructions vorhanden." />
                          <div className="space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--muted)' }}>Original Description</div>
                            <div className="rounded-2xl p-3 text-sm leading-6" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                              {insight.rawDescription || localExercise.original_description || 'Keine Beschreibung vorhanden.'}
                            </div>
                          </div>
                        </div>
                      </ShellCard>

                      <div className={AUTO_FIT_GRID}>
                        <ShellCard title="Field Snapshot" eyebrow="Exercise">
                          <div className="space-y-2">
                            {cleanText(localExercise.german) && cleanText(localExercise.german) !== displayName && (
                              <StatRow label="German" value={localExercise.german} />
                            )}
                            {cleanText(localExercise.english) && cleanText(localExercise.english) !== displayName && (
                              <StatRow label="English" value={localExercise.english} />
                            )}
                            <StatRow label="Category" value={localExercise.category || 'n/a'} />
                            <StatRow label="Type" value={localExercise.type || 'n/a'} />
                            <StatRow label="Equipment" value={Array.isArray(localExercise.equipment) ? localExercise.equipment.join(', ') : (localExercise.equipment || 'n/a')} />
                            <StatRow label="Pattern" value={insight.movement?.pattern || 'n/a'} />
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

                        <ShellCard title="Lesson Structure" eyebrow="Raw JSON">
                          <JsonBlock title="lesson" value={lesson} />
                        </ShellCard>
                        <ShellCard title="Extended Anatomy Blocks" eyebrow="Raw JSON">
                          <JsonBlock title="joint_actions" value={lesson?.joint_actions || lessonDraft.joint_actions} />
                          <JsonBlock title="body_highlighter_regions" value={lesson?.body_highlighter_regions || lessonDraft.body_highlighter_regions} />
                          <JsonBlock title="muscle_roles" value={lesson?.muscle_roles || lessonDraft.muscle_roles} />
                        </ShellCard>
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
