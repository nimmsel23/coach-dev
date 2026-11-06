import { useState } from 'react';
import { Target, Pencil, Check } from 'lucide-react';

// Kein hartcodiertes Ziel-km (z.B. "Burgenland–Slowenien") — das wäre
// erfundene Präzision. Stattdessen frei konfigurierbar, persistiert über die
// ohnehin vorhandenen getSettings()/saveSettings() (localStorage lokal,
// Firestore im Firebase-Build).
export default function TourGoal({ totalKm, goalKm, goalLabel, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draftKm, setDraftKm] = useState(goalKm != null ? String(goalKm) : '');
  const [draftLabel, setDraftLabel] = useState(goalLabel || '');

  const pct = goalKm ? Math.min(100, Math.round(((totalKm || 0) / goalKm) * 100)) : null;

  if (!goalKm && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full p-4 rounded-2xl border border-dashed border-fit-line text-fit-dim/50 hover:text-fit-accent hover:border-fit-accent/40 transition-all text-xs font-semibold flex items-center justify-center gap-2"
      >
        <Target size={14} /> Fernziel eintragen (z.B. „Burgenland → Slowenien", 350 km)
      </button>
    );
  }

  if (editing) {
    return (
      <div className="p-4 rounded-2xl border bg-fit-card border-fit-line space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40">Fernziel</div>
        <input
          type="text"
          placeholder="Name (z.B. Burgenland → Slowenien)"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          className="w-full p-3 rounded-xl border bg-fit-bg2 border-fit-line text-fit-ink text-sm font-medium focus:border-fit-orange outline-none"
        />
        <div className="relative">
          <input
            type="number"
            step="1"
            placeholder="z.B. 350"
            value={draftKm}
            onChange={(e) => setDraftKm(e.target.value)}
            className="w-full p-3 pr-16 rounded-xl border bg-fit-bg2 border-fit-line text-fit-ink text-sm font-bold focus:border-fit-orange outline-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-fit-dim/30">km</span>
        </div>
        <button
          onClick={() => {
            const km = Number(draftKm);
            onSave?.({ goalKm: Number.isFinite(km) && km > 0 ? km : null, goalLabel: draftLabel.trim() });
            setEditing(false);
          }}
          className="w-full py-2.5 rounded-xl bg-fit-orange text-black text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
        >
          <Check size={14} /> Speichern
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 rounded-2xl border bg-fit-card border-fit-line">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-fit-dim/50">
          <Target size={14} className="text-fit-accent" />
          {goalLabel || 'Fernziel'}
        </div>
        <button onClick={() => setEditing(true)} className="text-fit-dim/40 hover:text-fit-accent p-1">
          <Pencil size={13} />
        </button>
      </div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xl font-bold text-fit-ink">{(totalKm || 0).toFixed(1)} km</span>
        <span className="text-xs font-semibold text-fit-dim/40">von {goalKm} km</span>
      </div>
      <div className="h-2.5 rounded-full bg-fit-bg2 overflow-hidden">
        <div className="h-full rounded-full bg-fit-orange transition-all" style={{ width: `${pct || 0}%` }} />
      </div>
      <div className="mt-1.5 text-[10px] font-black text-fit-dim/40 text-right">{pct != null ? `${pct}%` : ''}</div>
    </div>
  );
}
