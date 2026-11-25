import { sourceIds } from '../lib/db/shared/catalogSources.js'
import './exercise-inspector.css'
import SourceEditor from '../views/Inbox/SourceEditor.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
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

// ── Coach-Sheet-Konzept ──────────────────────────────────────────────────────
// Das Sheet ist der Spickzettel, um eine Übung am Klienten zu coachen. Die
// Reihenfolge folgt dem Ablauf in der Einheit:
//   1. Worum es geht   — learning_goal.short + trainer_explanation.client_friendly
//   2. Cues            — coaching_cues (was ich sage) / feel_cues (was der Klient spürt)
//   3. Fehlerbilder    — common_errors: Fehler → Korrektur (+ Kurz-Cue, Warum)
//   4. Varianten       — variations_teach
//   5. Fachwissen      — trainer simple/technical, learning_goal.detailed, Quiz, Anatomie
// Felder, die das Sheet nicht editiert (region, joint_actions, quiz_prompts …),
// bleiben beim Speichern erhalten (Backend merged in die bestehende Lesson).

function linesToText(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function textToLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const EMPTY_ERROR = { error: '', anatomical_reason: '', correction: '', coaching_cue: '' }
const EMPTY_VARIATION = { variation: '', lesson: '' }
const EMPTY_QUIZ = { question: '', answer: '' }

function asObjectList(value, keys) {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => Object.fromEntries(keys.map((key) => [key, String(item[key] || '').trim()])))
}

function errorList(value) {
  return (Array.isArray(value) ? value : []).map((item) => {
    if (!item || typeof item !== 'object') return { ...EMPTY_ERROR, error: String(item || '').trim() }
    return {
      error: String(item.error || '').trim(),
      anatomical_reason: String(item.anatomical_reason || item.anatomicalReason || item.reason || '').trim(),
      correction: String(item.correction || item.fix || '').trim(),
      coaching_cue: String(item.coaching_cue || item.coachingCue || '').trim(),
    }
  })
}

function hasContent(item) {
  return Object.values(item).some((value) => String(value || '').trim())
}

function buildLessonDraft(exercise, lesson) {
  const record = exercise && typeof exercise === 'object' ? exercise : {}
  const source = lesson && typeof lesson === 'object' ? lesson : {}
  return {
    title: source.title || record.display_name || record.displayName || record.name || '',
    learning_goal_short: source.learning_goal?.short || '',
    learning_goal_detailed: source.learning_goal?.detailed || '',
    trainer_simple: source.trainer_explanation?.simple || '',
    trainer_technical: source.trainer_explanation?.technical || '',
    trainer_client_friendly: source.trainer_explanation?.client_friendly || '',
    coaching_cues: linesToText(source.coaching_cues),
    feel_cues: linesToText(source.feel_cues),
    common_errors: errorList(source.common_errors),
    variations_teach: asObjectList(source.variations_teach, ['variation', 'lesson']),
    quiz: asObjectList(source.quiz, ['question', 'answer']),
  }
}

function lessonDraftToPayload(exerciseId, draft) {
  // Nur was das Sheet editiert — movement_pattern, joint_actions, muscle_roles,
  // region usw. lässt der Server aus der bestehenden Lesson stehen.
  return {
    exercise_id: exerciseId,
    title: draft.title,
    learning_goal: {
      short: draft.learning_goal_short,
      detailed: draft.learning_goal_detailed,
    },
    trainer_explanation: {
      simple: draft.trainer_simple,
      technical: draft.trainer_technical,
      client_friendly: draft.trainer_client_friendly,
    },
    coaching_cues: textToLines(draft.coaching_cues),
    feel_cues: textToLines(draft.feel_cues),
    common_errors: draft.common_errors.filter(hasContent),
    variations_teach: draft.variations_teach.filter(hasContent),
    quiz: draft.quiz.filter(hasContent),
  }
}

