/**
 * MuscleSessionMap — "Anatomie-Check" für die heutige Session, umgezogen aus
 * Session/AnatomyInline.jsx (dort raus, um im Training-Tab Platz zu sparen).
 * Analog zu MuscleDetailedMap.jsx aufgebaut (gleiche Side-Toggle-Struktur,
 * gleiche DetailedMuscleMap-Komponente/Bibliothek — react-muscle-highlighter,
 * kein dritter Highlighter), zeigt aber `exercises` statt `groupScores`
 * (heutige Übungen grün statt Superkompensations-Farbverlauf).
 */

import { useState } from "react";
import { Info } from "lucide-react";
import DetailedMuscleMap from "../../components/DetailedMuscleMap.jsx";

export default function MuscleSessionMap({ exercises, gender, onGroupClick }) {
  const [side, setSide] = useState("front");

  if (!exercises?.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-3 opacity-30">
        <Info size={22} />
        <p className="text-[10px] font-black uppercase tracking-widest">Heute noch keine Übungen geloggt</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-[500px] relative">
      <div className="absolute top-0 left-0 z-20 flex gap-1 bg-fit-card/80 backdrop-blur-md p-1 rounded-xl border border-fit-line shadow-lg">
        <button onClick={() => setSide("front")}
          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${side === "front" ? 'bg-fit-accent text-black shadow-xs' : 'text-fit-dim hover:text-ink'}`}>
          Anterior
        </button>
        <button onClick={() => setSide("back")}
          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${side === "back" ? 'bg-fit-accent text-black shadow-xs' : 'text-fit-dim hover:text-ink'}`}>
          Posterior
        </button>
      </div>

      <div className="absolute top-0 right-0 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-fit-accent/10 border border-fit-accent/20 text-fit-accent text-[9px] font-black uppercase tracking-widest">
        <Info size={10} />
        Muskel anklicken für Details
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <DetailedMuscleMap exercises={exercises} gender={gender} side={side} onGroupClick={onGroupClick} />
      </div>
    </div>
  );
}
