import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Search, X } from 'lucide-react'
import { createInboxDraft, describeCoachError, searchExercises } from '@db'
import { sourceIds } from '../../lib/db/shared/catalogSources.js'
import { useEscapeKey } from '../../hooks/useEscapeKey.js'

function exerciseKey(ex) {
  return String(ex?.exercise_id || ex?.id || '')
}

function exerciseLabel(ex) {
  return ex?.display_name || ex?.name || ex?.german || exerciseKey(ex) || 'Übung'
}

function draftSlug(ex) {
  const raw = exerciseKey(ex).replace(/^(wger_|yuhonas_|inbox_)/i, '').trim()
  if (raw) return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return exerciseLabel(ex).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || null
}

function sourceRefs(ex) {
  return {
    wger: sourceIds(ex, 'wger', true)[0] || null,
    yuhonas: sourceIds(ex, 'yuhonas', true)[0] || null,
  }
}

function mergeSourceRefs(primary, duplicate) {
  const a = sourceRefs(primary)
  const b = sourceRefs(duplicate)
  const conflicts = []
  if (a.wger && b.wger && String(a.wger) !== String(b.wger)) {
    conflicts.push(`wger: ${a.wger} vs ${b.wger}`)
  }
  if (a.yuhonas && b.yuhonas && String(a.yuhonas) !== String(b.yuhonas)) {
    conflicts.push(`yuhonas: ${a.yuhonas} vs ${b.yuhonas}`)
  }
  return {
    wger_id: a.wger || b.wger || null,
    yuhonas_id: a.yuhonas || b.yuhonas || null,
    conflicts,
  }
}

function SourceChip({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-fit-line/50 bg-fit-bg2 px-2 py-0.5 text-[11px] text-fit-dim">
      <strong className="text-fit-ink">{label}</strong>
      <span>{value || '—'}</span>
    </span>
  )
}

export default function MergeDuplicateModal({ primary, onClose, onCreated = null }) {
  const [query, setQuery] = useState(exerciseLabel(primary))
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEscapeKey(onClose, true)

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await searchExercises(query, 40)
        const primaryKey = exerciseKey(primary)
        setResults((data?.results || []).filter((item) => exerciseKey(item) !== primaryKey))
      } catch (err) {
        setResults([])
        setError(describeCoachError(err, 'Suche fehlgeschlagen'))
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query, primary])

  const plan = useMemo(() => {
    if (!selected) return null
    const merged = mergeSourceRefs(primary, selected)
    return {
      ...merged,
      display_name: exerciseLabel(primary),
      exercise_id: draftSlug(primary),
      duplicate_label: exerciseLabel(selected),
    }
  }, [primary, selected])

  async function handleCreate() {
    if (!plan) return
    if (!plan.wger_id && !plan.yuhonas_id) {
      setError('Beide Einträge haben keine wger-/yuhonas-ID.')
      return
    }
    if (plan.conflicts.length) {
      setError(`Konflikt bei gleicher Quelle: ${plan.conflicts.join(', ')}`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await createInboxDraft({
        display_name: plan.display_name,
        exercise_id: plan.exercise_id,
        wger_id: plan.wger_id,
        yuhonas_id: plan.yuhonas_id,
      })
      onCreated?.(result)
      onClose?.()
    } catch (err) {
      setError(describeCoachError(err, 'Draft konnte nicht angelegt werden'))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-fit-line bg-fit-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Mit Doppelung mergen"
      >
        <header className="flex items-start justify-between gap-3 border-b border-fit-line/40 px-4 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-fit-dim">Telefonbuch</div>
            <h3 className="mt-1 text-lg font-bold text-fit-ink">Mergen mit Doppelung</h3>
            <p className="mt-1 text-xs text-fit-dim">
              Primär: <strong className="text-fit-ink">{exerciseLabel(primary)}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-fit-dim hover:bg-fit-bg2" aria-label="Schließen">
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-fit-line/30 px-4 py-3">
          <div className="vos-search">
            <Search className="shrink-0 text-fit-dim" size={14} />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Doppelgänger suchen …"
            />
            {loading && <Loader2 className="shrink-0 animate-spin text-fit-accent" size={14} />}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {results.length === 0 && !loading && (
            <div className="p-6 text-center text-sm text-fit-dim">Keine Treffer.</div>
          )}
          <ul className="divide-y divide-fit-line/20">
            {results.map((ex) => {
              const refs = sourceRefs(ex)
              const active = selected && exerciseKey(selected) === exerciseKey(ex)
              return (
                <li key={exerciseKey(ex)}>
                  <button
                    type="button"
                    onClick={() => setSelected(ex)}
                    className={`flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors ${active ? 'bg-fit-accent/10' : 'hover:bg-fit-bg2/60'}`}
                  >
                    <div className="text-sm font-semibold text-fit-ink">{exerciseLabel(ex)}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <SourceChip label="src" value={ex.source || '—'} />
                      <SourceChip label="wger" value={refs.wger} />
                      <SourceChip label="yuhonas" value={refs.yuhonas} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <footer className="space-y-3 border-t border-fit-line/40 px-4 py-3">
          {plan && (
            <div className="rounded-2xl border border-fit-line/40 bg-fit-bg2/50 p-3 text-xs text-fit-ink">
              <div className="font-semibold">Draft-Plan</div>
              <div className="mt-1 text-fit-dim">
                {plan.display_name} ← {plan.duplicate_label}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <SourceChip label="id" value={plan.exercise_id} />
                <SourceChip label="wger" value={plan.wger_id} />
                <SourceChip label="yuhonas" value={plan.yuhonas_id} />
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-fit-red">{error}</p>}
          <button
            type="button"
            disabled={!plan || busy}
            onClick={handleCreate}
            className="vos-btn min-h-[44px] w-full disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> lege Draft an…</span>
            ) : (
              'Inbox-Draft anlegen (ohne Enrichment)'
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
