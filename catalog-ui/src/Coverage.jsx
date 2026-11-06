import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from './api';
import { Loading, ErrorBox } from './Shared';

// ── Coverage Analysis Tab ──
export default function CoverageTab() {
  const [gaps, setGaps] = useState(null);
  const [detailed, setDetailed] = useState(null);
  const [days, setDays] = useState(7);
  const [subTab, setSubTab] = useState('gaps'); // 'gaps' or 'detailed'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api(`/coverage/gaps?days=${days}`).catch(() => ({ gaps: [] })),
      api(`/coverage/detailed?days=${days}`).catch(() => ({ muscles: [] }))
    ])
      .then(([gapsData, detailedData]) => {
        setGaps(gapsData.gaps || gapsData.items || []);
        setDetailed(detailedData.muscles || []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox msg={error} />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex gap-2 p-1 bg-surface border border-white/10 rounded-xl shadow-lg">
          <button
            onClick={() => setSubTab('gaps')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              subTab === 'gaps' ? 'bg-primary text-text shadow-sm shadow-primary/45' : 'text-muted hover:text-text'
            }`}
          >
            Lücken
          </button>
          <button
            onClick={() => setSubTab('detailed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              subTab === 'detailed' ? 'bg-primary text-text shadow-sm shadow-primary/45' : 'text-muted hover:text-text'
            }`}
          >
            Details
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface border border-white/10 px-3 py-1.5 rounded-xl text-xs font-mono text-muted">
            <span>Tage:</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-transparent focus:outline-none text-text font-bold cursor-pointer"
            >
              <option value="7">Letzte 7 Tage</option>
              <option value="14">Letzte 14 Tage</option>
              <option value="30">Letzte 30 Tage</option>
              <option value="90">Letzte 90 Tage</option>
            </select>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 text-muted rounded-xl transition-all active:scale-95"
            title="Neu laden"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <Loading />
        ) : subTab === 'gaps' ? (
          gaps && gaps.length === 0 ? (
            <div className="text-muted text-sm p-4 font-mono text-center bg-white/5 rounded-xl border border-white/5">
              Keine Lücken gemeldet. Alle Muskelgruppen sind ausreichend abgedeckt!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {gaps?.map((g, i) => (
                <div key={i} className="bg-surface/50 border border-white/5 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
                  <div className="flex justify-between items-start">
                    <span className="font-mono text-sm font-bold text-rose-400 capitalize">{g.name_de || g.name_en || g.id}</span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-mono font-bold uppercase">
                      Lücke
                    </span>
                  </div>
                  <div className="text-[10px] text-muted font-mono leading-relaxed mt-1">
                    Katalog ID: {g.id} <br />
                    Score in {days} Tagen: {g.totalScore || 0}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          detailed && (
            <div className="bg-surface/30 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-muted uppercase font-bold text-[10px]">
                    <th className="p-4">Muskel (DE)</th>
                    <th className="p-4">Muskel (EN)</th>
                    <th className="p-4">Katalog ID</th>
                    <th className="p-4 text-right">Coverage Score ({days}d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {detailed.map((m, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-all">
                      <td className="p-4 font-bold text-text/95">{m.name_de}</td>
                      <td className="p-4 text-text/80">{m.name_en}</td>
                      <td className="p-4 text-muted text-[11px]">{m.id}</td>
                      <td className="p-4 text-right">
                        <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          m.totalScore > 2 ? 'bg-success/10 text-success' :
                          m.totalScore > 0 ? 'bg-amber-500/10 text-amber-400' :
                          'bg-rose-500/10 text-rose-400'
                        }`}>
                          {m.totalScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
