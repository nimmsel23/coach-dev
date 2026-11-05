import { ArrowLeftRight } from 'lucide-react';

// Grobe Push/Pull/Legs-Zuordnung der granularen KB-Regionen (chest.yml,
// upper_back.yml etc., siehe shared/muscle.js::getMuscleGroups()) — bewusst
// simpel gehalten (keine Gewichtung), nur zur groben Split-Balance-Kontrolle.
// Rein muskelbasiert: Kraft-Übungen UND Cardio-Activities (session.activity.muscles)
// fließen über body_region_scores ein — Crossfit/Klettern/Rudern zählen so für Pull.
const PPL_GROUPS = {
  push: { label: 'Push', regions: ['chest', 'shoulders', 'triceps'] },
  pull: { label: 'Pull', regions: ['upper_back', 'middle_back', 'lower_back', 'rhomboids', 'biceps', 'forearms', 'back'] },
  legs: { label: 'Legs', regions: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'iliopsoas'] },
};

function sumRegions(bodyRegionScores, regions) {
  return regions.reduce((sum, id) => sum + (Number(bodyRegionScores?.[id]) || 0), 0);
}

export default function ReviewPPLBalance({ bodyRegionScores }) {
  const bars = Object.values(PPL_GROUPS).map(({ label, regions }) => ({
    label,
    score: sumRegions(bodyRegionScores, regions),
  }));
  const total = bars.reduce((sum, b) => sum + b.score, 0);
  const hasData = total > 0;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold" style={{ color: 'var(--dim)', opacity: 0.7 }}>
        <ArrowLeftRight size={14} className="text-fit-accent" />
        Push / Pull / Legs Balance
      </div>
      {hasData ? (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {bars.map(({ label, score }) => {
            const pct = total > 0 ? (score / total) * 100 : 0;
            return (
              <div key={label} className="flex flex-col p-3.5 sm:p-6 rounded-2xl border bg-fit-card border-fit-line min-w-0">
                <span className="text-[11px] sm:text-xs font-medium opacity-60 mb-2.5 sm:mb-4">
                  {label}
                </span>
                <span className="text-2xl sm:text-3xl font-bold text-fit-ink mb-2.5">{pct.toFixed(0)}%</span>
                <div className="w-full h-2 bg-fit-line rounded-full overflow-hidden">
                  <div className="h-full bg-fit-accent transition-all duration-1000" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-sm font-semibold border border-dashed border-gray-200 rounded-2xl" style={{ color: 'var(--dim)', opacity: 0.6 }}>Keine Daten in diesem Zeitraum</div>
      )}
    </section>
  );
}
