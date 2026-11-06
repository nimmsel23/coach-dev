/**
 * ExerciseList — Container for exercise cards + add/quick-add controls.
 * Upgraded version of ExerciseSection.jsx.
 *
 * Harte Abhängigkeit (PHASE3_TODO.md Stück 2): braucht einen umschließenden
 * <DndContext> aus @dnd-kit/core im Parent — useDroppable()/useSortable()
 * werfen sonst, es gibt keinen lokalen Fallback. Aktuell stellt
 * SessionEditor.jsx genau einen DndContext für die Basisliste UND alle
 * Slot-Listen (SessionSlots.jsx) gemeinsam bereit.
 *
 * exerciseOps bündelt die reinen Übungs-Mutations-Handler + Quick-Input-
 * State aus useSession.js (vorher 11 einzeln durchgereichte Props) — reine
 * Anzeige-/Kontext-Props (exercises, restHours, muscleRecovery, date,
 * prevMap, onInspectExercise) bleiben einzeln, weil sie je nach Aufrufer
 * (Basis-Abschnitt vs. einzelner Slot) unterschiedlich sind.
 */

import { useState } from 'react';
import { Dumbbell, Plus, Search, GripVertical } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ExerciseCard from './ExerciseCard';
import ExerciseSearchOverlay from '../../components/ExerciseSearchOverlay';
import { previousExerciseFor } from '../../lib/db/shared/previousExercise.js';

// Drag-Handle-Wrapper um ExerciseCard: Listener/Attribute sitzen nur am
// Griff-Icon, nicht auf der ganzen Karte — sonst wären Inputs/Buttons in
// ExerciseCard nicht mehr klickbar, weil dnd-kit Pointer-Events abfängt.
function SortableExerciseRow({ ex, containerId, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ex.id,
    data: { type: 'exercise', containerId },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1">
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 mt-3.5 w-5 h-8 flex items-center justify-center text-fit-dim/40 hover:text-fit-dim cursor-grab active:cursor-grabbing touch-none"
        aria-label="Übung verschieben"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function ExerciseList({
  exercises = [], restHours, muscleRecovery = {}, containerId = '__base__',
  date, prevMap = [], onInspectExercise,
  exerciseOps,
}) {
  const {
    updateEx, addSet, removeSet, removeEx, replaceSets, moveEx,
    addEx, quickInput, setQuickInput, addQuick, onToast,
  } = exerciseOps;
  const [showSearch, setShowSearch] = useState(false);
  const safe = Array.isArray(exercises) ? exercises : [];
  const { setNodeRef: setDroppableRef } = useDroppable({ id: containerId });

  return (
    <div className="space-y-5">

      {/* Rest hours badge */}
      {restHours !== null && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium" style={{ color: 'var(--dim)' }}>
          <span style={{ color: 'var(--accent)' }}>⏱</span> {restHours}h seit letztem Training
        </div>
      )}

      {/* Exercise cards */}
      <SortableContext items={safe.map(ex => ex.id)} strategy={verticalListSortingStrategy}>
        <div ref={setDroppableRef} className="space-y-2 min-h-[8px]">
          {safe.map((ex, idx) => (
            <SortableExerciseRow key={ex.id} ex={ex} containerId={containerId}>
              <ExerciseCard
                ex={ex}
                i={ex.__i ?? idx}
                muscleRecovery={muscleRecovery}
                updateEx={updateEx}
                addSet={addSet}
                removeSet={removeSet}
                removeEx={removeEx}
                replaceSets={replaceSets}
                moveEx={moveEx}
                isFirst={idx === 0}
                isLast={idx === safe.length - 1}
                prev={previousExerciseFor(prevMap, ex)}
                onInspectExercise={onInspectExercise}
                onToast={onToast}
              />
            </SortableExerciseRow>
          ))}

          {/* Empty state */}
          {safe.length === 0 && (
            <div className="flex flex-col items-center justify-center px-3 py-6 sm:py-12 text-center rounded-2xl" style={{ border: '1px dashed var(--line)' }}>
              <Dumbbell size={20} style={{ color: 'var(--dim)', opacity: 0.4 }} className="mb-2" />
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Noch keine Übungen
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>
                Übung hinzufügen oder Quick-Input nutzen
              </p>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Add controls */}
      <div className="space-y-2">
        {/* Primary: Search */}
        <button
          onClick={() => setShowSearch(true)}
          className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-95"
          style={{
            background: 'var(--accent)',
            color: '#000',
            boxShadow: '0 6px 20px -4px var(--accent-glow)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <Plus size={16} strokeWidth={3} />
            Übung hinzufügen
          </div>
          <Search size={14} style={{ opacity: 0.5 }} />
        </button>

        {/* Secondary: Quick input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addQuick()}
            placeholder="Quick: bench 3×8@80"
            aria-label="Übung als Quick-Input eingeben"
            className="min-w-0 flex-1 px-4 py-3 rounded-xl font-mono text-base outline-none transition-all"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(200,255,0,0.06)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <button
            onClick={addQuick}
            aria-label="Quick-Input hinzufügen"
            className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
            }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {showSearch && (
        <ExerciseSearchOverlay
          onSelect={addEx}
          onClose={() => setShowSearch(false)}
          date={date}
        />
      )}
    </div>
  );
}
