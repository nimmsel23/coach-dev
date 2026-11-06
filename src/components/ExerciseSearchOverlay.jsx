import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, History, Zap, Dumbbell, Star, Plus } from 'lucide-react'
import { searchExercises, getSessionHistory, getPlanSuggestion, toggleFavourite, getFavourites } from '@db'
import { downloadMirror } from '../lib/exerciseDbs/mirror.js'
import { IS_SOLO } from '../constants/NavigationItems.js'
import {
  loadLanguageFilter, filterByLanguage, LANG_STORAGE_KEY,
} from '../lib/exerciseLanguage.js'

const SOURCE_STORAGE_KEY = 'fitness-sessionSources'
const SOURCE_LABELS = {
  wger: 'wger',
  yuhonas: 'yuhonas',
  coach: 'vitalos',
  expert: 'vitalos',
}

export default function ExerciseSearchOverlay({ onSelect, onClose, date }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [mirrorMissing, setMirrorMissing] = useState([])
  const [mirrorLoading, setMirrorLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recents, setRecents] = useState([])
  const [program, setProgram] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [favourites, setFavourites] = useState(() => getFavourites())
  const [langFilter, setLangFilter] = useState(() => loadLanguageFilter())
  const rerunSearchRef = useRef(() => {})

  // Hot-reload, wenn Settings im Modal geändert werden
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || e.key === LANG_STORAGE_KEY) setLangFilter(loadLanguageFilter())
      if (!e.key || e.key === SOURCE_STORAGE_KEY) rerunSearchRef.current?.()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  function handleToggleFav(e, exerciseId) {
    e.stopPropagation()
    toggleFavourite(exerciseId)
    setFavourites(getFavourites())
  }

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus()
    
    // Load Recents
    getSessionHistory(30).then(sessions => {
      const seen = new Set()
      const uniqueEx = []
      sessions.forEach(s => {
        (s.exercises || []).forEach(ex => {
          if (ex.name && !seen.has(ex.name)) {
            seen.add(ex.name)
            uniqueEx.push({
              id: ex.id || ex.exercise_id,
              name: ex.name,
              primaryMuscles: ex.primaryMuscles || [],
              source: ex.source || 'recent'
            })
          }
        })
      })
      setRecents(uniqueEx.slice(0, 10))
    })

    // Load Program/Plan
    getPlanSuggestion(date).then(suggestion => {
      if (suggestion?.exercises) {
        setProgram(suggestion.exercises.map(name => ({ name, isPlan: true })))
      }
    })

    // Close on Escape
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [date, onClose])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.length < 2) { 
      setResults([])
      setSelectedIndex(-1)
      return 
    }

    const runSearch = async () => {
      setLoading(true)
      try {
        // mirror: yuhonas kommt aus dem Geräte-Mirror (Atlas → Quellen), nicht aus den alten Katalog-Bulk-Daten
        const data = await searchExercises(query, 25, { mirror: true })
        setMirrorMissing(data?.mirrorMissing || [])
        const filtered = filterByLanguage(data?.results || [], langFilter)
        setResults(filtered)
        setSelectedIndex(filtered.length > 0 ? 0 : -1)
      } catch { /* silent */ }
      finally { setLoading(false) }
    }

    rerunSearchRef.current = runSearch
    debounceRef.current = setTimeout(runSearch, 250)

    return () => clearTimeout(debounceRef.current)
  }, [query, langFilter])

  // Solo-Build hat keinen Atlas: yuhonas-Mirror (~1 MB, einmalig pro Gerät) direkt hier laden.
  async function loadYuhonasHere() {
    setMirrorLoading(true)
    try {
      await downloadMirror('yuhonas')
      await rerunSearchRef.current?.()
    } catch { /* Hinweis bleibt stehen, erneut tippen versucht es nochmal */ }
    finally { setMirrorLoading(false) }
  }

  const handleKeyDown = (e) => {
    if (results.length === 0) return
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      pick(results[selectedIndex])
    }
  }

  function pick(ex) {
    onSelect(ex)
    onClose()
  }

  return createPortal(
    <div className="search-overlay-backdrop fixed inset-0 z-[200] flex flex-col bg-fit-bg/95 backdrop-blur-xl">
      {/* Header / Search Bar */}
      <div className="search-overlay-panel p-4 border-b border-fit-line/50 bg-fit-card/50 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <div className="relative flex-1 group">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-fit-dim group-focus-within:text-fit-accent transition-colors" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Übung suchen…"
              className="w-full pl-12 pr-12 py-4 bg-fit-bg2 border border-fit-line rounded-2xl text-lg font-bold text-fit-ink outline-none focus:border-fit-accent focus:ring-4 focus:ring-fit-accent/10 transition-all shadow-xl tracking-tight"
            />
            {loading && (
              <div className="absolute right-14 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-fit-accent/20 border-t-fit-accent rounded-full animate-spin" />
              </div>
            )}
            {query && !loading && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-fit-line/20 flex items-center justify-center text-fit-dim hover:text-fit-ink hover:bg-fit-line/40 transition-all"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-fit-bg2 flex items-center justify-center text-fit-dim hover:text-fit-ink hover:bg-fit-card transition-all border border-fit-line shrink-0"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-10">
          
          {query.length < 2 ? (
            <>
              {/* Recents Section */}
              {recents.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <History size={14} className="text-fit-accent" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim">Zuletzt verwendet</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recents.map((ex, idx) => (
                      <button
                        key={ex.name}
                        onClick={() => pick(ex)}
                        style={{ animationDelay: `${idx * 20}ms` }}
                        className="search-row-in group flex flex-col p-4 rounded-3xl bg-fit-card border border-fit-line hover:border-fit-accent/50 hover:bg-fit-accent/5 transition-all text-left shadow-xs active:scale-[0.98]"
                      >
                        <span className="font-bold text-sm text-fit-ink group-hover:text-fit-accent transition-colors">{ex.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Program Section */}
              {program.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <Zap size={14} className="text-fit-orange" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim">Geplant für Heute</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {program.map((ex, idx) => (
                      <button
                        key={ex.name}
                        onClick={() => pick(ex)}
                        style={{ animationDelay: `${idx * 20}ms` }}
                        className="search-row-in group flex items-center gap-4 p-4 rounded-3xl bg-fit-orange/5 border border-fit-orange/20 hover:border-fit-orange/50 hover:bg-fit-orange/10 transition-all text-left shadow-xs active:scale-[0.98]"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-fit-orange/10 flex items-center justify-center text-fit-orange group-hover:scale-110 transition-transform">
                          <Plus size={20} />
                        </div>
                        <span className="font-bold text-sm text-fit-ink">{ex.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Info / Quick Tips */}
              <div className="p-8 rounded-[40px] bg-fit-bg2/50 border border-fit-line border-dashed flex flex-col items-center text-center gap-4 opacity-50">
                <Dumbbell size={32} className="text-fit-dim" />
                <p className="text-xs font-bold text-fit-dim max-w-xs leading-relaxed uppercase tracking-widest">
                  Tippe mindestens 2 Buchstaben um die clientseitige Exercise-Suche zu starten.
                </p>
              </div>
            </>
          ) : (
            /* Results Section */
            <section className="space-y-4 pb-20">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim">Suchergebnisse</h3>
                <span className="text-[10px] font-bold text-fit-accent bg-fit-accent/10 px-2 py-0.5 rounded-full font-mono">{results.length}</span>
              </div>

              {mirrorMissing.includes('yuhonas') && (
                <button
                  type="button"
                  disabled={mirrorLoading}
                  onClick={IS_SOLO ? loadYuhonasHere : () => { onClose(); window.location.hash = '#atlas' }}
                  className="w-full text-left px-4 py-3 rounded-2xl border border-dashed border-fit-accent/40 bg-fit-accent/5 text-[11px] font-bold text-fit-muted hover:text-fit-ink transition-colors disabled:opacity-60"
                >
                  {IS_SOLO
                    ? (mirrorLoading ? 'yuhonas-DB wird geladen …' : 'yuhonas-DB ist nicht auf diesem Gerät — hier tippen zum Laden (ca. 1 MB, einmalig).')
                    : 'yuhonas-DB ist nicht auf diesem Gerät — im Atlas unter „Quellen“ laden, dann erscheinen die Treffer hier.'}
                </button>
              )}

              {results.length > 0 ? (
                <div className="space-y-1.5">
                  {results.map((ex, idx) => {
                    const active = selectedIndex === idx
                    return (
                      <button
                        key={ex.id || ex.name}
                        onClick={() => pick(ex)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        style={{ animationDelay: `${Math.min(idx, 14) * 12}ms` }}
                        className={`search-row-in relative w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl border text-left transition-colors duration-150 ${
                          active
                            ? 'bg-fit-accent/[0.06] border-fit-accent/25'
                            : 'bg-transparent border-transparent hover:bg-fit-card/50'
                        }`}
                      >
                        <span
                          className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full transition-opacity duration-150 ${
                            active ? 'bg-fit-accent opacity-100' : 'opacity-0'
                          }`}
                        />
                        <span className={`shrink-0 font-mono text-[10px] tabular-nums w-5 text-right ${active ? 'text-fit-accent' : 'text-fit-dim/40'}`}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className={`flex-1 min-w-0 truncate text-[13px] ${active ? 'font-semibold text-fit-ink' : 'font-medium text-fit-dim'}`}>
                          {ex.name}
                        </span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                          active ? 'bg-fit-accent/10 text-fit-accent' : 'bg-fit-bg2 text-fit-dim/60'
                        }`}>
                          {SOURCE_LABELS[ex.source] || ex.source || 'exercise'}
                        </span>
                        <button
                          onClick={e => handleToggleFav(e, ex.id || ex.exercise_id)}
                          className="shrink-0 p-0.5 rounded-full hover:scale-110 transition-transform"
                        >
                          <Star size={12} className={favourites.includes(ex.id || ex.exercise_id) ? 'text-yellow-400 fill-yellow-400' : 'text-fit-dim/20'} />
                        </button>
                        {active && (
                          <kbd className="shrink-0 hidden sm:flex items-center gap-0.5 font-mono text-[9px] text-fit-accent/70 bg-fit-accent/10 rounded px-1.5 py-0.5">
                            ↵
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : !loading && (
                <div className="py-20 flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-fit-line/10 flex items-center justify-center text-fit-dim/30">
                    <Search size={32} />
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest text-fit-dim">Keine Übungen gefunden</p>
                  <button
                    onClick={() => pick({ name: query, isNew: true })}
                    className="mt-2 btn btn-primary px-8"
                  >
                    "{query}" als neue Übung hinzufügen
                  </button>
                </div>
              )}
            </section>
          )}

        </div>
      </div>

      {/* Keyboard hint bar */}
      {results.length > 0 && (
        <div className="hidden sm:flex items-center justify-center gap-5 px-4 py-2 border-t border-fit-line/40 bg-fit-card/70 backdrop-blur text-[10px] font-mono text-fit-dim/60">
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-fit-bg2 border border-fit-line">↑↓</kbd>navigieren</span>
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-fit-bg2 border border-fit-line">↵</kbd>auswählen</span>
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-fit-bg2 border border-fit-line">esc</kbd>schließen</span>
        </div>
      )}
    </div>,
    document.body
  )
}
