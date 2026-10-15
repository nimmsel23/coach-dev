import { useState, useEffect } from 'react';
import { Dumbbell, Search, Loader2, Sparkles, Brain, Save, ExternalLink, Activity, ChevronLeft } from 'lucide-react';
import { searchExercises, getAnatomy, saveExercise } from '@db';

export default function CatalogBrowser({ onInspectExercise }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [anatomy, setAnatomy] = useState(null);
  const [loadingAnatomy, setLoadingAnatomy] = useState(false);
  
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2200);
  };

  // Search Debounce
  useEffect(() => {
    const handler = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchExercises(searchQuery, 50);
        setResults(data?.results || []);
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Anatomy & Details when an exercise is selected
  useEffect(() => {
    if (!selectedExercise) {
      setAnatomy(null);
      return;
    }
    const exId = selectedExercise.exercise_id || selectedExercise.id;
    setEditNotes(selectedExercise.notes || selectedExercise.description || '');
    
    setLoadingAnatomy(true);
    getAnatomy(exId)
      .then((ana) => setAnatomy(ana))
      .catch(() => setAnatomy(null))
      .finally(() => setLoadingAnatomy(false));
  }, [selectedExercise]);

  async function handleSaveExercise() {
    if (!selectedExercise) return;
    const exId = selectedExercise.exercise_id || selectedExercise.id;
    setSaving(true);
    try {
      const updated = {
        ...selectedExercise,
        notes: editNotes,
        updated_at: new Date().toISOString(),
      };
      await saveExercise(exId, updated);
      setSelectedExercise(updated);
      showToast('Übung im Katalog gespeichert ✓');
    } catch {
      showToast('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vos-panel h-[calc(100dvh-15rem)] lg:h-[calc(100dvh-9rem)] min-h-[480px]">
      {/* Left Sidebar: Search & Results */}
      <div className={`vos-panel-side w-full md:w-80 md:border-r border-fit-line/30 flex-col shrink-0 ${selectedExercise ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-fit-line/30">
          <span className="vos-panel-head block mb-2">Übungen durchsuchen</span>
          <div className="vos-search">
            <Search className="text-fit-dim shrink-0" size={14} />
            <input
              type="text"
              placeholder="Name, Muskel, Quelle …"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {loading && <Loader2 className="text-fit-accent animate-spin shrink-0" size={14} />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && !loading && (
            <div className="vos-panel-head p-8 text-center">
              Keine Ergebnisse gefunden.
            </div>
          )}
          <ul className="divide-y divide-fit-line/20">
            {results.map((ex) => {
              const exId = ex.exercise_id || ex.id;
              const isSelected = selectedExercise && (selectedExercise.exercise_id || selectedExercise.id) === exId;
              const primary = ex.primary_muscles || ex.primaryMuscles || [];
              return (
                <li
                  key={exId}
                  className={`vos-list-row p-3.5 cursor-pointer group ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedExercise(ex)}
                >
                  <div className={`text-sm font-semibold truncate ${isSelected ? 'text-fit-accent' : 'text-fit-ink group-hover:text-fit-accent'}`}>
                    {ex.display_name || ex.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs font-medium text-fit-dim bg-fit-bg2 border border-fit-line/40 rounded-full px-2 py-0.5">
                      {ex.source || 'wger'}
                    </span>
                    {primary.length > 0 && (
                      <span className="text-xs truncate" style={{ color: 'var(--dim)', opacity: 0.6 }}>
                        {primary[0]} {primary.length > 1 ? `+${primary.length - 1}` : ''}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Main Content: Exercise Enhancer & Detail View */}
      <div className={`flex-1 min-w-0 p-4 md:p-6 overflow-y-auto relative space-y-6 ${selectedExercise ? 'block' : 'hidden md:block'}`}>
        {selectedExercise ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <button onClick={() => setSelectedExercise(null)} className="vos-press -mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-fit-accent md:hidden">
              <ChevronLeft size={16} /> Übungen
            </button>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-fit-line/30 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-fit-accent/10 border border-fit-accent/30 text-fit-accent">
                    {selectedExercise.source || 'wger'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--dim)', opacity: 0.5 }}>ID: {selectedExercise.exercise_id || selectedExercise.id}</span>
                </div>
                <h2 className="text-xl font-bold text-fit-ink">
                  {selectedExercise.display_name || selectedExercise.name}
                </h2>
                {selectedExercise.german && selectedExercise.german !== selectedExercise.display_name && (
                  <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>DE: {selectedExercise.german}</p>
                )}
              </div>

              {onInspectExercise && (
                <button
                  onClick={() => onInspectExercise(selectedExercise)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-fit-bg2 border border-fit-line/60 rounded-full text-xs font-semibold text-fit-ink hover:border-fit-accent transition-all shrink-0"
                >
                  <ExternalLink size={14} className="text-fit-accent" /> Detail-Inspector öffnen
                </button>
              )}
            </div>

            {/* Muscle Breakdown Badges */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-fit-bg2/50 p-4 rounded-2xl border border-fit-line/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--dim)', opacity: 0.7 }}>
                  <Activity size={14} className="text-fit-accent" /> Primäre Muskeln
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedExercise.primary_muscles || selectedExercise.primaryMuscles || []).length > 0 ? (
                    (selectedExercise.primary_muscles || selectedExercise.primaryMuscles || []).map((m, idx) => (
                      <span key={idx} className="text-xs font-semibold px-2.5 py-1 bg-fit-accent/15 border border-fit-accent/30 text-fit-accent rounded-full">
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs italic" style={{ color: 'var(--dim)', opacity: 0.5 }}>Keine angegeben</span>
                  )}
                </div>
              </div>

              <div className="bg-fit-bg2/50 p-4 rounded-2xl border border-fit-line/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--dim)', opacity: 0.7 }}>
                  <Activity size={14} className="text-fit-dim" /> Sekundäre Muskeln
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedExercise.secondary_muscles || selectedExercise.secondaryMuscles || []).length > 0 ? (
                    (selectedExercise.secondary_muscles || selectedExercise.secondaryMuscles || []).map((m, idx) => (
                      <span key={idx} className="text-xs font-medium px-2.5 py-1 bg-fit-bg2 border border-fit-line/40 text-fit-ink rounded-full">
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs italic" style={{ color: 'var(--dim)', opacity: 0.5 }}>Keine angegeben</span>
                  )}
                </div>
              </div>
            </div>

            {/* Anatomical Cues & Teaching KB */}
            <div className="bg-fit-bg2/40 p-5 rounded-2xl border border-fit-line/30 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-fit-ink">
                <Brain size={16} className="text-fit-accent" /> Biomechanik & Coaching-Cues
              </div>

              {loadingAnatomy ? (
                <div className="flex items-center gap-2 text-xs text-fit-dim py-4">
                  <Loader2 size={16} className="animate-spin text-fit-accent" /> Anatomie-KB wird geladen…
                </div>
              ) : anatomy ? (
                <div className="space-y-3 text-xs leading-relaxed text-fit-ink font-medium">
                  {anatomy.coaching_cues && anatomy.coaching_cues.length > 0 && (
                    <div>
                      <span className="font-medium block mb-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Cues:</span>
                      <ul className="list-disc list-inside space-y-1 text-fit-ink/90 pl-1">
                        {anatomy.coaching_cues.map((cue, cIdx) => (
                          <li key={cIdx}>{cue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {anatomy.common_errors && anatomy.common_errors.length > 0 && (
                    <div>
                      <span className="font-medium block mb-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Häufige Fehler:</span>
                      <ul className="list-disc list-inside space-y-1 text-fit-ink/90 pl-1">
                        {anatomy.common_errors.map((err, eIdx) => (
                          <li key={eIdx}>
                            <strong className="text-fit-ink">{err.error || err.name}:</strong> {err.correction || err.coaching_cue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs italic" style={{ color: 'var(--dim)', opacity: 0.6 }}>Keine vertieften Anatomie-Cues hinterlegt.</p>
              )}
            </div>

            {/* Coach Notes & Enhancer Editor */}
            <div className="bg-fit-bg2/60 p-5 rounded-2xl border border-fit-line/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-fit-ink">
                  <Sparkles size={16} className="text-fit-accent" /> Katalog-Enhancer-Notizen
                </div>
                <button
                  onClick={handleSaveExercise}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-fit-accent text-fit-bg rounded-full text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {saving ? 'Speichern…' : <><Save size={12} /> Speichern</>}
                </button>
              </div>

              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Coaching-Notizen oder Anpassungen für diese Übung eingeben..."
                className="w-full bg-fit-bg border border-fit-line focus:border-fit-accent rounded-xl p-3 text-xs text-fit-ink outline-none transition-all resize-none h-24 font-medium"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4" style={{ opacity: 0.5 }}>
            <Dumbbell className="w-10 h-10 text-fit-dim" />
            <h3 className="text-base font-semibold text-fit-dim">Katalog-Enhancer</h3>
            <p className="text-xs max-w-sm leading-relaxed">
              Wähle links eine Übung aus, um sie detailliert zu bearbeiten (Biomechanik, Anatomie-Cues, Metadaten).
            </p>
          </div>
        )}

        {toastMsg && (
          <div className="fixed bottom-[calc(var(--mobile-nav-height,0px)+16px)] right-4 lg:bottom-12 lg:right-12 z-[65] px-4 py-2 bg-fit-card border border-fit-accent text-fit-accent text-xs font-semibold rounded-full shadow-lg animate-in fade-in duration-200">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}
