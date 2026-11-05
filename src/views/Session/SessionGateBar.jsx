/**
 * SessionGateBar — Live-Counter des Session-Gates direkt im Session-Editor.
 *
 * Vorher lief die Gate-Stoppuhr nur im SessionGateSheet: wer per Start/Stop
 * mit dem Gate arbeitete, sah im eigentlichen Logging-UI nichts davon. Die
 * Bar sitzt im sticky SessionHeader und zeigt während einer aktiven Session
 * laufende Zeit + Übungs-/Satz-/Volumen-Zähler, nach dem Stop die
 * Abschlusszahlen. Tap öffnet das Gate-Sheet, Stop beendet direkt.
 */

import { useMemo, useState } from 'react';
import { Play, Square, CheckCircle2, LayoutGrid } from 'lucide-react';
import { normalizeSessionGate } from '../../lib/sessionGate.js';
import { useGateElapsed } from './useGateElapsed.js';
import { gateTone, GATE_STOP_STYLE } from './gateTone.js';
import GateIdleSuggestion from './GateIdleSuggestion.jsx';

function toNumber(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function countSessionProgress(exercises) {
  let exerciseCount = 0;
  let setCount = 0;
  let volume = 0;
  for (const ex of exercises || []) {
    const filled = (ex.setsArray || []).filter((s) => toNumber(s?.reps) > 0);
    if (filled.length) exerciseCount += 1;
    setCount += filled.length;
    for (const s of filled) volume += toNumber(s.reps) * toNumber(s.weight);
  }
  return { exerciseCount, setCount, volume: Math.round(volume) };
}

function formatVolume(kg) {
  if (kg >= 10000) return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
  return `${kg.toLocaleString('de-DE')} kg`;
}

function Counter({ value, label }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className="font-mono font-bold tabular-nums text-sm leading-none" style={{ color: 'var(--ink)' }}>{value}</span>
      <span className="text-[8px] font-bold tracking-[0.15em] mt-1 uppercase" style={{ color: 'var(--dim)', opacity: 0.6 }}>{label}</span>
    </div>
  );
}

export default function SessionGateBar({ sessionGate, exercises, isToday, onOpenGate, onStart, onStop }) {
  const gate = normalizeSessionGate(sessionGate);
  const active = gate.status === 'active';
  const completed = gate.status === 'completed';
  const { elapsedLabel } = useGateElapsed(gate);
  const tone = gateTone(gate);
  // startSessionGate() wartet auf den GPS-Fix (kann drinnen Sekunden dauern)
  // — ohne Busy-State wirkt der Tap wie ignoriert.
  const [starting, setStarting] = useState(false);

  const progress = useMemo(() => countSessionProgress(exercises), [exercises]);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try { await onStart?.(); } finally { setStarting(false); }
  }

  if (!active && !completed) {
    if (!isToday) return null;
    return (
      <div className="w-full mb-3 flex items-center gap-2">
        <button
          onClick={handleStart}
          disabled={starting}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-full text-[11px] font-bold transition-all active:scale-[0.98]"
          style={{ background: 'var(--bg2)', color: 'var(--dim)', border: '1px dashed var(--line)' }}
        >
          <Play size={12} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
          {starting ? 'Workout startet …' : 'Workout starten — Zeit & Zähler laufen mit'}
        </button>
        <button
          onClick={onOpenGate}
          aria-label="Schnelleinstieg öffnen"
          className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{ background: 'var(--bg2)', color: 'var(--dim)', border: '1px solid var(--line)' }}
        >
          <LayoutGrid size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3">
    <div
      className="flex items-center gap-3 rounded-2xl pl-3 pr-1.5 py-1.5"
      style={{
        background: tone.bg,
        border: tone.border,
      }}
    >
      <button onClick={onOpenGate} className="flex flex-1 items-center gap-3 min-w-0 text-left" aria-label="Session-Gate öffnen">
        <div className="flex items-center gap-2 shrink-0">
          {active ? (
            <span
              className="session-gate-dot"
              style={{ width: 6, height: 6, borderRadius: 9999, background: 'var(--accent)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)' }}
            />
          ) : (
            <CheckCircle2 size={13} style={{ color: tone.color }} />
          )}
          <span className="font-mono font-bold tabular-nums text-lg leading-none" style={{ color: 'var(--ink)' }}>
            {elapsedLabel}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-around gap-2 min-w-0">
          <Counter value={progress.exerciseCount} label="Übungen" />
          <Counter value={progress.setCount} label="Sätze" />
          <Counter value={formatVolume(progress.volume)} label="Volumen" />
        </div>
      </button>
      {active && (
        <button
          onClick={() => onStop?.()}
          className="shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-[11px] font-bold transition-all active:scale-95"
          style={GATE_STOP_STYLE}
          aria-label="Workout beenden"
        >
          <Square size={11} strokeWidth={2.5} />
          Stop
        </button>
      )}
    </div>
    <GateIdleSuggestion sessionGate={gate} onStop={onStop} className="mt-1.5" />
    </div>
  );
}
