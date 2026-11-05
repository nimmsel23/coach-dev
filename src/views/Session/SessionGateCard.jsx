import { useEffect, useState } from 'react';
import { Play, Square, Clock3, CheckCircle2, PencilLine, Dumbbell, Activity } from 'lucide-react';
import {
  normalizeSessionGate,
  isSessionGateActive,
  isSessionGateCompleted,
} from '../../lib/sessionGate.js';
import { useGateElapsed } from './useGateElapsed.js';
import { gateTone, GATE_STOP_STYLE } from './gateTone.js';
import GateIdleSuggestion from './GateIdleSuggestion.jsx';
import GatePortalGrid from './GatePortalGrid.jsx';
import SplitPicker from './SplitPicker.jsx';
import GateNextPlanCard from './GateNextPlanCard.jsx';
import { countSessionProgress } from './SessionGateBar.jsx';

// Ring füllt sich sichtbar über eine 90-Minuten-Referenzsession, läuft danach
// einfach weiter am Anschlag (kein harter Cutoff, nur ein Referenzrahmen für
// den optischen Fortschritt — reine Deko, keine Funktionsgrenze).
const RING_REFERENCE_MS = 90 * 60 * 1000;
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

function StatusEyebrow({ active, completed }) {
  const label = active ? 'LIVE · TRACKING' : completed ? 'GATE GESCHLOSSEN' : 'GATE BEREIT';
  const color = gateTone({ status: active ? 'active' : completed ? 'completed' : 'idle' }).color;
  return (
    <div className="flex items-center gap-2">
      <span
        className={active ? 'session-gate-dot' : ''}
        style={{
          width: 6, height: 6, borderRadius: 9999,
          background: color,
          boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${color} 20%, transparent)` : 'none',
          flexShrink: 0,
        }}
      />
      <span
        className="text-[10px] font-bold tracking-[0.2em] font-mono"
        style={{ color, opacity: active ? 1 : 0.6 }}
      >
        {label}
      </span>
    </div>
  );
}

function TodayCounters({ exercises }) {
  const { exerciseCount, setCount, volume } = countSessionProgress(exercises);
  const items = [[exerciseCount, 'Übungen'], [setCount, 'Sätze'], [`${volume.toLocaleString('de-DE')} kg`, 'Volumen']];
  return (
    <div className="relative mt-4 grid grid-cols-3 gap-2">
      {items.map(([value, label]) => (
        <div key={label} className="rounded-xl py-2 text-center" style={{ background: 'var(--bg2)' }}>
          <div className="font-mono font-bold tabular-nums text-sm" style={{ color: 'var(--ink)' }}>{value}</div>
          <div className="text-[8px] font-bold tracking-[0.15em] uppercase mt-0.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

export default function SessionGateCard({ date, sessionGate, currentSubTab = null, exercises = [], sessionMode = 'strength', setSessionMode, block = '', setBlock, onSplitLongPress, onApplyRoutine, hub = false, onSubNav, onLeave, onStart, onStop }) {
  const gate = normalizeSessionGate(sessionGate);
  const active = isSessionGateActive(gate);
  const completed = isSessionGateCompleted(gate);
  // Sichtbarer Status statt stillem No-op: `sendSessionGateNotification()`
  // bricht bei fehlender Permission unauffällig ab — ohne diese Anzeige hat
  // der User keine Chance zu sehen, dass genau das der Grund für "keine
  // Notification bisher" ist (iOS fragt den Permission-Dialog nur einmal ab,
  // ein Wegtippen/Verweigern bleibt sonst unsichtbar "denied").
  const [notifStatus, setNotifStatus] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );

  useEffect(() => {
    if (!active) return undefined;
    function refreshNotifStatus() {
      setNotifStatus(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    }
    refreshNotifStatus();
    document.addEventListener('visibilitychange', refreshNotifStatus);
    return () => document.removeEventListener('visibilitychange', refreshNotifStatus);
  }, [active]);

  // Notifications/1h-Reminder laufen in useSessionGateLifecycle (SessionEditor),
  // nicht hier — die Card existiert nur, solange das Sheet offen ist.
  const { elapsedMs, elapsedLabel } = useGateElapsed(gate);
  const ringProgress = gate.startedAt ? Math.min(1, elapsedMs / RING_REFERENCE_MS) : 0;
  const ringOffset = RING_C * (1 - ringProgress);
  const tone = gateTone(gate);
  const ringColor = active || completed ? tone.color : 'var(--line)';

  return (
    <section
      className={`rounded-3xl p-4 sm:p-6 overflow-hidden relative ${active ? 'session-gate-stripes' : ''}`}
      style={{ background: tone.bg, border: tone.border }}
    >
      {!active && !completed && (
        <div
          className="session-gate-blueprint absolute inset-0 pointer-events-none opacity-[0.35]"
          style={{ maskImage: 'linear-gradient(to bottom, black, transparent 75%)' }}
        />
      )}

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
        {/* Ring-Stoppuhr */}
        <div className="relative shrink-0 mx-auto sm:mx-0" style={{ width: 108, height: 108 }}>
          <svg width={108} height={108} viewBox="0 0 100 100" className={active ? 'session-gate-ring-spin' : ''} style={{ animationDuration: '14s' }}>
            <circle cx="50" cy="50" r={RING_R} fill="none" stroke="var(--bg2)" strokeWidth="5" />
            <circle
              cx="50" cy="50" r={RING_R} fill="none"
              stroke={ringColor}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={active ? ringOffset : completed ? 0 : RING_C}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-mono font-bold tabular-nums leading-none"
              style={{ fontSize: gate.startedAt ? '1.15rem' : '1.4rem', color: 'var(--ink)' }}
            >
              {gate.startedAt ? elapsedLabel : '—:—'}
            </span>
            <span className="text-[8px] font-bold tracking-[0.15em] mt-1" style={{ color: 'var(--dim)', opacity: 0.6 }}>
              {gate.startedAt ? 'MIN : SEC' : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* Status + CTA */}
        <div className="flex-1 min-w-0 w-full">
          <StatusEyebrow active={active} completed={completed} />
          <h3 className="text-lg sm:text-xl font-bold mt-1.5" style={{ color: 'var(--ink)' }}>
            {active ? 'Im Gym. Handy weg.' : completed ? 'Workout ist geloggt.' : 'Workout schnell starten.'}
          </h3>
          <p className="text-[13px] mt-1 max-w-xl" style={{ color: 'var(--dim)', opacity: 0.75 }}>
            {active
              ? 'Die Zeit läuft bereits. Das eigentliche Tracking kann komplett später passieren.'
              : completed
                ? 'Der Trainingstag steht. Unten kannst du Übungen und Details in Ruhe nachtragen.'
                : 'Start heißt nur: Session läuft. Erst beim Beenden gilt das Workout als wirklich done und geloggt.'}
          </p>

          <GateIdleSuggestion sessionGate={gate} onStop={onStop} className="mt-3" />

          <div className="flex flex-wrap items-stretch gap-2.5 mt-4">
            {!active ? (
              <button
                onClick={() => onStart?.()}
                className="flex-1 sm:flex-none sm:min-w-[15rem] h-12 px-6 rounded-full flex items-center justify-center gap-2.5 text-sm font-bold transition-all hover:scale-[1.01] active:scale-95"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                <Play size={16} strokeWidth={2.5} />
                Workout starten
              </button>
            ) : (
              <button
                onClick={() => onStop?.()}
                className="flex-1 sm:flex-none sm:min-w-[15rem] h-12 px-6 rounded-full flex items-center justify-center gap-2.5 text-sm font-bold transition-all hover:scale-[1.01] active:scale-95"
                style={GATE_STOP_STYLE}
              >
                <Square size={16} strokeWidth={2.5} />
                Workout beenden
              </button>
            )}

            <div
              className="w-full sm:flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium"
              style={{ background: 'var(--bg2)', color: 'var(--dim)' }}
            >
              {active ? <Clock3 size={13} /> : completed ? <CheckCircle2 size={13} /> : <PencilLine size={13} />}
              <span>
                {active && notifStatus !== 'granted'
                  ? notifStatus === 'denied'
                    ? '⚠ Benachrichtigungen blockiert — in den iOS/Browser-Einstellungen für diese App erlauben.'
                    : notifStatus === 'unsupported'
                      ? '⚠ Benachrichtigungen auf diesem Gerät/Browser nicht unterstützt.'
                      : '⚠ Benachrichtigungen noch nicht erlaubt — beim nächsten Start erneut bestätigen.'
                  : active
                    ? 'Live-Status läuft als App-Benachrichtigung weiter, solange der Browser das zulässt.'
                    : completed
                      ? 'Manuelles Nachtragen bleibt offen.'
                      : 'Kein Plan-Zwang. Erst aktive Session, geloggt erst bei done.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {onApplyRoutine && !completed && (
        <GateNextPlanCard
          className="relative mt-5"
          onApply={async (routine) => { await onApplyRoutine(routine); onLeave?.(); }}
        />
      )}

      {setSessionMode && (
        <div className="relative mt-5">
          <div className="text-[10px] font-bold tracking-[0.15em] mb-2 font-mono" style={{ color: 'var(--dim)', opacity: 0.5 }}>TRAINING</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {[['strength', 'Kraft', Dumbbell, 'var(--accent)'], ['cardio', 'Ausdauer', Activity, 'var(--orange)']].map(([key, label, Icon, color]) => {
              const on = sessionMode === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSessionMode(key)}
                  className="h-10 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95"
                  style={{ background: on ? color : 'var(--bg2)', color: on ? '#000' : 'var(--dim)', border: `1px solid ${on ? color : 'transparent'}` }}
                >
                  <Icon size={14} /> {label}
                </button>
              );
            })}
          </div>
          {sessionMode === 'strength' && setBlock && <SplitPicker block={block} setBlock={setBlock} onLongPress={onSplitLongPress} />}
        </div>
      )}

      {(active || completed) && <TodayCounters exercises={exercises} />}

      {/* Mobil im Sheet-Modus ersetzt die Hub-Leiste (GateHubBar im Sheet) das Raster; im Hub-Modus und auf Desktop bleibt es. */}
      <div className={`relative mt-5 pt-4 ${hub ? '' : 'hidden lg:block'}`} style={{ borderTop: '1px dashed var(--line)' }}>
        <GatePortalGrid hub={hub} currentSubTab={currentSubTab} onSubNav={onSubNav} onLeave={onLeave} />
      </div>
    </section>
  );
}
