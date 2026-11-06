import { CalendarDays } from 'lucide-react';

export default function ReviewOverview({ sessionCount, totalExercises, avgEffort }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold" style={{ color: 'var(--dim)', opacity: 0.7 }}>
        <CalendarDays size={14} className="text-fit-accent" />
        Übersicht
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-6 rounded-2xl border bg-fit-card border-fit-line flex flex-col justify-center min-w-0">
          <div className="text-[10px] sm:text-xs font-medium mb-1 sm:mb-1.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>Sessions</div>
          <div className="text-2xl sm:text-5xl font-bold text-fit-ink">{sessionCount || 0}</div>
        </div>
        <div className="p-3 sm:p-6 rounded-2xl border bg-fit-card border-fit-line flex flex-col justify-center min-w-0">
          <div className="text-[10px] sm:text-xs font-medium mb-1 sm:mb-1.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>Übungen</div>
          <div className="text-2xl sm:text-5xl font-bold text-fit-ink">{totalExercises || 0}</div>
        </div>
        <div className="p-3 sm:p-6 rounded-2xl border bg-fit-card border-fit-line flex flex-col justify-center min-w-0">
          <div className="text-[10px] sm:text-xs font-medium mb-1 sm:mb-1.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>Effort</div>
          <div className="text-2xl sm:text-5xl font-bold text-fit-ink">{avgEffort != null ? avgEffort : '–'}</div>
        </div>
      </div>
    </section>
  );
}
