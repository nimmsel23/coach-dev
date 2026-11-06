import { Sparkles, Download } from 'lucide-react';

export default function ReviewHeader({ onExport, toast }) {
  return (
    <section className="p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 bg-fit-card border border-fit-line">
      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold mb-1" style={{ color: 'var(--dim)', opacity: 0.6 }}>
          <Sparkles size={12} className="text-fit-accent" />
          Performance Review
        </div>
        <h2 className="text-xl font-bold text-fit-ink">
          Monats-Analyse
        </h2>
        <div className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>
          Rollierende letzte 28 Tage
        </div>
        {toast && (
          <div className="mt-2 text-[11px] font-semibold text-fit-accent bg-fit-accent/10 px-2.5 py-1 rounded-full border border-fit-accent/20 inline-block">
            {toast}
          </div>
        )}
      </div>

      <button
        onClick={onExport}
        className="h-10 px-3.5 rounded-xl bg-fit-accent/10 text-fit-accent border border-fit-accent/20 hover:bg-accent/20 transition-all flex items-center gap-2 text-xs font-semibold shrink-0"
      >
        <Download size={14} /> Obsidian
      </button>
    </section>
  );
}
