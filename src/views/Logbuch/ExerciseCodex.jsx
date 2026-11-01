/**
 * ExerciseCodex — alle Übungen auf einer Seite: pro Übung zuletzt geloggter
 * Wert, Gipfel (höchster Wert aller Zeiten), Abstand dazwischen und das
 * Gipfel-Profil. Zeile antippen → Dossier mit der kompletten Historie.
 */

import { ChevronDown, ChevronRight, Mountain, TrendingUp, Info, Moon } from 'lucide-react';
import PeakProfile, { STATUS_COLOR } from './PeakProfile.jsx';
import { blockColor } from '../Session/utils.js';
import { fmtAgo, fmtNum, fmtScore, fmtTop, parseDay } from './logbookStats.js';

const STATUS_LABEL = { gipfel: 'Am Gipfel', nah: 'Nah dran', tal: 'Im Tal', neu: 'Erster Eintrag' };
const DAY_FMT = { day: '2-digit', month: '2-digit', year: '2-digit' };
const fmtDate = (iso) => parseDay(iso).toLocaleDateString('de-DE', DAY_FMT);

const dim = (o) => ({ color: 'var(--dim)', opacity: o });

function GapChip({ ex }) {
  const color = STATUS_COLOR[ex.status];
  const text = ex.status === 'gipfel' ? 'Gipfel' : ex.status === 'neu' ? 'neu' : `−${fmtNum(ex.gap * 100, ex.gap < 0.1 ? 1 : 0)} %`;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      title={STATUS_LABEL[ex.status]}
    >
      {ex.status === 'gipfel' && <Mountain size={9} />}
      {text}
    </span>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-black uppercase tracking-[0.2em]" style={dim(0.45)}>{label}</div>
      <div className="text-[13px] font-black font-mono truncate" style={{ color: accent || 'var(--ink)' }}>{value}</div>
      {sub && <div className="text-[9px] font-bold truncate" style={dim(0.5)}>{sub}</div>}
    </div>
  );
}

