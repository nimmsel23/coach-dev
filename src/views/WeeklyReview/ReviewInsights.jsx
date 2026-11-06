import { Sparkles, Trophy } from 'lucide-react';
import { translateMuscle } from '../../lib/kb/muscles.js';
import { getMuscleIcon } from '../../constants/MuscleIcons';

export default function ReviewInsights({ recommendations, missingRegions, muscleLanguage = 'de', taxonomy = null }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold text-fit-accent">
        <Sparkles size={14} />
        Insights &amp; Tipps
      </div>
      <div className="space-y-2.5">
        {(recommendations || []).map((rec, i) => (
          <div key={i} className="flex gap-3 text-sm leading-relaxed text-fit-ink/80 bg-fit-accent/5 p-4 rounded-2xl border border-fit-accent/20">
            <span className="text-fit-accent font-bold mt-0.5">·</span>
            {rec}
          </div>
        ))}
        {missingRegions.length > 0 ? (
          <div className="pt-3 border-t border-fit-accent/10">
             <div className="text-[11px] font-semibold text-fit-red mb-2.5 flex items-center gap-1.5">
                <Trophy size={13} />
                Länger nicht trainiert
             </div>
             <div className="flex flex-wrap gap-1.5">
               {missingRegions.map(region => {
                 const Icon = getMuscleIcon(region);
                 return (
                   <span key={region} className="text-xs font-medium px-2.5 py-1.5 rounded-full border flex items-center gap-1.5"
                     style={{ background: 'rgba(239,68,68,0.05)', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.2)' }}>
                     <Icon size={12} />
                     {translateMuscle(region, taxonomy, muscleLanguage)}
                   </span>
                 );
               })}
             </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-fit-accent/10">
             <div className="flex items-center gap-3 p-3.5 bg-fit-green/10 rounded-xl border border-fit-green/20">
               <div className="w-8 h-8 rounded-full bg-fit-green text-black flex items-center justify-center font-bold text-sm">✓</div>
               <span className="text-sm font-semibold text-fit-green">Perfekte Abdeckung! Alle Regionen trainiert.</span>
             </div>
          </div>
        )}
      </div>
    </section>
  );
}
