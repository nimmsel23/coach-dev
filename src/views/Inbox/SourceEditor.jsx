import { sourceIds } from '../../lib/db/shared/catalogSources.js';
import { useEffect, useRef, useState } from 'react';
import { Check, Search, X, GitMerge } from 'lucide-react';
import { editExerciseSources } from '@db';

const SOURCES = ['wger', 'yuhonas'];
const FIELDS = { description: 'Beschreibung', instructions: 'Ausführung', coaching_notes: 'Coaching-Hinweise', equipment: 'Geräte', primary_muscles: 'Primäre Muskeln', secondary_muscles: 'Sekundäre Muskeln', images: 'Bilder' };
const choices = ex => Object.fromEntries(SOURCES.map(key => [key, sourceIds(ex, key)[0] || null]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = entry => entry?.display_name || entry?.name || entry?.english || entry?.id;

export default function SourceEditor({ id, exercise, target = 'inbox', candidates, onSaved, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [current, setCurrent] = useState(exercise);
  const [selection, setSelection] = useState(() => choices(exercise));
  const [rejections, setRejections] = useState(exercise?.source_rejections || {});
  const [fields, setFields] = useState({});
  const [source, setSource] = useState('wger');
  const [query, setQuery] = useState(exercise?.english || exercise?.display_name || exercise?.name || '');
  const [results, setResults] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState({});
  const [currentEntries, setCurrentEntries] = useState({});
  const [revision, setRevision] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showRejected, setShowRejected] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { generation.current += 1; pending.current = false; }, []);

  async function request(payload, kind) {
    if (pending.current) return null;
    pending.current = true;
    const token = generation.current;
    setBusy(kind); setError(''); setNotice('');
    try {
      const result = await editExerciseSources(id, { target, ...payload });
      if (token !== generation.current) return null;
      if (!result?.ok) throw new Error('Änderung konnte nicht gespeichert werden.');
      return result;
    } catch (err) {
      if (token === generation.current) setError(String(err.message).includes('source_merge_conflict') ? 'Der Eintrag wurde inzwischen geändert. Lade ihn erneut und prüfe deine Auswahl.' : err.message || 'Quellen konnten nicht geladen werden.');
      return null;
    } finally {
      pending.current = false;
      if (token === generation.current) setBusy('');
    }
  }
  async function inspect() {
    const result = await request({ operation: 'inspect' }, 'load');
    if (!result) return;
    setCurrent(result.exercise); setRevision(result.revision);
    setSelection(choices(result.exercise)); setRejections(result.exercise.source_rejections || {});
    const entries = result.sources || result.exercise.source_snapshot || result.exercise.origin || {};
    setSelectedEntries(entries); setCurrentEntries(entries);
    setFields({});
  }
  useEffect(() => { if (initiallyOpen) inspect(); }, []); // This inspector is keyed by exercise identity.
  async function toggle() {
    if (!open && !revision) await inspect();
    setOpen(value => !value);
  }
  async function search(event) {
    event.preventDefault();
    const result = await request({ operation: 'search', source, query }, 'search');
    if (result) setResults(result.results || []);
  }
  function select(key, entry) {
    const value = String(entry.id ?? entry[`${key}_id`]);
    setSelection(prev => ({ ...prev, [key]: value }));
    setSelectedEntries(prev => ({ ...prev, [key]: entry }));
    setRejections(prev => ({ ...prev, [key]: (prev[key] || []).filter(id => String(id) !== value) }));
    setNotice('Ausgewählt. Erst „Zusammenführen“ speichert die Änderung.');
  }
  function reject(key, entry) {
    const value = String(entry.id);
    setRejections(prev => ({ ...prev, [key]: [...new Set([...(prev[key] || []), value])] }));
    // Rejecting a proposal must never unlink the already merged source.
    setNotice('Vorschlag abgelehnt. Die bestehende Zuordnung bleibt erhalten.');
  }
  async function merge() {
    const result = await request({ operation: 'merge', revision, selection, rejections, fields }, 'save');
    if (!result) return;
    setCurrent(result.exercise); setSelection(choices(result.exercise));
    setRejections(result.exercise.source_rejections || {}); setRevision(result.revision); setFields({});
    const entries = result.sources || result.exercise.source_snapshot || result.exercise.origin || {};
    setSelectedEntries(entries); setCurrentEntries(entries);
    setNotice('Quellen und Entscheidungen gespeichert. Die Originale bleiben erhalten.');
    onSaved?.(result.exercise);
  }
  const dirty = !same(selection, choices(current)) || !same(rejections, current?.source_rejections || {}) || Object.keys(fields).length > 0;
  function candidateRow(key, entry) {
    const value = String(entry.id);
    const rejected = (rejections[key] || []).map(String).includes(value);
    if (rejected && !showRejected) return null;
    const selected = selection[key] === value;
    return <li key={`${key}:${value}`} className="source-merge-candidate">
      <label><input type="radio" name={`merge-${id}-${key}`} checked={selected} disabled={!!busy || !revision} onChange={() => select(key, entry)} /><span><strong>{nameOf(entry)}</strong><small>{key} · {value}{entry.equipment?.length ? ` · ${Array.isArray(entry.equipment) ? entry.equipment.join(', ') : entry.equipment}` : ''}</small></span></label>
      <div className="source-merge-candidate-actions">
        {rejected ? <button type="button" className="vos-btn" disabled={!!busy} onClick={() => setRejections(prev => ({ ...prev, [key]: prev[key].filter(id => String(id) !== value) }))}>Wieder vorschlagen</button>
          : !selected && <button type="button" className="vos-btn" disabled={!!busy || !revision} onClick={() => reject(key, entry)}><X size={14} /> Ablehnen</button>}
        {entry.description && <details><summary>Inhalt ansehen</summary><p>{entry.description}</p></details>}
      </div>
    </li>;
  }
  return <section className="source-merge" aria-label="Quellen zusammenführen">
    <button type="button" className="source-merge-heading" aria-expanded={open} onClick={toggle}><GitMerge size={18} /> Quellen zusammenführen</button>
    {open && <>
      <p>Wähle die passenden Einträge aus. Prüfe die Auswahl und führe sie anschließend zu dieser Übung zusammen.</p>
      {busy === 'load' && <p role="status">Gespeicherte Zuordnung wird geladen…</p>}
      {!revision && !busy && <button type="button" className="vos-btn" onClick={inspect}>Zuordnung laden</button>}
      <div className="source-merge-selection" aria-label="Auswahl für den gemeinsamen Eintrag">
        {SOURCES.map(key => <div key={key}><strong>{key}</strong><span>{selection[key] ? `${nameOf(selectedEntries[key]) || selection[key]} · ${selection[key]}` : 'Kein Eintrag ausgewählt'}</span>{selection[key] && <button type="button" className="vos-btn" disabled={!!busy || !revision} onClick={() => { setSelection(prev => ({ ...prev, [key]: null })); setFields(prev => Object.fromEntries(Object.entries(prev).filter(([,value]) => value !== key))); }}>Zuordnung entfernen</button>}</div>)}
      </div>
      {SOURCES.map(key => candidates?.[key] && <div key={key}><h4>Vorschlag aus {key}</h4><ul>{candidateRow(key, candidates[key])}</ul></div>)}
      <form onSubmit={search} className="source-merge-search">
        <label>Quelle<select value={source} disabled={!!busy} onChange={event => { setSource(event.target.value); setResults(null); }}><option value="wger">wger</option><option value="yuhonas">yuhonas</option></select></label>
        <label>Name oder Quellen-ID<input value={query} disabled={!!busy} onChange={event => { setQuery(event.target.value); setResults(null); }} /></label>
        <button type="submit" className="vos-btn" disabled={!!busy || !query.trim()}><Search size={15} /> {busy === 'search' ? 'Suche…' : 'Kandidaten suchen'}</button>
      </form>
      <label className="source-merge-rejected"><input type="checkbox" checked={showRejected} onChange={event => setShowRejected(event.target.checked)} /> Abgelehnte Vorschläge anzeigen</label>
      {results?.length === 0 && <p>Keine Treffer. Versuche einen kürzeren oder englischen Namen.</p>}
      {results && <ul aria-label={`Kandidaten aus ${source}`}>{results.map(entry => candidateRow(source, entry))}</ul>}
      <details className="source-merge-fields"><summary>Inhalte für den gemeinsamen Eintrag wählen</summary>
        <p>Vorhandene Coach-Inhalte bleiben standardmäßig erhalten. Fehlende Felder werden aus den gewählten Quellen ergänzt. Originaldaten bleiben separat erhalten.</p>
        {Object.entries(FIELDS).map(([field, label]) => <label key={field}>{label}<select disabled={!!busy} value={fields[field] || 'keep'} onChange={event => setFields(prev => ({ ...prev, [field]: event.target.value }))}><option value="keep">Vorhandenen Inhalt behalten</option><option value="combine">Beide Quellen kombinieren</option>{SOURCES.filter(key => selection[key]).map(key => <option key={key} value={key}>Aus {key} übernehmen</option>)}</select></label>)}
      </details>
      <p className="source-merge-explanation">Erst die Expert-Freigabe verdrängt die zugeordneten Rohlinge in der Übungssuche. Die Originale werden nicht gelöscht.</p>
      <div className="source-merge-footer"><button type="button" className="vos-btn primary" disabled={!!busy || !revision || !dirty} onClick={merge}><Check size={16} /> {busy === 'save' ? 'Speichert…' : (!same(selection, choices(current)) || Object.keys(fields).length ? 'Zusammenführen' : 'Entscheidungen speichern')}</button><button type="button" className="vos-btn" disabled={!!busy || !dirty} onClick={() => { setSelection(choices(current)); setRejections(current.source_rejections || {}); setSelectedEntries(currentEntries); setFields({}); setNotice('Auswahl zurückgesetzt.'); }}>Änderungen verwerfen</button></div>
    </>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="vos-btn" disabled={!!busy} onClick={inspect}>Gespeicherten Stand neu laden</button></div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
