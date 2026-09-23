/**
 * SessionHistory — Standalone weekly timeline view.
 * Extracted from the inline ~200-line block in index.jsx.
 *
 * Improvements:
 * - Extracted as own component (no more inline in 860-line file)
 * - Better visual hierarchy: week headers, timeline nodes
 * - Drag-and-drop to move sessions between dates preserved
 * - Collapsible weeks
 */

import { useState } from 'react';
import { History, Timer, Calendar, ChevronRight, Check, X as XIcon, Dumbbell, Activity, Trash2 } from 'lucide-react';
import { localToday } from '@utils';
import { blockColor } from './utils';
import { ACTIVITY_LABELS, ACTIVITY_ICONS, ACTIVITY_EMOJI, classifySession } from '../../constants/ActivityConstants';
import { sessionHasLoggedWorkout } from '../../lib/sessionGate.js';

const DAY_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const MON_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// Mindestens 10 Wochen, aber genug um auch ältere (z.B. manuell nachbearbeitete
// und neu gepushte) Sessions zu erreichen — sonst sind sie nur im ungefensterten
// Bericht/Verlauf sichtbar, aber im Session-Tab selbst nicht anwählbar.
function weeksNeeded(today, recentSessions) {
  const dates = Object.keys(recentSessions || {}).filter(d => d && d <= today);
  if (dates.length === 0) return 10;
  const oldest = dates.reduce((min, d) => (d < min ? d : min), today);
  const days = Math.round((new Date(today) - new Date(oldest)) / 86400000);
  return Math.max(10, Math.ceil(days / 7) + 1);
}

function buildWeekGroups(today, recentSessions) {
  const todayObj = new Date(today + 'T12:00:00');
  const dow0 = todayObj.getDay();
  const thisMonday = new Date(todayObj);
  thisMonday.setDate(todayObj.getDate() - (dow0 === 0 ? 6 : dow0 - 1));
  thisMonday.setHours(0, 0, 0, 0);

  const weekCount = weeksNeeded(today, recentSessions);
  return Array.from({ length: weekCount }, (_, w) => {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - w * 7);
    const allDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    }).filter(d => d <= today).reverse();

    const hasSessions = allDays.some(d => sessionHasLoggedWorkout(recentSessions[d]));

    let visibleDays;
    if (w === 0) {
      visibleDays = allDays;
    } else if (hasSessions) {
      const sessionDays = allDays.filter(d => sessionHasLoggedWorkout(recentSessions[d]));
      const oldest = sessionDays[sessionDays.length - 1];
      const newest = sessionDays[0];
      visibleDays = allDays.filter(d => d >= oldest && d <= newest);
    } else {
      visibleDays = [];
    }

    const jan4 = new Date(monday.getFullYear(), 0, 4);
    const kw = Math.max(1, Math.floor(((monday - jan4) / 86400000 + jan4.getDay() + 1) / 7));
    const label = w === 0 ? 'Diese Woche' : w === 1 ? 'Letzte Woche' : `KW ${kw} · ${monday.getFullYear()}`;
    const sessionCount = allDays.filter(d => sessionHasLoggedWorkout(recentSessions[d])).length;

    return { label, kw, allDays, visibleDays, hasSessions, sessionCount };
  });
}

