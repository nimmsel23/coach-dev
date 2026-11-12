import { useState, useEffect, useMemo, useRef } from 'react';
import { RotateCw, Plus, X } from 'lucide-react';
import { getUid, getClientJournalFeed, getClientHabitCycleConfig, saveClientHabitCycleConfig } from '@db';
import { computeSplitCycleProgress, getRecentBlockDays } from '../../lib/habitProgress.js';
import { readHabitDraft, writeHabitDraft, clearHabitDraft } from './habitCycleDraft.js';
import { blockColor } from '../Session/utils.js';

// Coach-Ansicht: "HabitShare"-artige Wochenübersicht pro Split-Tag (Push/
// Pull/Legs/...) + Zyklus-Fortschritt ("6 komplette Zyklen"). Baut bewusst
// NICHT auf einem eigenen Habit-Datensatz auf (habits-dev kennt fitness-dev
// nicht, siehe ARCHITECTURE.md) — liest stattdessen retroaktiv das ohnehin
// vorhandene `session.block`-Feld aus (SplitPicker), keine Doppelpflege.
export default function ClientHabitCycle({ clientUid }) {
  const coachUid = getUid();
  const scope = JSON.stringify([coachUid, clientUid]);
  const [loadedScope, setLoadedScope] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [config, setConfig] = useState({ tags: [], targetCycles: 0 });
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState('');
  const [savedConfig, setSavedConfig] = useState(null);
  const [draftBaseConfig, setDraftBaseConfig] = useState(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const savePending = useRef(false);

  useEffect(() => {
    if (!clientUid) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([getClientJournalFeed(clientUid), getClientHabitCycleConfig(clientUid)])
      .then(([feed, cfg]) => {
        if (!active) return;
        setSessions(feed.filter((f) => f.type === 'workout'));
        const loaded = cfg || { tags: [], targetCycles: 0 };
        let draft = null;
        try { draft = readHabitDraft(window.sessionStorage, coachUid, clientUid); } catch { /* unavailable storage */ }
        setConfig(draft?.config || loaded);
        setNewTag(draft?.newTag || '');
        setSavedConfig(loaded);
        setDraftBaseConfig(draft?.baseConfig || loaded);
        setLoadedScope(JSON.stringify([coachUid, clientUid]));
        setDraftNotice(draft ? JSON.stringify(draft.baseConfig.tags) === JSON.stringify(loaded.tags) && draft.baseConfig.targetCycles === loaded.targetCycles
          ? 'Ungespeicherter Entwurf aus diesem Tab wiederhergestellt.'
          : 'Entwurf wiederhergestellt. Die gespeicherte Konfiguration hat sich inzwischen geändert. Bitte vor dem Speichern prüfen.' : '');
      })
      .catch(() => { if (active) setLoadError('Zyklus konnte nicht geladen werden.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientUid, coachUid, loadAttempt]);

  const progress = useMemo(
    () => computeSplitCycleProgress(sessions, config.tags, config.targetCycles),
    [sessions, config]
  );

  const dirty = savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig);

  useEffect(() => {
    if (loading || !savedConfig || loadedScope !== scope) return;
    try {
      const storage = window.sessionStorage;
      const ok = dirty || newTag ? writeHabitDraft(storage, coachUid, clientUid, { baseConfig: draftBaseConfig, config, newTag })
        : clearHabitDraft(storage, coachUid, clientUid);
      setStorageError(!ok);
    } catch { setStorageError(true); }
  }, [loading, savedConfig, dirty, newTag, config, coachUid, clientUid, loadedScope, scope, draftBaseConfig]);

  useEffect(() => {
    if (!dirty && !newTag) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, newTag]);

  async function persist(event) {
    event.preventDefault();
    if (savePending.current || (!dirty && !newTag.trim())) return;
    const tag = newTag.trim();
    const next = tag && !config.tags.some((value) => value.toLowerCase() === tag.toLowerCase())
      ? { ...config, tags: [...config.tags, tag] } : config;
    if (!Number.isInteger(config.targetCycles) || config.targetCycles < 0) {
      setError('Bitte eine ganze Zahl ab 0 für das Zyklusziel eingeben.');
      return;
    }
    savePending.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await saveClientHabitCycleConfig(clientUid, next);
      if (result?.ok !== true) throw new Error('not saved');
      setConfig(next);
      setSavedConfig(next);
      setDraftBaseConfig(next);
      setNewTag('');
      setDraftNotice('');
    } catch {
      setError('Änderungen konnten nicht gespeichert werden. Bitte erneut speichern.');
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  function addTag() {
    const tag = newTag.trim();
    if (!tag || config.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) { setNewTag(''); return; }
    setConfig({ ...config, tags: [...config.tags, tag] });
    setNewTag('');
  }

  function removeTag(tag) {
    setConfig({ ...config, tags: config.tags.filter((t) => t !== tag) });
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-fit-accent/30 border-t-fit-accent rounded-full animate-spin" />
    </div>
  );

  if (loadError) return <div role="alert" className="card p-4 text-fit-red">
    <p>{loadError}</p>
    <button type="button" className="min-h-11 underline" onClick={() => setLoadAttempt((n) => n + 1)}>Erneut versuchen</button>
  </div>;

  return (
    <div className="space-y-5">
      {draftNotice && <p role="status" className="text-sm text-fit-muted">{draftNotice}</p>}
      {storageError && <p role="alert" className="text-sm text-fit-red">Der Tab-Entwurf konnte nicht gesichert werden. Bitte vor dem Verlassen speichern.</p>}
      {/* Konfiguration */}
      <form onSubmit={persist} className="card p-4 space-y-3">
        <fieldset disabled={saving} className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-fit-ink">Zyklus-Tags</h4>
          {progress.tags.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fit-accent">
              <RotateCw size={12} />
              {progress.cyclesCompleted} Zyklen
              {config.targetCycles > 0 && <span style={{ color: 'var(--dim)' }}> / Ziel {config.targetCycles}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {config.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: `${blockColor(tag)}22`, color: blockColor(tag) }}
            >
              {tag}
              <button type="button" aria-label={`${tag} entfernen`} onClick={() => removeTag(tag)} className="min-h-11 min-w-11 hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              aria-label="Neuer Zyklus-Tag"
              placeholder="z.B. Push"
              className="min-h-11 w-28 px-2 py-1 rounded-full text-xs bg-fit-bg2 border border-fit-line/40 text-fit-ink"
            />
            <button type="button" aria-label="Tag hinzufügen" onClick={addTag} className="min-h-11 min-w-11 p-1 rounded-full bg-fit-bg2 border border-fit-line/40 hover:bg-fit-accent/10">
              <Plus size={12} />
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--dim)' }}>
          Ziel (Zyklen):
          <input
            type="number"
            min={0}
            value={config.targetCycles || ''}
            onChange={(e) => setConfig({ ...config, targetCycles: Number(e.target.value) || 0 })}
            className="min-h-11 w-20 px-2 py-1 rounded-lg text-xs bg-fit-bg2 border border-fit-line/40 text-fit-ink"
          />
        </label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-fit-red">{error}</p>}
        <p role="status" className="text-sm text-fit-muted">{saving ? 'Speichert…' : dirty || newTag ? 'Ungespeicherte Änderungen' : 'Keine offenen Änderungen'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={(!dirty && !newTag.trim()) || saving} className="min-h-11 rounded-full bg-fit-accent px-4 text-sm text-fit-bg disabled:opacity-50">Änderungen speichern</button>
          <button type="button" disabled={(!dirty && !newTag) || saving} onClick={() => { setConfig(savedConfig); setDraftBaseConfig(savedConfig); setNewTag(''); setError(''); setDraftNotice(''); }} className="min-h-11 px-3 text-sm disabled:opacity-50">Verwerfen</button>
        </div>
      </form>

      {/* Wochenübersicht pro Tag */}
      {progress.tags.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--dim)' }}>
          Noch keine Split-Tags konfiguriert — oben hinzufügen (müssen mit den
          Werten aus dem SplitPicker übereinstimmen, z.B. Push/Pull/Legs).
        </p>
      ) : (
        <div className="space-y-3">
          {progress.tags.map((tag) => {
            const days = getRecentBlockDays(tag, sessions, 28);
            const color = blockColor(tag);
            return (
              <div key={tag} className="flex items-center gap-3">
                <div className="w-16 shrink-0 text-xs font-semibold capitalize" style={{ color }}>{tag}</div>
                <div className="flex gap-[3px] flex-wrap">
                  {days.map((d) => (
                    <span
                      key={d.date}
                      title={d.date}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: d.done ? color : 'var(--line)' }}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold ml-auto shrink-0" style={{ color: 'var(--dim)' }}>
                  {progress.counts[tag]}x
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
