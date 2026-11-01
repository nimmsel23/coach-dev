/**
 * Logbuch — Makro-Gegenstück zum Einzelsession-Tab (Training → Logbuch).
 *
 * Vier Linsen auf dieselben Daten:
 *  - Kodex    alle Übungen mit zuletzt / Gipfel / Abstand + Gipfel-Profil
 *  - Rekorde  Chronik aller Bestleistungen
 *  - Rhythmus Stempelkarte Übung × Woche
 *  - Chronik  Wochen-Timeline (abgeleitet vom History-Tab, der unverändert bleibt)
 */

import { useEffect, useMemo, useState } from 'react';
import { Search, Mountain, Grid3x3, Trophy, CalendarRange, ChevronLeft } from 'lucide-react';
import { useLogbook } from './useLogbook.js';
import ExerciseCodex from './ExerciseCodex.jsx';
import RecordChronicle from './RecordChronicle.jsx';
import RhythmGrid from './RhythmGrid.jsx';
import WeekChronik from './WeekChronik.jsx';
import { fmtNum, addDays } from './logbookStats.js';
import { IS_SOLO } from '../../constants/NavigationItems.js';

const LENSES = [
  { id: 'kodex', label: 'Kodex', Icon: Mountain },
  { id: 'rekorde', label: 'Rekorde', Icon: Trophy },
  { id: 'rhythmus', label: 'Rhythmus', Icon: Grid3x3 },
  { id: 'chronik', label: 'Chronik', Icon: CalendarRange },
];
const STATUS_FILTERS = [
  ['alle', 'Alle'], ['gipfel', 'Am Gipfel'], ['nah', 'Nah dran'], ['tal', 'Im Tal'], ['schlaeft', 'Schläft'],
];
const SORTS = [
  ['zuletzt', 'Zuletzt trainiert'], ['haeufig', 'Häufigkeit'], ['abstand', 'Abstand zum Gipfel'],
  ['trend', 'Stärkster Anstieg'], ['name', 'Name'],
];
const RANGES = [['90', '90 Tage', 90], ['365', '1 Jahr', 365], ['alles', 'Alles', null]];
const LS_LENS = 'fitness-logbuch-lens';

const dim = (o) => ({ color: 'var(--dim)', opacity: o });
const chip = (active) => ({
  background: active ? 'var(--accent)' : 'var(--bg2)',
  color: active ? '#000' : 'var(--dim)',
  border: '1px solid var(--line)',
});

function readLens() {
  try {
    const v = localStorage.getItem(LS_LENS);
    return LENSES.some((l) => l.id === v) ? v : 'kodex';
  } catch { return 'kodex'; }
}

function Kpi({ label, value, sub }) {
  return (
    <div className="rounded-2xl px-3 py-2.5 min-w-0" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      <div className="text-[8px] font-black uppercase tracking-[0.2em]" style={dim(0.5)}>{label}</div>
      <div className="text-lg font-black leading-tight truncate" style={{ color: 'var(--ink)' }}>{value}</div>
      {sub && <div className="text-[9px] font-bold truncate" style={dim(0.5)}>{sub}</div>}
    </div>
  );
}

