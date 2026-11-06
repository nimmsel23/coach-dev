/**
 * SessionSlots — frei belegbare Sub-Einheiten innerhalb einer Session.
 *
 * Additiv zum bestehenden ActivityAddon-Finisher: der User legt selbst fest,
 * ob/welche Slots er nutzt (Exercises-Block, Activity, Notiz). Leeres
 * `slots`-Array => diese Komponente rendert nichts, keine Verhaltensänderung.
 *
 * Slots selbst sind seit Phase-3-Stück-3 per dnd-kit sortierbar (Griff-Icon
 * je Karte, analog zum SortableExerciseRow-Muster in ExerciseList.jsx) —
 * teilt sich den einen DndContext aus SessionEditor.jsx mit den Exercise-
 * Listen; `data: { type: 'slot' }` unterscheidet dort, welcher Reorder-Pfad
 * bei onDragEnd greift. Braucht deshalb wie ExerciseList.jsx zwingend einen
 * umschließenden <DndContext> im Parent.
 */

import { useEffect, useState } from 'react';
import { Plus, ChevronDown, GripVertical } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SlotCard from './SlotCard.jsx';
import { getSlotTemplates } from '@db';

// Drag-Handle-Wrapper um SlotCard, gleiches Muster wie SortableExerciseRow
// in ExerciseList.jsx — Listener sitzen nur am Griff-Icon, sonst wären
// Inputs/Buttons in SlotCard (inkl. der verschachtelten ExerciseList) nicht
// mehr klickbar.
function SortableSlotRow({ slot, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    data: { type: 'slot' },
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
        className="shrink-0 mt-4 w-5 h-8 flex items-center justify-center text-fit-dim/40 hover:text-fit-dim cursor-grab active:cursor-grabbing touch-none"
        aria-label="Slot verschieben"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function SessionSlots({ slots = [], exercises = [], block, addSlot, removeSlot, updateSlot, ...exerciseListProps }) {
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (!block) { setTemplates([]); return; }
    let alive = true;
    getSlotTemplates(block).then(t => { if (alive) setTemplates(t || []); }).catch(() => {});
    return () => { alive = false; };
  }, [block]);

  // Ein Klick legt sofort einen namenlosen Slot an — Umbenennen ist optional
  // und passiert direkt in der Slot-Karte selbst, kein Zwangs-Eingabefeld vorab.
  // Kein Auto-Timestamp: Sessions werden immer nachträglich geloggt, eine
  // "jetzt"-Uhrzeit beim Anlegen wäre erfunden, nicht die echte Trainingszeit.
  function handleAdd() {
    addSlot({ label: `Slot ${slots.length + 1}` });
  }

  // Baustein anwenden = Slot 1:1 aus der Vorlage nachbauen (Übungen +
  // Activity + Notiz, je nachdem was die Vorlage enthält).
  async function handleUseTemplate(tpl) {
    const id = addSlot({
      label: tpl.label,
      ...(tpl.activityType ? { activityType: tpl.activityType, duration: tpl.duration } : {}),
      ...(tpl.text ? { text: tpl.text } : {}),
    });
    if (Array.isArray(tpl.exercises)) {
      for (const ex of tpl.exercises) {
        await exerciseListProps.exerciseOps.addEx(ex, id);
      }
    }
    setShowTemplates(false);
  }

  const sorted = [...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="space-y-3">
      <SortableContext items={sorted.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {sorted.map(slot => (
            <SortableSlotRow key={slot.id} slot={slot}>
              <SlotCard
                slot={slot}
                block={block}
                exercises={exercises.filter(e => e.slotId === slot.id)}
                updateSlot={updateSlot}
                removeSlot={removeSlot}
                exerciseListProps={exerciseListProps}
              />
            </SortableSlotRow>
          ))}
        </div>
      </SortableContext>

      {templates.length > 0 && (
        <div>
          <button
            onClick={() => setShowTemplates(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] text-fit-dim hover:text-fit-ink transition-all"
          >
            <span>Aus deinen Bausteinen ({block})</span>
            <ChevronDown size={13} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </button>
          {showTemplates && (
            <div className="space-y-1.5 mt-1.5">
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => handleUseTemplate(tpl)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-fit-bg2 border border-fit-line text-left hover:border-fit-accent/40 transition-all"
                >
                  <span className="text-xs font-bold text-fit-ink">{tpl.label}</span>
                  <span className="text-[9px] font-black uppercase tracking-wide text-fit-dim opacity-50">
                    {[
                      tpl.exercises?.length ? `${tpl.exercises.length} Übungen` : null,
                      tpl.activityType ? 'Activity' : null,
                      tpl.text ? 'Notiz' : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-2xl border border-dashed border-fit-line text-fit-dim hover:border-fit-accent/40 hover:text-fit-accent hover:bg-fit-accent/5 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-200"
      >
        <Plus size={13} strokeWidth={3} />
        Slot hinzufügen
      </button>
    </div>
  );
}
