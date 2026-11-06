/**
 * GatePortalGrid — Schnelleinstieg des Session-Gates.
 *
 * Alle Ziele der App (Session-Bereiche, Review, Lernen, Atlas, Radtouren, Setup,
 * "Gestern nachtragen") in einem Raster mit Suche, Tastaturkürzeln (1–9, "/" für
 * die Suche, Enter öffnet den ersten Treffer) und "Zuletzt genutzt" (localStorage,
 * rein komfortabel — fehlt der Speicher, funktioniert alles ohne).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, ClipboardList, TimerReset, Sparkles, BookOpen, BarChart3, Brain,
  LayoutGrid, Bike, Settings2, History, Search, ChevronUp,
} from 'lucide-react';
import { localToday } from '@utils';
import { IS_SOLO } from '../../constants/NavigationItems.js';

const RECENT_KEY = 'fitness-gate-portal-recent';
const RECENT_MAX = 3;

function yesterdayIso() {
  const [y, m, d] = localToday().split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

// kind 'sub' → onSubNav(id) im Session-Tab, kind 'hash' → globale Hash-Route (App.jsx parst sie).
export function buildPortalEntries() {
  const session = [
    { id: 'today', label: 'Session', hint: 'Heute loggen', Icon: CalendarDays, kind: 'sub', keywords: 'training heute log' },
    { id: 'plan', label: 'Plan', hint: 'Routinen & Pläne', Icon: ClipboardList, kind: 'sub', keywords: 'routine workout' },
    { id: 'logbuch', label: 'Logbuch', hint: 'Chronik & Verlauf', Icon: BookOpen, kind: 'sub', keywords: 'history verlauf woche' },
    { id: 'timer', label: '6Pack-App', hint: 'Timer', Icon: TimerReset, kind: 'sub', keywords: 'timer stoppuhr' },
    { id: 'skills', label: 'Skills-App', hint: 'Skills üben', Icon: Sparkles, kind: 'sub', keywords: 'skill calisthenics' },
  ];
  const yesterday = { id: 'yesterday', label: 'Gestern', hint: 'Nachtragen', Icon: History, kind: 'hash', hash: `#session/${yesterdayIso()}`, keywords: 'nachtragen datum vergessen' };
  if (IS_SOLO) return [...session, yesterday];
  return [
    ...session,
    yesterday,
    { id: 'review', label: 'Review', hint: 'Bericht & Muskeln', Icon: BarChart3, kind: 'hash', hash: '#review', keywords: 'bericht woche muskeln readiness' },
    { id: 'learn', label: 'Lernen', hint: 'Übungen & Anatomie', Icon: Brain, kind: 'hash', hash: '#learn', keywords: 'anatomie quiz übungen' },
    { id: 'atlas', label: 'Atlas', hint: 'Übungs-Datenbanken', Icon: LayoutGrid, kind: 'hash', hash: '#atlas', keywords: 'datenbank katalog' },
    { id: 'touren', label: 'Radtouren', hint: 'Cardio & Touren', Icon: Bike, kind: 'hash', hash: '#touren', keywords: 'rad tour cardio' },
    { id: 'settings', label: 'Setup', hint: 'Einstellungen', Icon: Settings2, kind: 'hash', hash: '#settings', keywords: 'einstellungen konto' },
  ];
}

function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function writeRecent(id) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* Speicher gesperrt: kein Problem */ }
}

function openEntry(entry, { onSubNav, onLeave }) {
  writeRecent(entry.id);
  if (entry.kind === 'sub') onSubNav?.(entry.id);
  else { onLeave?.(); window.location.hash = entry.hash; }
}

const BAR_MAX = 5;
const BAR_DEFAULT = ['today', 'plan', 'logbuch', 'review', 'learn'];

/**
 * GateHubBar — die Hub-Leiste am unteren Rand des geöffneten Sheets. Sie ersetzt dort
 * die Bottom-Nav (das Sheet verdrängt sie): fünf Ziele (zuletzt genutzte zuerst, sonst
 * Standard) plus Chevron. Hochwischen auf der Leiste oder Tipp aufs Chevron klappt den
 * Hub voll auf (`onExpand`). Nur mobil (lg:hidden), Desktop nutzt das Raster im Sheet.
 */
