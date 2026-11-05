/**
 * SplitPlanSheet — Bottom-Sheet, das per Long-Press auf einen Split-Chip
 * (SplitPicker) aufgeht und die passenden Vorlagen aus dem Plan-Tab
 * (Routines, `views/Plan/api.js`) anbietet. Antippen einer Vorlage setzt den
 * Split und übernimmt alle Übungen samt Satzanzahl in die Session
 * (`addFromTemplate`, useExerciseList.js) — Schnell-Logging statt jede
 * Übung einzeln zu suchen.
 *
 * Zuordnung Vorlage → Split: gesetzte Kategorie, sonst aus dem Namen
 * erkannt (Plan-Tab-Auto-Ordner, splitFolders.js). Passt keine, werden alle
 * Vorlagen gezeigt.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ClipboardList, ChevronRight } from 'lucide-react';
import { api } from '../Plan/api.js';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss.js';
import { blockColor } from './utils';
import { groupRoutinesIntoFolders } from '../Plan/lib/splitFolders.js';

// Dieselbe Split-Erkennung wie die Auto-Ordner im Plan-Tab
// (views/Plan/lib/splitFolders.js): eine Vorlage erscheint hier genau unter
// dem Split, in dessen Ordner sie dort einsortiert ist.
export function routineMatchesSplit(routine, split) {
  const { folderNames } = groupRoutinesIntoFolders([routine]);
  return folderNames[0] === split;
}

export default function SplitPlanSheet({ split, onClose, onPick }) {
  const open = !!split;
  const backdropRef = useRef(null);
  const sheetRef = useSwipeToDismiss(onClose, { enabled: open, backdropRef });
  const [routines, setRoutines] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRoutines(null);
    setError('');
    api.get('/routines')
      .then(d => { if (!cancelled) setRoutines(d?.routines || []); })
      .catch(() => { if (!cancelled) { setRoutines([]); setError('Pläne konnten nicht geladen werden'); } });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const matching = (routines || []).filter(r => routineMatchesSplit(r, split));
  const others = (routines || []).filter(r => !routineMatchesSplit(r, split));
  const color = blockColor(split);

  async function pick(routine) {
    if (busyId) return;
    setBusyId(routine.id);
    try {
      const d = await api.get(`/routines/${routine.id}`);
      await onPick(split, d?.routine || { ...routine, exercises: [] });
      onClose();
    } catch {
      setError('Plan konnte nicht geladen werden');
    } finally {
      setBusyId(null);
    }
  }

  const renderRow = (r) => (
    <button
      key={r.id}
      type="button"
      disabled={!!busyId}
      onClick={() => pick(r)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.99] disabled:opacity-60"
      style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}
    >
      <div className="min-w-0">
        <div className="text-sm font-black truncate" style={{ color: 'var(--ink)' }}>{r.name || 'Ohne Namen'}</div>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--dim)', opacity: 0.6 }}>
          {r.exerciseCount ?? 0} Übungen{r.category ? ` · ${r.category}` : ''}
        </div>
      </div>
      {busyId === r.id
        ? <Loader2 size={16} className="animate-spin shrink-0" style={{ color }} />
        : <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--dim)' }} />}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-200">
      <div ref={backdropRef} className="absolute inset-0 bg-fit-scrim backdrop-blur-xs" onClick={onClose} />
      <div
        ref={sheetRef}
        className="relative w-full max-w-xl bg-fit-card border-t border-fit-line rounded-t-[32px] sm:rounded-t-[40px] shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[80vh] overflow-y-auto overscroll-contain"
      >
        <div className="sticky top-0 bg-fit-card pt-3 pb-2 px-4 sm:px-5 z-10">
          <div className="w-10 h-1 rounded-full bg-fit-line mx-auto" />
          <button
            onClick={onClose}
            className="absolute right-4 top-3 p-1.5 rounded-lg text-fit-dim hover:text-fit-ink transition-colors"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
          <div className="mt-3 flex items-center gap-2">
            <ClipboardList size={16} style={{ color }} />
            <span className="text-base font-black" style={{ color: 'var(--ink)' }}>{split}-Pläne</span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--dim)' }}>
            Antippen übernimmt alle Übungen in die heutige Session.
          </div>
        </div>

        <div className="px-4 sm:px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-2">
          {routines === null && (
            <div className="flex items-center gap-2 py-6 justify-center text-xs" style={{ color: 'var(--dim)' }}>
              <Loader2 size={14} className="animate-spin" /> Pläne laden…
            </div>
          )}
          {error && <div className="text-xs font-bold" style={{ color: 'var(--red)' }}>{error}</div>}
          {routines && routines.length === 0 && !error && (
            <div className="py-6 text-center text-xs" style={{ color: 'var(--dim)' }}>
              Noch keine Vorlagen — im Plan-Tab anlegen oder ein Workout „Als Vorlage" speichern.
            </div>
          )}
          {matching.map(renderRow)}
          {routines && routines.length > 0 && others.length > 0 && (
            <>
              <div className="pt-3 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--dim)', opacity: 0.5 }}>
                {matching.length ? 'Weitere Vorlagen' : `Keine ${split}-Vorlage gefunden · alle Vorlagen`}
              </div>
              {others.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
