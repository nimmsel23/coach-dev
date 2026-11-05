/**
 * GateNextPlanCard — Karte "Nächster Plan" im Gate-Sheet: zeigt die heutige Routine aus dem
 * aktiven Zyklus (useTodayPlan, dieselbe Quelle wie TodayPlan) und übernimmt ihre Übungen mit
 * einem Tipp in die Session — ohne in den Plan-Tab zu gehen. Ohne aktiven Zyklus oder
 * Routine rendert die Karte nichts.
 */

import { useState } from 'react';
import { ClipboardList, Plus, Loader2 } from 'lucide-react';
import { useTodayPlan } from './TodayPlan.jsx';

export default function GateNextPlanCard({ onApply, className = '' }) {
  const { loading, cycle, nextRoutine } = useTodayPlan();
  const [busy, setBusy] = useState(false);
  if (loading || !cycle || !nextRoutine) return null;

  const exercises = nextRoutine.exercises || [];
  const title = nextRoutine.label || nextRoutine.name || 'Nächste Routine';

  async function apply() {
    if (busy || !exercises.length) return;
    setBusy(true);
    try { await onApply?.(nextRoutine); } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-2xl p-3 flex items-center gap-3 ${className}`} style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
      <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--card)' }}>
        <ClipboardList size={16} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold tracking-[0.15em] font-mono truncate" style={{ color: 'var(--dim)', opacity: 0.6 }}>
          NÄCHSTER PLAN{cycle.name ? ` · ${String(cycle.name).toUpperCase()}` : ''}
        </div>
        <div className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{title}</div>
        <div className="text-[11px]" style={{ color: 'var(--dim)' }}>{exercises.length} Übungen</div>
      </div>
      <button
        type="button"
        onClick={apply}
        disabled={busy || !exercises.length}
        className="shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#000' }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.5} />}
        Übernehmen
      </button>
    </div>
  );
}
