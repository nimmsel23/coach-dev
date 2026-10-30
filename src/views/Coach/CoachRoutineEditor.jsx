import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Trash2 } from 'lucide-react';
import {
  deleteRoutineExercise,
  getRoutine,
  reorderRoutineExercises,
  updateWorkoutRoutine,
  updateRoutineExercise,
  addRoutineExercise,
} from '@db';
import ExerciseSearch from '../Plan/components/ExerciseSearch.jsx';

export default function CoachRoutineEditor({ coachUid, routineId, onBack }) {
  const [routine, setRoutine] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const result = await getRoutine(routineId, coachUid);
    setRoutine(result.routine);
    setExercises(result.routine.exercises || []);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, [routineId, coachUid]);

  async function saveName() {
    if (!routine) return;
    setBusy(true);
    try { await updateWorkoutRoutine(routineId, { name: routine.name.trim() || 'Workout-Einheit' }, coachUid); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function addExercise(exercise) {
    setBusy(true);
    try {
      await addRoutineExercise(routineId, {
        exercise_id: exercise.id,
        name: exercise.name,
        primaryMuscles: exercise.primaryMuscles || exercise.primary_muscles || [],
        secondaryMuscles: exercise.secondaryMuscles || exercise.secondary_muscles || [],
        yuhonas_id: exercise.yuhonas_id || null,
        equipment: exercise.equipment || [],
        instructions: exercise.instructions || [],
        trackingType: exercise.trackingType || 'weight_reps',
      }, coachUid);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function patchExercise(id, patch) {
    setBusy(true);
    try {
      await updateRoutineExercise(routineId, id, patch, coachUid);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function removeExercise(id) {
    setBusy(true);
    try {
      await deleteRoutineExercise(routineId, id, coachUid);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= exercises.length) return;
    const reordered = [...exercises];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusy(true);
    try {
      await reorderRoutineExercises(routineId, reordered.map((item, order) => ({ id: item.id, order })), coachUid);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (!routine) return <div className="p-5 text-sm text-fit-muted">{error || 'Einheit wird geladen…'}</div>;

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-fit-muted"><ArrowLeft size={16} /> Zur Programmbibliothek</button>
      <header className="rounded-2xl border border-fit-line bg-fit-card p-4">
        <label className="block text-xs font-semibold text-fit-muted">WORKOUT-EINHEIT
          <input value={routine.name} onChange={(event) => setRoutine({ ...routine, name: event.target.value })}
            onBlur={saveName} className="mt-1 w-full rounded-xl border border-fit-line bg-fit-bg px-3 py-2 text-lg font-semibold text-fit-ink" />
        </label>
        <p className="mt-2 text-sm text-fit-muted">Übungen, Vorgaben und Reihenfolge bearbeiten. Diese Vorlage bleibt beim Veröffentlichen als eigene Version erhalten.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-fit-red">{error}</p>}
      <ExerciseSearch onAdd={addExercise} exclude={exercises.map((item) => item.exercise_id || item.id)} />
      {!exercises.length && <p className="rounded-xl border border-dashed border-fit-line p-4 text-sm text-fit-muted">Suche eine Übung und füge sie zur Einheit hinzu.</p>}
      <div className="space-y-3">
        {exercises.map((exercise, index) => <article key={exercise.id} className="rounded-xl border border-fit-line bg-fit-card p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div><h3 className="font-semibold text-fit-ink">{exercise.name}</h3><p className="text-xs text-fit-muted">{(exercise.primaryMuscles || []).join(', ')}</p></div>
            <div className="flex shrink-0 items-center gap-1">
              <button disabled={busy || index === 0} aria-label="Übung nach oben" onClick={() => move(index, -1)} className="rounded p-1.5 text-fit-muted disabled:opacity-30"><ArrowUp size={15} /></button>
              <button disabled={busy || index === exercises.length - 1} aria-label="Übung nach unten" onClick={() => move(index, 1)} className="rounded p-1.5 text-fit-muted disabled:opacity-30"><ArrowDown size={15} /></button>
              <button disabled={busy} aria-label={`${exercise.name} entfernen`} onClick={() => removeExercise(exercise.id)} className="rounded p-1.5 text-fit-red"><Trash2 size={15} /></button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-fit-muted">Sätze<input type="number" min="1" max="20" defaultValue={exercise.target_sets}
              onBlur={(event) => patchExercise(exercise.id, { target_sets: Number(event.target.value) || 3 })}
              className="mt-1 w-full rounded-lg border border-fit-line bg-fit-bg px-2 py-2 text-sm text-fit-ink" /></label>
            <label className="text-xs text-fit-muted">Wiederholungen<input defaultValue={exercise.target_reps}
              onBlur={(event) => patchExercise(exercise.id, { target_reps: event.target.value.trim() || '8-12' })}
              className="mt-1 w-full rounded-lg border border-fit-line bg-fit-bg px-2 py-2 text-sm text-fit-ink" /></label>
            <label className="text-xs text-fit-muted">Pause (Sek.)<input type="number" min="0" max="3600" defaultValue={exercise.rest_seconds}
              onBlur={(event) => patchExercise(exercise.id, { rest_seconds: Number(event.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-fit-line bg-fit-bg px-2 py-2 text-sm text-fit-ink" /></label>
          </div>
          <label className="mt-2 block text-xs text-fit-muted">Coach-Hinweis<textarea defaultValue={exercise.notes || ''}
            onBlur={(event) => patchExercise(exercise.id, { notes: event.target.value.trim() || null })}
            className="mt-1 w-full rounded-lg border border-fit-line bg-fit-bg px-2 py-2 text-sm text-fit-ink" /></label>
        </article>)}
      </div>
      <button disabled={busy} onClick={onBack} className="rounded-xl bg-fit-accent px-4 py-2.5 text-sm font-semibold text-fit-bg">Fertig</button>
    </section>
  );
}
