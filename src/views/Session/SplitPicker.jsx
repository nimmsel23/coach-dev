/**
 * SplitPicker — 1-Klick-Auswahl der Trainingsart (Push/Pull/Legs/...), direkt
 * unter dem Datumspicker im SessionHeader verankert. Vorher stand dieselbe
 * Auswahl (als generisches Button-Grid) hinter "Weitere Details" versteckt in
 * SessionSidebar — die Hürde, überhaupt einen Split für den Tag festzuhalten,
 * war dadurch unnötig hoch. Bewusst eigenständige, kompakte Chip-Reihe statt
 * Wiederverwendung des alten Grid-Stils.
 */

import { useRef, useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Footprints, ChevronsUp, ChevronsDown, CircleDot, Triangle, Dumbbell } from 'lucide-react';
import { blockColor } from './utils';

// SPLITS ist NICHT die einzige Stelle mit Push/Pull/Legs-Vokabular im Repo —
// bewusst NICHT zusammengeführt (Phase-1-Audit 2026-09-05, zu riskant für
// diese Phase), nur dokumentiert. Bekannte Duplikate:
// - src/components/PlanBuilder.jsx (`push_day`/`pull_day`/`legs_day`/
//   `full_body`-Templates, eigenes Label-Vokabular inkl. "Full Body" statt
//   "Full" hier)
// - src/views/WeeklyReview/ReviewPPLBalance.jsx (nur push/pull/legs, mit
//   zusätzlichen Muskel-Region-Zuordnungen pro Split, kein Upper/Lower/Full)
// - src/views/Session/utils.js::normalizeBlock()/inferBlockFromExercises()
//   kennt bereits das Vokabular-Mismatch "Full" vs. "Full Body" und
//   normalisiert dort separat
// Details + Stand: PHASE1_TODO.md.
const SPLITS = [
  { key: 'Push',  icon: ArrowUpCircle },
  { key: 'Pull',  icon: ArrowDownCircle },
  { key: 'Legs',  icon: Footprints },
  { key: 'Upper', icon: ChevronsUp },
  { key: 'Lower', icon: ChevronsDown },
  { key: 'Full',  icon: CircleDot },
  { key: 'Shoulders', icon: Triangle },
  { key: 'Arms',  icon: Dumbbell },
];

// Long-Press (≥ LONG_PRESS_MS halten, ohne zu verrutschen) öffnet über
// `onLongPress(key)` die passenden Plan-Vorlagen (SplitPlanSheet.jsx).
// Rechtsklick am Desktop macht dasselbe. Der normale Tap bleibt die
// 1-Klick-Split-Auswahl.
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

export default function SplitPicker({ block, setBlock, onLongPress }) {
  const [hovered, setHovered] = useState(null);
  const pressRef = useRef(null);   // { key, x, y, timer }
  const firedRef = useRef(false);  // Long-Press ausgelöst → folgenden Click schlucken

  const cancelPress = () => {
    if (pressRef.current?.timer) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  const startPress = (key, e) => {
    if (!onLongPress || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelPress();
    firedRef.current = false;
    pressRef.current = {
      key, x: e.clientX, y: e.clientY,
      timer: setTimeout(() => {
        firedRef.current = true;
        pressRef.current = null;
        navigator.vibrate?.(15);
        onLongPress(key);
      }, LONG_PRESS_MS),
    };
  };

  const movePress = (e) => {
    const p = pressRef.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) cancelPress();
  };

  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
      {SPLITS.map(({ key, icon: Icon }) => {
        const isActive = block === key;
        const isHovered = hovered === key && !isActive;
        const color = blockColor(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            title={onLongPress ? `${key} · lange drücken für Pläne` : key}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
            onPointerDown={e => startPress(key, e)}
            onPointerMove={movePress}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            onContextMenu={e => {
              if (!onLongPress) return;
              e.preventDefault();
              if (firedRef.current) return; // Touch-Long-Press hat schon geöffnet
              cancelPress();
              firedRef.current = true; // nächster pointerdown setzt zurück
              onLongPress(key);
            }}
            onClick={() => {
              if (firedRef.current) { firedRef.current = false; return; }
              setBlock(isActive ? '' : key);
            }}
            className="group relative min-h-11 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-all duration-200 ease-out active:scale-95 select-none [-webkit-touch-callout:none]"
            style={{
              background: isActive ? color : isHovered ? `${color}1a` : 'var(--card)',
              color: isActive ? '#000' : isHovered ? color : 'var(--dim)',
              border: `1px solid ${isActive ? color : isHovered ? `${color}80` : 'var(--line)'}`,
              boxShadow: isActive
                ? `0 4px 12px -4px ${color}66`
                : isHovered
                  ? `0 4px 14px -8px ${color}70`
                  : 'none',
              transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            <Icon
              size={14}
              strokeWidth={2.5}
              className="transition-transform duration-200 ease-out group-hover:scale-125 group-active:scale-95"
            />
            {key}
          </button>
        );
      })}
    </div>
  );
}