function patternLabel(pattern) {
  const value = typeof pattern === 'string' ? pattern : pattern?.primary || ''
  return value.replace(/_/g, ' ')
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

function ShellCard({ title, children, actions = null }) {
  return <section className="ei-section">
    <div className="ei-section-heading"><h3>{title}</h3>{actions}</div>
    {children}
  </section>
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
    statusLabel = 'Zuordnung offen'
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
        {detail.candidate && !detail.ids.length && (
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
function SectionLabel({ children }) {
  return (
    <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--muted)' }}>{children}</div>
  )
}

function Input({ label, value, onChange, placeholder = '' }) {
  return (
    <label className="block space-y-1">
      {label && <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{label}</div>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: 'rgba(0,0,0,0.12)', color: 'var(--ink)', border: '1px solid var(--line)' }}
      />
    </label>
  )
}

// Liste strukturierter Einträge (Fehlerbilder, Varianten, Quiz) — eine Karte
// pro Eintrag statt „a | b | c"-Zeilen im Textfeld.
function RowListEditor({ items, onChange, empty, addLabel, renderRow }) {
  const update = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const remove = (index) => onChange(items.filter((_, i) => i !== index))
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="rounded-2xl p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
          {renderRow(item, (patch) => update(index, patch))}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => remove(index)}
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
              style={{ color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <Trash2 size={12} /> Entfernen
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { ...empty }])}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
        style={{ background: 'var(--bg2)', border: '1px dashed var(--line)', color: 'var(--ink)' }}
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  )
}

