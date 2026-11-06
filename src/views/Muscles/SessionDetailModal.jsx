import { X, Dumbbell } from 'lucide-react';
import { createPortal } from 'react-dom';
import { translateMuscle } from '../../lib/kb/muscles.js';
import { useEscapeKey } from '../../hooks/useEscapeKey.js';

export default function SessionDetailModal({ session, onClose, muscleLanguage = 'de', taxonomy = null }) {
  // ESC schließt das Session-Detail — vor dem Early-Return, sonst würde
  // der Hook nur bedingt aufgerufen (Rules of Hooks).
  useEscapeKey(onClose, !!session);

  if (!session) return null;

  const exercises = Array.isArray(session.exercises) ? session.exercises : [];
  const isActivity = !!session.activity;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-fit-scrim backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-fit-card rounded-[32px] border border-fit-line shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-fit-line/50 flex items-center justify-between bg-gradient-to-r from-fit-card to-fit-bg2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-fit-ink">{session.block || 'Session'}</h3>
            <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-1">{session.date}</div>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-fit-bg2 text-fit-dim transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isActivity && (
            <div className="p-4 rounded-2xl bg-fit-bg2 border border-fit-line">
              <div className="text-[10px] font-black uppercase tracking-widest text-fit-accent mb-1">Activity Finisher</div>
              <div className="text-sm font-bold text-fit-ink">{session.activity.type || 'Activity'} {session.activity.duration ? `· ${session.activity.duration}m` : ''}</div>
            </div>
          )}

          {exercises.length > 0 ? exercises.map((ex, i) => {
            const primary = ex.primaryMuscles || ex.primary_muscles || [];
            const secondary = ex.secondaryMuscles || ex.secondary_muscles || [];
            return (
              <div key={i} className="p-4 rounded-2xl bg-fit-bg2 border border-fit-line flex items-start gap-3">
                <Dumbbell size={14} className="text-fit-accent mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-fit-ink truncate">{ex.name || ex.exercise_id}</div>
                  {[...primary, ...secondary].length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[...primary, ...secondary].map((m, j) => (
                        <span key={j} className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-fit-accent/10 text-fit-accent border border-fit-accent/20">
                          {translateMuscle(m, taxonomy, muscleLanguage)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }) : !isActivity && (
            <p className="text-xs italic opacity-30 text-center py-8">Keine Übungen in dieser Session.</p>
          )}
        </div>

        <div className="p-6 border-t border-fit-line/50 bg-fit-bg2/50 flex justify-end">
          <button onClick={onClose} className="btn bg-fit-card border border-fit-line text-fit-ink px-8 py-2.5 text-[10px] font-black uppercase tracking-widest hover:border-fit-accent transition-all">
            Schließen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
