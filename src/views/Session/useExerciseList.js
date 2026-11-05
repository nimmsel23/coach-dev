/**
 * useExerciseList — Übungs-Mutations-State + Handler, aus useSession.js
 * herausgelöst (PHASE3_TODO.md Stück 4, rein mechanisch, keine
 * Logik/Werte verändert).
 *
 * Interdependenzen (siehe PHASE3_TODO.md, "Vor dem Split dokumentieren"):
 * - `addEx`/`addQuick` müssen nach dem State-Update sofort speichern
 *   (`setTimeout(() => saveRef.current?.(true))`), damit ein direkt danach
 *   einsetzender Auto-Save-Zyklus des Haupthooks nicht mit veraltetem
 *   `dirty`-Flag kollidiert — braucht deshalb `saveRef` (immer die neueste
 *   `save()`-Closure, siehe useSession.js) UND `setDirty` von außen.
 * - Alle übrigen Mutationen (`updateEx`, `addSet`, `replaceSets`, `removeSet`,
 *   `moveEx`/`moveExercise`, `removeEx`) laufen über das normale
 *   `scheduleAutoSave()`-Debounce des Haupthooks — ebenfalls von außen
 *   hereingereicht, kein eigener Autosave-Mechanismus hier.
 * - `moveExercise(exerciseId, targetSlotId, targetContainerIndex)` ist der
 *   Container-bewusste Reorder-Pfad für DnD UND die Pfeil-Buttons
 *   (`moveEx`) — braucht NUR `exercises` (über `slotId`-Feld), keinen
 *   direkten Zugriff auf `slots[]` selbst. Die Slot-Liste lebt bewusst
 *   getrennt in `useSessionSlots.js`; die einzige Kopplungsstelle zwischen
 *   beiden ist `removeSlot()` dort, das `setExercises` von hier braucht
 *   (siehe useSessionSlots.js), nicht umgekehrt.
 */

import { useState } from 'react';
import { getExercise, normalizeExerciseRecord, parseQuick, queueForEnrichment } from '@db';
import { slugify } from './utils';
import { mergeDraftIntoExercises } from '../Plan/lib/sessionDraft.js';

const PLAIN_NUMBER = /^\s*\d+([.,]\d+)?\s*$/;

function templateSetsToSessionSets(rex) {
  const tSets = Array.isArray(rex.templateSets) && rex.templateSets.length
    ? rex.templateSets
    : Array.from({ length: Math.max(1, Math.min(Number(rex.target_sets) || 3, 20)) }, () => ({
      targetReps: rex.target_reps, targetWeight: rex.target_weight,
    }));
  return tSets.map(t => ({
    reps: PLAIN_NUMBER.test(String(t.targetReps ?? '')) ? String(t.targetReps).trim() : '',
    weight: t.targetWeight != null && PLAIN_NUMBER.test(String(t.targetWeight)) ? String(t.targetWeight).trim() : '',
  }));
}

