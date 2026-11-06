import { CalendarRange } from 'lucide-react';

function formatRange(dateFrom, dateTo) {
  const fmt = (d) => {
    if (!d) return '';
    const [, m, day] = d.split('-');
    return `${day}.${m}.`;
  };
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}

// Wochen-Kartenreihe innerhalb des rollierenden 28-Tage-Monats-Reviews —
// jede Karte fasst eine 7-Tage-Woche zusammen (jüngste zuerst). Klick wählt
// die Woche aus, ReviewPPLBalance/ReviewMuscleImpact zeigen dann nur noch
// deren body_region_scores statt der Gesamt-28-Tage-Summe.
export default function ReviewWeeksBreakdown({ weeks, selectedIndex, onSelect }) {
  if (!weeks || weeks.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold" style={{ color: 'var(--dim)', opacity: 0.7 }}>
        <CalendarRange size={14} className="text-fit-accent" />
        Wochenansicht
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          onClick={() => onSelect(null)}
          className={`flex flex-col items-start p-3 sm:p-4 rounded-2xl border transition-all min-w-0 text-left ${selectedIndex === null ? 'bg-fit-accent/10 border-fit-accent/40' : 'bg-fit-card border-fit-line hover:border-accent/30'}`}
        >
          <span className="text-[10px] sm:text-xs font-medium opacity-60 mb-1.5">Gesamt</span>
          <span className="text-lg sm:text-2xl font-bold text-fit-ink">28 Tage</span>
        </button>
        {weeks.map((wk, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`flex flex-col items-start p-3 sm:p-4 rounded-2xl border transition-all min-w-0 text-left ${selectedIndex === i ? 'bg-fit-accent/10 border-fit-accent/40' : 'bg-fit-card border-fit-line hover:border-accent/30'}`}
          >
            <span className="text-[10px] sm:text-xs font-medium opacity-60 mb-1.5 truncate w-full">
              {i === 0 ? 'Diese Woche' : `Vor ${i} Woche${i > 1 ? 'n' : ''}`}
            </span>
            <span className="text-lg sm:text-2xl font-bold text-fit-ink">{wk.session_count || 0}</span>
            <span className="text-[10px] opacity-50 mt-0.5">{formatRange(wk.date_from, wk.date_to)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