function Bullets({ items, empty }) {
  if (!items.length) return <div className="text-sm" style={{ color: 'var(--muted)' }}>{empty}</div>
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm leading-6" style={{ color: 'var(--ink)' }}>
          <span style={{ color: 'var(--accent)' }}>›</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function SheetView({ draft, lesson, roleBlocks, jointActions, muscleLanguage, taxonomy, onEdit }) {
  const coachingCues = textToLines(draft.coaching_cues)
  const feelCues = textToLines(draft.feel_cues)
  const errors = draft.common_errors.filter(hasContent)
  const variations = draft.variations_teach.filter(hasContent)
  const quiz = draft.quiz.filter(hasContent)
  const knowledge = [
    { label: 'Einfach erklärt', value: draft.trainer_simple },
    { label: 'Technisch', value: draft.trainer_technical },
    { label: 'Lernziel (Ausbildung)', value: draft.learning_goal_detailed },
  ].filter((item) => item.value)
  const missing = [
    !draft.learning_goal_short && 'Ziel',
    !draft.trainer_client_friendly && 'Satz an den Klienten',
    !coachingCues.length && 'Cues',
    !errors.length && 'Fehlerbilder',
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      {missing.length > 0 && (
        <button
          type="button"
          onClick={onEdit}
          className="w-full text-left rounded-2xl px-4 py-3 text-sm"
          style={toneColor('warn')}
        >
          Noch leer: {missing.join(', ')} — <span className="underline">ergänzen</span>
        </button>
      )}

      <ShellCard title="Worum es geht" eyebrow="1 · Ziel" tone="accent">
        <div className="space-y-3">
          <div className="text-base md:text-lg font-semibold leading-7" style={{ color: 'var(--ink)' }}>
            {draft.learning_goal_short || <span style={{ color: 'var(--muted)' }}>Kein Ziel formuliert.</span>}
          </div>
          {draft.trainer_client_friendly && (
            <div className="rounded-2xl px-4 py-3 text-sm leading-6" style={{ background: 'rgba(0,0,0,0.14)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] mb-1" style={{ color: 'var(--muted)' }}>Zum Klienten</div>
              „{draft.trainer_client_friendly}"
            </div>
          )}
          {lesson?.movement_pattern && <MetaPill tone="accent">{patternLabel(lesson.movement_pattern)}</MetaPill>}
        </div>
      </ShellCard>

      <div className={AUTO_FIT_GRID}>
        <ShellCard title="Was ich sage" eyebrow="2 · Coaching Cues">
          <Bullets items={coachingCues} empty="Noch keine Cues." />
        </ShellCard>
        <ShellCard title="Was der Klient spürt" eyebrow="2 · Feel Cues">
          <Bullets items={feelCues} empty="Noch keine Feel-Cues." />
        </ShellCard>
      </div>

      <ShellCard title="Fehlerbilder" eyebrow="3 · Sehen → Korrigieren" tone="warn">
        {errors.length ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
            {errors.map((err, index) => (
              <div key={index} className="rounded-2xl p-3 space-y-1.5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
                <div className="text-sm font-black" style={{ color: 'var(--ink)' }}>{err.error || 'Fehler'}</div>
                {err.correction && <div className="text-sm" style={{ color: 'var(--accent)' }}>→ {err.correction}</div>}
                {err.coaching_cue && err.coaching_cue !== err.correction && (
                  <MetaPill tone="accent">„{err.coaching_cue}"</MetaPill>
                )}
                {err.anatomical_reason && (
                  <div className="text-xs leading-5" style={{ color: 'var(--muted)' }}>Warum: {err.anatomical_reason}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm" style={{ color: 'var(--muted)' }}>Noch keine Fehlerbilder.</div>
        )}
      </ShellCard>

      {variations.length > 0 && (
        <ShellCard title="Varianten" eyebrow="4 · Anpassen">
          <div className="space-y-2">
            {variations.map((v, index) => (
              <div key={index} className="text-sm leading-6" style={{ color: 'var(--ink)' }}>
                <span className="font-black">{v.variation}</span>
                {v.lesson && <span style={{ color: 'var(--muted)' }}> — {v.lesson}</span>}
              </div>
            ))}
          </div>
        </ShellCard>
      )}

      <ShellCard title="Fachwissen" eyebrow="5 · Hintergrund & Ausbildung">
        <div className="space-y-4">
          {knowledge.map((item) => (
            <div key={item.label}>
              <SectionLabel>{item.label}</SectionLabel>
              <div className="text-sm leading-6" style={{ color: 'var(--ink)' }}>{item.value}</div>
            </div>
          ))}
          {roleBlocks.length > 0 && (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
              {roleBlocks.map((block) => (
                <div key={block.label}>
                  <SectionLabel>{block.label}</SectionLabel>
                  <TagCloud items={block.items} tone={block.tone} />
                </div>
              ))}
            </div>
          )}
          {jointActions.length > 0 && (
            <div>
              <SectionLabel>Gelenkaktionen</SectionLabel>
              <Bullets items={jointActions} empty="" />
            </div>
          )}
          {lesson?.muscle_anatomy && Object.keys(lesson.muscle_anatomy).length > 0 && (
            <div>
              <SectionLabel>Muskel-Anatomie</SectionLabel>
              <MuscleAnatomySection muscleAnatomy={lesson.muscle_anatomy} muscleLanguage={muscleLanguage} taxonomy={taxonomy} />
            </div>
          )}
          {quiz.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Prüfungsfragen</SectionLabel>
              {quiz.map((q, index) => (
                <details key={index} className="rounded-2xl px-3 py-2" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--line)' }}>
                  <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--ink)' }}>{q.question || 'Frage'}</summary>
                  <div className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>{q.answer || '—'}</div>
                </details>
              ))}
            </div>
          )}
          {!knowledge.length && !roleBlocks.length && !jointActions.length && !quiz.length && (
            <div className="text-sm" style={{ color: 'var(--muted)' }}>Noch kein Fachwissen hinterlegt.</div>
          )}
        </div>
      </ShellCard>
    </div>
  )
}

function EditView({ draft, setDraft }) {
  const set = (key) => (value) => setDraft((prev) => ({ ...prev, [key]: value }))
  return (
    <div className="space-y-5">
      <ShellCard title="Worum es geht" eyebrow="1 · Ziel" tone="accent">
        <div className="space-y-4">
          <Field label="Ziel in einem Satz (für dich)" value={draft.learning_goal_short} onChange={set('learning_goal_short')} rows={2} placeholder="z. B. Lat als Schulter-Beweger spüren — nicht als Armzug." />
          <Field label="Satz an den Klienten" value={draft.trainer_client_friendly} onChange={set('trainer_client_friendly')} rows={2} placeholder="So sagst du es in der Einheit, ohne Fachbegriffe." />
        </div>
      </ShellCard>

      <div className={AUTO_FIT_GRID}>
        <ShellCard title="Was ich sage" eyebrow="2 · Coaching Cues">
          <Field label="Eine Zeile pro Cue (externe Anweisung)" value={draft.coaching_cues} onChange={set('coaching_cues')} rows={7} placeholder="Schultern von den Ohren weg." />
        </ShellCard>
        <ShellCard title="Was der Klient spürt" eyebrow="2 · Feel Cues">
          <Field label="Eine Zeile pro Cue (Körpergefühl)" value={draft.feel_cues} onChange={set('feel_cues')} rows={7} placeholder="Breiter Schild, der sich zusammenzieht." />
        </ShellCard>
      </div>

      <ShellCard title="Fehlerbilder" eyebrow="3 · Sehen → Korrigieren" tone="warn">
        <RowListEditor
          items={draft.common_errors}
          onChange={set('common_errors')}
          empty={EMPTY_ERROR}
          addLabel="Fehlerbild hinzufügen"
          renderRow={(err, update) => (
            <>
              <Input label="Was ich sehe" value={err.error} onChange={(v) => update({ error: v })} placeholder="Schultern wandern nach oben" />
              <Input label="Korrektur" value={err.correction} onChange={(v) => update({ correction: v })} placeholder="Schulterblätter vor dem Zug nach unten setzen" />
              <Input label="Kurz-Cue (optional)" value={err.coaching_cue} onChange={(v) => update({ coaching_cue: v })} placeholder="Erst runter, dann ziehen." />
              <Input label="Warum (anatomisch, optional)" value={err.anatomical_reason} onChange={(v) => update({ anatomical_reason: v })} />
            </>
          )}
        />
      </ShellCard>

      <ShellCard title="Varianten" eyebrow="4 · Anpassen">
        <RowListEditor
          items={draft.variations_teach}
          onChange={set('variations_teach')}
          empty={EMPTY_VARIATION}
          addLabel="Variante hinzufügen"
          renderRow={(v, update) => (
            <>
              <Input label="Variante" value={v.variation} onChange={(val) => update({ variation: val })} placeholder="Neutral Grip" />
              <Input label="Wann / was ändert sich" value={v.lesson} onChange={(val) => update({ lesson: val })} placeholder="Schulterfreundlicher, mehr Brachialis." />
            </>
          )}
        />
      </ShellCard>

      <ShellCard title="Fachwissen" eyebrow="5 · Hintergrund & Ausbildung">
        <div className="space-y-4">
          <Field label="Titel der Lektion" value={draft.title} onChange={set('title')} rows={1} />
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
            <Field label="Einfach erklärt" value={draft.trainer_simple} onChange={set('trainer_simple')} rows={4} />
            <Field label="Technisch" value={draft.trainer_technical} onChange={set('trainer_technical')} rows={4} />
          </div>
          <Field label="Lernziel (Ausbildung)" value={draft.learning_goal_detailed} onChange={set('learning_goal_detailed')} rows={3} />
          <div>
            <SectionLabel>Prüfungsfragen</SectionLabel>
            <RowListEditor
              items={draft.quiz}
              onChange={set('quiz')}
              empty={EMPTY_QUIZ}
              addLabel="Frage hinzufügen"
              renderRow={(q, update) => (
                <>
                  <Input label="Frage" value={q.question} onChange={(v) => update({ question: v })} />
                  <Field label="Antwort" value={q.answer} onChange={(v) => update({ answer: v })} rows={2} />
                </>
              )}
            />
          </div>
        </div>
      </ShellCard>
    </div>
  )
}

const VIEW_OPTIONS = [
  { id: 'overview', label: 'Übersicht', icon: BookOpen },
  { id: 'sources', label: 'Quellen zusammenführen', icon: Plus },
  { id: 'sheet', label: 'Coaching', icon: BookOpen },
  { id: 'edit', label: 'Bearbeiten', icon: PencilLine },
  { id: 'raw', label: 'Rohdaten', icon: FileSearch },
]

export default function ExerciseInsightModal({ exercise, onExerciseChange, ...props }) {
  const changeExercise = useCallback((value) => {
    onExerciseChange?.((current) => {
      if (current !== exercise) return current
      return typeof value === 'function' ? value(current) : value
    })
  }, [exercise, onExerciseChange])
  if (!exercise) return null
  const key = JSON.stringify([
    exercise.userId || exercise.inbox_entry?.userId || '',
    exercise.file_id || exercise.inbox_entry?.file_id || '',
    exercise.exercise_id || exercise.id || exercise.name || '',
  ])
  return <ExerciseInspector key={key} {...props} exercise={exercise} onExerciseChange={changeExercise} />
}

function ExerciseInspector({ exercise, onClose, onExerciseChange, muscleLanguage = 'de', taxonomy = null }) {
  const [localExercise, setLocalExercise] = useState(exercise)
  const [lessonDraft, setLessonDraft] = useState(() => buildLessonDraft(exercise, exercise?.lesson))
  const [exerciseNotes, setExerciseNotes] = useState(exercise?.notes || '')
  const [loadingLesson, setLoadingLesson] = useState(false)
  const [savingLesson, setSavingLesson] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [reviewFeedback, setReviewFeedback] = useState(exercise?.coachFeedback || exercise?.feedback || '')
  const [reviewAction, setReviewAction] = useState('')
  const [notice, setNotice] = useState('')
  const [activeView, setActiveView] = useState('overview')

  const dialogRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus?.() }
  }, [])
  function trapFocus(event) {
    if (event.key !== 'Tab') return
    const controls = [...dialogRef.current.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex="0"]')]
      .filter(el => !el.disabled && el.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus() }
  }

  useEffect(() => {
    setLocalExercise(exercise)
    setLessonDraft(buildLessonDraft(exercise, exercise?.lesson))
    setExerciseNotes(exercise?.notes || '')
    setReviewFeedback(exercise?.coachFeedback || exercise?.feedback || '')
    setReviewAction('')
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
      if (result?.ok !== true) throw new Error('Coach Sheet Save fehlgeschlagen')
      // Firestore-Adapter liefert nur den Payload zurück — bestehende Lesson-
      // Felder (muscle_roles, joint_actions …) für die Anzeige behalten.
      const nextLesson = { ...(localExercise.lesson || {}), ...(result.lesson || payload) }
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
        display_name: displayName,
      }
      const result = await saveExercise(exerciseId, payload)
      if (result?.ok !== true) throw new Error('Exercise Save fehlgeschlagen')
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
      const result = await approveInbox(inboxFileId, inboxUserId)
      if (result?.ok !== true) throw new Error('Freigabe fehlgeschlagen')
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
    const next = { ...localExercise, ...value, file_id: inboxFileId, userId: inboxUserId, enriched: value }
    setLocalExercise(next)
    onExerciseChange?.(next)
    if (inboxFileId) publishInboxUpdate('source_linked')
  }

  async function handleRejectInbox() {
    if (!inboxFileId || reviewAction) return
    setReviewAction('reject')
    try {
      const result = await deleteInbox(inboxFileId, inboxUserId)
      if (result?.ok !== true) throw new Error('Verwerfen fehlgeschlagen')
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
  const hasLesson = Boolean(lesson) || !insight.isRaw
  const btn = { background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }

  return createPortal(
    <div className="ei-overlay">
      <div className="ei-scrim" onClick={onClose} />

      <div className="ei-position">
        <div
          className="ei-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-detail-title"
          ref={dialogRef} tabIndex={-1} onKeyDown={trapFocus}
        >
          <div className="flex h-full flex-col">
            <header className="border-b px-5 py-4 md:px-6" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h2 id="exercise-detail-title" className="text-2xl md:text-3xl font-black leading-tight" style={{ color: 'var(--ink)' }}>
                      {displayName}
                    </h2>
                    <MetaPill tone={hasLesson ? 'accent' : 'warn'}>
                      {inboxFileId ? inboxStatusMeta.label : hasLesson ? 'Coaching vorhanden' : 'Quelldaten'}
                    </MetaPill>
                    {loadingLesson && (
                      <MetaPill tone="default">
                        <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> lade Sheet</span>
                      </MetaPill>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {insight.equipment && insight.equipment !== 'Unbekannt' && <MetaPill>{insight.equipment}</MetaPill>}
                    {insight.category && insight.category !== 'Unbekannte Kategorie' && <MetaPill>{insight.category}</MetaPill>}
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
                  <button onClick={onClose} aria-label="Schließen" className="rounded-2xl p-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted)' }}>
                    <X size={18} />
                  </button>
                </div>
              </div>
            </header>

            <div className="ei-scroll">
              <div className="ei-content">
                <main className="ei-main space-y-5">
                  <nav className="ei-tabs" aria-label="Übungsdetails">
                    {VIEW_OPTIONS.map(({ id, label, icon: Icon }) => {
                      const active = activeView === id
                      return (
                        <button
                          key={id}
                          onClick={() => setActiveView(id)} aria-current={active ? 'page' : undefined}
                          className="rounded-full px-4 py-2 text-sm font-black transition-all"
                          style={active ? toneColor('accent') : {
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--muted)',
                          }}
                        >
                          <span className="inline-flex items-center gap-2"><Icon size={14} /> {label}</span>
                        </button>
                      )
                    })}
                    {activeView === 'edit' && (
                      <button aria-label="Coach Sheet speichern" onClick={handleSaveLesson} disabled={savingLesson || loadingLesson} className="ml-auto min-h-11 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider" style={toneColor('accent')}>
                        {savingLesson ? <span className="inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Speichern</span> : <span className="inline-flex items-center gap-2"><Save size={12} /> Speichern</span>}
                      </button>
                    )}
                  </nav>

                  {notice && (
                    <div role="status" className="rounded-2xl px-4 py-3 text-sm font-semibold" style={toneColor('accent')}>
                      {notice}
                    </div>
                  )}

                  {activeView === 'overview' && <div className="ei-overview">
                    <ShellCard title="Die Übung">
                      <p className="ei-description">{formatSourceText(localExercise.description || localExercise.original_description || insight.rawDescription) || 'Noch keine Beschreibung vorhanden.'}</p>
                      <div className="ei-facts"><div><SectionLabel>Primäre Muskeln</SectionLabel><TagCloud items={primaryLabels} /></div><div><SectionLabel>Sekundäre Muskeln</SectionLabel><TagCloud items={secondaryLabels} empty="Keine angegeben" /></div></div>
                    </ShellCard>
                    <ShellCard title="Ausführung"><Bullets items={rawInstructions.length ? rawInstructions : asStringList(localExercise.coaching_notes)} empty="Noch keine Anleitung vorhanden." /></ShellCard>
                    {asStringList(localExercise.biomechanical_warnings).length > 0 && <ShellCard title="Worauf du achten solltest"><Bullets items={asStringList(localExercise.biomechanical_warnings)} empty="" /></ShellCard>}
                    <ShellCard title="wger + yuhonas zusammenführen">
                      <p className="ei-description">Beide Quellen ergänzen einen gemeinsamen Übungseintrag. Ordne die passende Übungsvariante zu und prüfe anschließend die angereicherten Inhalte.</p>
                      <div className="ei-source-summary">{['wger', 'yuhonas'].map(source => <div key={source}><strong>{source}</strong><span>{sourceIds(localExercise, source, true).join(', ') || 'Passende Übung zuordnen'}</span></div>)}</div>
                      <button className="vos-btn" onClick={() => setActiveView('sources')}>Quellen prüfen und zusammenführen</button>
                    </ShellCard>
                  </div>}

                  {activeView === 'sheet' && (hasLesson ? (
                    <SheetView
                      draft={lessonDraft}
                      lesson={lesson}
                      roleBlocks={roleBlocks}
                      jointActions={insight.movement?.jointActions || []}
                      muscleLanguage={muscleLanguage}
                      taxonomy={taxonomy}
                      onEdit={() => setActiveView('edit')}
                    />
                  ) : (
                    <div className="space-y-5">
                      <ShellCard title="Noch kein Coach Sheet" eyebrow="Ungeprüfte Quelldaten" tone="warn">
                        <div className="space-y-4">
                          <div className="text-sm leading-6" style={{ color: 'var(--ink)' }}>
                            Für diese Übung gibt es nur die Original-Anleitung aus der Quell-Datenbank. Lege Ziel, Cues und Fehlerbilder an, damit das Sheet in der Einheit trägt.
                          </div>
                          <button onClick={() => setActiveView('edit')} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={toneColor('accent')}>
                            <PencilLine size={14} /> Sheet anlegen
                          </button>
                        </div>
                      </ShellCard>
                      <ShellCard title="Original-Anleitung" eyebrow="Quelle">
                        <div className="space-y-4">
                          <Bullets items={rawInstructions} empty="Keine Anleitung vorhanden." />
                          {insight.rawDescription && (
                            <div className="text-sm leading-6" style={{ color: 'var(--muted)' }}>{insight.rawDescription}</div>
                          )}
                        </div>
                      </ShellCard>
                    </div>
                  ))}

                  {activeView === 'sources' && <div className="space-y-5"><h3>Quellen zu einer Übung zusammenführen</h3>
                    <div className="mt-4 space-y-4">
                      {(inboxFileId || localExercise.approved_at || localExercise.review_state?.status === 'approved' || ['expert', 'approved'].includes(localExercise.source)) && (
                        <SourceEditor
                          key={inboxFileId || exerciseId}
                          id={inboxFileId || exerciseId}
                          initiallyOpen
                          target={inboxFileId ? 'inbox' : 'approved'}
                          exercise={localExercise}
                          candidates={mergeCandidate}
                          onSaved={handleSourceSaved}
                        />
                      )}
                      <details className="ei-tools"><summary>Originalquellen vergleichen</summary><div className={AUTO_FIT_GRID}>
                      <SourceProvenanceCard exercise={localExercise} source="wger" mergeCandidate={mergeCandidate} />
                      <SourceProvenanceCard exercise={localExercise} source="yuhonas" mergeCandidate={mergeCandidate} />
                      </div></details>
                    </div>
                  </div>}
                  {activeView === 'edit' && <EditView draft={lessonDraft} setDraft={setLessonDraft} />}

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
                            <StatRow label="ID" value={exerciseId} />
                            {cleanText(localExercise.german) && <StatRow label="German" value={localExercise.german} />}
                            {cleanText(localExercise.english) && <StatRow label="English" value={localExercise.english} />}
                            <StatRow label="Category" value={localExercise.category || 'n/a'} />
                            <StatRow label="Type" value={localExercise.type || 'n/a'} />
                            <StatRow label="Equipment" value={Array.isArray(localExercise.equipment) ? localExercise.equipment.join(', ') : (localExercise.equipment || 'n/a')} />
                            <StatRow label="Source" value={localExercise.source || localExercise.origin?.type || 'n/a'} />
                            <StatRow label="Pattern" value={patternLabel(lesson?.movement_pattern) || 'n/a'} />
                          </div>
                        </ShellCard>

                        <ShellCard title="Tags & Arrays" eyebrow="Exercise">
                          <div className="space-y-3">
                            <div><SectionLabel>Tags</SectionLabel><TagCloud items={sourceTags} /></div>
                            <div><SectionLabel>Primary Raw</SectionLabel><TagCloud items={(localExercise.primary_muscles || localExercise.primaryMuscles || []).map(String)} /></div>
                            <div><SectionLabel>Secondary Raw</SectionLabel><TagCloud items={(localExercise.secondary_muscles || localExercise.secondaryMuscles || []).map(String)} /></div>
                          </div>
                        </ShellCard>

                        <ShellCard title="Lesson Structure" eyebrow="Raw JSON">
                          <JsonBlock title="lesson" value={lesson} />
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
                </main>

                <aside className="ei-review space-y-4">
                  {inboxFileId && (
                    <ShellCard title="Übung prüfen" eyebrow="Coach Inbox" tone={inboxStatusMeta.tone}>
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
                          rows={4}
                          placeholder="Was soll Gemini bzw. das Backend beim Re-Enrichment präzisieren?"
                        />
                        <div className="grid gap-2">
                          <button onClick={handleApproveInbox} disabled={Boolean(reviewAction) || inboxStatus === 'approved'} className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left" style={toneColor('accent')}>
                            <span className="inline-flex items-center gap-2">
                              {reviewAction === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Freigeben
                            </span>
                          </button>
                          <button onClick={handleReenrichInbox} disabled={Boolean(reviewAction)} className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left" style={btn}>
                            <span className="inline-flex items-center gap-2">
                              {reviewAction === 'reenrich' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                              Neu anreichern
                            </span>
                          </button>
                          <button onClick={handleRejectInbox} disabled={Boolean(reviewAction) || inboxStatus === 'rejected'} className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-left" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                            <span className="inline-flex items-center gap-2">
                              {reviewAction === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              Verwerfen
                            </span>
                          </button>
                        </div>
                      </div>
                    </ShellCard>
                  )}

                  {activeView === 'edit' && <ShellCard
                    title="Meine Notizen"
                    eyebrow="Privat, nicht im Sheet"
                    actions={(
                      <button aria-label="Coach-Notizen speichern" onClick={handleSaveNotes} disabled={savingNotes} className="min-h-11 min-w-11 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider" style={btn}>
                        {savingNotes ? <span className="inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> save</span> : <span className="inline-flex items-center gap-2"><Save size={12} /> save</span>}
                      </button>
                    )}
                  >
                    <Field
                      label="Notizen"
                      value={exerciseNotes}
                      onChange={setExerciseNotes}
                      rows={5}
                      placeholder="Klienten-Erfahrungen, Qualitätsurteil, Merge-Hinweise."
                    />
                  </ShellCard>}
                  <details className="ei-tools"><summary>Exportieren</summary><div className="flex flex-wrap gap-2 mt-3">                  <button onClick={copySheet} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={btn} title="Sheet als Markdown kopieren">
                    <span className="inline-flex items-center gap-2"><Copy size={14} /> Copy</span>
                  </button>
                  <button onClick={downloadSheet} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={btn} title="Sheet als .md herunterladen">
                    <span className="inline-flex items-center gap-2"><Download size={14} /> MD</span>
                  </button>
                  <button onClick={() => exportSheet('sheet')} className="rounded-2xl px-3 py-2 text-sm font-semibold" style={btn} title="Nach Obsidian exportieren">
                    Export
                  </button>
</div></details>
                </aside>
              </div>
            </div>
            {inboxFileId && <footer className="ei-mobile-actions" aria-label="Übung prüfen">
              <button onClick={handleReenrichInbox} disabled={Boolean(reviewAction)} style={btn}><RefreshCw size={16} /> Verbessern</button>
              <button onClick={handleApproveInbox} disabled={Boolean(reviewAction) || inboxStatus === 'approved'} style={toneColor('accent')}><CheckCircle2 size={16} /> Freigeben</button>
            </footer>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