export default function Logbuch({ onOpenSession, onInspectExercise, onSubNav }) {
  const { loading, error, book, today } = useLogbook();
  const [lens, setLensState] = useState(readLens);
  const [query, setQuery] = useState('');
  const [block, setBlock] = useState('alle');
  const [status, setStatus] = useState('alle');
  const [sort, setSort] = useState('zuletzt');
  const [range, setRange] = useState('alles');
  const [weekCount, setWeekCount] = useState(26);
  const [expandedKey, setExpandedKey] = useState(null);

  const setLens = (id) => {
    setLensState(id);
    try { localStorage.setItem(LS_LENS, id); } catch { /* Speicher gesperrt → egal */ }
  };

  const blocks = useMemo(() => {
    const counts = {};
    for (const e of book.exercises) if (e.mainBlock) counts[e.mainBlock] = (counts[e.mainBlock] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([b]) => b);
  }, [book.exercises]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = book.exercises.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (block !== 'alle' && e.mainBlock !== block) return false;
      if (status === 'schlaeft') return e.dormant;
      if (status !== 'alle') return e.status === status && !e.dormant;
      return true;
    });
    const by = {
      zuletzt: (a, b) => a.daysSince - b.daysSince || b.count - a.count,
      haeufig: (a, b) => b.count - a.count || a.daysSince - b.daysSince,
      abstand: (a, b) => (b.gap ?? -1) - (a.gap ?? -1),
      trend: (a, b) => (b.trend ?? -Infinity) - (a.trend ?? -Infinity),
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
    }[sort];
    return [...list].sort(by);
  }, [book.exercises, query, block, status, sort]);

  // Gemeinsame x-Achse aller Gipfel-Profile.
  const domain = useMemo(() => {
    const days = RANGES.find((r) => r[0] === range)?.[2];
    const start = days ? addDays(today, -days) : (book.firstDate || today);
    return [start < today ? start : addDays(today, -1), today];
  }, [range, book.firstDate, today]);

  // Aus Rekorde/Rhythmus in den Kodex springen und die Übung aufklappen.
  const focusExercise = (key) => {
    setQuery(''); setBlock('alle'); setStatus('alle');
    setLens('kodex');
    setExpandedKey(key);
    setTimeout(() => document.getElementById(`codex-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  useEffect(() => { if (expandedKey && !filtered.some((e) => e.key === expandedKey)) setExpandedKey(null); }, [filtered, expandedKey]);

  const showFilters = lens === 'kodex' || lens === 'rhythmus';

  return (
    <div className="px-3 pb-32 pt-3">
      {IS_SOLO && (
        <button onClick={() => onSubNav?.('today')} className="mb-2 flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--dim)' }}>
          <ChevronLeft size={14} /> Heute
        </button>
      )}

      <header className="mb-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.3em]" style={dim(0.6)}>Logbuch</h2>
        <p className="text-[10px] font-bold" style={dim(0.45)}>
          {book.firstDate ? `Alles seit ${new Date(`${book.firstDate}T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}` : 'Noch keine Einträge'}
        </p>
      </header>

      {loading ? (
        <div className="py-32 text-center text-[11px] font-black uppercase tracking-[0.3em] animate-pulse" style={dim(0.3)}>Logbuch wird geladen…</div>
      ) : error ? (
        <div className="py-32 text-center text-[11px] font-black uppercase tracking-[0.3em]" style={dim(0.4)}>Verlauf konnte nicht geladen werden</div>
      ) : book.exercises.length === 0 && book.dayRows.length === 0 ? (
        <div className="py-32 text-center text-[11px] font-black uppercase tracking-[0.3em]" style={dim(0.3)}>Noch keine Sessions</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Kpi label="Trainingstage" value={book.kpis.trainingDays} />
            <Kpi label="Übungen" value={book.kpis.exerciseCount} />
            <Kpi label="Gesamtvolumen" value={`${fmtNum(book.kpis.totalVolume / 1000, 1)} t`} />
            <Kpi label="Rekorde · 30 Tage" value={book.kpis.records30} sub={`${book.kpis.recordsTotal} insgesamt`} />
          </div>

          <div className="flex mb-3 rounded-2xl p-1 gap-1" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }} role="tablist">
            {LENSES.map(({ id, label, Icon }) => (
              <button
                key={id} role="tab" aria-selected={lens === id} onClick={() => setLens(id)}
                className="flex-1 min-h-10 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all"
                style={lens === id ? { background: 'var(--accent)', color: '#000' } : dim(0.7)}
              >
                <Icon size={12} /> <span className="hidden min-[420px]:inline">{label}</span>
              </button>
            ))}
          </div>

          {showFilters && (
            <div className="mb-3 space-y-2">
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
                <Search size={13} style={dim(0.5)} />
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Übung suchen…" aria-label="Übung suchen"
                  className="flex-1 bg-transparent outline-none text-[12px] font-bold" style={{ color: 'var(--ink)' }}
                />
              </label>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3">
                {STATUS_FILTERS.filter(([id]) => lens === 'kodex' || id === 'alle' || id === 'schlaeft').map(([id, label]) => (
                  <button key={id} onClick={() => setStatus(id)} className="px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap" style={chip(status === id)}>{label}</button>
                ))}
                {blocks.length > 1 && <span className="w-px shrink-0 mx-1" style={{ background: 'var(--line)' }} />}
                {blocks.length > 1 && ['alle', ...blocks].map((b) => (
                  <button key={b} onClick={() => setBlock(b)} className="px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap" style={chip(block === b)}>{b === 'alle' ? 'Alle Blöcke' : b}</button>
                ))}
              </div>
              {lens === 'kodex' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sortierung"
                    className="flex-1 min-w-0 px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                  >
                    {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <div className="flex gap-1" role="group" aria-label="Zeitachse der Profile">
                    {RANGES.map(([id, label]) => (
                      <button key={id} onClick={() => setRange(id)} className="px-2 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap" style={chip(range === id)}>{label}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex gap-1" role="group" aria-label="Anzahl Wochen">
                  {[13, 26, 52].map((n) => (
                    <button key={n} onClick={() => setWeekCount(n)} className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest" style={chip(weekCount === n)}>{n} Wochen</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {lens === 'kodex' && (
            <div className="pb-8">
              <ExerciseCodex
                exercises={filtered} today={today} domain={domain}
                expandedKey={expandedKey} onExpand={setExpandedKey}
                onOpenSession={onOpenSession} onInspectExercise={onInspectExercise}
              />
            </div>
          )}
          {lens === 'rekorde' && <RecordChronicle records={book.records} onOpenSession={onOpenSession} onFocusExercise={focusExercise} />}
          {lens === 'rhythmus' && <RhythmGrid exercises={filtered} today={today} weekCount={weekCount} onFocusExercise={focusExercise} />}
          {lens === 'chronik' && <WeekChronik dayRows={book.dayRows} today={today} onOpenSession={onOpenSession} />}
        </>
      )}
    </div>
  );
}