function Dossier({ ex, today, onOpenSession, onInspectExercise }) {
  const rows = [...ex.entries].reverse();
  const recordDates = new Set(ex.records.map((r) => r.date));
  const firstDates = new Set(ex.records.filter((r) => r.kind === 'erst').map((r) => r.date));
  const color = STATUS_COLOR[ex.status];
  return (
    <div className="px-3 pb-3 pt-1 space-y-3 animate-in slide-in-from-top-1 duration-150" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="pt-3 flex justify-center">
        <PeakProfile
          scored={ex.scored} peak={ex.peak} last={ex.lastScored} domain={[ex.first.date, today]}
          status={ex.status} width={300} height={84} showFloor
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Einheiten" value={`${ex.count}×`} sub={`seit ${fmtDate(ex.first.date)}`} />
        <Stat
          label="Schwerster Satz"
          value={ex.heaviest ? `${fmtNum(ex.heaviest.heaviest.weight)} kg${ex.heaviest.heaviest.reps ? ` × ${ex.heaviest.heaviest.reps}` : ''}` : '–'}
          sub={ex.heaviest ? fmtDate(ex.heaviest.date) : null}
        />
        <Stat label="Gesamtvolumen" value={ex.totalVolume ? `${fmtNum(ex.totalVolume / 1000, 2)} t` : '–'} sub={`${ex.records.filter((r) => r.kind === 'rekord').length} Rekorde`} accent={color} />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
        <div
          className="grid grid-cols-[64px_1fr_auto] gap-2 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.2em]"
          style={{ background: 'var(--bg2)', ...dim(0.6) }}
        >
          <span>Datum</span><span>Sätze</span><span className="text-right">{ex.mode === 'reps' ? 'Bestwert' : 'e1RM'}</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {rows.map((e) => {
            const isPeak = ex.peak === e;
            return (
              <button
                key={e.date}
                onClick={() => onOpenSession?.(e.date)}
                className="w-full grid grid-cols-[64px_1fr_auto] gap-2 px-3 py-2 text-left items-center transition-colors hover:bg-[var(--bg2)]"
                style={{ borderTop: '1px solid var(--line)' }}
                title="Session im Editor öffnen"
              >
                <span className="text-[10px] font-bold font-mono" style={dim(0.7)}>{fmtDate(e.date)}</span>
                <span className="text-[11px] font-mono font-bold truncate" style={{ color: 'var(--ink)' }}>
                  {e.sets.map((s) => (s.weight > 0 ? `${fmtNum(s.weight)}×${s.reps || '?'}` : `${s.reps}`)).join(' · ')}
                </span>
                <span className="flex items-center gap-1.5 justify-end text-[11px] font-black font-mono" style={{ color: isPeak ? color : 'var(--ink)' }}>
                  {e.score != null ? fmtScore(e.score, ex.mode) : '–'}
                  {isPeak && <Mountain size={11} />}
                  {!isPeak && recordDates.has(e.date) && !firstDates.has(e.date) && <TrendingUp size={11} style={{ color: 'var(--green, #34d399)' }} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onOpenSession?.(ex.last.date)}
          className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          Letzte Session öffnen
        </button>
        <button
          onClick={() => onInspectExercise?.({ name: ex.name, displayName: ex.name, exercise_id: ex.id, primaryMuscles: ex.muscles })}
          className="px-3 py-2 rounded-xl flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest"
          style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--dim)' }}
        >
          <Info size={11} /> Übung
        </button>
      </div>
    </div>
  );
}

export default function ExerciseCodex({ exercises, today, domain, expandedKey, onExpand, onOpenSession, onInspectExercise }) {
  if (!exercises.length) {
    return (
      <div className="py-24 text-center text-[11px] font-black uppercase tracking-[0.3em]" style={dim(0.3)}>
        Keine Übung gefunden
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {exercises.map((ex) => {
        const open = expandedKey === ex.key;
        const color = STATUS_COLOR[ex.status];
        const stripe = ex.mainBlock ? blockColor(ex.mainBlock) : 'var(--line)';
        const peakDiffers = ex.peak && ex.last !== ex.peak;
        return (
          <div
            key={ex.key}
            id={`codex-${ex.key}`}
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--card)', border: `1px solid ${open ? color : 'var(--line)'}` }}
          >
            <button
              onClick={() => onExpand(open ? null : ex.key)}
              className="w-full text-left flex items-stretch"
              aria-expanded={open}
            >
              <span className="w-1 shrink-0" style={{ background: stripe, opacity: ex.dormant ? 0.3 : 0.9 }} />
              <span className="flex-1 min-w-0 px-3 py-3">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-black truncate" style={{ color: 'var(--ink)' }}>{ex.name}</span>
                  <GapChip ex={ex} />
                  {ex.dormant && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold shrink-0" style={dim(0.5)} title="Seit mehr als 6 Wochen nicht trainiert">
                      <Moon size={9} /> schläft
                    </span>
                  )}
                  <span className="flex-1" />
                  {open ? <ChevronDown size={13} style={dim(0.4)} /> : <ChevronRight size={13} style={dim(0.4)} />}
                </span>
                <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-widest" style={dim(0.45)}>
                  {ex.mainBlock ? `${ex.mainBlock} · ` : ''}{ex.count}× · {fmtAgo(ex.daysSince)}
                </span>
                <span className="mt-2.5 flex items-end gap-3">
                  <span className="grid grid-cols-2 gap-3 flex-1 min-w-0">
                    <Stat
                      label="Zuletzt"
                      value={fmtTop(ex.last, ex.mode)}
                      sub={`${fmtDate(ex.last.date)}${ex.trend != null && Math.abs(ex.trend) >= 0.005 ? ` · ${ex.trend > 0 ? '+' : ''}${fmtNum(ex.trend * 100, 1)} %` : ''}`}
                    />
                    <Stat
                      label="Gipfel"
                      value={fmtTop(ex.peak, ex.mode)}
                      sub={peakDiffers ? fmtDate(ex.peak.date) : 'aktueller Stand'}
                      accent={color}
                    />
                  </span>
                  <PeakProfile
                    scored={ex.scored} peak={ex.peak} last={ex.lastScored} domain={domain}
                    status={ex.status} dormant={ex.dormant}
                  />
                </span>
              </span>
            </button>
            {open && <Dossier ex={ex} today={today} onOpenSession={onOpenSession} onInspectExercise={onInspectExercise} />}
          </div>
        );
      })}
    </div>
  );
}