export default function SessionHistory({
  recentSessions, onOpenSession, setDate,
  reDateEntry, setReDateEntry,
  draggedDate, setDraggedDate,
  dragOverDate, setDragOverDate,
  moveSessionToDate, deleteSessionAtDate,
  hasMoreHistory, onLoadMoreHistory,
}) {
  const today = localToday();
  const weekGroups = buildWeekGroups(today, recentSessions);
  const hasAnything = weekGroups.some(wg => wg.hasSessions);
  const [collapsedWeeks, setCollapsedWeeks] = useState(new Set());

  const toggleWeek = label => {
    setCollapsedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderSessionCard = (d, s) => {
    const { isActivity, hasFinisher, actType, label } = classifySession(s);
    const emoji = actType ? ACTIVITY_EMOJI[actType] : null;
    const ActivityIconComp = (!emoji && actType) ? (ACTIVITY_ICONS[actType] || Activity) : null;
    const color = blockColor(s.block, isActivity ? s.activity : null, s.sessionMode);
    const isReDate = reDateEntry?.d === d;
    const isDragging = draggedDate === d;

    return (
      <div
        className={`rounded-2xl overflow-hidden transition-all ${isDragging ? 'opacity-30 scale-95' : ''}`}
        draggable
        onDragStart={e => { setDraggedDate(d); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDraggedDate(null); setDragOverDate(null); }}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
        }}
      >
        <div className="flex items-center gap-2.5 px-3 py-3">
          {/* Drag handle */}
          <div
            className="text-lg leading-none shrink-0 cursor-grab active:cursor-grabbing select-none"
            style={{ color: 'var(--dim)', opacity: 0.2 }}
            title="Ziehen um Datum zu verschieben"
          >
            ⠿
          </div>

          {/* Type icon */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
            style={{ background: color + '15', color }}
          >
            {isActivity && emoji
              ? emoji
              : isActivity && ActivityIconComp
                ? <ActivityIconComp size={14} />
                : <Dumbbell size={14} />}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-black truncate flex items-center gap-1.5"
              style={{ color: 'var(--ink)' }}
            >
              <span className="truncate">
                {label || <span style={{ color: 'var(--dim)', fontStyle: 'italic', opacity: 0.4 }}>–</span>}
              </span>
              {hasFinisher && (
                <span
                  className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5"
                  style={{ background: 'var(--accent)' + '20', color: 'var(--accent)' }}
                  title="Activity Finisher"
                >
                  {emoji ? <span>{emoji}</span> : ActivityIconComp ? <ActivityIconComp size={9} /> : null}
                  {ACTIVITY_LABELS[actType] || 'Finisher'}
                </span>
              )}
            </div>
            {isActivity ? (
              <div
                className="text-[9px] font-bold flex items-center gap-1"
                style={{ color: 'var(--dim)', opacity: 0.4 }}
              >
                <Timer size={8} />
                {s.activity?.duration}min
                {s.activity?.distanceKm ? ` · ${s.activity.distanceKm}km` : ''}
              </div>
            ) : (
              <div
                className="text-[9px] font-bold flex items-center gap-1.5"
                style={{ color: 'var(--dim)', opacity: 0.4 }}
              >
                <span>{Array.isArray(s.exercises) ? s.exercises.length : 0} Übungen</span>
                {hasFinisher && s.activity?.duration && (
                  <span className="flex items-center gap-0.5">
                    <Timer size={8} />
                    {s.activity.duration}min
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Direktes Löschen aus dem Verlauf, ohne Umweg über "Edit
                öffnen → im Editor löschen" (User-Feedback 2026-09-06:
                Löschen einer falsch geloggten Session "hat nicht so gut
                geklappt"). */}
            <button
              onClick={e => { e.stopPropagation(); deleteSessionAtDate?.(d, s.id ?? null); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{ color: 'var(--dim)', opacity: 0.5 }}
              title="Löschen"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setReDateEntry(isReDate ? null : { d, value: d }); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: isReDate ? 'var(--accent)' : 'transparent',
                color: isReDate ? '#000' : 'var(--dim)',
              }}
              title="Datum verschieben"
            >
              <Calendar size={12} />
            </button>
            <button
              onClick={() => onOpenSession ? onOpenSession(d) : setDate(d)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-[0.15em] transition-all hover:scale-105 active:scale-95"
              style={{ background: 'var(--accent)', color: '#000' }}
              title="Im Editor öffnen"
            >
              <ChevronRight size={11} strokeWidth={3} />
              <span className="hidden sm:inline">Edit</span>
            </button>
          </div>
        </div>

        {/* Re-date input */}
        {isReDate && (
          <div
            className="px-3 pb-3 flex items-center gap-2 pt-2 animate-in slide-in-from-top-1 duration-150"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            <span
              className="text-[8px] font-black uppercase tracking-widest shrink-0"
              style={{ color: 'var(--dim)', opacity: 0.4 }}
            >
              →
            </span>
            <input
              type="date"
              value={reDateEntry.value}
              max={today}
              onChange={e => setReDateEntry({ d, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') moveSessionToDate(d, reDateEntry.value);
                if (e.key === 'Escape') setReDateEntry(null);
              }}
              className="flex-1 px-2 py-1 rounded-lg text-[10px] font-black outline-none"
              style={{
                border: '1px solid var(--accent)',
                background: 'var(--bg2)',
                color: 'var(--ink)',
              }}
              autoFocus
            />
            <button
              onClick={() => moveSessionToDate(d, reDateEntry.value)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <Check size={12} strokeWidth={3} />
            </button>
            <button
              onClick={() => setReDateEntry(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--dim)' }}
            >
              <XIcon size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderDayRow = (d, showEmpty) => {
    const s = recentSessions[d];
    const hasSession = sessionHasLoggedWorkout(s);
    if (!hasSession && !showEmpty) return null;

    const isToday = d === today;
    const dateObj = new Date(d + 'T12:00:00');
    const dayName = DAY_SHORT[dateObj.getDay()];
    const dayNum = dateObj.getDate();
    const mon = MON_SHORT[dateObj.getMonth()];
    const isDropTarget = !!draggedDate && draggedDate !== d && !hasSession;
    const isDragOver = dragOverDate === d && isDropTarget;
    const dotColor = hasSession ? blockColor(s?.block, s?.activity, s?.sessionMode) : null;

    return (
      <div
        key={d}
        className={`flex items-start transition-all ${isDragOver ? 'scale-[1.01]' : ''}`}
        onDragOver={isDropTarget ? e => { e.preventDefault(); setDragOverDate(d); } : undefined}
        onDragLeave={isDropTarget ? () => setDragOverDate(prev => prev === d ? null : prev) : undefined}
        onDrop={isDropTarget ? e => { e.preventDefault(); setDragOverDate(null); moveSessionToDate(draggedDate, d); setDraggedDate(null); } : undefined}
      >
        {/* Date sidebar */}
        <div className="w-14 text-right pr-3 shrink-0 pt-2.5">
          <div className="text-[8px] font-black uppercase" style={{ color: 'var(--dim)', opacity: 0.25 }}>
            {dayName}
          </div>
          <div
            className="text-[13px] font-black leading-tight"
            style={{ color: isToday ? 'var(--accent)' : 'var(--dim)', opacity: isToday ? 1 : 0.5 }}
          >
            {dayNum}
          </div>
          {!hasSession && (
            <div className="text-[7px] font-bold uppercase" style={{ color: 'var(--dim)', opacity: 0.2 }}>
              {mon}
            </div>
          )}
        </div>

        {/* Timeline node */}
        <div className="w-5 flex flex-col items-center shrink-0 mt-[14px]">
          <div
            className={`w-2.5 h-2.5 rounded-full border-2 z-10 relative transition-all ${
              hasSession ? 'scale-100' : isDropTarget ? 'scale-125 border-dashed' : 'scale-75 opacity-30'
            }`}
            style={dotColor ? {
              borderColor: dotColor,
              background: dotColor + '30',
            } : {
              borderColor: isDropTarget ? 'var(--accent)' : 'var(--line)',
              background: isDropTarget ? 'rgba(200,255,0,0.15)' : 'var(--bg)',
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 pl-2 pb-3 min-w-0">
          {hasSession ? renderSessionCard(d, s) : (
            <div
              className="h-9 rounded-xl flex items-center justify-center transition-all"
              style={{
                border: isDragOver ? '1.5px dashed var(--accent)' : '1.5px solid transparent',
                background: isDragOver ? 'rgba(200,255,0,0.04)' : 'transparent',
              }}
            >
              {isDragOver && (
                <span
                  className="text-[8px] font-black uppercase tracking-[0.2em] animate-pulse"
                  style={{ color: 'var(--accent)' }}
                >
                  Hierher verschieben
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!hasAnything) {
    return (
      <div
        className="flex flex-col items-center justify-center py-32"
        style={{ opacity: 0.3 }}
      >
        <History size={40} style={{ color: 'var(--dim)', marginBottom: '16px' }} />
        <p className="text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: 'var(--dim)' }}>
          Noch keine Sessions
        </p>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {weekGroups.map(wg => {
        const isCollapsed = collapsedWeeks.has(wg.label);
        return (
          <div key={wg.label} className="mb-1">
            {/* Week header */}
            <button
              onClick={() => toggleWeek(wg.label)}
              className="w-full flex items-center gap-3 px-2 pt-4 pb-2"
            >
              <span
                className="text-[9px] font-black uppercase tracking-[0.3em]"
                style={{ color: 'var(--dim)', opacity: 0.35 }}
              >
                {wg.label}
              </span>
              {wg.hasSessions && (
                <span
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                  style={{
                    background: 'var(--bg2)',
                    color: 'var(--dim)',
                    opacity: 0.5,
                    border: '1px solid var(--line)',
                  }}
                >
                  {wg.sessionCount}×
                </span>
              )}
              {!wg.hasSessions && (
                <span
                  className="text-[8px] font-bold italic"
                  style={{ color: 'var(--dim)', opacity: 0.2 }}
                >
                  Keine Session
                </span>
              )}
              <div style={{ flex: 1 }} />
              <ChevronRight
                size={12}
                style={{
                  color: 'var(--dim)',
                  opacity: 0.3,
                  transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </button>

            {/* Week days */}
            {!isCollapsed && wg.visibleDays.length > 0 && (
              <div className="relative">
                {/* Timeline vertical line */}
                <div
                  className="absolute top-0 bottom-0 w-px z-0"
                  style={{ left: '67px', background: 'var(--line)', opacity: 0.3 }}
                />
                {wg.visibleDays.map(d => renderDayRow(d, true))}
              </div>
            )}
          </div>
        );
      })}

      {hasMoreHistory && (
        <button
          onClick={onLoadMoreHistory}
          className="w-full mt-4 py-3 rounded-xl text-sm font-bold transition-colors"
          style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
        >
          Mehr laden
        </button>
      )}
    </div>
  );
}
