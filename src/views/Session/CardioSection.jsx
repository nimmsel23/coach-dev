/**
 * CardioSection — Ausdauer-Session-Block (Cardio/Endurance-Modus).
 *
 * Aus SessionEditor.jsx herausgelöst (PHASE3_TODO.md Stück 4, letzter
 * Punkt: SessionEditor soll außer Layout-Wrappern kein Inline-JSX mehr
 * enthalten) — rein mechanisch, keine Logik/Werte verändert.
 */

import ActivitySection from './ActivitySection';

export default function CardioSection({ activity, setActivity, scheduleAutoSave }) {
  return (
    <div
      className="p-5 rounded-3xl animate-in slide-in-from-top-2 duration-300"
      style={{
        background: 'rgba(255,140,50,0.04)',
        border: '1px solid rgba(255,140,50,0.15)',
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-lg"
          style={{ background: 'rgba(255,140,50,0.12)' }}
        >
          🏃
        </div>
        <div>
          <div
            className="text-[11px] font-black uppercase tracking-[0.2em]"
            style={{ color: 'var(--orange)' }}
          >
            Ausdauer-Session
          </div>
          <div
            className="text-[10px] font-medium"
            style={{ color: 'var(--dim)', opacity: 0.5 }}
          >
            Cardio · Endurance
          </div>
        </div>
      </div>
      <ActivitySection activity={activity} setActivity={v => { setActivity(v); scheduleAutoSave(); }} />
    </div>
  );
}
