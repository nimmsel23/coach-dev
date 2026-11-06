import { Flame } from 'lucide-react';
import { getRecentCompletionDays, computeStreak } from '../lib/habitProgress.js';

// HabitShare/Awesome-Habits-artige Dot-Grid + Streak-Anzeige für eine
// Routine-als-Habit. Rein visuell additiv zu den bestehenden Zahlen-Anzeigen
// (X/Y in Z Tagen) — ersetzt sie nicht, ergänzt sie um das, was bei echten
// Habit-Trackern den Unterschied macht: auf einen Blick sehen, wann man dran
// war, plus ein Streak-Zähler als Motivator.
export default function HabitStreak({ routine, workouts, days = 14 }) {
  if (!routine.targetCount || !routine.targetPeriodDays) return null;
  const dayList = getRecentCompletionDays(routine.id, workouts, days);
  const streak = computeStreak(routine, workouts);

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px]">
        {dayList.map((d) => (
          <span
            key={d.date}
            title={d.date}
            className={`w-2 h-2 rounded-full ${d.done ? 'bg-fit-accent' : 'bg-fit-line'}`}
          />
        ))}
      </div>
      {streak > 0 && (
        <span className="flex items-center gap-0.5 text-xs font-semibold text-orange-400 shrink-0">
          <Flame size={12} strokeWidth={2.5} /> {streak}
        </span>
      )}
    </div>
  );
}