export function GateHubBar({ currentSubTab, onSubNav, onLeave, onExpand }) {
  const entries = useMemo(buildPortalEntries, []);
  const recent = readRecent();
  const ids = [...recent, ...BAR_DEFAULT].filter((id, i, a) => a.indexOf(id) === i);
  const items = ids.map((id) => entries.find((e) => e.id === id)).filter(Boolean).slice(0, BAR_MAX);
  const startY = useRef(null);

  return (
    <div
      className="lg:hidden sticky bottom-0 z-10 -mx-2 mt-4 border-t border-fit-line bg-fit-card/95 backdrop-blur-xl pb-[max(0.25rem,env(safe-area-inset-bottom))]"
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        if (startY.current == null) return;
        const dy = e.changedTouches[0].clientY - startY.current;
        startY.current = null;
        if (dy < -40) onExpand?.();
      }}
    >
      <div className="flex items-end justify-around">
        {items.map(({ id, label, Icon, kind }) => {
          const selected = kind === 'sub' && (currentSubTab || 'today') === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => openEntry(entries.find((e) => e.id === id), { onSubNav, onLeave })}
              aria-current={selected ? 'page' : undefined}
              className="min-h-12 flex flex-1 flex-col items-center justify-center gap-[5px] px-1 active:scale-90 transition-transform duration-150 min-w-[44px]"
            >
              <div className={`flex items-center justify-center rounded-2xl transition-all duration-300 ${selected ? 'bg-fit-accent w-12 h-8 shadow-lg shadow-fit-accent/30' : 'w-10 h-8'}`}>
                <Icon size={selected ? 17 : 19} className={selected ? 'text-black stroke-[2.5]' : 'text-fit-dim stroke-[1.8]'} />
              </div>
              <span className={`text-[10px] font-bold leading-tight ${selected ? 'text-fit-accent' : 'text-fit-dim'}`}>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onExpand}
          aria-label="Hub aufklappen"
          className="min-h-12 flex flex-1 flex-col items-center justify-center gap-[5px] px-1 active:scale-90 transition-transform duration-150 min-w-[44px]"
        >
          <div className="w-10 h-8 flex items-center justify-center"><ChevronUp size={19} className="text-fit-dim stroke-[1.8]" /></div>
          <span className="text-[10px] font-bold leading-tight text-fit-dim">Hub</span>
        </button>
      </div>
    </div>
  );
}

export default function GatePortalGrid({ currentSubTab, onSubNav, onLeave, hub = false }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const inputRef = useRef(null);
  const entries = useMemo(buildPortalEntries, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const filtered = q
      ? entries.filter((e) => `${e.label} ${e.hint} ${e.keywords}`.toLowerCase().includes(q))
      : entries;
    if (q) return filtered;
    // Zuletzt genutzte zuerst, Rest in Grundreihenfolge.
    const rank = (e) => { const i = recent.indexOf(e.id); return i === -1 ? RECENT_MAX + 1 : i; };
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [entries, q, recent]);

  function open(entry) {
    writeRecent(entry.id);
    setRecent(readRecent());
    if (entry.kind === 'sub') onSubNav?.(entry.id);
    else { onLeave?.(); window.location.hash = entry.hash; }
  }

  // Kürzel: "/" fokussiert die Suche, 1–9 öffnet das n-te sichtbare Ziel (nicht beim Tippen).
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if (e.key === '/' && !typing) { e.preventDefault(); inputRef.current?.focus(); return; }
      if (typing) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && visible[n - 1]) { e.preventDefault(); open(visible[n - 1]); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10px] font-bold tracking-[0.15em] font-mono" style={{ color: 'var(--dim)', opacity: 0.5 }}>
          SCHNELLEINSTIEG
        </div>
        <label className="flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[11px]" style={{ background: 'var(--bg2)', color: 'var(--dim)' }}>
          <Search size={12} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible[0]) open(visible[0]);
            }}
            placeholder="Suchen  ( / )"
            aria-label="Ziele durchsuchen"
            className="bg-transparent outline-none w-24 sm:w-32 placeholder:opacity-60"
            style={{ color: 'var(--ink)' }}
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="text-[12px] py-3 text-center" style={{ color: 'var(--dim)' }}>Kein Treffer für „{query}“.</div>
      ) : (
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${hub ? 'gap-3' : 'gap-2'}`}>
          {visible.map((entry, i) => {
            const { id, label, hint, Icon, kind } = entry;
            const selected = kind === 'sub' && (currentSubTab || 'today') === id;
            const isRecent = !q && recent.includes(id);
            return (
              <button
                key={id}
                onClick={() => open(entry)}
                className={`relative text-left ${hub ? 'rounded-2xl px-4 py-6' : 'rounded-xl px-3 py-2.5'} transition-all active:scale-[0.98] hover:brightness-110`}
                style={{
                  background: selected ? 'rgba(200,255,0,0.08)' : 'var(--bg2)',
                  border: selected ? '1px solid rgba(200,255,0,0.3)' : '1px solid transparent',
                }}
              >
                {i < 9 && (
                  <span className="absolute top-1.5 right-2 text-[8px] font-mono font-bold hidden sm:block" style={{ color: selected ? 'var(--accent)' : 'var(--dim)', opacity: 0.4 }}>
                    {i + 1}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Icon size={hub ? 22 : 13} style={{ color: selected ? 'var(--accent)' : 'var(--dim)' }} />
                  <span className={`${hub ? 'text-sm' : 'text-xs'} font-semibold truncate`} style={{ color: selected ? 'var(--accent)' : 'var(--ink)' }}>
                    {label}
                  </span>
                </div>
                <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--dim)', opacity: 0.65 }}>
                  {isRecent ? '↻ ' : ''}{hint}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
