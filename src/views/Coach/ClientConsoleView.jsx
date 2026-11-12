import { useEffect, useMemo, useRef } from 'react'
import { Brain, Check, Dumbbell } from 'lucide-react'
import { formatRestDays, macroLines } from './clientConsoleStats.js'
import { feedItemsOnDate, formatFeedDate, highlightStatus, normalizeFeedDate } from './feedHighlight.js'

function exerciseSets(exercise) {
  if (Array.isArray(exercise?.setsArray) && exercise.setsArray.length) return exercise.setsArray
  if (Array.isArray(exercise?.sets) && exercise.sets.length) return exercise.sets
  return []
}

function setLabel(set, index) {
  const reps = set?.reps ?? 0
  const weight = set?.weight ? ` @ ${set.weight} kg` : ''
  return `Satz ${index + 1}: ${reps} Wdh${weight}`
}

function macroEmptyCopy(access) {
  if (access === 'denied') return 'Makronährstoffe sind mit diesem Coach-Zugang nicht freigegeben.'
  if (access === 'error') return 'Makronährstoffe konnten gerade nicht geladen werden.'
  return 'Noch keine Makronährstoffe erfasst.'
}

export default function ClientConsoleView({
  model,
  loading = false,
  error = '',
  commentError = '',
  nutritionAccess = 'ok',
  comments = {},
  submittingId = null,
  onCommentChange,
  onCommentSubmit,
  onRetry,
  highlightDate = '',
  onDismissHighlight,
}) {
  const workouts = model?.workouts || []
  const highlightActive = Boolean(normalizeFeedDate(highlightDate))
  const highlighted = useMemo(() => feedItemsOnDate(workouts, highlightDate), [workouts, highlightDate])
  const highlightedIds = useMemo(() => new Set(highlighted.map((item) => item.id)), [highlighted])
  const firstId = highlighted[0]?.id || ''
  const anchorRef = useRef(null)
  const scrolledFor = useRef('')

  useEffect(() => {
    if (loading || !firstId) return
    const key = `${highlightDate}:${firstId}`
    if (scrolledFor.current === key) return
    scrolledFor.current = key
    const node = anchorRef.current
    if (!node) return
    node.scrollIntoView({ block: 'center' })
    node.focus({ preventScroll: true })
  }, [loading, highlightDate, firstId])

  const highlightBanner = highlightActive && !loading && !error ? (
    <div
      role="status"
      data-testid="console-highlight-banner"
      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-fit-accent/40 bg-fit-accent/10 px-4 py-3 text-xs text-fit-ink"
    >
      <p>{highlightStatus({ dateLabel: formatFeedDate(highlightDate), matched: highlighted.length, hidden: 0 })}</p>
      {onDismissHighlight && (
        <button type="button" onClick={onDismissHighlight} className="rounded-full border border-fit-line/50 px-3 py-1.5 font-semibold text-fit-ink">
          Markierung schließen
        </button>
      )}
    </div>
  ) : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" role="status">
        <div className="spinner" />
        <span className="sr-only">Konsole wird geladen</span>
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="card p-6 text-sm text-fit-red">
        {error}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-3 underline">
            Erneut versuchen
          </button>
        )}
      </div>
    )
  }

  const lines = macroLines(model?.macros)

  return (
    <section className="space-y-4" aria-label="Klientenkonsole">
      {highlightBanner}
      {commentError && <p role="alert" className="text-sm text-fit-red">{commentError}</p>}
      <header className="grid gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <p className="text-xs font-medium text-fit-muted">Trainingslogs</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-fit-ink">{model?.workoutCount || 0}</p>
          <p className="mt-1 text-xs text-fit-dim">Kraft-Einheiten dieses Klienten</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-medium text-fit-muted">Ø Ruhephase</p>
          {model?.averageRestDays == null ? (
            <p className="mt-2 text-sm text-fit-muted">Noch keine zweite Einheit im selben Block.</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-fit-ink">{formatRestDays(model.averageRestDays)}</p>
              <p className="mt-1 text-xs text-fit-dim">
                {model.restPhases} {model.restPhases === 1 ? 'Abstand' : 'Abstände'} zwischen gleichen Blöcken
              </p>
            </>
          )}
        </article>
        <article className="card p-4">
          <p className="text-xs font-medium text-fit-muted">Ø Makronährstoffe</p>
          {lines.length ? (
            <>
              <ul className="mt-2 space-y-1 text-sm font-semibold text-fit-ink">
                {lines.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <p className="mt-1 text-xs text-fit-dim">Mittel über {model.macros.days} {model.macros.days === 1 ? 'Tag' : 'Tage'} mit Eintrag</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-fit-muted">{macroEmptyCopy(nutritionAccess)}</p>
          )}
        </article>
      </header>

      {!workouts.length && (
        <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
          <Dumbbell size={36} className="mb-3 text-fit-dim" />
          <h3 className="text-base font-semibold text-fit-ink">Keine Trainingslogs</h3>
          <p className="mt-1 max-w-sm text-xs text-fit-muted">Dieser Klient hat noch keine Kraft-Einheit erfasst.</p>
        </div>
      )}

      <div className="space-y-3">
        {workouts.map((log) => {
          const exercises = Array.isArray(log.exercises) ? log.exercises : []
          const marked = highlightedIds.has(log.id)
          return (
            <article
              key={log.id}
              ref={log.id === firstId ? anchorRef : undefined}
              tabIndex={log.id === firstId ? -1 : undefined}
              data-testid={marked ? 'console-highlight-card' : undefined}
              aria-current={marked ? 'date' : undefined}
              className="card space-y-3 p-4 outline-none sm:p-5"
              style={marked ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent)' } : undefined}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-fit-ink">{log.block || log.trainingsart || 'Training'}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fit-dim">
                    <span>{log.date || 'Ohne Datum'}</span>
                    {marked && <span className="font-medium text-fit-accent">Dieser Tag</span>}
                  </p>
                </div>
                {log.restDays != null && (
                  <span className="vos-tag text-fit-accent">{formatRestDays(log.restDays)} Ruhe</span>
                )}
              </div>
              {exercises.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {exercises.map((exercise, index) => {
                    const sets = exerciseSets(exercise)
                    return (
                      <li key={`${log.id}-${exercise.exercise_id || exercise.id || index}`} className="rounded-2xl border border-fit-line/30 bg-fit-bg2/40 p-3">
                        <p className="text-xs font-semibold text-fit-ink">{exercise.name || 'Übung'}</p>
                        {sets.length ? (
                          <ul className="mt-2 space-y-1">
                            {sets.map((set, setIndex) => (
                              <li key={set.id || setIndex} className="text-xs text-fit-muted">{setLabel(set, setIndex)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-fit-muted">
                            {exercise.sets || 0} × {exercise.reps || 0}{exercise.weight ? ` @ ${exercise.weight} kg` : ''}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-xs text-fit-muted">Keine Übungen in diesem Log.</p>
              )}
              {onCommentSubmit && (
                <form
                  className="space-y-2 border-t border-fit-line/20 pt-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onCommentSubmit(log)
                  }}
                >
                  <label className="flex items-center gap-2 text-xs text-fit-dim" htmlFor={`feedback-${log.id}`}>
                    <Brain size={13} className="text-fit-accent" /> Kommentar
                  </label>
                  <textarea
                    id={`feedback-${log.id}`}
                    value={comments[log.id] || ''}
                    onChange={(event) => onCommentChange?.(log.id, event.target.value)}
                    placeholder="Feedback zu dieser Einheit"
                    className="h-16 w-full resize-none rounded-xl border border-fit-line/60 bg-fit-bg2 p-3 text-xs text-fit-ink outline-none focus:border-fit-accent/50"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingId === log.id || !(comments[log.id] || '').trim()}
                      className="inline-flex items-center gap-2 rounded-full bg-fit-accent px-4 py-2 text-xs font-semibold text-fit-bg disabled:opacity-40"
                    >
                      {submittingId === log.id ? 'Speichert…' : <><Check size={13} /> Senden</>}
                    </button>
                  </div>
                </form>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
