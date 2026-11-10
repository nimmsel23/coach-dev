import SourceEditor from '../Inbox/SourceEditor.jsx';
import MergeDuplicateModal from './MergeDuplicateModal.jsx';
import ExerciseContextMenu from './ExerciseContextMenu.jsx';
import { useEffect, useState } from 'react';
import { Dumbbell, Search, Loader2, Sparkles, Brain, Save, ExternalLink, Activity, ChevronLeft, GitMerge, Inbox } from 'lucide-react';
import { searchExercises, getAnatomy, saveExercise, createInboxDraft, describeCoachError } from '@db';
import { sourceIds } from '../../lib/db/shared/catalogSources.js';
import {
  archiveCatalogExercise,
  draftSlug,
  exerciseKey,
  exerciseLabel,
  isArchivedExercise,
  renameCatalogExercise,
  requeueCatalogExercise,
} from '../../lib/catalogExerciseActions.js';

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
  const [menu, setMenu] = useState(null);
  const [mergePrimary, setMergePrimary] = useState(null);
  const [inboxBusy, setInboxBusy] = useState(false);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2600);
  };

  useEffect(() => {
    const handler = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchExercises(searchQuery, 50);
        setResults((data?.results || []).filter((ex) => !isArchivedExercise(ex)));
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

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

  function patchExercise(next) {
    const key = exerciseKey(next);
    setSelectedExercise((prev) => (prev && exerciseKey(prev) === key ? { ...prev, ...next } : prev));
    setResults((items) => {
      if (isArchivedExercise(next)) return items.filter((item) => exerciseKey(item) !== key);
      return items.map((item) => (exerciseKey(item) === key ? { ...item, ...next } : item));
    });
  }

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

  function openContextMenu(event, exercise) {
    event.preventDefault();
    event.stopPropagation();
    const pad = 8;
    const width = 250;
    const height = 320;
    const x = Math.min(event.clientX, window.innerWidth - width - pad);
    const y = Math.min(event.clientY, window.innerHeight - height - pad);
    setMenu({ x: Math.max(pad, x), y: Math.max(pad, y), exercise });
  }

  async function sendExerciseToInbox(exercise) {
    if (!exercise || inboxBusy) return;
    setInboxBusy(true);
    setMenu(null);
    try {
      const result = await createInboxDraft({
        display_name: exerciseLabel(exercise),
        exercise_id: draftSlug(exercise),
        wger_id: sourceIds(exercise, 'wger', true)[0] || null,
        yuhonas_id: sourceIds(exercise, 'yuhonas', true)[0] || null,
      });
      showToast(`Inbox-Draft: ${result?.id || 'ok'} (noch nicht enriched)`);
    } catch (err) {
      showToast(describeCoachError(err, 'Inbox-Draft fehlgeschlagen'));
    } finally {
      setInboxBusy(false);
    }
  }

  async function handleRename(exercise) {
    setMenu(null);
    const next = window.prompt('Neuer Anzeigename', exerciseLabel(exercise));
    if (next == null) return;
    try {
      const updated = await renameCatalogExercise(exercise, next);
      patchExercise(updated);
      showToast(`Umbenannt: ${exerciseLabel(updated)}`);
    } catch (err) {
      showToast(describeCoachError(err, 'Umbenennen fehlgeschlagen'));
    }
  }

  async function handleArchive(exercise, archived = true) {
    setMenu(null);
    try {
      const updated = await archiveCatalogExercise(exercise, archived);
      patchExercise(updated);
      showToast(archived ? `Archiviert: ${exerciseLabel(exercise)}` : `Wieder aktiv: ${exerciseLabel(exercise)}`);
    } catch (err) {
      showToast(describeCoachError(err, 'Archivieren fehlgeschlagen'));
    }
  }

  async function handleDelete(exercise) {
    setMenu(null);
    const ok = window.confirm(
      `"${exerciseLabel(exercise)}" archivieren/entfernen?\nSie verschwindet aus der Katalogsuche. Approve bleibt unberührt bis du neu freigibst.`,
    );
    if (!ok) return;
    await handleArchive(exercise, true);
  }

  async function handleRequeue(exercise) {
    if (!exercise || inboxBusy) return;
    setInboxBusy(true);
    setMenu(null);
    try {
      const { draft, enriched } = await requeueCatalogExercise(exercise, { enrich: true });
      const draftId = draft?.id || 'inbox';
      showToast(
        enriched?.ok === false
          ? `Draft ${draftId} angelegt — Enrichment später in der Inbox`
          : `Pipeline: ${draftId} enriched, wartet auf Approve`,
      );
    } catch (err) {
      showToast(describeCoachError(err, 'Pipeline fehlgeschlagen'));
    } finally {
      setInboxBusy(false);
    }
  }

  return (
    <div className="vos-panel h-[calc(100dvh-15rem)] lg:h-[calc(100dvh-9rem)] min-h-[480px]">
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
          <p className="mt-2 text-[11px] text-fit-dim">Rechtsklick: umbenennen · mergen · Pipeline · archivieren</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && !loading && (
            <div className="vos-panel-head p-8 text-center">
              Keine Ergebnisse gefunden.
            </div>
          )}
          <ul className="divide-y divide-fit-line/20">
            {results.map((ex) => {
              const exId = exerciseKey(ex);
              const isSelected = selectedExercise && exerciseKey(selectedExercise) === exId;
              const primary = ex.primary_muscles || ex.primaryMuscles || [];
              return (
                <li
                  key={exId}
                  className={`vos-list-row p-3.5 cursor-pointer group ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedExercise(ex)}
                  onContextMenu={(event) => openContextMenu(event, ex)}
                >
                  <div className={`text-sm font-semibold truncate ${isSelected ? 'text-fit-accent' : 'text-fit-ink group-hover:text-fit-accent'}`}>
                    {exerciseLabel(ex)}
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

      <div className={`flex-1 min-w-0 p-4 md:p-6 overflow-y-auto relative space-y-6 ${selectedExercise ? 'block' : 'hidden md:block'}`}>
        {selectedExercise ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <button onClick={() => setSelectedExercise(null)} className="vos-press -mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-fit-accent md:hidden">
              <ChevronLeft size={16} /> Übungen
            </button>
            {(selectedExercise.approved_at || selectedExercise.review_state?.status === 'approved' || ['approved', 'expert'].includes(selectedExercise.source)) && (
              <SourceEditor
                key={selectedExercise.exercise_id || selectedExercise.id}
                id={selectedExercise.exercise_id || selectedExercise.id}
                exercise={selectedExercise}
                target="approved"
                onSaved={(value) => {
                  setSelectedExercise(value);
                  setResults((items) => items.map((item) => (item.exercise_id || item.id) === (value.exercise_id || value.id) ? value : item));
                }}
              />
            )}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-fit-line/30 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-fit-accent/10 border border-fit-accent/30 text-fit-accent">
                    {selectedExercise.source || 'wger'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--dim)', opacity: 0.5 }}>ID: {selectedExercise.exercise_id || selectedExercise.id}</span>
                </div>
                <h2 className="text-xl font-bold text-fit-ink">
                  {exerciseLabel(selectedExercise)}
                </h2>
                {selectedExercise.german && selectedExercise.german !== selectedExercise.display_name && (
                  <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>DE: {selectedExercise.german}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  onClick={() => setMergePrimary(selectedExercise)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-fit-bg2 border border-fit-line/60 rounded-full text-xs font-semibold text-fit-ink hover:border-fit-accent transition-all"
                >
                  <GitMerge size={14} className="text-fit-accent" /> Mergen
                </button>
                <button
                  onClick={() => sendExerciseToInbox(selectedExercise)}
                  disabled={inboxBusy}
                  className="flex items-center gap-2 px-3.5 py-2 bg-fit-bg2 border border-fit-line/60 rounded-full text-xs font-semibold text-fit-ink hover:border-fit-accent transition-all disabled:opacity-50"
                >
                  <Inbox size={14} className="text-fit-accent" /> Inbox
                </button>
                {onInspectExercise && (
                  <button
                    onClick={() => onInspectExercise(selectedExercise)}
                    className="flex items-center gap-2 px-3.5 py-2 bg-fit-bg2 border border-fit-line/60 rounded-full text-xs font-semibold text-fit-ink hover:border-fit-accent transition-all"
                  >
                    <ExternalLink size={14} className="text-fit-accent" /> Detail-Inspector
                  </button>
                )}
              </div>
            </div>

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
              Links suchen und Rechtsklick öffnen. „Erneut durch Pipeline“ legt einen Inbox-Draft an und enriched — Approve bleibt bei dir.
            </p>
          </div>
        )}

        {toastMsg && (
          <div className="fixed bottom-[calc(var(--mobile-nav-height,0px)+16px)] right-4 lg:bottom-12 lg:right-12 z-[65] px-4 py-2 bg-fit-card border border-fit-accent text-fit-accent text-xs font-semibold rounded-full shadow-lg animate-in fade-in duration-200">
            {toastMsg}
          </div>
        )}
      </div>

      <ExerciseContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onRename={handleRename}
        onMerge={(exercise) => {
          setMergePrimary(exercise);
          setMenu(null);
        }}
        onInbox={sendExerciseToInbox}
        onRequeue={handleRequeue}
        onInspect={onInspectExercise ? (exercise) => {
          onInspectExercise(exercise);
          setMenu(null);
        } : null}
        onArchive={(exercise) => handleArchive(exercise, true)}
        onUnarchive={(exercise) => handleArchive(exercise, false)}
        onDelete={handleDelete}
      />

      {mergePrimary && (
        <MergeDuplicateModal
          primary={mergePrimary}
          onClose={() => setMergePrimary(null)}
          onCreated={(result) => showToast(`Merge-Draft: ${result?.id || 'ok'} (ohne Enrichment)`)}
        />
      )}
    </div>
  );
}
