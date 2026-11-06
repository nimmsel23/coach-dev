/**
 * SessionHeader — merges DateStrip + SessionSwitcher + hint-banner + ModeSwitcher
 * into one calm unit. Sentence case, minimal borders, accent color reserved for
 * the single primary action. Icon clutter reduced (calendar-jump + save stay
 * visible, sidebar/settings collapse into one overflow button, see
 * `SessionHeaderMenu.jsx`). Day-strip has no per-day pill background — just a
 * number with an underline for selected/today. Session-pills + Kraft/Ausdauer
 * switch live in `SessionModeAndPills.jsx`; this file stays the composer:
 * title row + day-strip + hint-banner render directly here.
 */

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, MoreHorizontal, Save, Zap } from 'lucide-react';
import { IS_SOLO } from '../../constants/NavigationItems.js';
import { useDayStrip } from './useDayStrip';
import { blockColor, DAY_LABELS, parseLocalDate } from './utils';
import { sessionHasLoggedWorkout } from '../../lib/sessionGate.js';
import SessionHeaderMenu from './SessionHeaderMenu';
import SessionModeAndPills from './SessionModeAndPills';

export default function CalmHeader({
  date, setDate, rollingDays, recentSessions,
  saving, autoSaveLabel, dirty, onSave, onOpenSidebar, onOpenSettings,
  hint,
  daySessions, sessionId, selectSession, onNew, onDelete,
  sessionMode, setSessionMode, block, activity,
  subTab, onSubNav,
  gateBar = null,
}) {
  const { today, allDays, stripRef, dateInputRef, dateLabel, goBack, goFwd, jumpToDate } =
    useDayStrip({ date, setDate, rollingDays });

  // Solo-Build: Tagesleiste standardmäßig nur wenige Tage um das gewählte Datum,
  // "…" links zoomt auf die volle, scrollbare Leiste. Session wird bei jedem
  // Datumswechsel neu gemountet → nach der Auswahl klappt sie von selbst zu.
  const [zoomedOut, setZoomedOut] = useState(false);
  const compact = IS_SOLO && !zoomedOut;
  const COMPACT_DAYS = 5;
  const selIdx = Math.max(0, allDays.indexOf(date));
  const compactStart = Math.max(0, Math.min(selIdx - Math.floor(COMPACT_DAYS / 2), allDays.length - COMPACT_DAYS));
  const stripDays = compact ? allDays.slice(compactStart, compactStart + COMPACT_DAYS) : allDays;

  // Beim Aufzoomen steht die frisch gerenderte lange Leiste sonst bei 0 (ältester Tag):
  // useDayStrip zentriert nur bei Datumswechsel.
  useEffect(() => {
    if (!zoomedOut) return;
    stripRef.current?.querySelector(`[data-date="${date}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [zoomedOut]);

  return (
    <div className="session-header sticky top-0 z-30 px-3 pt-3 pb-2" style={{ background: 'var(--bg)' }}>
      {/* Title row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--dim)', opacity: 0.55 }}>
            Session
          </div>
          <div className="text-base font-bold truncate" style={{ color: 'var(--ink)' }}>{dateLabel}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {dirty && !autoSaveLabel && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--red)', opacity: 0.7 }} />
          )}
          {autoSaveLabel && (
            <span className="text-[9px] font-medium" style={{ color: 'var(--accent)', opacity: 0.8 }}>{autoSaveLabel}</span>
          )}
          <button
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            className="relative w-11 h-11 rounded-full flex items-center justify-center transition-colors"
            style={{ color: 'var(--dim)' }}
            title="Datum wählen"
            aria-label="Datum wählen"
          >
            <CalendarDays size={15} />
            {/* Kein inset-0-Overlay mehr: ein transparentes <input type="date">
                über dem Button hat auf iOS Safari einen intrinsisch größeren,
                nach links verschobenen Touch-Bereich → Taps landen auf dem
                Nachbar-Icon. Der Picker wird ohnehin nur programmatisch über
                showPicker()/click() geöffnet, das Feld braucht also keine
                eigene Trefferfläche. */}
            <input
              ref={dateInputRef}
              type="date"
              value={date}
              onChange={(e) => jumpToDate(e.target.value)}
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              tabIndex={-1}
              aria-hidden="true"
            />
          </button>
          <SessionHeaderMenu onOpenSidebar={onOpenSidebar} onOpenSettings={onOpenSettings} subTab={subTab} onSubNav={onSubNav} />
          <button
            onClick={onSave}
            disabled={saving}
            className="flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {saving
              ? <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              : <Save size={12} strokeWidth={2.5} />}
            <span className="hidden xs:inline">Speichern</span>
          </button>
        </div>
      </div>

      {/* Live-Counter des Session-Gates (SessionGateBar.jsx) — im sticky
          Header, damit Zeit/Zähler beim Scrollen durch die Übungen sichtbar
          bleiben. */}
      {gateBar}

      {/* Day strip — echt scrollbar/wischbar statt festem 7-Tage-Fenster
          (User-Feedback 2026-09-06), Chevrons bleiben als Komfort-Sprung
          für Maus-Nutzer ohne Trackpad/Touch, siehe useDayStrip.js. */}
      <div className="flex items-center gap-1 mb-3">
        {IS_SOLO && (
          <button
            onClick={() => setZoomedOut(v => !v)}
            className="w-6 h-6 flex items-center justify-center shrink-0"
            style={{ color: zoomedOut ? 'var(--accent)' : 'var(--dim)' }}
            title={zoomedOut ? 'Weniger Tage' : 'Mehr Tage'}
            aria-label={zoomedOut ? 'Weniger Tage anzeigen' : 'Mehr Tage anzeigen'}
            aria-pressed={zoomedOut}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
        {!compact && (
          <button onClick={goBack} aria-label="Vorherige Tage" className="w-8 h-11 flex items-center justify-center shrink-0" style={{ color: 'var(--dim)' }}>
            <ChevronLeft size={14} />
          </button>
        )}
        <div ref={stripRef} className={`flex-1 flex gap-1 min-w-0 no-scrollbar ${compact ? 'justify-around overflow-x-hidden' : 'overflow-x-auto'}`}>
          {stripDays.map(d => {
            const sess = recentSessions[d];
            const hasSess = sessionHasLoggedWorkout(sess);
            const isSelected = d === date;
            const isToday = d === today;
            const color = hasSess ? blockColor(sess?.block, sess?.activity, sess?.sessionMode) : null;
            const dateObj = parseLocalDate(d);
            return (
              <button
                key={d}
                data-date={d}
                onClick={() => setDate(d)}
                className={`flex flex-col items-center gap-1 py-1 ${compact ? 'flex-1' : 'shrink-0 w-8'}`}
              >
                <span className="text-[10px] font-medium" style={{ color: isSelected ? 'var(--accent)' : 'var(--dim)' }}>
                  {DAY_LABELS[dateObj.getDay()]}
                </span>
                <span
                  className="text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full"
                  style={{
                    color: isSelected ? '#000' : hasSess ? color : 'var(--ink)',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    opacity: isSelected || isToday || hasSess ? 1 : 0.8,
                  }}
                >
                  {hasSess && !isSelected ? '·' : dateObj.getDate()}
                </span>
              </button>
            );
          })}
        </div>
        {!compact && (
          <button onClick={goFwd} aria-label="Nächste Tage" className="w-8 h-11 flex items-center justify-center shrink-0" style={{ color: 'var(--dim)' }}>
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {hint && (
        <div className="flex items-center gap-2 mb-3 text-[11px]" style={{ color: 'var(--dim)' }}>
          <Zap size={12} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--ink)' }} className="font-semibold">{hint.block}</span>
          <span className="truncate opacity-70">{(hint.exercises || []).slice(0, 3).join(' · ')}</span>
        </div>
      )}

      <SessionModeAndPills
        daySessions={daySessions}
        sessionId={sessionId}
        selectSession={selectSession}
        onNew={onNew}
        onDelete={onDelete}
        sessionMode={sessionMode}
        setSessionMode={setSessionMode}
        block={block} activity={activity}
        subTab={subTab} onSubNav={onSubNav}
      />
    </div>
  );
}
