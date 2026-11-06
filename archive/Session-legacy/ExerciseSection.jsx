import { useState } from "react";
import { Dumbbell, Plus, Search } from "lucide-react";
import SectionHeader from "./SectionHeader";
import ExerciseItem from "./ExerciseItem";
import ExerciseSearchOverlay from "../../components/ExerciseSearchOverlay";

export default function ExerciseSection({
  exercises = [], restHours, muscleRecovery = {},
  updateEx, addSet, removeSet, removeEx, replaceSets, moveEx,
  planMode, date, addEx, quickInput, setQuickInput, addQuick,
  prevMap = {}, onInspectExercise
}) {
  const [showSearch, setShowSearch] = useState(false);
  const safeExercises = Array.isArray(exercises) ? exercises : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionHeader>Übungen</SectionHeader>
        {restHours !== null && (
          <div className="text-[10px] font-bold text-fit-accent font-mono uppercase tracking-widest bg-fit-accent/10 px-2.5 py-1.5 rounded-lg border border-fit-accent/20 shadow-sm">
            Rest: {restHours}h
          </div>
        )}
      </div>
      
      <div className="space-y-3">
        {safeExercises.map((ex, idx) => (
          <ExerciseItem
            key={idx}
            ex={ex}
            i={idx}
            muscleRecovery={muscleRecovery}
            updateEx={updateEx}
            addSet={addSet}
            removeSet={removeSet}
            removeEx={removeEx}
            replaceSets={replaceSets}
            moveEx={moveEx}
            isFirst={idx === 0}
            isLast={idx === safeExercises.length - 1}
            planMode={planMode}
            date={date}
            prev={prevMap[ex.name]}
            onInspectExercise={onInspectExercise}
          />
        ))}
        {safeExercises.length === 0 && (
          <div className="card border-dashed flex flex-col items-center justify-center py-16 opacity-30 bg-fit-bg2/30 rounded-[40px]">
            <div className="w-16 h-16 rounded-full bg-fit-line/10 flex items-center justify-center mb-4">
              <Dumbbell size={32} />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Keine Übungen geloggt</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mt-8">
        <button 
          onClick={() => setShowSearch(true)}
          className="flex items-center justify-between px-6 py-4 rounded-[24px] bg-fit-accent text-black font-black uppercase tracking-widest text-[11px] shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <div className="flex items-center gap-3">
            <Plus size={18} />
            <span>Übung hinzufügen</span>
          </div>
          <Search size={16} className="opacity-40" />
        </button>

        <div className="flex gap-2">
          <input 
            type="text" 
            value={quickInput} 
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addQuick()}
            placeholder="Quick: bench 3x8@80" 
            className="flex-1 p-4 rounded-[24px] border text-sm font-mono bg-fit-card border-fit-line text-fit-ink focus:border-accent outline-none shadow-sm min-w-0" 
          />
          <button 
            onClick={addQuick} 
            className="w-14 h-14 rounded-[24px] bg-fit-bg2 text-fit-ink border border-fit-line flex items-center justify-center font-black hover:bg-card active:scale-95 transition-all"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      {showSearch && (
        <ExerciseSearchOverlay 
          onSelect={addEx} 
          onClose={() => setShowSearch(false)} 
          date={date}
        />
      )}
    </div>
  );
}
