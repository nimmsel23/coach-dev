/**
 * RhythmGrid — "Stempelkarte": Übungen (Zeilen) × Wochen (Spalten). Die
 * Zellfarbe zeigt, wie nah der beste Wert der Woche am Gipfel der Übung lag;
 * leere Zellen sind Wochen ohne diese Übung. So sieht man Rhythmus, Lücken
 * und vernachlässigte Übungen, ohne einen einzigen Verlauf zu öffnen.
 * Ring = Gipfel-Woche. Namen antippen → im Kodex öffnen.
 */

import { useEffect, useMemo, useRef } from 'react';
import { weekWindow, weeklyIntensity, parseDay } from './logbookStats.js';
import { STATUS_COLOR } from './PeakProfile.jsx';

const CELL = 16;
const GAP = 3;
const NAME_W = 124;
const dim = (o) => ({ color: 'var(--dim)', opacity: o });

export default function RhythmGrid({ exercises, today, weekCount, onFocusExercise }) {
  const weeks = useMemo(() => weekWindow(today, weekCount), [today, weekCount]);
  const scroller = useRef(null);
  // Neueste Wochen (rechts) zuerst zeigen, ältere per Scroll nach links.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weekCount, exercises.length]);
  const rows = useMemo(
    () => exercises
      .map((ex) => ({ ex, cells: weeklyIntensity(ex, weeks) }))
      .filter((r) => r.cells.some((c) => c.ratio != null))
      .sort((a, b) => b.cells.filter((c) => c.ratio != null).length - a.cells.filter((c) => c.ratio != null).length),
    [exercises, weeks],
  );

  // Monatsmarken: Spalte, in der ein neuer Monat beginnt.
  const monthMarks = weeks.map((w, i) => {
    const d = parseDay(w);
    const prev = i ? parseDay(weeks[i - 1]) : null;
    return !prev || prev.getMonth() !== d.getMonth()
      ? d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')
      : '';
  });
  const gridW = weeks.length * (CELL + GAP);

  if (!rows.length) {
    return (
      <div className="py-24 text-center text-[11px] font-black uppercase tracking-[0.3em]" style={dim(0.3)}>
        Keine Einheiten in diesem Zeitraum
      </div>
    );
  }

  return (
    <div className="pb-32">
      <div ref={scroller} className="rounded-2xl overflow-x-auto" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        <div style={{ minWidth: NAME_W + gridW + 24 }} className="p-3">
          <div className="flex" style={{ height: 14 }}>
            <div style={{ width: NAME_W }} className="shrink-0" />
            <div className="flex" style={{ gap: GAP }}>
              {monthMarks.map((m, i) => (
                <div key={weeks[i]} style={{ width: CELL }} className="text-[8px] font-black uppercase overflow-visible whitespace-nowrap">
                  <span style={dim(0.45)}>{m}</span>
                </div>
              ))}
            </div>
          </div>
          {rows.map(({ ex, cells }) => {
            const color = STATUS_COLOR[ex.status];
            return (
              <div key={ex.key} className="flex items-center" style={{ height: CELL + GAP + 2 }}>
                <button
                  onClick={() => onFocusExercise?.(ex.key)}
                  className="shrink-0 text-left truncate pr-2 text-[10px] font-black sticky left-0 z-10"
                  style={{ width: NAME_W, color: 'var(--ink)', background: 'var(--card)', opacity: ex.dormant ? 0.55 : 1 }}
                  title={ex.name}
                >
                  {ex.name}
                </button>
                <div className="flex" style={{ gap: GAP }}>
                  {cells.map((c) => (
                    <div
                      key={c.week}
                      title={c.ratio != null ? `${ex.name} · Woche ab ${c.week} · ${Math.round(c.ratio * 100)} % vom Gipfel` : undefined}
                      style={{
                        width: CELL, height: CELL, borderRadius: 4,
                        background: c.ratio != null
                          ? `color-mix(in srgb, ${color} ${Math.round(22 + c.ratio * 78)}%, transparent)`
                          : 'var(--bg2)',
                        outline: c.isPeak ? `1.5px solid ${color}` : 'none',
                        outlineOffset: 1.5,
                        opacity: c.ratio != null ? 1 : 0.5,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 px-1 text-[9px] font-bold uppercase tracking-widest" style={dim(0.5)}>
        <span>Je dunkler, desto näher am Gipfel</span>
        <span className="inline-flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 3, outline: '1.5px solid var(--dim)', outlineOffset: 1 }} /> Gipfel-Woche
        </span>
      </div>
    </div>
  );
}
