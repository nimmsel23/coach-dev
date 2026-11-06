import { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, Flag, Trophy } from 'lucide-react';

const TIMER_STORAGE_KEY = 'fitness-workout-timer-v2';
const ACCENT = '#c8ff00';

function formatSeconds(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Format mit Zehntelsekunden für Halte-Zeiten (Front Lever/Planche/L-Sit
// Attempts sind oft <10s, da zählt die Nachkommastelle).
function formatHoldTime(ms) {
  const totalTenths = Math.floor(Math.max(0, ms) / 100);
  const seconds = Math.floor(totalTenths / 10);
  const tenths = totalTenths % 10;
  return `${seconds}.${tenths}s`;
}

function createInitialStopwatchState() {
  return { running: false, startedAt: null, elapsedMs: 0, laps: [] };
}

function hydrateStopwatchState() {
  if (typeof window === 'undefined') return createInitialStopwatchState();
  try {
    const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return createInitialStopwatchState();
    const parsed = JSON.parse(raw);
    const base = { ...createInitialStopwatchState(), ...parsed, laps: Array.isArray(parsed.laps) ? parsed.laps : [] };
    if (!base.running || !base.startedAt) return base;
    const delta = Math.max(0, Date.now() - Date.parse(base.startedAt));
    return { ...base, startedAt: new Date().toISOString(), elapsedMs: base.elapsedMs + delta };
  } catch {
    return createInitialStopwatchState();
  }
}

export default function WorkoutTimerCard() {
  const [state, setState] = useState(() => hydrateStopwatchState());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
    return undefined;
  }, [state]);

  useEffect(() => {
    if (!state.running) return undefined;
    const interval = window.setInterval(() => {
      setState(current => ({ ...current, elapsedMs: current.elapsedMs + 100 }));
    }, 100);
    return () => window.clearInterval(interval);
  }, [state.running]);

  function toggle() {
    setState(current => ({ ...current, running: !current.running, startedAt: new Date().toISOString() }));
  }

  function reset() {
    setState(createInitialStopwatchState());
  }

  // Logt einen Hold-Versuch: Dauer seit dem letzten geloggten Lap (oder seit
  // Start), nicht die Gesamtzeit — jeder Versuch zählt einzeln, damit man
  // mehrere Halte-Attempts in einer Session vergleichen kann.
  function logLap() {
    setState(current => {
      const previousCumulative = current.laps.length ? current.laps[current.laps.length - 1].cumulative : 0;
      const duration = current.elapsedMs - previousCumulative;
      return {
        ...current,
        laps: [...current.laps, { duration, cumulative: current.elapsedMs, at: new Date().toISOString() }],
      };
    });
  }

  const bestLapMs = state.laps.length ? Math.max(...state.laps.map(l => l.duration)) : null;

  return (
    <section
      className="rounded-[2rem] p-5 sm:p-6"
      style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))', border: '1px solid var(--line)' }}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--dim)', opacity: 0.7 }}>Hold Timer</div>
          <h3 className="text-xl sm:text-2xl font-black text-fit-ink mt-1">Stoppuhr</h3>
        </div>
        <div
          className="rounded-2xl px-4 py-3 min-w-[9rem] text-right"
          style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}33` }}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: ACCENT }}>Freie Zeit</div>
          <div className="text-3xl font-black tabular-nums text-fit-ink mt-1">{formatSeconds(Math.floor(state.elapsedMs / 1000))}</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--dim)', opacity: 0.8 }}>{state.running ? 'Stoppuhr läuft.' : 'Bereit zum Start.'}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-2">
        <button onClick={toggle} className="min-h-12 px-5 rounded-2xl flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: ACCENT, color: '#000', boxShadow: `0 16px 32px -16px ${ACCENT}` }}>
          {state.running ? <Pause size={16} strokeWidth={3} /> : <Play size={16} strokeWidth={3} />}
          {state.running ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={logLap}
          disabled={!state.running}
          className="min-h-12 px-5 rounded-2xl flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:hover:scale-100"
          style={{ background: 'var(--bg2)', color: 'var(--ink)', border: '1px solid var(--line)' }}
        >
          <Flag size={16} strokeWidth={2.7} />
          Hold loggen
        </button>
        <button onClick={reset} className="min-h-12 px-5 rounded-2xl flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: 'var(--bg2)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
          <RotateCcw size={16} strokeWidth={2.7} />
          Reset
        </button>
      </div>

      {state.laps.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {state.laps.slice().reverse().map((lap, i) => {
            const isBest = lap.duration === bestLapMs;
            return (
              <div
                key={lap.at}
                className="flex items-center justify-between px-3.5 py-2 rounded-xl"
                style={{
                  background: isBest ? `${ACCENT}14` : 'var(--bg2)',
                  border: isBest ? `1px solid ${ACCENT}44` : '1px solid var(--line)',
                }}
              >
                <div className="flex items-center gap-2">
                  {isBest && <Trophy size={13} style={{ color: ACCENT }} />}
                  <span className="text-[11px] font-bold" style={{ color: 'var(--dim)' }}>
                    Hold {state.laps.length - i}
                  </span>
                </div>
                <span className="text-sm font-black tabular-nums" style={{ color: isBest ? ACCENT : 'var(--ink)' }}>
                  {formatHoldTime(lap.duration)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
