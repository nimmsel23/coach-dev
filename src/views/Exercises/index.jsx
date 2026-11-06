import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, SlidersHorizontal, Database, X } from 'lucide-react'
import { getAllExercises } from '@db'
import { useExerciseMirrors } from '../../lib/exerciseDbs/useExerciseMirrors.js'
import { EXERCISE_DB_SOURCES } from '../../lib/exerciseDbs/sources.js'
import { FACETS, facetCounts, filterItems, sortItems } from './filters.js'
import { muscleDe } from './labels.js'
import Plate from './Plate.jsx'
import DetailSheet from './DetailSheet.jsx'
import SourcePanel from './SourcePanel.jsx'
import './exercises.css'

const PAGE = 48
const SORT_OPTIONS = [['az', 'A–Z'], ['muscle', 'Muskel'], ['level', 'Level']]

function isCurated(rec) {
  const tags = rec.tags || []
  return rec.source === 'expert' || rec.source === 'inbox' || tags.includes('expert')
}

// Katalog-Einträge (kuratiert/Inbox) per yuhonas-ID an die Mirror-Einträge
// hängen — der Atlas zeigt dann deutsche Namen und öffnet die Katalog-Lektion.
function buildCatalogIndex(records) {
  const map = new Map()
  for (const rec of records || []) {
    if (!isCurated(rec)) continue
    const ids = [rec.yuhonas_id, ...(rec.external_ids?.yuhonas || [])].filter(Boolean)
    for (const id of ids) if (!map.has(String(id))) map.set(String(id), rec)
  }
  return map
}

function Chip({ on, count, onClick, children }) {
  return (
    <button type="button" className="xa-chip" data-on={on} data-zero={count === 0} onClick={onClick}>
      {children}{count != null && <sup>{count}</sup>}
    </button>
  )
}

