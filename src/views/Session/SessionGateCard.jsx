import { useEffect, useState } from 'react';
import { Play, Square, Clock3, CheckCircle2, PencilLine, CalendarDays, ClipboardList, History, TimerReset, Sparkles, BookOpen } from 'lucide-react';
import {
  normalizeSessionGate,
  isSessionGateActive,
  isSessionGateCompleted,
} from '../../lib/sessionGate.js';
import { useGateElapsed } from './useGateElapsed.js';
import { gateTone, GATE_STOP_STYLE } from './gateTone.js';
import GateIdleSuggestion from './GateIdleSuggestion.jsx';

const SESSION_NAV_ITEMS = [
  { id: 'today', label: 'Session', code: '01', Icon: CalendarDays },
  { id: 'plan', label: 'Plan', code: '02', Icon: ClipboardList, comingSoon: true },
  { id: 'history', label: 'Verlauf', code: '03', Icon: History },
  { id: 'logbuch', label: 'Logbuch', code: '04', Icon: BookOpen },
  { id: 'timer', label: '6Pack-App', code: '05', Icon: TimerReset },
  { id: 'skills', label: 'Skills-App', code: '06', Icon: Sparkles },
];

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

export default function SessionGateCard({ date, sessionGate, currentSubTab = null, onSubNav, onStart, onStop }) {
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

      <div className="relative mt-5 pt-4" style={{ borderTop: '1px dashed var(--line)' }}>
        <div className="text-[10px] font-bold tracking-[0.15em] mb-2.5 font-mono" style={{ color: 'var(--dim)', opacity: 0.5 }}>
          BEREICHE
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {SESSION_NAV_ITEMS.map(({ id, label, code, Icon }) => {
            const selected = (currentSubTab || 'today') === id;
            return (
              <button
                key={id}
                onClick={() => onSubNav?.(id)}
                className="relative rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.98]"
                style={{
                  background: selected ? 'rgba(200,255,0,0.08)' : 'var(--bg2)',
                  border: selected ? '1px solid rgba(200,255,0,0.3)' : '1px solid transparent',
                }}
              >
                <span
                  className="absolute top-1.5 right-2 text-[8px] font-mono font-bold"
                  style={{ color: selected ? 'var(--accent)' : 'var(--dim)', opacity: 0.4 }}
                >
                  {code}
                </span>
                <div className="flex items-center gap-2">
                  <Icon size={13} style={{ color: selected ? 'var(--accent)' : 'var(--dim)' }} />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: selected ? 'var(--accent)' : 'var(--ink)' }}
                  >
                    {label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
