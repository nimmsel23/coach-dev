import { X, Brain, Info, BookOpen, Search } from "lucide-react";
import { getAllExercises } from "@db";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MuscleHighlightMap from "./MuscleHighlightMap";
import { translateMuscle } from "../lib/kb/muscles.js";
import { getMuscleIcon } from "../constants/MuscleIcons";
import { useEscapeKey } from "../hooks/useEscapeKey.js";

export default function MuscleDetailModal({ muscleId, muscleData, onClose, loading, muscleLanguage = 'de', taxonomy = null, onInspectExercise = null }) {
  const [exercises, setExercises] = useState([]);
  const [exLoading, setExLoading] = useState(false);

  useEffect(() => {
    if (!muscleId || !muscleData) return;
    
    setExLoading(true);
    getAllExercises().then(all => {
      // 1. Use pre-calculated "trained_by" if available from Anatomy-KB
      if (muscleData.trained_by && Array.isArray(muscleData.trained_by)) {
         const found = all.filter(ex => muscleData.trained_by.includes(ex.exercise_id || ex.id));
         setExercises(found.slice(0, 10));
      } else {
         // 2. Fallback: Manual search in local library
         const relatedIds = muscleData.muscles || [muscleId];
         const found = all.filter(ex => {
           const primary = (ex.primary_muscles || ex.primaryMuscles || []);
           const secondary = (ex.secondary_muscles || ex.secondaryMuscles || []);
           return [...primary, ...secondary].some(m => relatedIds.includes(m.toLowerCase()));
         });
         setExercises(found.slice(0, 8));
      }
    }).finally(() => setExLoading(false));
  }, [muscleId, muscleData]);

  // ESC schließt nur dieses (ggf. verschachtelte) Muskel-Detail-Modal —
  // aktiv genau dann, wenn `muscleId` gesetzt ist (deckt sich mit dem
  // Render-Gate unten), damit ein umschließendes Modal (z.B. MuscleMapModal)
  // bei offenem Detail nicht mitgeschlossen wird.
  useEscapeKey(onClose, !!muscleId);

  if (!muscleId) return null;

  const name = translateMuscle(muscleId, taxonomy, muscleLanguage);
  const latin = taxonomy?.[muscleId]?.label_lat || muscleData?.latin_name || muscleData?.latin;
  const Icon = getMuscleIcon(muscleId);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-fit-scrim backdrop-blur-xs" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-fit-card rounded-[32px] border border-fit-line shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
         {/* Modal Header */}
         <div className="p-6 border-b border-fit-line/50 flex items-center justify-between bg-gradient-to-r from-fit-card to-fit-bg2">
            <div className="flex items-center gap-4">
               <MuscleHighlightMap muscleId={muscleId} size={56} />
               <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className="text-fit-accent" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-fit-ink">
                      {name}
                    </h3>
                  </div>
                  {latin && (
                    <div className="text-[10px] font-bold opacity-30 uppercase tracking-widest italic">
                       {latin}
                    </div>
                  )}
               </div>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl hover:bg-fit-bg2 text-fit-dim transition-all">
               <X size={24} />
            </button>
         </div>

         {/* Modal Body */}
         <div className="flex-1 overflow-y-auto p-8 sm:p-10">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-30">
                 <div className="spinner mb-4" />
                 <p className="text-[10px] font-black uppercase tracking-widest">Lade Anatomie-Details…</p>
              </div>
            ) : muscleData ? (
              <div className="space-y-8">
                 {/* Biomechanics Grid */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {muscleData.origin && (
                      <div className="p-5 rounded-2xl border bg-fit-bg2 border-fit-line/50">
                         <div className="label-caps !mb-3 flex items-center gap-2">
                            <Info size={14} className="text-fit-accent" />
                            Ursprung
                         </div>
                         <p className="text-xs font-medium leading-relaxed text-fit-ink/80 whitespace-pre-wrap">{muscleData.origin}</p>
                      </div>
                    )}
                    {muscleData.insertion && (
                      <div className="p-5 rounded-2xl border bg-fit-bg2 border-fit-line/50">
                         <div className="label-caps !mb-3 flex items-center gap-2">
                            <Info size={14} className="text-fit-accent" />
                            Ansatz
                         </div>
                         <p className="text-xs font-medium leading-relaxed text-fit-ink/80 whitespace-pre-wrap">{muscleData.insertion}</p>
                      </div>
                    )}
                    {muscleData.innervation && (
                      <div className="p-5 rounded-2xl border bg-fit-bg2 border-fit-line/50">
                         <div className="label-caps !mb-3 flex items-center gap-2">
                            <Brain size={14} className="text-fit-accent" />
                            Innervation
                         </div>
                         <p className="text-xs font-medium leading-relaxed text-fit-ink/80 whitespace-pre-wrap">{muscleData.innervation}</p>
                      </div>
                    )}
                    {muscleData.function && (
                      <div className="p-5 rounded-2xl border bg-fit-bg2 border-fit-line/50">
                         <div className="label-caps !mb-3 flex items-center gap-2">
                            <BookOpen size={14} className="text-fit-accent" />
                            Funktion
                         </div>
                         <p className="text-xs font-medium leading-relaxed text-fit-ink/80 whitespace-pre-wrap">{muscleData.function}</p>
                      </div>
                    )}
                 </div>

                 {/* Exercises Section */}
                 <div className="pt-6 border-t border-fit-line/30">
                    <div className="label-caps mb-4 flex items-center gap-2">
                       <Search size={14} className="text-fit-accent" />
                       Passende Übungen
                    </div>
                    {exLoading ? (
                       <div className="animate-pulse flex gap-2">
                          {[1,2,3].map(i => <div key={i} className="h-8 w-24 bg-fit-bg2 rounded-lg" />)}
                       </div>
                    ) : exercises.length > 0 ? (
                       <div className="flex flex-wrap gap-2">
                          {exercises.map(ex => (
                             onInspectExercise ? (
                               <button
                                 key={ex.exercise_id}
                                 onClick={() => onInspectExercise(ex)}
                                 className="px-3 py-1.5 rounded-xl bg-fit-accent/10 border border-fit-accent/20 text-fit-accent text-[10px] font-black uppercase tracking-widest hover:bg-fit-accent/20 transition-colors cursor-pointer"
                               >
                                  {ex.display_name || ex.name}
                               </button>
                             ) : (
                               <span key={ex.exercise_id} className="px-3 py-1.5 rounded-xl bg-fit-accent/10 border border-fit-accent/20 text-fit-accent text-[10px] font-black uppercase tracking-widest">
                                  {ex.display_name || ex.name}
                               </span>
                             )
                          ))}
                       </div>
                    ) : (
                       <p className="text-xs italic opacity-30">Keine spezifischen Übungen gefunden.</p>
                    )}
                 </div>
              </div>
            ) : (
              <div className="p-12 text-center rounded-[32px] border border-dashed border-fit-line opacity-20">
                <p className="text-sm font-black uppercase tracking-widest">Keine detaillierten Anatomie-Daten verfügbar</p>
              </div>
            )}
         </div>

         {/* Modal Footer */}
         <div className="p-6 border-t border-fit-line/50 bg-fit-bg2/50 flex justify-end">
            <button onClick={onClose} className="btn bg-fit-card border border-fit-line text-fit-ink px-8 py-2.5 text-[10px] font-black uppercase tracking-widest hover:border-fit-accent transition-all">
               Schließen
            </button>
         </div>
      </div>
    </div>,
    document.body
  );
}
