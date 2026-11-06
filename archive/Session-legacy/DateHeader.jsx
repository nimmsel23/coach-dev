import { useState } from "react";
import { Save, ChevronLeft, ChevronRight, Calendar, Settings2, SlidersHorizontal } from "lucide-react";
import { blockColor, DAY_LABELS } from "./utils";

export default function DateHeader({
  date, setDate, rollingDays, recentSessions, localToday, onSave, saving, onOpenSettings, onOpenSidebar
}) {
  const todayIdx = rollingDays.findIndex(d => d === localToday);
  const [offset, setOffset] = useState(todayIdx >= 0 ? Math.max(0, todayIdx - 6) : 0);
  
  const visibleDays = rollingDays.slice(offset, offset + 7);
  const canGoBack = offset > 0;
  const canGoForward = offset + 7 < rollingDays.length;

  return (
    <div className="card mb-8 p-6 shadow-2xl rounded-[40px] border-fit-line/40 bg-fit-card/80 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-fit-accent/10 flex items-center justify-center text-fit-accent">
            <Calendar size={20} strokeWidth={3} />
          </div>
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-fit-dim/40 mb-1">Session Datum</h2>
            <div className="text-sm font-black text-fit-ink uppercase tracking-widest">{date}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              className="w-10 h-10 rounded-2xl bg-fit-bg2 border border-fit-line flex items-center justify-center text-fit-dim hover:text-accent hover:border-accent/40 transition-all"
            >
              <SlidersHorizontal size={16} />
            </button>
          )}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-10 h-10 rounded-2xl bg-fit-bg2 border border-fit-line flex items-center justify-center text-fit-dim hover:text-accent hover:border-accent/40 transition-all"
            >
              <Settings2 size={16} />
            </button>
          )}
          <div className="relative group hidden sm:block">
            <input type="date" value={date} max={localToday} onChange={e => setDate(e.target.value)}
              className="px-6 py-3 rounded-2xl border text-[11px] font-black uppercase tracking-widest bg-fit-bg2 border-fit-line text-fit-ink w-44 outline-none focus:border-accent focus:bg-card transition-all" />
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="w-12 h-12 sm:w-auto sm:px-8 rounded-2xl bg-fit-accent text-black font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-accent/20 hover:scale-[1.05] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <><Save size={18} strokeWidth={3} /><span className="hidden sm:inline">Session Speichern</span></>
            )}
          </button>
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        <button 
          onClick={() => setOffset(Math.max(0, offset - 3))} 
          disabled={!canGoBack}
          className="w-10 h-10 rounded-xl bg-fit-bg2 border border-fit-line flex items-center justify-center text-fit-dim hover:text-accent disabled:opacity-0 transition-all shrink-0"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 flex justify-between gap-2 px-1">
          {visibleDays.map((d) => {
            const sess = recentSessions[d];
            const done = !!(sess?.block || sess?.activity);
            const isSelected = d === date;
            const color = done ? blockColor(sess.block, sess.activity) : null;
            const dateObj = new Date(d);
            const dayName = DAY_LABELS[dateObj.getDay()];
            const isToday = d === localToday;

            return (
              <button 
                key={d} 
                onClick={() => setDate(d)}
                className="flex flex-col items-center gap-3 group relative flex-1 min-w-0"
              >
                <div 
                  className={`w-full max-w-[50px] aspect-square rounded-[20px] flex items-center justify-center text-xs font-black transition-all border-2 relative ${
                    isSelected 
                    ? 'border-fit-accent shadow-2xl shadow-accent/40 scale-110 z-10' 
                    : 'border-fit-line/10 hover:border-line-hover'
                  }`}
                  style={{ 
                    background: isSelected ? 'var(--accent)' : done ? (color + '20') : 'var(--bg2)',
                    color: isSelected ? '#000' : done ? color : 'var(--dim)'
                  }}
                >
                  {done ? '✓' : d.split('-')[2]}
                  {isToday && !isSelected && (
                    <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-fit-accent rounded-full border-[3px] border-fit-card shadow-lg" />
                  )}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${isSelected ? 'text-fit-accent' : 'text-fit-dim/30 group-hover:text-dim'}`}>
                  {dayName}
                </span>
                
                {isSelected && (
                  <div className="absolute -bottom-2 w-1 h-1 rounded-full bg-fit-accent animate-pulse" />
                )}
              </button>
            )
          })}
        </div>

        <button 
          onClick={() => setOffset(Math.min(rollingDays.length - 7, offset + 3))} 
          disabled={!canGoForward}
          className="w-10 h-10 rounded-xl bg-fit-bg2 border border-fit-line flex items-center justify-center text-fit-dim hover:text-accent disabled:opacity-0 transition-all shrink-0"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
