import { Brain } from "lucide-react";

export default function MuscleInsights({ hitAnalysis }) {
  const { heavy, recovering, super: supercomp } = hitAnalysis;
  
  const insightText = supercomp.length >= 3 
    ? "Perfektes Zeitfenster! Viele Muskeln sind superkompensiert. Ein intensiver Reiz heute bringt maximalen Fortschritt."
    : heavy.length >= 4 
    ? "Dein Nervensystem und viele Muskeln sind stark belastet. Fokus auf Erholung, leichte Aktivität oder Mobility empfohlen."
    : recovering.length >= 3
    ? "Einige Muskeln sind noch in Erholung. Ein leichtes Pump-Training oder gezieltes Training anderer Gruppen ist optimal."
    : "Du bist frisch und bereit. Such dir eine Fokus-Region aus und setze einen neuen Reiz!";

  return (
    <div className="card p-6 bg-fit-accent/5 border-fit-accent/10 shadow-lg border-dashed">
      <h4 className="text-[10px] font-black text-fit-accent uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
        <Brain size={12} />
        Smart Insight
      </h4>
      <p className="text-[11px] font-medium opacity-70 leading-relaxed text-fit-ink/80">
        {insightText}
      </p>
    </div>
  );
}
