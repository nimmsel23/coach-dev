/**
 * WeekChronik — Wochen-Timeline, abgeleitet aus Session/SessionHistory.jsx
 * (Wochenköpfe, Datumsspalte, Zeitstrahl-Knoten, einklappbar), aber rein
 * lesend: kein Drag&Drop/Löschen/Umdatieren (das bleibt im History-Tab).
 * Neu gegenüber History: Pausen zwischen Wochen werden benannt, Karten zeigen
 * die stärksten Lifts, Volumen und Rekord-Sterne; Tippen öffnet die Session.
 */

import { useMemo, useState } from 'react';
import { ChevronRight, Dumbbell, Activity, Star, Timer } from 'lucide-react';
import { classifySession, ACTIVITY_EMOJI } from '../../constants/ActivityConstants';
import { blockColor } from '../Session/utils.js';
import { addDays, daysBetween, fmtNum, fmtTop, isoWeekNumber, mondayOf, parseDay } from './logbookStats.js';

const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dim = (o) => ({ color: 'var(--dim)', opacity: o });

function groupWeeks(dayRows, today) {
  const thisMonday = mondayOf(today);
  const byWeek = new Map();
  for (const d of dayRows.filter((r) => r.hasWorkout)) {
    const w = mondayOf(d.date);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(d);
  }
  const mondays = [...byWeek.keys()].sort((a, b) => b.localeCompare(a));
  return mondays.map((monday, i) => {
    const weeksAgo = Math.round(daysBetween(monday, thisMonday) / 7);
    const label = weeksAgo === 0 ? 'Diese Woche' : weeksAgo === 1 ? 'Letzte Woche'
      : `KW ${isoWeekNumber(monday)} · ${parseDay(addDays(monday, 3)).getFullYear()}`;
    const nextOlder = mondays[i + 1];
    const pauseWeeks = nextOlder ? Math.round(daysBetween(nextOlder, monday) / 7) - 1 : 0;
    const days = byWeek.get(monday);
    return {
      monday, label, days, pauseWeeks,
      volume: days.reduce((a, d) => a + d.volume, 0),
      records: days.reduce((a, d) => a + d.records, 0),
    };
  });
}

function DayCard({ d, onOpen }) {
  const { isActivity, hasFinisher, actType, label } = classifySession(d);
  const emoji = actType ? ACTIVITY_EMOJI[actType] : null;
  const color = blockColor(d.block, isActivity ? d.activity : null);
  return (
    <button
      onClick={() => onOpen?.(d.date)}
      className="w-full text-left rounded-2xl px-3 py-2.5 transition-all active:scale-[0.99]"
      style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ background: color + '15', color }}>
          {isActivity ? (emoji || <Activity size={14} />) : <Dumbbell size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black truncate flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
            <span className="truncate">{label || '–'}</span>
            {d.records > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-black shrink-0" style={{ color: 'var(--accent)' }} title={`${d.records} Rekord${d.records > 1 ? 'e' : ''}`}>
                <Star size={9} fill="currentColor" /> {d.records}
              </span>
            )}
          </div>
          <div className="text-[9px] font-bold flex items-center gap-1.5" style={dim(0.5)}>
            {isActivity ? (
              <span className="inline-flex items-center gap-1"><Timer size={8} />{d.activity?.duration}min{d.activity?.distanceKm ? ` · ${d.activity.distanceKm}km` : ''}</span>
            ) : (
              <>
                <span>{d.exerciseCount} Übungen</span>
                {d.volume > 0 && <span>· {fmtNum(d.volume / 1000, 2)} t</span>}
                {hasFinisher && d.activity?.duration && <span className="inline-flex items-center gap-0.5">· <Timer size={8} />{d.activity.duration}min</span>}
              </>
            )}
          </div>
        </div>
        <ChevronRight size={13} style={dim(0.35)} />
      </div>
      {d.topLifts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.topLifts.map((l) => (
            <span
              key={l.key}
              className="px-1.5 py-0.5 rounded-md text-[9px] font-bold font-mono max-w-full truncate"
              style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--dim)' }}
            >
              {l.name} <b style={{ color: 'var(--ink)' }}>{fmtTop(l.entry, l.mode)}</b>
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function WeekChronik({ dayRows, today, onOpenSession }) {
  const weeks = useMemo(() => groupWeeks(dayRows, today), [dayRows, today]);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (monday) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(monday)) next.delete(monday); else next.add(monday);
    return next;
  });

  if (!weeks.length) {
    return (
      <div className="py-24 text-center text-[11px] font-black uppercase tracking-[0.3em]" style={dim(0.3)}>
        Noch keine Sessions
      </div>
    );
  }

  return (
    <div className="pb-32">
      {weeks.map((wg) => {
        const isCollapsed = collapsed.has(wg.monday);
        return (
          <div key={wg.monday} className="mb-1">
            <button onClick={() => toggle(wg.monday)} className="w-full flex items-center gap-3 px-2 pt-4 pb-2" aria-expanded={!isCollapsed}>
              <span className="text-[9px] font-black uppercase tracking-[0.3em]" style={dim(0.45)}>{wg.label}</span>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', ...dim(0.6) }}>
                {wg.days.length}×
              </span>
              {wg.volume > 0 && <span className="text-[8px] font-bold uppercase tracking-widest" style={dim(0.4)}>{fmtNum(wg.volume / 1000, 1)} t</span>}
              {wg.records > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[8px] font-black" style={{ color: 'var(--accent)' }}>
                  <Star size={8} fill="currentColor" /> {wg.records}
                </span>
              )}
              <div className="flex-1" />
              <ChevronRight size={12} style={{ ...dim(0.3), transform: isCollapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
            </button>

            {!isCollapsed && (
              <div className="relative">
                <div className="absolute top-0 bottom-0 w-px z-0" style={{ left: '67px', background: 'var(--line)', opacity: 0.3 }} />
                {wg.days.map((d) => {
                  const dt = parseDay(d.date);
                  const dot = blockColor(d.block, d.activity);
                  return (
                    <div key={d.date} className="flex items-start">
                      <div className="w-14 text-right pr-3 shrink-0 pt-2.5">
                        <div className="text-[8px] font-black uppercase" style={dim(0.3)}>{DAY_SHORT[dt.getDay()]}</div>
                        <div className="text-[13px] font-black leading-tight" style={{ color: d.date === today ? 'var(--accent)' : 'var(--dim)', opacity: d.date === today ? 1 : 0.55 }}>{dt.getDate()}</div>
                      </div>
                      <div className="w-5 flex flex-col items-center shrink-0 mt-[14px]">
                        <div className="w-2.5 h-2.5 rounded-full border-2 z-10 relative" style={{ borderColor: dot, background: dot + '30' }} />
                      </div>
                      <div className="flex-1 pl-2 pb-3 min-w-0"><DayCard d={d} onOpen={onOpenSession} /></div>
                    </div>
                  );
                })}
              </div>
            )}

            {wg.pauseWeeks > 0 && (
              <div className="flex items-center gap-2 px-2 py-3 text-[9px] font-bold uppercase tracking-[0.25em]" style={dim(0.35)}>
                <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
                {wg.pauseWeeks} {wg.pauseWeeks === 1 ? 'Woche' : 'Wochen'} Pause
                <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
