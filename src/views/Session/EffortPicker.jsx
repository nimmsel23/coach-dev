/**
 * EffortPicker — RPE (1-10) prominent statt hinter "Details & Notizen"
 * versteckt. War vorher nur als Slider tief in SessionSidebar erreichbar.
 */

import { Flame } from 'lucide-react';

// Farben aus System-Tokens statt hardcodierten Hex-Werten (Phase-1-Audit
// 2026-09-05) — `#f59e0b` (mittlerer RPE-Bereich) hat keinen passenden Token
// (Themes definieren nur --green/--red/--orange, kein --yellow/--amber) und
// bleibt deshalb bewusst als Hex-Wert stehen statt einen neuen Token zu
// erfinden, siehe PHASE1_TODO.md.
function effortColor(v) {
  if (v <= 3) return 'var(--green)';
  if (v <= 6) return '#f59e0b';
  if (v <= 8) return 'var(--orange)';
  return 'var(--red)';
}

export default function EffortPicker({ effort, setEffort }) {
  const color = effortColor(effort);
  const pct = ((effort - 1) / 9) * 100;
  return (
    <div
      className="group flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-[var(--line)] hover:border-[var(--rpe-color)] transition-all duration-200 ease-out hover:shadow-[0_6px_20px_-10px_var(--rpe-color)] hover:-translate-y-0.5"
      style={{ background: 'var(--card)', '--rpe-color': color }}
    >
      <div
        className="flex items-center gap-1.5 shrink-0 transition-transform duration-200 ease-out group-hover:scale-110"
        style={{ color }}
      >
        <Flame size={13} strokeWidth={2.5} className="group-hover:animate-pulse" />
        <span className="text-[11px] font-black uppercase tracking-wide">RPE</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={effort}
        onChange={e => setEffort(Number(e.target.value))}
        className="rpe-range flex-1 h-1.5 rounded-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} ${pct}%, var(--line) ${pct}%)`,
          '--rpe-color': color,
        }}
      />
      <span
        className="text-sm font-black w-4 text-center shrink-0 transition-transform duration-200 ease-out group-hover:scale-125"
        style={{ color }}
      >
        {effort}
      </span>
    </div>
  );
}
