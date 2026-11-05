import { useEffect, useState } from 'react';
import { Download, MapPin, Clock, Activity, Target, FileText, Info, X, Brain, Navigation } from 'lucide-react';
import SectionHeader from './SectionHeader';

const TRAININGSART_OPTIONS = ['Kraft', 'Hypertrophie', 'Ausdauer'];

export default function SessionSidebar({
  location, setLocation, duration, setDuration,
  gpsMapsUrl, gateTimes,
  trainingsart, setTrainingsart,
  notes, setNotes, onDownload,
  onExportObsidian, onClose, coachFeedback = ""
}) {
  const [startVal, setStartVal] = useState(gateTimes?.start || '');
  const [endVal, setEndVal] = useState(gateTimes?.end || '');
  useEffect(() => { setStartVal(gateTimes?.start || ''); setEndVal(gateTimes?.end || ''); }, [gateTimes?.start, gateTimes?.end]);
  const timesInvalid = !!(startVal && endVal && endVal <= startVal);
  const changeTimes = (start, end) => { setStartVal(start); setEndVal(end); gateTimes?.onChange(start, end); };

  return (
    <aside className="space-y-6">
      {onClose && (
        <div className="flex items-center justify-between px-6 pt-2 pb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40">Session Details</span>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-fit-bg2 flex items-center justify-center text-fit-dim hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
      <section className="card p-6 shadow-xl border-fit-line/50 rounded-[32px]">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-xl bg-fit-accent/10 flex items-center justify-center text-fit-accent">
            <Info size={16} strokeWidth={3} />
          </div>
          <SectionHeader>Details</SectionHeader>
        </div>
        
        <div className="space-y-5">
          <div className="group">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-2 block ml-1 flex items-center gap-2">
              <MapPin size={12} /> Location
            </label>
            <div className="relative">
              <input type="text" value={location} placeholder="z.B. Home Gym" onChange={e => setLocation(e.target.value)}
                className="w-full p-4 rounded-2xl border text-sm font-bold bg-fit-bg2 border-fit-line text-fit-ink focus:border-accent focus:bg-card outline-none transition-all"
                style={{ paddingRight: gpsMapsUrl ? '3.25rem' : undefined }} />
              {gpsMapsUrl && (
                <a href={gpsMapsUrl} target="_blank" rel="noopener noreferrer" title="In Google Maps öffnen"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center bg-fit-accent/10 text-fit-accent hover:bg-fit-accent hover:text-black transition-all">
                  <Navigation size={14} strokeWidth={2.5} />
                </a>
              )}
            </div>
          </div>

          {gateTimes && (
            <div className="group">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-2 block ml-1 flex items-center gap-2">
                <Clock size={12} /> Beginn / Ende
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={startVal} aria-label="Beginn" onChange={e => changeTimes(e.target.value, endVal)}
                  className="w-full p-4 rounded-2xl border text-sm font-bold bg-fit-bg2 border-fit-line text-fit-ink focus:border-accent focus:bg-card outline-none transition-all" />
                <input type="time" value={endVal} aria-label="Ende" onChange={e => changeTimes(startVal, e.target.value)}
                  className="w-full p-4 rounded-2xl border text-sm font-bold bg-fit-bg2 border-fit-line text-fit-ink focus:border-accent focus:bg-card outline-none transition-all" />
              </div>
              {timesInvalid && <p className="mt-2 ml-1 text-[11px] font-semibold text-red-400">Ende muss nach dem Beginn liegen.</p>}
            </div>
          )}

          <div className="relative group">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-2 block ml-1 flex items-center gap-2">
              <Clock size={12} /> Dauer
            </label>
            <div className="relative">
              <input type="number" value={duration} placeholder="Minuten" onChange={e => setDuration(e.target.value)}
                className="w-full p-4 pr-14 rounded-2xl border text-sm font-bold bg-fit-bg2 border-fit-line text-fit-ink focus:border-accent focus:bg-card outline-none transition-all" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-fit-dim/30 uppercase tracking-widest">MIN</span>
            </div>
          </div>

          <div className="group">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-2 block ml-1 flex items-center gap-2">
              <Target size={12} /> Trainingsart
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TRAININGSART_OPTIONS.map(opt => {
                const isActive = trainingsart === opt;
                return (
                  <button key={opt} type="button" onClick={() => setTrainingsart(isActive ? '' : opt)}
                    className={`px-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] border transition-all ${
                      isActive
                        ? 'bg-fit-accent text-black border-fit-accent shadow-xl'
                        : 'border-fit-line bg-fit-bg2 text-fit-dim hover:text-ink hover:border-line-hover'
                    }`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </section>

      <section className="card p-6 shadow-xl border-fit-line/50 rounded-[32px]">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-xl bg-fit-accent/10 flex items-center justify-center text-fit-accent">
            <Activity size={16} strokeWidth={3} />
          </div>
          <SectionHeader>Qualität & Fokus</SectionHeader>
        </div>
        <div className="space-y-8">
          <div className="group">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-2 block ml-1 flex items-center gap-2">
              <FileText size={12} /> Notizen
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Wie war der Fokus?"
              className="w-full p-4 rounded-2xl border text-sm font-medium bg-fit-bg2 border-fit-line text-fit-ink focus:border-accent focus:bg-card outline-none resize-none leading-relaxed transition-all" />
          </div>
          
          {coachFeedback && (
            <div className="p-4 rounded-2xl bg-fit-accent/5 border border-fit-accent/25 relative overflow-hidden group">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={14} className="text-fit-accent" />
                <span className="text-[10px] font-black uppercase tracking-widest text-fit-accent">Coach Feedback</span>
              </div>
              <p className="text-xs font-bold italic text-fit-ink/80 leading-relaxed">
                "{coachFeedback}"
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <button onClick={onExportObsidian} className="w-full p-6 rounded-[32px] border flex items-center justify-between bg-fit-accent/5 border-fit-accent/20 hover:border-accent/40 transition-all shadow-xl group">
          <div className="text-left">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-accent mb-1 group-hover:translate-x-1 transition-transform">Obsidian Sync</div>
            <div className="text-[11px] font-bold opacity-30">In Vault speichern</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-fit-accent/10 flex items-center justify-center text-fit-accent group-hover:scale-110 transition-all">
            <Download size={20} />
          </div>
        </button>
        
        <button onClick={onDownload} className="w-full p-6 rounded-[32px] border flex items-center justify-between bg-fit-card border-fit-line hover:border-accent/30 transition-all shadow-xs group">
          <div className="text-left">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-1 group-hover:translate-x-1 transition-transform">Download MD</div>
            <div className="text-[11px] font-bold opacity-30">Lokale Datei</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-fit-bg2 flex items-center justify-center text-fit-dim group-hover:text-ink transition-colors">
            <Download size={20} />
          </div>
        </button>
      </section>
    </aside>
  );
}
