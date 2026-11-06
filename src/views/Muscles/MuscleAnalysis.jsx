import { translateMuscle } from "../../lib/kb/muscles.js";

export default function MuscleAnalysis({ hitAnalysis, muscleLanguage = 'de', taxonomy = null }) {
  const { heavy, recovering, super: supercomp, ready } = hitAnalysis;
  return (
    <div className="card p-8 border-fit-accent/20 shadow-xl bg-gradient-to-b from-card to-bg2">
      <div className="label-caps mb-6 flex items-center gap-2 text-fit-accent">
         <div className="w-1.5 h-1.5 rounded-full bg-fit-accent animate-pulse" />
         Fokus-Analyse
      </div>
      <div className="space-y-6">
        <p className="text-sm font-medium opacity-70 leading-relaxed">
          Basierend auf der Zeit seit deinem letzten Training:
        </p>
        <div className="flex flex-col gap-4">
          <StatusRow color="#ef4444" label="Stark belastet" items={heavy} taxonomy={taxonomy} lang={muscleLanguage} />
          <StatusRow color="#f59e0b" label="In Erholung" items={recovering} taxonomy={taxonomy} lang={muscleLanguage} />
          <StatusRow color="#22c55e" label="Superkompensiert" items={supercomp} taxonomy={taxonomy} lang={muscleLanguage} />
          <StatusRow color="#3b82f6" label="Leicht belastet / Bereit" items={ready} taxonomy={taxonomy} lang={muscleLanguage} />
        </div>
      </div>
    </div>
  );
}

function StatusRow({ color, label, count, items = [], taxonomy, lang }) {
  return (
    <div className="flex flex-col gap-2 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px]">
          <div className="w-4 h-4 rounded-lg shadow-lg" style={{ background: color, boxShadow: `0 4px 12px ${color}33` }} />
          <span className="font-black opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-tighter text-fit-ink">{label}</span>
        </div>
        {(count !== undefined || items.length > 0) && (
          <span className="text-[11px] font-black text-fit-ink">{count ?? items.length} Muskeln</span>
        )}
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-7">
          {items.map(m => (
            <span key={m} className="text-[9px] font-bold opacity-40 bg-fit-bg2 px-1.5 py-0.5 rounded border border-fit-line">
              {translateMuscle(m, taxonomy, lang)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
