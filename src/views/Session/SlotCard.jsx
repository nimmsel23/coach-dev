/**
 * SlotCard — eine einzelne Session-Slot-Karte (Übungen + Activity + Notiz).
 *
 * Aus SessionSlots.jsx herausgelöst (PHASE3_TODO.md Stück 3, rein
 * mechanisch, keine Logik verändert). Der Slot selbst IST der Baustein:
 * "Als Baustein speichern" snapshotted 1:1, was der Slot aktuell enthält —
 * kein exklusiver Typ, Übungen/Activity/Notiz sind frei kombinierbar.
 */

import { useState } from 'react';
import { X, Save, Check } from 'lucide-react';
import ExerciseList from './ExerciseList';
import { ADDON_TYPES } from './ActivityAddon';
import { saveSlotTemplate } from '@db';

export default function SlotCard({ slot, exercises, block, updateSlot, removeSlot, exerciseListProps }) {
  const [saved, setSaved] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const hasContent = exercises.length > 0 || !!slot.activityType || !!slot.text;

  async function handleSaveTemplate() {
    const template = {
      id: crypto.randomUUID(),
      block: block || '',
      label: slot.label,
      ...(exercises.length > 0 ? {
        exercises: exercises.map(ex => ({
          id: ex.id, name: ex.name,
          primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles,
          stabilizers: ex.stabilizers, source: ex.source,
        })),
      } : {}),
      ...(slot.activityType ? { activityType: slot.activityType, duration: slot.duration } : {}),
      ...(slot.text ? { text: slot.text } : {}),
    };
    await saveSlotTemplate(template);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-[24px] border border-fit-line bg-fit-card p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2">
        <input
          value={slot.label || ''}
          onChange={e => updateSlot(slot.id, { label: e.target.value })}
          placeholder="Slot"
          className="flex-1 min-w-0 bg-transparent text-[11px] font-black uppercase tracking-[0.15em] text-fit-ink outline-none"
        />
        {hasContent && (
          <button
            onClick={handleSaveTemplate}
            title="Als Baustein speichern"
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-fit-dim hover:text-fit-accent hover:bg-fit-accent/10 transition-all"
          >
            {saved ? <Check size={13} /> : <Save size={13} />}
          </button>
        )}
        <button
          onClick={() => removeSlot(slot.id)}
          title="Slot entfernen"
          className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-fit-dim hover:text-fit-red hover:bg-fit-red/10 transition-all"
        >
          <X size={13} />
        </button>
      </div>

      {/* Ein Slot ist eine Mini-Session: Übungen, Activity und Notiz sind
          unabhängig voneinander kombinierbar, nicht exklusiv nach `type`. */}
      <ExerciseList
        {...exerciseListProps}
        containerId={slot.id}
        exercises={exercises}
        exerciseOps={{
          ...exerciseListProps.exerciseOps,
          addEx: (ex) => exerciseListProps.exerciseOps.addEx(ex, slot.id),
        }}
      />

      {(showActivity || slot.activityType) && (
        <div className="flex gap-2">
          <select
            value={slot.activityType || 'hiit'}
            onChange={e => updateSlot(slot.id, { activityType: e.target.value })}
            className="flex-1 px-3 py-2.5 rounded-xl bg-fit-bg2 border border-fit-line text-fit-ink text-sm font-bold outline-none"
          >
            {ADDON_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Min"
            value={slot.duration || ''}
            onChange={e => updateSlot(slot.id, { duration: e.target.value })}
            className="w-16 px-2 py-2.5 rounded-xl bg-fit-bg2 border border-fit-line text-fit-ink font-bold text-sm text-center outline-none"
          />
        </div>
      )}

      {(showNote || slot.text) && (
        <textarea
          autoFocus={showNote && !slot.text}
          value={slot.text || ''}
          onChange={e => updateSlot(slot.id, { text: e.target.value })}
          placeholder="Notiz..."
          rows={2}
          className="w-full p-3 rounded-xl border bg-fit-bg2 border-fit-line text-fit-ink text-sm outline-none resize-none"
        />
      )}

      {(!(showActivity || slot.activityType) || !(showNote || slot.text)) && (
        <div className="flex gap-4">
          {!(showActivity || slot.activityType) && (
            <button onClick={() => setShowActivity(true)} className="text-[10px] font-bold text-fit-dim hover:text-fit-accent transition-colors">
              + Activity
            </button>
          )}
          {!(showNote || slot.text) && (
            <button onClick={() => setShowNote(true)} className="text-[10px] font-bold text-fit-dim hover:text-fit-accent transition-colors">
              + Notiz
            </button>
          )}
        </div>
      )}
    </div>
  );
}
