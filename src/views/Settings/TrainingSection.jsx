import { useState } from "react";
import { Zap, ChevronDown } from "lucide-react";
import SegmentedControl from "./SegmentedControl";

export default function TrainingSection({
  split, setSplit,
  gender, setGender,
  defaultLocation, setDefaultLocation,
  cycleLength, setCycleLength,
  recentDays, setRecentDays,
  coverageThreshold, setCoverageThreshold,
}) {
  const [slidersOpen, setSlidersOpen] = useState(false);

  return (
    <section className="card p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
       <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-fit-bg2 border border-fit-line flex items-center justify-center">
            <Zap size={18} className="text-fit-dim" />
          </div>
          <h3 className="text-base font-semibold text-fit-ink">Trainings-Präferenzen</h3>
       </div>

       <div className="space-y-6">
          <SegmentedControl
            label="Trainings-Split"
            options={[
              { id: 'PPL', label: 'PPL' },
              { id: 'Upper/Lower', label: 'Upper/Lower' },
              { id: 'Full Body', label: 'Full Body' },
            ]}
            value={split}
            onChange={setSplit}
          />

          <SegmentedControl
            label="Anatomie-Modell (Visualisierung)"
            options={[
              { id: 'male', label: 'Male' },
              { id: 'female', label: 'Female' },
            ]}
            value={gender}
            onChange={setGender}
          />

          <SegmentedControl
            label="Standard Standort"
            options={[
              { id: 'Home', label: 'Home' },
              { id: 'Gym', label: 'Gym' },
              { id: 'Outdoor', label: 'Outdoor' },
            ]}
            value={defaultLocation}
            onChange={setDefaultLocation}
          />

          {/* Analyse & Zyklus (collapsible) */}
          <div className="border-t border-fit-line/50 pt-5">
             <button
                onClick={() => setSlidersOpen(o => !o)}
                className="w-full flex items-center justify-between mb-3 group"
             >
                <span className="text-xs font-medium group-hover:opacity-100 transition-opacity ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Analyse &amp; Zyklus</span>
                <ChevronDown size={14} className={`text-fit-dim transition-transform ${slidersOpen ? 'rotate-180' : ''}`} />
             </button>

             {slidersOpen && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                   <div>
                      <div className="flex items-center justify-between mb-3">
                         <div className="text-xs font-medium ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Zyklus-Länge</div>
                         <span className="text-xs font-semibold text-fit-accent bg-fit-accent/10 px-2 py-0.5 rounded-full">{cycleLength} Wochen</span>
                      </div>
                      <input type="range" min="1" max="12" step="1" value={cycleLength} onChange={(e) => setCycleLength(parseInt(e.target.value))} className="fit-slider w-full" />
                      <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--dim)', opacity: 0.5 }}>
                         <span>1 Woche</span>
                         <span>12 Wochen</span>
                      </div>
                   </div>
                   <div>
                      <div className="flex items-center justify-between mb-3">
                         <div className="text-xs font-medium ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Analyse-Fenster</div>
                         <span className="text-xs font-semibold text-fit-accent bg-fit-accent/10 px-2 py-0.5 rounded-full">{recentDays} Tage</span>
                      </div>
                      <input type="range" min="1" max="30" value={recentDays} onChange={(e) => setRecentDays(parseInt(e.target.value))} className="fit-slider w-full" />
                   </div>
                   <div>
                      <div className="flex items-center justify-between mb-3">
                         <div className="text-xs font-medium ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Coverage-Schwelle</div>
                         <span className="text-xs font-semibold text-fit-accent bg-fit-accent/10 px-2 py-0.5 rounded-full">{coverageThreshold} Sätze</span>
                      </div>
                      <input type="range" min="0.5" max="10" step="0.5" value={coverageThreshold} onChange={(e) => setCoverageThreshold(parseFloat(e.target.value))} className="fit-slider w-full" />
                   </div>
                </div>
             )}
          </div>
       </div>
    </section>
  );
}
