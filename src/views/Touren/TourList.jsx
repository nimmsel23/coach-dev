import { Bike, ChevronRight, Gauge, Mountain, Route, Trash2, Timer, Sparkles } from 'lucide-react';

const SOURCE_LABEL = {
  manual: null, // kein Badge nötig — der Normalfall (Ausdauertraining-Modal)
  gpx: 'GPX-Import',
  tcx: 'TCX-Import',
  fit: 'FIT-Import',
};

export default function TourList({ tours, onOpenSession, onDelete }) {
  if (!tours || tours.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 opacity-30">
        <Bike size={40} className="mb-4" />
        <p className="text-[11px] font-black uppercase tracking-[0.3em]">Noch keine Radtouren</p>
        <p className="text-xs mt-2 text-center max-w-xs">
          Trag eine Tour im Ausdauertraining-Modal ein (Typ „Radfahren") oder importiere eine GPX/TCX/FIT-Datei unten.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {tours.map((t, idx) => {
        const sourceBadge = SOURCE_LABEL[t.source];
        return (
          <div key={`${t.date}__${t.sessionId || idx}`}
            className="w-full text-left px-5 py-4 rounded-3xl bg-fit-card border border-fit-line hover:border-accent/40 transition-all group hover:bg-accent/5">
            <div className="flex items-center justify-between gap-4">
              <button onClick={() => onOpenSession?.(t.date)} className="flex items-center gap-4 min-w-0 flex-1 text-left">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-xl bg-fit-orange/15 text-fit-orange">
                  <Bike size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black opacity-30 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                    {t.date}
                    {sourceBadge && (
                      <span className="px-1.5 py-0.5 rounded bg-fit-accent/20 text-fit-accent flex items-center gap-1">
                        <Sparkles size={9} /> {sourceBadge}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-black text-fit-muted">
                    {t.distanceKm != null && (
                      <span className="flex items-center gap-1"><Route size={12} className="opacity-40" />{t.distanceKm} km</span>
                    )}
                    {t.durationMin != null && (
                      <span className="flex items-center gap-1"><Timer size={12} className="opacity-40" />{t.durationMin} min</span>
                    )}
                    {t.avgSpeedKmh != null && (
                      <span className="flex items-center gap-1"><Gauge size={12} className="opacity-40" />⌀ {t.avgSpeedKmh} km/h</span>
                    )}
                    {t.maxSpeedKmh != null && (
                      <span className="flex items-center gap-1"><Gauge size={12} className="opacity-40" />max {t.maxSpeedKmh} km/h</span>
                    )}
                    {t.elevationGainM != null && (
                      <span className="flex items-center gap-1"><Mountain size={12} className="opacity-40" />{t.elevationGainM} hm</span>
                    )}
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {onDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(t); }}
                    className="p-2 rounded-xl text-fit-dim/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    title="Tour löschen"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <ChevronRight size={16} className="text-fit-dim/30 group-hover:text-fit-accent transition-colors" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
