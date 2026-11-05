/**
 * SessionGateSheet — Bottom-Sheet-Portal um SessionGateCard.
 *
 * Aus SessionEditor.jsx herausgelöst (PHASE3_TODO.md Stück 4, letzter
 * Punkt: SessionEditor soll außer Layout-Wrappern kein Inline-JSX mehr
 * enthalten) — rein mechanisch, keine Logik/Werte verändert.
 */

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import SessionGateCard from './SessionGateCard.jsx';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss.js';

export default function SessionGateSheet({
  open, onClose,
  date, sessionGate, currentSubTab, exercises, onSubNav, onStart, onStop,
}) {
  // Swipe-down-to-close über den gemeinsamen Hook (gleiches Verhalten wie
  // alle anderen VOS-Sheets: Tempo + Distanz, Scroll hat Vorrang).
  const backdropRef = useRef(null);
  const sheetRef = useSwipeToDismiss(onClose, { enabled: open, backdropRef });

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-200">
      <div ref={backdropRef} className="absolute inset-0 bg-fit-scrim backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className="relative w-full max-w-xl bg-fit-card border-t border-fit-line rounded-t-[32px] sm:rounded-t-[40px] shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[92vh] overflow-y-auto overscroll-contain"
      >
        <div className="sticky top-0 bg-fit-card pt-3 pb-2 flex items-center justify-between px-4 sm:px-5 z-10">
          <div className="w-10 h-1 rounded-full bg-fit-line mx-auto" />
          <button
            onClick={onClose}
            className="absolute right-4 top-3 p-1.5 rounded-lg text-fit-dim hover:text-fit-ink transition-colors"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-2 sm:px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SessionGateCard
            date={date}
            sessionGate={sessionGate}
            currentSubTab={currentSubTab}
            exercises={exercises}
            onLeave={onClose}
            onSubNav={(id) => { onClose(); onSubNav?.(id); }}
            onStart={onStart}
            onStop={onStop}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