export function useExerciseList({ scheduleAutoSave, showToast, saveRef, setDirty }) {
  const [exercises, setExercises] = useState([]);
  const [quickInput, setQuickInput] = useState('');

  async function addEx(ex, slotId = null) {
    let normalized = normalizeExerciseRecord(ex);
    let primary = normalized.primaryMuscles;
    let secondary = normalized.secondaryMuscles;
    if (primary.length === 0 && secondary.length === 0 && !ex.isNew) {
      try {
        const kbEx = await getExercise(ex.id || ex.name);
        if (kbEx) {
          normalized = normalizeExerciseRecord({ ...kbEx, ...normalized });
          primary = normalized.primaryMuscles;
          secondary = normalized.secondaryMuscles;
        }
      } catch (e) { console.warn('Could not fetch KB data:', e); }
    }
    const displayName = normalized.displayName;
    // Firestore lehnt undefined-Feldwerte ab (setDoc crasht sonst still im
    // Auto-Save) — bei manuell hinzugefügten, noch nicht im Katalog
    // geführten Übungen (isNew) fehlt id/exercise_id, daher slug-Fallback.
    const id = normalized.id || `inbox_${slugify(displayName)}`;
    // Dieselbe Übung erneut per Suche hinzuzufügen (statt "+Satz" auf der
    // schon vorhandenen Karte) erzeugte bisher einen zweiten, dritten, ...
    // exercises[]-Eintrag mit je einem Satz im setsArray -- ein Dropset/
    // mehrere Sätze derselben Übung wurde dadurch als N verschiedene
    // "Übungen" mit gleichem Namen angezeigt statt als eine Übung mit N
    // Sätzen (live an Bestandsdaten reproduziert, siehe Coach-Feedback).
    // Jetzt: existiert die id schon in dieser Session, wird stattdessen ein
    // Satz angehängt (wie addSet()), keine Duplikat-Übung angelegt.
    let merged = false;
    setExercises(prev => {
      const existingIdx = prev.findIndex(e => e.id === id);
      if (existingIdx === -1) {
        return [...prev, {
          id,
          name: displayName,
          primaryMuscles: primary,
          secondaryMuscles: secondary,
          stabilizers: normalized.stabilizers || [],
          setsArray: [{ reps: '', weight: '' }],
          note: '',
          source: normalized.source || (ex.isNew ? 'inbox' : 'unknown'),
          slotId: slotId || null,
        }];
      }
      merged = true;
      return prev.map((e, idx) => {
        if (idx !== existingIdx) return e;
        const last = e.setsArray[e.setsArray.length - 1] || {};
        return { ...e, setsArray: [...e.setsArray, { reps: last.reps || '', weight: last.weight || '' }] };
      });
    });
    if (!merged && normalized.source !== 'expert') queueForEnrichment({ ...normalized, id, name: displayName });
    showToast(merged ? `+ Satz (${displayName})` : `+ ${displayName}`);
    setTimeout(() => { saveRef.current?.(true); setDirty(false); }, 0);
  }

  // Ganze Plan-Vorlage (Routine aus dem Plan-Tab, `getRoutine().exercises`)
  // in einem Rutsch übernehmen — Schnell-Logging per Long-Press auf einen
  // Split-Chip (SplitPlanSheet.jsx). Satzanzahl/Zielwerte kommen aus
  // `templateSets` (bzw. Legacy `target_sets`/`target_reps`); Rep-Bereiche
  // wie "8-12" bleiben leer statt eine Zahl zu erfinden — die Vorwerte der
  // letzten Session stehen ohnehin als Platzhalter/"Übernehmen" bereit.
  // Bereits in der Session vorhandene Übungen werden übersprungen.
  function addFromTemplate(templateExercises = [], slotId = null) {
    const candidates = [];
    const seen = new Set();
    for (const rex of templateExercises) {
      const normalized = normalizeExerciseRecord({
        name: rex.name,
        id: rex.exercise_id || null,
        exercise_id: rex.exercise_id || null,
        primaryMuscles: rex.primaryMuscles || [],
        secondaryMuscles: rex.secondaryMuscles || [],
      });
      const id = normalized.id || `inbox_${slugify(normalized.displayName)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({
        id,
        name: normalized.displayName,
        primaryMuscles: normalized.primaryMuscles,
        secondaryMuscles: normalized.secondaryMuscles,
        stabilizers: normalized.stabilizers || [],
        setsArray: templateSetsToSessionSets(rex),
        note: '',
        source: rex.exercise_id ? 'plan' : 'inbox',
        slotId: slotId || null,
      });
    }
    // Zählung gegen den aktuellen Render-Stand (der Updater unten läuft bei
    // React-Batching erst später), Dedup im Updater nochmal gegen `prev`.
    const present = new Set(exercises.map(e => e.id));
    const added = candidates.filter(c => !present.has(c.id)).length;
    if (!added) return 0;
    setExercises(prev => {
      const ids = new Set(prev.map(e => e.id));
      return [...prev, ...candidates.filter(c => !ids.has(c.id))];
    });
    setTimeout(() => { saveRef.current?.(true); setDirty(false); }, 0);
    return added;
  }

  // Drill 6: vorbereiteten Plan-/Vorlagen-Entwurf in die laufende Session einfügen.
  function appendDraft(draft) {
    if (!draft?.exercises?.length) return;
    setExercises(prev => mergeDraftIntoExercises(prev, draft));
    showToast(`+ ${draft.block || 'Workout'}`);
    setTimeout(() => { saveRef.current?.(true); setDirty(false); }, 0);
  }

  function addQuick() {
    if (!quickInput.trim()) return;
    const parsed = parseQuick(quickInput);
    if (parsed) {
      // parseQuick liefert keine id — ohne die wären Quick-Adds nicht von
      // updateEx/removeEx/DnD adressierbar (id ist der Sortable-/Dedup-Key
      // aller Übungen dieser Session, siehe addEx()).
      const id = `inbox_${slugify(parsed.name)}`;
      const ex = { ...parsed, id, source: 'inbox', slotId: null };
      setExercises(prev => [...prev, ex]);
      setQuickInput('');
      showToast(`+ ${ex.name}`);
      setTimeout(() => { saveRef.current?.(true); setDirty(false); }, 0);
    }
  }

  function updateEx(i, field, value, setIdx = null) {
    setExercises(prev => prev.map((ex, idx) => {
      if (idx !== i) return ex;
      if (setIdx !== null) {
        const newSets = [...ex.setsArray];
        newSets[setIdx] = { ...newSets[setIdx], [field]: value };
        return { ...ex, setsArray: newSets };
      }
      return { ...ex, [field]: value };
    }));
    scheduleAutoSave();
  }

  function addSet(i) {
    setExercises(prev => prev.map((ex, idx) => {
      if (idx !== i) return ex;
      const last = ex.setsArray[ex.setsArray.length - 1] || {};
      return { ...ex, setsArray: [...ex.setsArray, { reps: last.reps || '', weight: last.weight || '' }] };
    }));
    scheduleAutoSave();
  }

  function replaceSets(i, newSets) {
    setExercises(prev => prev.map((ex, idx) => idx !== i ? ex : { ...ex, setsArray: newSets }));
    scheduleAutoSave();
  }

  function removeSet(i, setIdx) {
    setExercises(prev => prev.map((ex, idx) => {
      if (idx !== i || ex.setsArray.length <= 1) return ex;
      return { ...ex, setsArray: ex.setsArray.filter((_, sIdx) => sIdx !== setIdx) };
    }));
    scheduleAutoSave();
  }

  // Ein Exercise-Eintrag wird in einen anderen Container (Basis oder ein
  // bestimmter Slot) und/oder an eine andere Position innerhalb dieses
  // Containers verschoben — Grundlage für DnD UND für die Pfeil-Buttons
  // (moveEx unten), damit beide denselben, korrekten Container-Begriff
  // benutzen statt naiv im flachen Gesamt-Array zu tauschen (das würde
  // Nachbarn aus fremden Containern dazwischenrutschen lassen).
  function moveExercise(exerciseId, targetSlotId, targetContainerIndex) {
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === exerciseId);
      if (idx === -1) return prev;
      const item = { ...prev[idx], slotId: targetSlotId || null };
      const rest = prev.filter(e => e.id !== exerciseId);
      const containerItems = rest.filter(e => (e.slotId || null) === (targetSlotId || null));
      const clamped = Math.max(0, Math.min(targetContainerIndex, containerItems.length));
      const anchor = containerItems[clamped];
      const insertAt = anchor ? rest.findIndex(e => e.id === anchor.id) : rest.length;
      const next = [...rest];
      next.splice(insertAt, 0, item);
      return next;
    });
    scheduleAutoSave();
  }

  function moveEx(i, direction) {
    const ex = exercises[i];
    if (!ex) return;
    const containerId = ex.slotId || null;
    const containerItems = exercises.filter(e => (e.slotId || null) === containerId);
    const localIdx = containerItems.findIndex(e => e.id === ex.id);
    moveExercise(ex.id, containerId, localIdx + direction);
  }

  function removeEx(i) {
    setExercises(prev => prev.filter((_, idx) => idx !== i));
    scheduleAutoSave();
  }

  return {
    exercises, setExercises,
    quickInput, setQuickInput,
    addEx, addFromTemplate, addQuick, appendDraft, updateEx, addSet, replaceSets, removeSet, moveEx, moveExercise, removeEx,
  };
}
