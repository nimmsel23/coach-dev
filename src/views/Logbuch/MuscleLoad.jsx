/**
 * MuscleLoad — Arbeitssätze je Hauptmuskel (Zeilen) × Woche (Spalten).
 * Zellfarbe = Sätze der Woche relativ zur stärksten Woche dieses Muskels,
 * rechts "4 Wo." = Sätze der letzten vier Wochen (Ø pro Woche). Aufwärmsätze
 * zählen nicht; Übungen ohne Muskel-Zuordnung stehen unter "Ohne Zuordnung".
 */

import { useEffect, useMemo, useRef } from 'react';
import { weekWindow, muscleWeekly, parseDay, fmtNum, NO_MUSCLE } from './logbookStats.js';

const CELL = 16;
const GAP = 3;
const NAME_W = 110;
const dim = (o) => ({ color: 'var(--dim)', opacity: o });

export default function MuscleLoad({ exercises, today, weekCount }) {
  const weeks = useMemo(() => weekWindow(today, weekCount), [today, weekCount]);
  const rows = useMemo(() => muscleWeekly(exercises, weeks), [exercises, weeks]);
  const scroller = useRef(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weekCount, rows.length]);

  const monthMarks = weeks.map((w, i) => {
    const d = parseDay(w);
    const prev = i ? parseDay(weeks[i - 1]) : null;
    return !prev || prev.getMonth() !== d.getMonth()
      ? d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')
      : '';
  });

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
        <div style={{ minWidth: NAME_W + weeks.length * (CELL + GAP) + 70 }} className="p-3">
          <div className="flex" style={{ height: 14 }}>
            <div style={{ width: NAME_W }} className="shrink-0" />
            <div className="flex" style={{ gap: GAP }}>
              {monthMarks.map((m, i) => (
                <div key={weeks[i]} style={{ width: CELL }} className="text-[8px] font-black uppercase overflow-visible whitespace-nowrap">
                  <span style={dim(0.45)}>{m}</span>
                </div>
              ))}
            </div>
            <div className="ml-3 text-[8px] font-black uppercase whitespace-nowrap" style={dim(0.45)}>4 Wo. · Ø/Wo.</div>
          </div>
          {rows.map((r) => {
            const max = Math.max(...r.cells.map((c) => c.sets), 1);
            return (
              <div key={r.muscle} className="flex items-center" style={{ height: CELL + GAP + 2 }}>
                <div
                  className="shrink-0 truncate pr-2 text-[10px] font-black sticky left-0 z-10"
                  style={{ width: NAME_W, color: 'var(--ink)', background: 'var(--card)', opacity: r.muscle === NO_MUSCLE ? 0.5 : 1 }}
                  title={r.muscle}
                >
                  {r.muscle}
                </div>
                <div className="flex" style={{ gap: GAP }}>
                  {r.cells.map((c) => (
                    <div
                      key={c.week}
                      title={c.sets ? `${r.muscle} · Woche ab ${c.week} · ${c.sets} Sätze` : undefined}
                      style={{
                        width: CELL, height: CELL, borderRadius: 4,
                        background: c.sets
                          ? `color-mix(in srgb, var(--accent) ${Math.round(22 + (c.sets / max) * 78)}%, transparent)`
                          : 'var(--bg2)',
                        opacity: c.sets ? 1 : 0.5,
                      }}
                    />
                  ))}
                </div>
                <div className="ml-3 text-[10px] font-black whitespace-nowrap" style={{ color: 'var(--ink)' }}>
                  {r.last4} <span style={dim(0.5)}>· {fmtNum(r.last4 / 4, 1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 px-1 text-[9px] font-bold uppercase tracking-widest" style={dim(0.5)}>
        Arbeitssätze je Hauptmuskel · je dunkler, desto mehr Sätze in dieser Woche (relativ zum Muskel)
      </div>
    </div>
  );
}