export default function Exercises({ onInspectExercise }) {
  const mirrors = useExerciseMirrors()
  const [catalog, setCatalog] = useState(() => new Map())
  const [q, setQ] = useState('')
  const [sel, setSel] = useState({})
  const [withSecondary, setWithSecondary] = useState(false)
  const [onlyCatalog, setOnlyCatalog] = useState(false)
  const [sort, setSort] = useState('az')
  const [showMore, setShowMore] = useState(false)
  const [showSources, setShowSources] = useState(null)
  const [source, setSource] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  const [openUid, setOpenUid] = useState(null)
  const sentinelRef = useRef(null)

  useEffect(() => {
    let alive = true
    getAllExercises()
      .then((records) => { if (alive) setCatalog(buildCatalogIndex(records)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const all = useMemo(() => {
    const merged = []
    for (const s of EXERCISE_DB_SOURCES) {
      for (const ex of mirrors.items[s.id] || []) {
        merged.push({ ...ex, catalog: catalog.get(String(ex.id)) || null })
      }
    }
    return merged
  }, [mirrors.items, catalog])

  const loadedSources = EXERCISE_DB_SOURCES.filter((s) => mirrors.statuses[s.id])
  const ctx = useMemo(
    () => ({ q, sel, withSecondary, onlyCatalog, source }),
    [q, sel, withSecondary, onlyCatalog, source],
  )
  const list = useMemo(() => sortItems(filterItems(all, ctx), sort), [all, ctx, sort])
  const facetData = useMemo(
    () => FACETS.map((facet) => ({ facet, entries: facetCounts(all, ctx, facet) })),
    [all, ctx],
  )
  const activeCount = Object.values(sel).reduce((n, set) => n + set.size, 0) + (onlyCatalog ? 1 : 0)

  useEffect(() => { setLimit(PAGE) }, [ctx, sort])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return undefined
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + PAGE)
    }, { rootMargin: '600px' })
    io.observe(node)
    return () => io.disconnect()
  }, [list.length, limit])

  const toggle = useCallback((key, value) => {
    setSel((prev) => {
      const next = new Set(prev[key] || [])
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return { ...prev, [key]: next }
    })
  }, [])

  function reset() {
    setQ('')
    setSel({})
    setOnlyCatalog(false)
  }

  const openIndex = openUid ? list.findIndex((ex) => ex.uid === openUid) : -1
  const openEx = openIndex >= 0 ? list[openIndex] : null
  const step = useCallback((delta) => {
    if (!list.length || openIndex < 0) return
    setOpenUid(list[(openIndex + delta + list.length) % list.length].uid)
  }, [list, openIndex])
  const openPlate = useCallback((ex) => setOpenUid(ex.uid), [])

  const hasData = all.length > 0
  const sourcesOpen = showSources ?? (mirrors.ready && !hasData)
  const updateAvailable = Object.values(mirrors.updates).some((u) => u?.available)

  return (
    <div className="xa space-y-7">
      {/* Hero */}
      <header className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="xa-label mb-2">Übungs-Atlas · {hasData ? `${all.length} Tafeln auf diesem Gerät` : 'noch keine Tafeln'}</div>
            <div className="xa-count">{hasData ? list.length : '—'}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowSources(!sourcesOpen)}
            className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-colors ${sourcesOpen ? 'bg-fit-accent text-fit-bg border-fit-accent' : 'border-fit-line text-fit-muted hover:text-fit-ink'}`}
          >
            <Database size={14} /> Quellen{updateAvailable && !sourcesOpen ? ' •' : ''}
          </button>
        </div>
        <div className="xa-rule" />
        {sourcesOpen && <SourcePanel mirrors={mirrors} />}
      </header>

      {!mirrors.ready && <div className="xa-label py-16 text-center">lädt …</div>}

      {mirrors.ready && !hasData && (
        <div className="py-10 text-center space-y-3">
          <p className="xa-serif text-2xl text-fit-ink m-0">Der Atlas liest nur vom Gerät.</p>
          <p className="text-sm text-fit-muted max-w-md mx-auto m-0">
            Lade eine Übungs-DB oben auf dieses Gerät — danach funktioniert der Atlas auch offline.
            Weitere Quellen werden an derselben Stelle ergänzt.
          </p>
        </div>
      )}

      {hasData && (
        <>
          <div className="xa-controls -mx-4 px-4 sm:-mx-10 sm:px-10 lg:-mx-16 lg:px-16 py-3 space-y-3 border-b border-fit-line">
            <div className="flex items-center gap-2">
              <label className="flex-1 min-w-0 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-fit-line bg-fit-card focus-within:border-fit-accent transition-colors">
                <Search size={15} className="text-fit-dim shrink-0" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Übung, Muskel, Equipment …"
                  className="w-full min-w-0 bg-transparent border-none outline-none text-sm text-fit-ink placeholder:text-fit-dim"
                />
                {q && <button type="button" onClick={() => setQ('')} aria-label="Suche leeren" className="text-fit-dim"><X size={14} /></button>}
              </label>
              <button
                type="button" onClick={() => setShowMore(!showMore)} aria-label="Filter"
                className={`relative shrink-0 p-3 rounded-2xl border transition-colors ${showMore ? 'bg-fit-accent text-fit-bg border-fit-accent' : 'border-fit-line text-fit-muted'}`}
              >
                <SlidersHorizontal size={16} />
                {activeCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-fit-accent text-fit-bg text-[10px] font-black grid place-items-center">{activeCount}</span>}
              </button>
            </div>

            {/* Muskel-Reihe immer sichtbar */}
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5">
              {facetData[0].entries.map(([value, count]) => (
                <Chip key={value} on={!!sel.muscle?.has(value)} count={count} onClick={() => toggle('muscle', value)}>
                  {muscleDe(value)}
                </Chip>
              ))}
            </div>

            {showMore && (
              <div className="space-y-3 pt-1">
                {facetData.slice(1).map(({ facet, entries }) => entries.length > 0 && (
                  <div key={facet.key} className="flex items-start gap-3">
                    <span className="xa-label w-20 shrink-0 pt-1.5">{facet.title}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map(([value, count]) => (
                        <Chip key={value} on={!!sel[facet.key]?.has(value)} count={count} onClick={() => toggle(facet.key, value)}>
                          {facet.label(value)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Chip on={withSecondary} onClick={() => setWithSecondary(!withSecondary)}>Muskel auch sekundär</Chip>
                  <Chip on={onlyCatalog} onClick={() => setOnlyCatalog(!onlyCatalog)}>Nur mit Katalog-Eintrag</Chip>
                  {loadedSources.length > 1 && loadedSources.map((s) => (
                    <Chip key={s.id} on={source === s.id} onClick={() => setSource(source === s.id ? null : s.id)}>{s.label}</Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="xa-label mr-1">Sortierung</span>
                {SORT_OPTIONS.map(([id, label]) => (
                  <Chip key={id} on={sort === id} onClick={() => setSort(id)}>{label}</Chip>
                ))}
              </div>
              {(activeCount > 0 || q) && (
                <button type="button" onClick={reset} className="xa-label hover:text-fit-accent">zurücksetzen</button>
              )}
            </div>
          </div>

          {list.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <p className="xa-serif text-2xl text-fit-ink m-0">Keine Tafel passt.</p>
              <button type="button" onClick={reset} className="xa-label hover:text-fit-accent">Filter zurücksetzen</button>
            </div>
          ) : (
            <div className="xa-grid">
              {list.slice(0, limit).map((ex, i) => (
                <Plate key={ex.uid} ex={ex} index={i} onOpen={openPlate} />
              ))}
            </div>
          )}
          {list.length > limit && <div ref={sentinelRef} className="h-10" aria-hidden="true" />}
        </>
      )}

      <DetailSheet
        ex={openEx}
        position={openIndex + 1}
        total={list.length}
        onClose={() => setOpenUid(null)}
        onStep={step}
        onOpenCatalog={onInspectExercise ? (rec) => { setOpenUid(null); onInspectExercise(rec) } : null}
      />
    </div>
  )
}
