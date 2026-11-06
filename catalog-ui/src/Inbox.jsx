import { useState, useEffect, useCallback } from 'react';
import {
  Inbox, Search, CheckCircle, Trash2, ChevronRight, RefreshCw, Sparkles, AlertTriangle,
} from 'lucide-react';
import { api } from './api';
import { DescriptionTabViewer, Loading, ErrorBox } from './Shared';

// Feld-Gewichte für den Vollständigkeits-Score eines Drafts — bestimmen zugleich,
// welche Lücken im UI als fehlend markiert werden (Gate vor Freigabe).
const QUALITY_FIELDS = [
  { key: (it) => it.name || it.display_name || it.query, label: 'Name' },
  { key: (it) => it.category || it.movement_pattern, label: 'Kategorie/Pattern' },
  { key: (it) => (it.primaryMuscles || it.primary_muscles || []).length > 0, label: 'Primäre Muskeln' },
  { key: (it) => (it.secondaryMuscles || it.secondary_muscles || []).length > 0, label: 'Sekundäre Muskeln' },
  { key: (it) => it.description || it.instructions || it.lesson, label: 'Beschreibung' },
  { key: (it) => it.equipment, label: 'Ausrüstung' },
];

function inboxQuality(item) {
  const missing = QUALITY_FIELDS.filter((f) => !f.key(item)).map((f) => f.label);
  const score = Math.round(((QUALITY_FIELDS.length - missing.length) / QUALITY_FIELDS.length) * 100);
  return { score, missing };
}

function inboxSource(item) {
  const id = item.exercise_id || item.id || '';
  if (id.startsWith('inbox_wger_') || item.wger_id) return 'wger';
  if (id.startsWith('inbox_yuhonas_') || item.yuhonas_id) return 'yuhonas';
  return 'manual';
}

const SOURCE_STYLE = {
  wger: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
  yuhonas: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
  manual: 'bg-white/5 border-white/10 text-muted',
};

