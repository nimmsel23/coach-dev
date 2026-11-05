/**
 * SessionGateSheet — Bottom-Sheet-Portal um SessionGateCard.
 *
 * Aus SessionEditor.jsx herausgelöst (PHASE3_TODO.md Stück 4, letzter
 * Punkt: SessionEditor soll außer Layout-Wrappern kein Inline-JSX mehr
 * enthalten) — rein mechanisch, keine Logik/Werte verändert.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import SessionGateCard from './SessionGateCard.jsx';
import { GateHubBar } from './GatePortalGrid.jsx';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss.js';

export default function SessionGateSheet({
  open, onClose, initialExpanded = false,
  date, sessionGate, currentSubTab, exercises, sessionMode, setSessionMode, block, setBlock, onSplitLongPress, onApplyRoutine, onSubNav, onStart, onStop,
}) {
  // Swipe-down-to-close über den gemeinsamen Hook (gleiches Verhalten wie
  // alle anderen VOS-Sheets: Tempo + Distanz, Scroll hat Vorrang).
  const backdropRef = useRef(null);
  // Hub-Modus: Sheet nach oben herausziehen (oder Chevron tippen) → füllt den
  // Screen, darunter öffnet sich der Schnelleinstieg als großer Hub. Im Hub-Modus
  // ist Wegwischen nach unten deaktiviert; es klappt erst auf Sheet-Größe zurück.
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useSwipeToDismiss(onClose, { enabled: open && !expanded, backdropRef });
  const dragRef = useRef(null);

  useEffect(() => { setExpanded(open && initialExpanded); }, [open, initialExpanded]);

  function onHandleTouchStart(e) { dragRef.current = e.touches[0].clientY; }
  function onHandleTouchEnd(e) {
    if (dragRef.current == null) return;
    const dy = e.changedTouches[0].clientY - dragRef.current;
    dragRef.current = null;
    if (dy < -40) setExpanded(true);
    else if (dy > 40 && expanded) setExpanded(false);
  }

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-200">
      <div ref={backdropRef} className="absolute inset-0 bg-fit-scrim backdrop-blur-xs" onClick={onClose} />
      <div
        ref={sheetRef}
        className={`relative w-full bg-fit-card border-t border-fit-line shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-y-auto overscroll-contain transition-[max-width,height,border-radius] ${expanded ? 'max-w-3xl rounded-t-none sm:rounded-t-[40px]' : 'max-w-xl rounded-t-[32px] sm:rounded-t-[40px]'}`}
        style={expanded
          ? { height: 'calc(100dvh - env(safe-area-inset-top, 0px))' }
          : { maxHeight: 'min(92vh, calc(100dvh - env(safe-area-inset-top, 0px) - 1rem))' }}
      >
        <div className="sticky top-0 bg-fit-card pt-3 pb-2 flex items-center justify-between px-4 sm:px-5 z-10">
          <button
            onClick={() => setExpanded((v) => !v)}
            onTouchStart={onHandleTouchStart}
            onTouchEnd={onHandleTouchEnd}
            aria-label={expanded ? 'Hub einklappen' : 'Hub öffnen'}
            className="mx-auto flex flex-col items-center gap-0.5 px-8 py-1 text-fit-dim"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span className="w-10 h-1 rounded-full bg-fit-line" />
          </button>
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
            sessionMode={sessionMode} setSessionMode={setSessionMode}
            block={block} setBlock={setBlock} onSplitLongPress={onSplitLongPress} onApplyRoutine={onApplyRoutine}
            hub={expanded}
            onLeave={onClose}
            onSubNav={(id) => { onClose(); onSubNav?.(id); }}
            onStart={onStart}
            onStop={onStop}
          />
          {!expanded && (
            <GateHubBar
              currentSubTab={currentSubTab}
              onSubNav={(id) => { onClose(); onSubNav?.(id); }}
              onLeave={onClose}
              onExpand={() => setExpanded(true)}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
