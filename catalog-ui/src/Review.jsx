import { useState, useEffect, useCallback } from 'react';
import { FileText, Sparkles, Info } from 'lucide-react';
import { api } from './api';
import { Loading, ErrorBox, BadgeBox } from './Shared';

// ── Weekly Review Tab ──
export default function WeeklyTab({ showToast }) {
  const [week, setWeek] = useState('current');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api(`/fitness/weekly?week=${week}`)
      .then(res => {
        if (res.ok) {
          setData(res);
          setError(null);
        } else {
          setError('Wochendaten konnten nicht geladen werden.');
        }
      })
      .catch(err => setError(`Netzwerkfehler: ${err.message}`))
      .finally(() => setLoading(false));
  }, [week]);

  useEffect(() => { load(); }, [load]);

  const handleExportWeekly = () => {
    setExporting(true);
    api('/fitness/export/weekly', {
      method: 'POST',
      body: JSON.stringify({ week_selector: week }),
    })
      .then(res => {
        if (res.ok) {
          showToast(`Erfolgreich nach Obsidian exportiert! (${res.path.split('/').pop()})`, 'success');
        } else {
          showToast('Export fehlgeschlagen.', 'error');
        }
      })
      .catch(err => showToast(`Fehler: ${err.message}`, 'error'))
      .finally(() => setExporting(false));
  };

  if (error) return <ErrorBox msg={error} />;
  if (data === null && loading) return <Loading />;

  return (
    <div className="flex gap-6 h-full overflow-hidden">
      {/* Left Column (Stats & Regions) */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <select
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              className="bg-surface border border-white/10 rounded-xl px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-primary text-text cursor-pointer"
            >
              <option value="current">Diese Woche (Current)</option>
              <option value="last">Letzte Woche (Last)</option>
              <option value="2_weeks_ago">Vor 2 Wochen</option>
              <option value="3_weeks_ago">Vor 3 Wochen</option>
            </select>
            {data && (
              <span className="text-xs text-muted font-mono">
                Sessions: <strong className="text-primary">{data.entries_count}</strong>
              </span>
            )}
          </div>
          {data && (
            <button
              disabled={exporting}
              onClick={handleExportWeekly}
              className="px-3 py-1.5 border border-white/10 bg-white/5 rounded-xl hover:bg-white/10 text-xs font-mono font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              {exporting ? 'Speichert…' : 'Bericht exportieren'}
            </button>
          )}
        </div>

        {data ? (
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {/* Muscle Region Progress Bars */}
            {data.body_region_scores && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-mono uppercase tracking-wider text-muted font-bold">
                  Belastungs-Intensität pro Region
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(data.body_region_scores).map(([region, score]) => {
                    const pct = Math.min(100, (score / 10) * 100); // map score to percentage
                    let color = 'bg-muted';
                    if (score > 6) color = 'bg-rose-500 shadow-md shadow-rose-500/25';
                    else if (score > 2) color = 'bg-success shadow-md shadow-success/25';
                    else if (score > 0) color = 'bg-amber-500 shadow-md shadow-amber-500/25';

                    return (
                      <div key={region} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="capitalize text-text/80">{region}</span>
                          <span className="font-bold text-text">{score}</span>
                        </div>
                        <div className="h-2 w-full bg-surface rounded-full overflow-hidden border border-white/5">
                          <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Categorization Badges */}
            <div className="grid grid-cols-3 gap-4">
              <BadgeBox title="Hoch Belastet" items={data.high_regions} badgeClass="bg-rose-500/10 border-rose-500/20 text-rose-400" />
              <BadgeBox title="Gering Belastet" items={data.low_regions} badgeClass="bg-amber-500/10 border-amber-500/20 text-amber-400" />
              <BadgeBox title="Keine Belastung" items={data.missing_regions} badgeClass="bg-white/5 border-white/10 text-muted" />
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <Loading />
          </div>
        )}
      </div>

      {/* Right Column (Coach Recommendations) */}
      <div className="w-[380px] bg-surface/30 border border-white/5 rounded-2xl p-6 flex flex-col h-full overflow-hidden shrink-0 shadow-2xl">
        <div className="mb-4 flex items-center gap-1.5">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-md font-bold font-mono text-primary uppercase tracking-wide">Coach Feedback</h3>
        </div>

        {data && data.recommendations && data.recommendations.length > 0 ? (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {data.recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="p-4 bg-gradient-to-r from-primary/10 to-transparent border-l-2 border-primary rounded-r-xl rounded-l-sm text-xs font-mono leading-relaxed text-text/90"
              >
                {rec}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-center space-y-2 text-muted">
            <Info className="w-8 h-8 opacity-40" />
            <span className="font-mono text-xs">Keine Empfehlungen für diese Woche.</span>
          </div>
        )}
      </div>
    </div>
  );
}