export default function InboxTab({ showToast }) {
  const [items, setItems] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [reenriching, setReenriching] = useState(false);
  const [reenrichPreview, setReenrichPreview] = useState(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent'); // recent | quality_asc | name
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('/fitness/inbox')
      .then((d) => {
        const list = d.items || [];
        setItems(list);
        setSelectedIds(new Set());
        if (list.length > 0) {
          setSelectedItem(prev => list.find(it => it.id === prev?.id) || list[0]);
        } else {
          setSelectedItem(null);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setFeedback('');
    setReenrichPreview(null);
  }, [selectedItem?.id]);

  const approve = (id) => {
    api(`/fitness/inbox/${id}/approve`, { method: 'POST' })
      .then(() => {
        showToast('Eintrag erfolgreich freigegeben!', 'success');
        load();
      })
      .catch(err => showToast(`Fehler beim Freigeben: ${err.message}`, 'error'));
  };

  const remove = (id) => {
    if (!confirm('Eintrag wirklich löschen?')) return;
    api(`/fitness/inbox/${id}`, { method: 'DELETE' })
      .then(() => {
        showToast('Eintrag gelöscht', 'success');
        load();
      })
      .catch(err => showToast(`Fehler beim Löschen: ${err.message}`, 'error'));
  };

  const reenrich = (item) => {
    setReenriching(true);
    setReenrichPreview(null);
    api(`/fitness/inbox/${item.id}/reenrich`, {
      method: 'POST',
      body: JSON.stringify({
        display_name: item.name || item.display_name || item.query,
        exercise_id: item.exercise_id || item.id,
        feedback: feedback || undefined,
        current_data: item,
      }),
    })
      .then((res) => {
        setReenrichPreview(res.enriched || null);
        showToast('Gemini-Reenrichment abgeschlossen — Vorschau prüfen', 'success');
      })
      .catch(err => showToast(`Reenrich fehlgeschlagen: ${err.message}`, 'error'))
      .finally(() => setReenriching(false));
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkApprove = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Einträge freigeben?`)) return;
    setBulkBusy(true);
    Promise.allSettled([...selectedIds].map(id => api(`/fitness/inbox/${id}/approve`, { method: 'POST' })))
      .then((results) => {
        const ok = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.length - ok;
        showToast(failed ? `${ok} freigegeben, ${failed} fehlgeschlagen` : `${ok} Einträge freigegeben!`, failed ? 'error' : 'success');
        load();
      })
      .finally(() => setBulkBusy(false));
  };

  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Einträge löschen?`)) return;
    setBulkBusy(true);
    Promise.allSettled([...selectedIds].map(id => api(`/fitness/inbox/${id}`, { method: 'DELETE' })))
      .then(() => {
        showToast(`${selectedIds.size} Einträge gelöscht`, 'success');
        load();
      })
      .finally(() => setBulkBusy(false));
  };

  if (error) return <ErrorBox msg={error} />;
  if (items === null && loading) return <Loading />;
  if (items && items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2 border border-primary/20">
          <Inbox className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-bold font-mono">Inbox leer</h3>
        <p className="text-muted max-w-sm font-mono text-sm leading-relaxed">
          Keine offenen Katalog-Entwürfe. Neue unreviewed Exercises landen hier zur biomechanischen Freigabe.
        </p>
        <button
          onClick={load}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
        </button>
      </div>
    );
  }

  const enriched = (items || []).map((it) => ({ it, quality: inboxQuality(it), source: inboxSource(it) }));
  const q = query.trim().toLowerCase();
  let visible = enriched.filter(({ it, source }) => {
    if (sourceFilter !== 'all' && source !== sourceFilter) return false;
    if (!q) return true;
    const hay = `${it.name || ''} ${it.query || ''} ${it.id || ''} ${it.category || ''}`.toLowerCase();
    return hay.includes(q);
  });
  visible = visible.sort((a, b) => {
    if (sortBy === 'quality_asc') return a.quality.score - b.quality.score;
    if (sortBy === 'name') return (a.it.name || a.it.id || '').localeCompare(b.it.name || b.it.id || '');
    return (b.it.queued_at || '').localeCompare(a.it.queued_at || '');
  });

  const avgScore = enriched.length ? Math.round(enriched.reduce((s, e) => s + e.quality.score, 0) / enriched.length) : 0;
  const incompleteCount = enriched.filter(e => e.quality.score < 100).length;
  const selectedQuality = selectedItem ? inboxQuality(selectedItem) : null;

  return (
    <div className="flex gap-6 h-full overflow-hidden">
      {/* Left List */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Stats header */}
        <div className="grid grid-cols-3 gap-2 mb-3 shrink-0">
          <div className="bg-surface/30 border border-white/5 rounded-xl px-3 py-2">
            <div className="text-[9px] text-muted font-mono uppercase tracking-wider font-bold">Drafts</div>
            <div className="text-lg font-mono font-bold text-text/90">{items?.length || 0}</div>
          </div>
          <div className="bg-surface/30 border border-white/5 rounded-xl px-3 py-2">
            <div className="text-[9px] text-muted font-mono uppercase tracking-wider font-bold">Ø Vollständigkeit</div>
            <div className={`text-lg font-mono font-bold ${avgScore >= 80 ? 'text-success' : avgScore >= 50 ? 'text-amber-400' : 'text-danger'}`}>{avgScore}%</div>
          </div>
          <div className="bg-surface/30 border border-white/5 rounded-xl px-3 py-2">
            <div className="text-[9px] text-muted font-mono uppercase tracking-wider font-bold">Unvollständig</div>
            <div className="text-lg font-mono font-bold text-amber-400">{incompleteCount}</div>
          </div>
        </div>

        {/* Search + filter + sort */}
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Drafts durchsuchen…"
              className="w-full bg-surface/50 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 font-mono text-xs focus:outline-none focus:border-primary text-text"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-2 py-1.5 font-mono text-[10px] text-text/80 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">Alle Quellen</option>
            <option value="wger">wger</option>
            <option value="yuhonas">yuhonas</option>
            <option value="manual">manuell</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-2 py-1.5 font-mono text-[10px] text-text/80 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="recent">Neueste zuerst</option>
            <option value="quality_asc">Unvollständigste zuerst</option>
            <option value="name">Name A–Z</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted transition-all active:scale-90 shrink-0"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg shrink-0">
            <span className="text-[10px] font-mono text-primary font-bold">{selectedIds.size} ausgewählt</span>
            <div className="flex gap-2">
              <button
                onClick={bulkApprove}
                disabled={bulkBusy}
                className="px-2.5 py-1 rounded-md bg-success/20 border border-success/30 text-success text-[10px] font-mono font-bold hover:bg-success/30 transition-all disabled:opacity-50"
              >
                Freigeben
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkBusy}
                className="px-2.5 py-1 rounded-md bg-danger/20 border border-danger/30 text-danger text-[10px] font-mono font-bold hover:bg-danger/30 transition-all disabled:opacity-50"
              >
                Löschen
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-muted text-[10px] font-mono font-bold hover:bg-white/10 transition-all"
              >
                Abwählen
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {visible.length === 0 && (
            <div className="text-muted font-mono text-xs p-4 text-center bg-white/5 rounded-xl border border-white/5">
              Keine Drafts für diesen Filter.
            </div>
          )}
          {visible.map(({ it, quality, source }) => (
            <button
              key={it.id}
              onClick={() => setSelectedItem(it)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-center gap-3 ${
                selectedItem?.id === it.id
                  ? 'bg-primary/10 border-primary/30 shadow-md shadow-primary/5'
                  : 'bg-surface/30 border-white/5 hover:border-white/10 hover:bg-surface/50'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(it.id)}
                onChange={() => {}}
                onClick={(e) => toggleSelect(it.id, e)}
                className="shrink-0 accent-primary w-3.5 h-3.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-mono text-sm font-bold truncate text-text/90">
                    {it.name || it.query || it.id}
                  </div>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold uppercase ${SOURCE_STYLE[source]}`}>
                    {source}
                  </span>
                </div>
                <div className="text-[10px] text-muted font-mono truncate mt-1">
                  {it.file}{it.queued_at ? ` · ${it.queued_at.slice(0, 16).replace('T', ' ')}` : ''}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span
                  title={quality.missing.length ? `Fehlt: ${quality.missing.join(', ')}` : 'Vollständig'}
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    quality.score >= 80 ? 'bg-success/10 border-success/20 text-success'
                    : quality.score >= 50 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-danger/10 border-danger/20 text-danger'
                  }`}
                >
                  {quality.score}%
                </span>
                <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${selectedItem?.id === it.id ? 'text-primary translate-x-1' : 'text-muted'}`} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Details Panel */}
      {selectedItem && (
        <div className="w-[420px] bg-surface/30 border border-white/5 rounded-2xl p-6 flex flex-col h-full overflow-hidden shadow-2xl relative">
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="px-2 py-0.5 rounded bg-primary/20 border border-primary/30 text-primary text-[9px] font-mono font-bold tracking-wider uppercase inline-block">
                  {selectedItem.status || 'Draft'}
                </div>
                <div className={`px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase ${SOURCE_STYLE[inboxSource(selectedItem)]}`}>
                  {inboxSource(selectedItem)}
                </div>
              </div>
              <h3 className="text-xl font-bold font-mono text-primary truncate" title={selectedItem.name || selectedItem.query}>
                {selectedItem.name || selectedItem.query}
              </h3>
            </div>

            {/* Quality gate */}
            <div className={`rounded-xl border p-3 space-y-1.5 ${
              selectedQuality.score === 100 ? 'bg-success/5 border-success/20' : 'bg-amber-500/5 border-amber-500/20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted">Vollständigkeit</span>
                <span className={`text-xs font-mono font-bold ${selectedQuality.score === 100 ? 'text-success' : 'text-amber-400'}`}>
                  {selectedQuality.score}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${selectedQuality.score === 100 ? 'bg-success' : 'bg-amber-400'}`}
                  style={{ width: `${selectedQuality.score}%` }}
                />
              </div>
              {selectedQuality.missing.length > 0 && (
                <div className="flex items-start gap-1.5 pt-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-[10px] font-mono text-amber-400/90 leading-relaxed">
                    Fehlt: {selectedQuality.missing.join(', ')}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs border-y border-white/5 py-4">
              <div>
                <span className="text-muted block font-mono text-[10px] uppercase font-bold">Muskelgruppe</span>
                <span className="font-mono text-text/80">{selectedItem.category || '—'}</span>
              </div>
              <div>
                <span className="text-muted block font-mono text-[10px] uppercase font-bold">Pattern</span>
                <span className="font-mono text-text/80">{selectedItem.movement_pattern || '—'}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">Primäre Muskeln</h4>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Array.isArray(selectedItem.primaryMuscles || selectedItem.primary_muscles) ? (
                    (selectedItem.primaryMuscles || selectedItem.primary_muscles).map((m, idx) => (
                      <span key={idx} className="px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-xs">
                        {m}
                      </span>
                    ))
                  ) : <span className="text-muted text-xs font-mono">—</span>}
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">Sekundäre Muskeln</h4>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Array.isArray(selectedItem.secondaryMuscles || selectedItem.secondary_muscles) ? (
                    (selectedItem.secondaryMuscles || selectedItem.secondary_muscles).map((m, idx) => (
                      <span key={idx} className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs">
                        {m}
                      </span>
                    ))
                  ) : <span className="text-muted text-xs font-mono">—</span>}
                </div>
              </div>
            </div>

            <DescriptionTabViewer item={selectedItem} />

            <div className="border-t border-white/5 pt-4 space-y-2">
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary" /> Gemini Reenrich
              </h4>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optionales Feedback für die Neu-Anreicherung (z.B. 'sekundäre Muskeln fehlen', 'falsches Pattern')…"
                rows={2}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-xs text-text/80 focus:outline-none focus:border-primary resize-none placeholder:text-muted/60"
              />
              <button
                onClick={() => reenrich(selectedItem)}
                disabled={reenriching}
                className="w-full bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reenriching ? 'animate-spin' : ''}`} />
                {reenriching ? 'Reenriche…' : 'Neu anreichern'}
              </button>
            </div>

            {reenrichPreview && (
              <div className="border-t border-white/5 pt-4 space-y-2">
                <h4 className="text-[10px] font-mono uppercase tracking-wider text-success font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" /> Enrichment-Vorschau
                </h4>
                <pre className="text-[10px] font-mono bg-success/5 border border-success/20 rounded-xl p-3 text-text/80 overflow-x-auto whitespace-pre max-h-60 overflow-y-auto">
                  {JSON.stringify(reenrichPreview, null, 2)}
                </pre>
                <p className="text-[10px] text-muted font-mono leading-relaxed">
                  Vorschau wurde bereits als neuer Draft in der Inbox gespeichert — "Aktualisieren" lädt sie in die Liste.
                </p>
              </div>
            )}

            <div className="border-t border-white/5 pt-4">
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold mb-1">Rohdaten (YAML/JSON)</h4>
              <pre className="text-[10px] font-mono bg-black/30 border border-white/5 rounded-xl p-3 text-muted overflow-x-auto whitespace-pre">
                {JSON.stringify(selectedItem, null, 2)}
              </pre>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 mt-4 flex gap-3 shrink-0">
            {selectedItem.status !== 'approved' && (
              <button
                onClick={() => approve(selectedItem.id)}
                title={selectedQuality.score < 50 ? 'Achtung: Draft ist unvollständig' : undefined}
                className="flex-1 bg-success/20 border border-success/30 hover:bg-success/30 text-success py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <CheckCircle className="w-4 h-4" /> Freigeben{selectedQuality.score < 100 ? ` (${selectedQuality.score}%)` : ''}
              </button>
            )}
            <button
              onClick={() => remove(selectedItem.id)}
              className="bg-danger/20 border border-danger/30 hover:bg-danger/30 text-danger px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Trash2 className="w-4 h-4" /> Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
