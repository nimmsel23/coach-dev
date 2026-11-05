import { TrendingUp } from 'lucide-react';
import { translateMuscle } from '../../lib/kb/muscles.js';
import { getMuscleIcon } from '../../constants/MuscleIcons';

// regionEntries kommt roh pro Einzelmuskel (z.B. mehrere Rücken-Muskeln
// einzeln) — für die Anzeige nach dem übersetzten Gruppennamen aggregieren
// (Summe), sonst taucht "Rücken" fünfmal getrennt in der Liste auf.
function aggregateByGroup(regionEntries, taxonomy, muscleLanguage) {
  const bySlug = new Map();
  for (const [name, score] of regionEntries) {
    const label = translateMuscle(name, taxonomy, muscleLanguage);
    if (!bySlug.has(label)) bySlug.set(label, { label, score: 0, icon: name });
    bySlug.get(label).score += Number(score) || 0;
  }
  return [...bySlug.values()].sort((a, b) => b.score - a.score);
}

export default function ReviewMuscleImpact({ regionEntries, muscleLanguage = 'de', taxonomy = null }) {
  const grouped = aggregateByGroup(regionEntries, taxonomy, muscleLanguage);
  const maxScore = Math.max(...grouped.map(e => e.score), 5);
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold" style={{ color: 'var(--dim)', opacity: 0.7 }}>
        <TrendingUp size={14} className="text-fit-accent" />
        Relative Muskelbelastung
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
        {grouped.length > 0 ? grouped.map(({ label, score, icon }) => {
          const pct = Math.min(100, (score / maxScore) * 100);
          const Icon = getMuscleIcon(icon);
          return (
            <div key={label} className="flex flex-col p-3.5 sm:p-6 rounded-2xl border bg-fit-card border-fit-line hover:border-accent/40 transition-all group min-w-0">
              <div className="flex items-center gap-1.5 mb-2.5 sm:mb-4 min-w-0">
                <Icon size={13} className="opacity-40 group-hover:text-accent group-hover:opacity-100 transition-all shrink-0" />
                <span className="text-[11px] sm:text-xs font-medium opacity-60 group-hover:text-accent group-hover:opacity-100 transition-colors truncate">
                  {label}
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-2xl sm:text-3xl font-bold text-fit-ink">{score.toFixed(1)}</span>
                <div className="w-2 h-10 bg-fit-line rounded-full overflow-hidden flex flex-col justify-end">
                  <div className="w-full bg-fit-accent transition-all duration-1000" style={{ height: `${pct}%` }} />
                </div>
              </div>
            </div>
          )
        }) : (
          <div className="col-span-full py-8 text-center text-sm font-semibold border border-dashed border-gray-200 rounded-2xl" style={{ color: 'var(--dim)', opacity: 0.6 }}>Keine Daten in diesem Zeitraum</div>
        )}
      </div>
    </section>
  );
}
