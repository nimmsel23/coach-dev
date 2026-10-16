import { useState } from 'react';
import { groupWorkoutSets, formatSet, workoutTotals, formatDuration } from '@plan/views/Plan/lib/history.js';

export default function ClientWorkoutResults({ workouts }) {
  const [open, setOpen] = useState(null);
  const completed = workouts.filter((w) => w.finished_at).sort((a,b) => b.finished_at.localeCompare(a.finished_at));
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Ergebnisse aus Plan</h2>
      {!completed.length && <p className="text-sm text-fit-muted">Sobald der Klient eine Einheit in Plan abschließt, erscheinen hier seine tatsächlich protokollierten Sätze.</p>}
      {completed.slice(0, 20).map((workout) => {
        const totals = workoutTotals(workout);
        return <article key={workout.id} className="rounded-xl border border-fit-line bg-fit-card p-3">
          <button onClick={() => setOpen(open === workout.id ? null : workout.id)} aria-expanded={open === workout.id} className="w-full text-left">
            <span className="block text-sm font-semibold">{workout.name}</span>
            <span className="text-xs text-fit-muted">{new Date(workout.finished_at).toLocaleDateString('de-AT')} · {totals.sets} Sätze · {formatDuration(totals.durationMs)}</span>
          </button>
          {open === workout.id && <div className="mt-3 space-y-3">{groupWorkoutSets(workout).map((ex) => <div key={ex.exercise_id || ex.name}>
            <h3 className="text-sm font-medium">{ex.name}</h3>
            {ex.sets.map((set, i) => <p key={set.setId || i} className="mt-1 text-xs text-fit-muted">Satz {i+1} · {formatSet(set)}</p>)}
          </div>)}</div>}
        </article>;
      })}
    </section>
  );
}
