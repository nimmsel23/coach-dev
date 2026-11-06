/**
 * useSessionSlots — Slots-State + Handler, aus useSession.js herausgelöst
 * (PHASE3_TODO.md Stück 4, rein mechanisch, keine Logik/Werte verändert).
 *
 * Einzige Kopplungsstelle zu useExerciseList.js: `removeSlot()` muss
 * `slotId` bei allen betroffenen Übungen zurücksetzen (sonst würden sie an
 * einen nicht mehr existierenden Slot "gehängt" bleiben und aus der UI
 * verschwinden) — braucht deshalb `setExercises` von außen. Umgekehrt
 * braucht useExerciseList.js NICHTS von hier (moveExercise kennt nur das
 * `slotId`-Feld auf dem Exercise-Objekt selbst, keine Slot-Liste).
 */

import { useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';

export function useSessionSlots({ setExercises, scheduleAutoSave }) {
  // Frei belegbare Sub-Einheiten innerhalb der Session (Warm-up-Block,
  // Cardio-Finisher, Notiz-Abschnitt, ...) — additiv zum bestehenden
  // Activity-Addon-Mechanismus, berührt exercises[] nur über das optionale
  // slotId-Feld (kein Slot definiert -> exakt heutiges Verhalten).
  const [slots, setSlots] = useState([]);

  // Ein Klick legt sofort einen namenlosen Slot an — Umbenennen ist optional
  // und passiert direkt in der Slot-Karte selbst, kein Zwangs-Eingabefeld vorab.
  function addSlot({ label, ...extra }) {
    const id = crypto.randomUUID();
    setSlots(prev => [...prev, { id, label, order: prev.length, ...extra }]);
    scheduleAutoSave();
    return id;
  }

  function removeSlot(id) {
    setSlots(prev => prev.filter(s => s.id !== id));
    setExercises(prev => prev.map(ex => ex.slotId === id ? { ...ex, slotId: null } : ex));
    scheduleAutoSave();
  }

  function updateSlot(id, patch) {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    scheduleAutoSave();
  }

  // Slots untereinander sortierbar machen (PHASE3_TODO.md Stück 3, User-
  // Entscheidung 2026-09-05: volles nested dnd-kit-Sortable statt Pfeil-
  // Buttons). `order` existierte als Feld schon immer, wurde aber nie
  // geändert (nur beim Anlegen als prev.length gesetzt) — hier erstmals
  // tatsächlich neu vergeben, nach demselben Muster wie moveExercise() für
  // einzelne Übungen.
  function reorderSlots(activeId, overId) {
    setSlots(prev => {
      const sorted = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const oldIndex = sorted.findIndex(s => s.id === activeId);
      const newIndex = sorted.findIndex(s => s.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
      return arrayMove(sorted, oldIndex, newIndex).map((s, idx) => ({ ...s, order: idx }));
    });
    scheduleAutoSave();
  }

  return { slots, setSlots, addSlot, removeSlot, updateSlot, reorderSlots };
}
