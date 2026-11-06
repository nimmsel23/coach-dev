import { useState } from 'react';
import { Calendar, RefreshCw, Sparkles, FileText } from 'lucide-react';
import { api } from './api';

// ── Plan Builder Tab ──
export default function PlanTab({ onSelectExercise, showToast }) {
  const [template, setTemplate] = useState('push_day');
  const [goal, setGoal] = useState('hypertrophy');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const generatePlan = () => {
    setLoading(true);
    // Request an POST /fitness/plan
    api('/fitness/plan', {
      method: 'POST',
      body: JSON.stringify({ template, goal }),
    })
      .then(res => {
        if (res.ok && res.plan) {
          setPlan(res.plan);
          showToast('Plan erfolgreich generiert!', 'success');
        } else {
          showToast('Plan konnte nicht generiert werden.', 'error');
        }
      })
      .catch(err => showToast(`Fehler: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  };

  const handleExportPlan = () => {
    if (!plan) return;
    setExporting(true);
    api('/fitness/export/plan', {
      method: 'POST',
      body: JSON.stringify({ plan }),
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

  return (
    <div className="flex gap-6 h-full overflow-hidden">
      {/* Options Panel (Left) */}
      <div className="w-80 bg-surface/30 border border-white/5 rounded-2xl p-6 flex flex-col gap-5 shrink-0">
        <div>
          <h3 className="text-md font-bold font-mono text-primary uppercase tracking-wide">Optionen</h3>
          <p className="text-xs text-muted font-mono mt-0.5">Parameter für Plan-Generator</p>
        </div>

        <div className="space-y-4 flex-1">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">Template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-text cursor-pointer"
            >
              <option value="push_day">Push Day</option>
              <option value="pull_day">Pull Day</option>
              <option value="legs_day">Legs Day</option>
              <option value="upper_day">Upper Day</option>
              <option value="lower_day">Lower Day</option>
              <option value="full_body">Full Body</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">Ziel</label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-text cursor-pointer"
            >
              <option value="hypertrophy">Hypertrophie (Muskelaufbau)</option>
              <option value="strength">Maximalkraft (Strength)</option>
              <option value="endurance">Kraftausdauer (Endurance)</option>
              <option value="hybrid">Hybrid (Strength & Size)</option>
            </select>
          </div>
        </div>

        <button
          onClick={generatePlan}
          disabled={loading}
          className="w-full bg-primary text-text py-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Plan generieren
        </button>
      </div>

      {/* Plan Details (Right) */}
      <div className="flex-1 bg-surface/30 border border-white/5 rounded-2xl p-6 flex flex-col h-full overflow-hidden shadow-2xl">
        {plan ? (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-white/5 shrink-0">
              <div>
                <h3 className="text-lg font-bold font-mono text-primary">{plan.template || template}</h3>
                <span className="text-xs text-muted font-mono capitalize">Ziel: {plan.goal || goal}</span>
              </div>
              <button
                disabled={exporting}
                onClick={handleExportPlan}
                className="px-4 py-2 border border-white/10 bg-white/5 rounded-xl hover:bg-white/10 hover:border-white/20 text-xs font-mono font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                {exporting ? 'Speichert…' : 'In Obsidian speichern'}
              </button>
            </div>

            {/* Coverage Summary Metrics */}
            {plan.coverage_summary && (
              <div className="grid grid-cols-3 gap-4 py-4 border-b border-white/5 bg-black/10 px-4 -mx-6 shrink-0">
                <div className="text-center">
                  <span className="text-[10px] text-muted uppercase font-mono font-bold">Gesamtsätze</span>
                  <span className="block text-xl font-bold font-mono text-primary mt-0.5">
                    {plan.coverage_summary.sets || '0'}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-muted uppercase font-mono font-bold">Durchschnitts-RPE</span>
                  <span className="block text-xl font-bold font-mono text-success mt-0.5">
                    {plan.coverage_summary.rpe || '—'}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-muted uppercase font-mono font-bold">Übungen</span>
                  <span className="block text-xl font-bold font-mono text-text mt-0.5">
                    {plan.slots ? plan.slots.length : '0'}
                  </span>
                </div>
              </div>
            )}

            {/* Plan Slots List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted font-bold mb-1">Übungen</h4>
              {plan.slots && plan.slots.map((slot, idx) => (
                <div key={idx} className="p-4 bg-surface/50 border border-white/5 rounded-xl flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-muted font-bold">
                      Slot: {slot.name}
                    </span>
                    <div className="font-mono text-sm font-bold text-text mt-1.5">
                      {slot.selected_exercise || 'Keine Übung ausgewählt'}
                    </div>
                  </div>
                  {slot.selected_exercise && (
                    <button
                      onClick={() => onSelectExercise(slot.selected_exercise)}
                      className="px-2.5 py-1.5 border border-white/5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-mono text-muted hover:text-text transition-all active:scale-95 shrink-0"
                    >
                      Ansehen
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <Calendar className="w-12 h-12 text-muted/40" />
            <h3 className="text-xl font-bold font-mono">Kein Plan geladen</h3>
            <p className="text-muted max-w-xs font-mono text-xs">
              Wähle links ein Template und ein Ziel und klicke auf "Plan generieren", um die Übungsauswahl zu berechnen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
