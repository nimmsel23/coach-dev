import { useState, useEffect } from 'react';
import { Search, ChevronRight, RefreshCw, Sparkles, FileText, Award } from 'lucide-react';
import { api } from './api';
import { VisualMuscleMap, DescriptionTabViewer, Field, Loading, ErrorBox } from './Shared';

// ── Browser: Exercise Search & Details side panel ──
export default function BrowserTab({ selectedExId, setSelectedExId, showToast }) {
  const [all, setAll] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(null); // 'sheet' or 'lesson'

  // Alle Exercises laden
  useEffect(() => {
    api('/fitness/exercises/all')
      .then((d) => setAll(d.exercises || []))
      .catch((e) => setError(e.message));
  }, []);

  // Externe Suche (lokal + wger)
  useEffect(() => {
    if (q.length < 2) { setResults(null); return; }
    const t = setTimeout(() => {
      setLoading(true);
      api(`/exercises/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Wenn von anderem Tab ein Exercise ID übergeben wurde
  useEffect(() => {
    if (selectedExId) {
      openDetail(selectedExId);
      setSelectedExId(null); // reset
    }
  }, [selectedExId]);

  const openDetail = (id) => {
    setDetail({ loading: true });
    api(`/exercise/${encodeURIComponent(id)}`)
      .then((d) => setDetail(d.exercise))
      .catch((e) => setDetail({ error: e.message }));
  };

  const handleExport = (id, type) => {
    setExportLoading(type);
    const endpoint = type === 'sheet' ? 'exercise_sheet' : 'exercise_lesson';
    const body = type === 'sheet' ? { query: id } : { exercise_id: id };

    api(`/fitness/export/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (res.ok) {
          showToast(`Erfolgreich nach Obsidian exportiert! (${res.path.split('/').pop()})`, 'success');
        } else {
          showToast(`Fehler beim Export: ${res.detail || 'Fehler'}`, 'error');
        }
      })
      .catch((err) => showToast(`Verbindungsfehler: ${err.message}`, 'error'))
      .finally(() => setExportLoading(null));
  };

  if (error) return <ErrorBox msg={error} />;
  if (all === null) return <Loading />;

  const list = results ?? all;

  return (
    <div className="flex gap-6 h-full overflow-hidden">
      {/* Left List */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <div className="relative mb-4 shrink-0">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Suche in ${all.length} Übungen… (lokal + wger fallback)`}
            className="w-full bg-surface/50 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 font-mono text-sm focus:outline-none focus:border-primary shadow-inner focus:ring-1 focus:ring-primary/30 transition-all text-text"
          />
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <RefreshCw className="w-3.5 h-3.5 text-muted animate-spin" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {list.map((ex) => (
            <button
              key={ex.id || ex.canonical_id}
              onClick={() => openDetail(ex.id || ex.canonical_id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/5 text-left transition-all border ${
                detail?.id === (ex.id || ex.canonical_id)
                  ? 'bg-primary/10 border-primary/20 text-text font-medium'
                  : 'border-transparent text-text/80'
              }`}
            >
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold truncate">{ex.name || ex.display_name}</div>
                <div className="text-[11px] text-muted truncate mt-1">
                  {Array.isArray(ex.primaryMuscles || ex.primary_muscles)
                    ? (ex.primaryMuscles || ex.primary_muscles).join(', ')
                    : (ex.primaryMuscles || '')}
                  {ex.source ? ` · ${ex.source}` : ''}
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-muted shrink-0 transition-transform ${detail?.id === (ex.id || ex.canonical_id) ? 'text-primary translate-x-1' : ''}`} />
            </button>
          ))}
          {list.length === 0 && (
            <div className="text-muted font-mono text-sm p-4 text-center bg-white/5 rounded-xl border border-white/5">
              Keine Treffer in der Datenbank.
            </div>
          )}
        </div>
      </div>

      {/* Right Detail Panel */}
      {detail && (
        <div className="w-[420px] bg-surface/30 border border-white/5 rounded-2xl p-6 overflow-y-auto shrink-0 flex flex-col h-full shadow-2xl space-y-5">
          {detail.loading ? (
            <Loading />
          ) : detail.error ? (
            <ErrorBox msg={detail.error} />
          ) : (
            <>
              <div>
                <span className="px-2 py-0.5 rounded bg-primary/20 border border-primary/30 text-primary text-[9px] font-mono font-bold tracking-wider uppercase inline-block mb-2">
                  {detail.source_file ? detail.source_file.replace('.yml', '') : 'Catalog'}
                </span>
                <h3 className="text-xl font-bold font-mono text-primary leading-tight">{detail.name}</h3>
              </div>

              {/* Visual BodyMap */}
              <VisualMuscleMap
                primaryMuscles={detail.primaryMuscles || detail.primary_muscles || []}
                secondaryMuscles={detail.secondaryMuscles || detail.secondary_muscles || []}
              />

              <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10 text-xs">
                <Field label="ID" value={detail.id || detail.canonical_id} />
                <Field label="wger ID" value={detail.wger_id ? `#${detail.wger_id}` : null} />
                <Field label="yuhonas ID" value={detail.yuhonas_id || null} />
                <Field label="Pattern" value={detail.movement_pattern || '—'} />
                <Field label="Ausrüstung" value={Array.isArray(detail.equipment) ? detail.equipment.join(', ') : detail.equipment} />
                <Field label="Primär Muskeln" value={Array.isArray(detail.primaryMuscles || detail.primary_muscles) ? (detail.primaryMuscles || detail.primary_muscles).join(', ') : ''} />
                <Field label="Sekundär Muskeln" value={Array.isArray(detail.secondaryMuscles || detail.secondary_muscles) ? (detail.secondaryMuscles || detail.secondary_muscles).join(', ') : ''} />
              </div>

              <DescriptionTabViewer item={detail} />

              {/* Action Buttons for Export */}
              <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-4">
                <button
                  disabled={exportLoading !== null}
                  onClick={() => handleExport(detail.id || detail.canonical_id, 'sheet')}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-text py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {exportLoading === 'sheet' ? 'Exporte…' : 'Coach Sheet'}
                </button>
                <button
                  disabled={exportLoading !== null}
                  onClick={() => handleExport(detail.id || detail.canonical_id, 'lesson')}
                  className="bg-primary/20 border border-primary/30 hover:bg-primary/30 text-primary py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  <Award className="w-3.5 h-3.5" />
                  {exportLoading === 'lesson' ? 'Exporte…' : 'Anatomy Lesson'}
                </button>
              </div>

              {detail.lesson && (
                <div className="pt-4 border-t border-white/5">
                  <div className="text-[10px] text-muted font-mono uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" />
                    Anatomie-Lesson (Enriched)
                  </div>
                  <pre className="text-xs whitespace-pre-wrap font-mono text-text/80 bg-black/20 p-3 rounded-xl border border-white/5 max-h-60 overflow-y-auto leading-relaxed">
                    {typeof detail.lesson === 'string' ? detail.lesson : JSON.stringify(detail.lesson, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
