/**
 * GateIdleSuggestion — Vorschlag, ein vergessenes Workout zur letzten Eingabe
 * zu beenden. Erscheint in Bar und Sheet, sobald das aktive Gate seit
 * GATE_IDLE_MS nichts Neues mehr gesehen hat (auch direkt nach App-Öffnen).
 * Löst das Problem "Stop wird nie gedrückt" (endedAt bleibt null, Core4 zählt
 * das Workout nicht), ohne Zeitstempel pro Satz zu speichern.
 */

import { normalizeSessionGate } from '../../lib/sessionGate.js';
import { getGateLastActivityMs, GATE_IDLE_MS } from '../../lib/gateActivity.js';
import { useGateElapsed } from './useGateElapsed.js';

function hhmm(ms) {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function GateIdleSuggestion({ sessionGate, onStop, className = '' }) {
  const gate = normalizeSessionGate(sessionGate);
  const { nowMs } = useGateElapsed(gate);
  if (gate.status !== 'active') return null;
  const lastMs = getGateLastActivityMs(gate);
  if (!lastMs || nowMs - lastMs < GATE_IDLE_MS) return null;
  const idleMin = Math.round((nowMs - lastMs) / 60000);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] ${className}`}
      style={{ background: 'var(--bg2)', color: 'var(--dim)' }}
    >
      <span className="flex-1 min-w-0">
        Seit {idleMin} Min keine Eingabe (zuletzt {hhmm(lastMs)}).
      </span>
      <button
        onClick={() => onStop?.({ endedAt: new Date(lastMs).toISOString() })}
        className="shrink-0 h-8 px-3 rounded-full font-bold active:scale-95 transition-all"
        style={{ background: 'var(--accent)', color: '#000' }}
      >
        Um {hhmm(lastMs)} beenden
      </button>
    </div>
  );
}
