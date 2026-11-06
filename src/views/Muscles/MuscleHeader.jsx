import { LayoutGrid, User, Dumbbell } from "lucide-react";

const DAYS_OPTIONS = [7, 14, 28];
const VIEW_MODES = [
  { id: 'standard', label: 'Standard', Icon: LayoutGrid },
  { id: 'detail', label: 'Detail', Icon: User },
  { id: 'today', label: 'Heute', Icon: Dumbbell },
];

export default function MuscleHeader({ days, setDays, viewMode, setViewMode }) {
  return (
    <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-fit-accent mb-2">
          Anatomie & Fokus
        </div>
        <h2 className="text-3xl font-black text-fit-ink tracking-tight">
          Superkompensation
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 bg-fit-card p-1 rounded-xl border border-fit-line shadow-inner">
          {DAYS_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)} 
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${days === d ? 'bg-fit-accent text-black shadow-lg shadow-accent/20' : 'text-fit-dim hover:text-ink hover:bg-white/5'}`}>
              {d}d
            </button>
          ))}
        </div>
        
        <div className="flex gap-1 bg-fit-card p-1 rounded-xl border border-fit-line shadow-inner">
          {VIEW_MODES.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === id ? 'bg-fit-accent text-black shadow-lg shadow-accent/20' : 'text-fit-dim hover:text-ink hover:bg-white/5'}`}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
