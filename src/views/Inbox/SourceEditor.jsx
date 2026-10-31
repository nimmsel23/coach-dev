import { useState } from 'react';
import { editExerciseSources } from '@db';

function ids(ex, source) {
  return ex?.external_ids?.[source] || ex?.origin?.source_refs?.[source] || (ex?.[`${source}_id`] ? [ex[`${source}_id`]] : []);
}

export default function SourceEditor({ id, exercise, target = 'inbox', candidates, onSaved }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(exercise);
  const [source, setSource] = useState('wger');
  const [query, setQuery] = useState(exercise?.display_name || exercise?.name || '');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewed, setReviewed] = useState({});

  async function run(payload) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await editExerciseSources(id, { target, ...payload });
      if (!result?.ok) throw new Error('Quellen konnten nicht aktualisiert werden.');
      if (result.exercise) setCurrent(result.exercise);
      return result;
    } catch (err) { setError(err.message || 'Quellen konnten nicht geladen werden.'); return null; }
    finally { setBusy(false); }
  }
  async function toggle() {
    if (!open) await run({ operation: 'inspect' });
    setOpen(!open);
  }
  async function search(event) {
    event.preventDefault();
    const result = await run({ operation: 'search', source, query });
    setResults(result?.results || []);
  }
  async function choose(sourceKey, sourceId) {
    const result = await run({ operation: 'set', source: sourceKey, source_id: sourceId });
    if (!result) return;
    setReviewed((value) => ({ ...value, [sourceKey]: true }));
    setNotice(sourceId == null ? 'Verknüpfung entfernt. Diese Quelle bleibt bis zur manuellen Auswahl getrennt.' : 'Quelle ersetzt. Prüfe vorhandene KI-Texte und reichere bei Bedarf erneut an.');
    onSaved?.(result.exercise);
  }
  return <section className="my-3 rounded-xl border border-fit-line p-3 text-xs space-y-3" aria-label="Quellenzuordnung">
    <button type="button" className="min-h-[44px] w-full text-left font-semibold text-fit-accent" aria-expanded={open} onClick={toggle} disabled={busy}>Quellen prüfen / korrigieren {candidates ? '· Vorschläge vorhanden' : ''}</button>
    {current?.source_review_required && <p className="text-fit-orange">Quellen wurden korrigiert. Vorhandene KI-Inhalte müssen erneut geprüft werden.</p>}
    {open && <>
      <p className="text-fit-dim">Eine Quelle beschreibt genau diese Variante. Namensähnlichkeit ist keine bestätigte Zuordnung.</p>
      {['wger', 'yuhonas'].map((key) => <div key={key} className="flex flex-wrap items-center justify-between gap-2">
        <span><strong>{key}</strong>: {ids(current, key).join(', ') || (current?.source_selection && key in current.source_selection ? 'bewusst nicht verknüpft' : 'nicht verknüpft')}</span>
        {!!ids(current, key).length && <button type="button" className="vos-btn no min-h-[44px]" disabled={busy} onClick={() => choose(key, null)}>Verknüpfung entfernen</button>}
      </div>)}
      {Object.entries(candidates || {}).filter(([key]) => !reviewed[key] && !(current?.source_selection && key in current.source_selection)).map(([key, candidate]) => <div key={key} className="rounded-lg border border-fit-line p-2 space-y-2">
        <p>Vorschlag {key}: <strong>{candidate.display_name || candidate.id}</strong> · ID {candidate.id}</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="vos-btn min-h-[44px]" onClick={() => choose(key, candidate.id)}>Diese Variante verbinden</button><button type="button" disabled={busy} className="vos-btn no min-h-[44px]" onClick={() => choose(key, null)}>Falscher Vorschlag</button></div>
      </div>)}
      <form onSubmit={search} className="space-y-2">
        <label className="block">Richtige Quelle suchen<select className="block w-full rounded-lg bg-fit-bg border border-fit-line p-2 mt-1 min-h-[44px]" value={source} disabled={busy} onChange={(e) => { setSource(e.target.value); setResults(null); }}><option value="wger">wger</option><option value="yuhonas">yuhonas</option></select></label>
        <label className="block">Name oder Quellen-ID<input className="block w-full rounded-lg bg-fit-bg border border-fit-line p-2 mt-1 min-h-[44px]" value={query} onChange={(e) => { setQuery(e.target.value); setResults(null); }} disabled={busy} /></label>
        <button type="submit" className="vos-btn min-h-[44px]" disabled={busy || !query.trim()}>{busy ? 'Bitte warten…' : 'Quelle suchen'}</button>
      </form>
      {results?.length === 0 && <p>Keine Treffer in dieser Quelle. Suche auch mit dem englischen Namen oder der ID.</p>}
      <ul className="space-y-2 max-h-80 overflow-y-auto">{results?.map((entry) => <li key={entry.id} className="rounded-lg border border-fit-line p-2 space-y-2"><strong>{entry.display_name}</strong><p>{source} · {entry.id}{entry.english ? ` · ${entry.english}` : ''}</p>{entry.equipment?.length > 0 && <p>Geräte: {entry.equipment.join(', ')}</p>}{entry.description && <details><summary>Originalbeschreibung</summary><p className="whitespace-pre-wrap">{entry.description}</p></details>}<button type="button" className="vos-btn min-h-[44px]" disabled={busy} onClick={() => choose(source, entry.id)}>Als richtige Quelle übernehmen</button></li>)}</ul>
    </>}
    {error && <p role="alert" className="text-fit-red">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
