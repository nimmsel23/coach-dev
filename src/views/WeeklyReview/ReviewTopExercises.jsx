import { BarChart3 } from 'lucide-react';

export default function ReviewTopExercises({ topExercises = [], onInspectExercise }) {
  function openTopExercise(ex) {
    onInspectExercise?.({
      ...ex,
      name: ex.display_name || ex.exercise_id,
      displayName: ex.display_name || ex.exercise_id,
      category: ex.source_file ? ex.source_file.replace(/\.yml$/i, '') : 'Weekly Review',
      primaryMuscles: ex.primary_muscles || ex.primaryMuscles || [],
      secondaryMuscles: ex.secondary_muscles || ex.secondaryMuscles || [],
      stabilizers: ex.stabilizers || [],
      variations: ex.variations || [],
      coachingNotes: ex.coaching_notes || [],
      commonErrors: ex.common_errors || [],
      tags: ex.tags || [],
      movementPattern: ex.movement_pattern || '',
      lesson: ex.lesson || null,
    });
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold" style={{ color: 'var(--dim)', opacity: 0.7 }}>
        <BarChart3 size={14} className="text-fit-accent" />
        Top Exercises
      </div>
      <div className="space-y-2">
        {topExercises.slice(0, 6).map(ex => (
          <button
            key={ex.exercise_id || ex.display_name}
            onClick={() => openTopExercise(ex)}
            className="w-full text-left p-3.5 rounded-2xl border bg-fit-bg2 border-fit-line hover:border-accent/50 transition-all flex items-center justify-between group"
          >
            <span className="text-sm font-semibold text-fit-ink group-hover:text-accent truncate pr-4">{ex.display_name || ex.exercise_id}</span>
            <span className="text-xs font-bold text-fit-accent bg-fit-accent/10 px-2.5 py-1 rounded-full border border-fit-accent/20">{ex.count}x</span>
          </button>
        ))}
        {topExercises.length === 0 && (
          <div className="py-8 text-center text-sm font-semibold border border-dashed border-gray-200 rounded-2xl" style={{ color: 'var(--dim)', opacity: 0.6 }}>Keine Top Exercises</div>
        )}
      </div>
    </section>
  );
}
