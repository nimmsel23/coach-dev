import { useEffect, useRef, useState } from 'react';
import { Download, Save, Sparkles, Square } from 'lucide-react';
import { useUser } from '../../contexts/UserContext.jsx';
import { calculateNutritionTargets, EMPTY_NUTRITION_INPUT, normalizeNutritionInput, normalizeNutritionIdeas, nutritionDraftKey, NUTRITION_SOURCES } from '../../lib/nutrition/targets.js';

import { useNutritionPreferences } from './useNutritionPreferences.js';
import { runRecipeSlots, RECIPE_DAYS } from '../../lib/nutrition/recipeRuns.js';

const field = 'coach-nutrition-input';
function readDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { input: { ...EMPTY_NUTRITION_INPUT }, savedAt: '' };
    const value = JSON.parse(raw);
    if (![1, 2].includes(value.schema) || !value.input || typeof value.input !== 'object') throw new Error();
    const input = normalizeNutritionInput(value.input);
    const ideas = value.ideas?.entries ? value.ideas : value.ideas ? { entries: normalizeNutritionIdeas(value.ideas, calculateNutritionTargets(input).mealTargets.length).recipes.map((recipe, i) => ({ id: `legacy-${i}`, day: null, mealIndex: i, status: 'ready', value: { ...value.ideas, recipes: [recipe] } })) } : { entries: [] };
    if (!Array.isArray(ideas.entries) || ideas.entries.length > 100) throw new Error();
    for (const entry of ideas.entries) {
      if (typeof entry.id !== 'string' || !Number.isInteger(entry.mealIndex) || entry.mealIndex < 0 || entry.mealIndex > 5 || !['ready', 'error'].includes(entry.status)) throw new Error();
      if (entry.status === 'ready') normalizeNutritionIdeas(entry.value, 1);
    }
    return { input, ideas, savedAt: value.savedAt || '' };
  } catch { return { input: { ...EMPTY_NUTRITION_INPUT }, savedAt: '', error: 'Gespeicherter Ernährungsentwurf konnte nicht gelesen werden. Er wird erst durch bewusstes Speichern ersetzt.' }; }
}
export default function ClientNutritionPlan({ clientUid }) {
  const { user } = useUser();
  const preferences = useNutritionPreferences(clientUid);
  if (!user?.uid || !clientUid) return <p role="status">Coach-Anmeldung und Klientenauswahl erforderlich.</p>;
  return <NutritionEditor key={`${user.uid}:${clientUid}`} draftKey={nutritionDraftKey(user.uid, clientUid)} preferences={preferences} />;
}
function NutritionEditor({ draftKey, preferences }) {
  const [initial] = useState(() => readDraft(draftKey));
  const [input, setInput] = useState(initial.input);
  const [savedAt, setSavedAt] = useState(initial.savedAt);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(initial.error || '');
  const [ideas, setIdeas] = useState(initial.ideas || { entries: [] });
  const [mealIndex, setMealIndex] = useState(0);
  const [progress, setProgress] = useState('');
  const controller = useRef(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  useEffect(() => { request.current++; controller.current?.abort(); setAiBusy(false); }, [preferences.status, JSON.stringify(preferences.rules)]);
  let targets, problem;
  try { targets = calculateNutritionTargets(input); } catch (err) { problem = err.message; }
  function change(key, value) {
    request.current++; controller.current?.abort();
    setProgress(''); setAiBusy(false); setAiError(''); setIdeas({ entries: [] }); setDirty(true); setError('');
    setInput((prev) => ({ ...prev, [key]: value }));
  }
  const numberField = (key, label, min, max, step = '1') => <label className="coach-nutrition-label">{label}<input className={field} name={key} type="number" inputMode="decimal" min={min} max={max} step={step} value={input[key]} onChange={(event) => change(key, event.target.value)} /></label>;
  const selectField = (key, label, options) => <label className="coach-nutrition-label">{label}<select className={field} name={key} value={input[key]} onChange={(event) => change(key, event.target.value)}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  const textField = (key, label, placeholder) => <label className="coach-nutrition-label">{label}<textarea name={key} className={field} rows={3} maxLength={1500} value={input[key]} placeholder={placeholder} onChange={(event) => change(key, event.target.value)} /></label>;
  function document() {
    return { schema: 2, kind: 'coach-nutrition-draft', input, targets, ideas, savedAt: new Date().toISOString(), status: 'draft', delivery: 'not-delivered', sources: NUTRITION_SOURCES };
  }
  function save() {
    if (!targets) return;
    try {
      const value = document();
      localStorage.setItem(draftKey, JSON.stringify(value));
      setSavedAt(value.savedAt); setDirty(false); setError('');
    } catch { setError('Entwurf konnte im Browser nicht gespeichert werden. Bitte als JSON sichern.'); }
  }
  function download() {
    if (!targets) return;
    const blob = new Blob([JSON.stringify(document(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a'); link.href = url; link.download = 'ernaehrungsentwurf.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function generate(mode = 'single', retrySlot = null) {
    if (preferences.status !== 'ready' || !targets || controller.current && !controller.current.signal.aborted && aiBusy) return;
    const revision = ++request.current;
    const nextController = new AbortController(); controller.current = nextController;
    setAiBusy(true); setAiError(''); setProgress('Startet …');
    const slots = retrySlot ? [retrySlot] : mode === 'week'
      ? RECIPE_DAYS.map((_, day) => ({ id: `week-${day}-${mealIndex}`, day, mealIndex }))
      : [{ id: crypto.randomUUID(), day: null, mealIndex }];
    const replaced = new Set(slots.map((slot) => slot.id));
    const previousNames = ideas.entries.filter((entry) => !replaced.has(entry.id) && entry.status === 'ready').map((entry) => entry.value.recipes[0].name);
    try {
      const { generateNutritionIdeas } = await import('../../lib/nutrition/ideas.js');
      await runRecipeSlots({ slots, signal: nextController.signal, previousNames,
        generate: (slot) => generateNutritionIdeas(input, targets, { ...slot, preferences }),
        onResult: (result, done, total) => {
          if (request.current !== revision) return;
          setIdeas((previous) => ({ entries: [...previous.entries.filter((entry) => entry.id !== result.id), result] }));
          setDirty(true); setProgress(`${done}/${total} Läufe abgeschlossen`);
        } });
    } catch (err) {
      if (request.current === revision) setAiError(err.message || 'Rezeptlauf fehlgeschlagen.');
    } finally { if (request.current === revision) { setAiBusy(false); setProgress((value) => nextController.signal.aborted ? `${value} · gestoppt` : value); } }
  }
  return <section className="coach-nutrition" aria-label="Ernährungsplanung">
    <header className="space-y-2"><h2 className="text-xl font-semibold">Ernährung planen</h2><p className="text-sm text-fit-muted">Vom Ziel zu Tagesmakros und konkreten Rezeptideen. Du prüfst und entscheidest, was zum Klienten passt.</p></header>
    <div className="coach-nutrition-columns">
      <div className="min-w-0 space-y-6">
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold">Ziel & Ausgangslage</legend>
          {selectField('scope', 'Rahmen der Planung', [['', 'Bitte wählen'], ['general', 'Gesunder Erwachsener · allgemeine Fitnessziele'], ['clinical', 'Erkrankung / Schwangerschaft / Stillzeit / Essstörung']])}
          <div className="coach-nutrition-fields">{numberField('age', 'Alter (Jahre)', 18, 100)}{numberField('weight', 'Körpergewicht (kg)', 35, 250, '0.1')}</div>
          {selectField('goal', 'Ziel', [['maintain', 'Gewicht halten / Versorgung strukturieren'], ['lose', 'Fettabbau · moderates Defizit'], ['gain', 'Muskelaufbau · moderater Überschuss']])}
          {selectField('method', 'Erhaltungsbedarf', [['estimate', 'Aus Körperdaten und Aktivität schätzen'], ['manual', 'Bekannten Erhaltungsbedarf eingeben']])}
          {input.method === 'estimate' ? <>
            <div className="coach-nutrition-fields">{numberField('height', 'Körpergröße (cm)', 130, 220)}{selectField('sex', 'Mifflin-Formelparameter', [['', 'Bitte wählen'], ['f', 'Weiblich (−161)'], ['m', 'Männlich (+5)']])}</div>
            {selectField('activity', 'Alltag einschließlich Training', [['1.2', '1,2 · überwiegend sitzend'], ['1.4', '1,4 · leicht aktiv'], ['1.6', '1,6 · aktiv'], ['1.8', '1,8 · sehr aktiv'], ['2', '2,0 · hohe körperliche Belastung']])}
            <p className="text-xs text-fit-muted">Training ist im Faktor enthalten. Trainingskalorien nicht zusätzlich addieren. Alternativ den bekannten Erhaltungsbedarf verwenden.</p>
          </> : numberField('maintenance', 'Erhaltungsbedarf (kcal/Tag)', 1200, 6500, '10')}
          {input.goal !== 'maintain' && numberField('adjustment', `${input.goal === 'lose' ? 'Defizit' : 'Überschuss'} (% des Erhaltungsbedarfs)`, 0, 20)}
        </fieldset>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold">Makros & Mahlzeiten</legend>
          <div className="coach-nutrition-fields">{numberField('proteinPerKg', 'Protein (g/kg Bezugsgewicht)', 0.8, 2.4, '0.1')}{numberField('fatPercent', 'Fett (% der Zielenergie)', 20, 35)}</div>
          {numberField('referenceWeight', 'Optional: Bezugsgewicht für Protein/Fett (kg)', 35, 250, '0.1')}
          <p className="text-xs text-fit-muted">Leer = Körpergewicht. Bei deutlich erhöhtem Körperfett Bezugsgewicht individuell festlegen. Kohlenhydrate decken die verbleibende Energie.</p>
          {selectField('meals', 'Mahlzeiten pro Tag', [['2', '2 Mahlzeiten'], ['3', '3 Mahlzeiten'], ['4', '4 Mahlzeiten'], ['5', '5 Mahlzeiten'], ['6', '6 Mahlzeiten']])}
        </fieldset>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold">Gerichte, Stil & Alltag</legend>
          {selectField('style', 'Ernährungsstil', [['mixed', 'Mischkost'], ['vegetarian', 'Vegetarisch'], ['pescatarian', 'Pescetarisch'], ['plant-based', 'Vegan · ausdrücklich pflanzlich'], ['paleo', 'Paleo · ohne Getreide, Milch, Hülsenfrüchte und Erdäpfel']])}
          {textField('foods', 'Optional: Vorräte oder Vorlieben', 'Zum Beispiel: Kürbis ist noch da; gerne österreichische Küche. Leer lassen = passende Zutaten frei wählen.')}
          {textField('exclusions', 'Allergien, Unverträglichkeiten & Ausschlüsse', 'Keine bekannt — oder konkrete Lebensmittel/Zutaten eintragen')}
          {textField('logistics', 'Kochzeit, Budget, Vorlieben & Tagesablauf', 'Zum Beispiel: maximal 20 Minuten, Meal Prep, warmes Abendessen, Training am Nachmittag')}
        </fieldset>
      </div>
      <div className="coach-nutrition-result min-w-0 space-y-5">
        <h3 className="font-semibold">Dein Planentwurf</h3>
        {!targets ? <p role="status" className="text-sm text-fit-muted">{problem}</p> : <>
          <dl className="coach-nutrition-totals" aria-label="Berechnete Tagesziele">{[[targets.targetKcal, 'kcal / Tag'], [targets.proteinG, 'g Protein'], [targets.fatG, 'g Fett'], [targets.carbsG, 'g Kohlenhydrate']].map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className="text-sm text-fit-muted">{targets.restingKcal ? `Ruhebedarf ≈ ${targets.restingKcal} → ` : ''}Erhaltung ≈ {targets.maintenanceKcal} kcal → Ziel {targets.deltaPct > 0 ? '+' : ''}{targets.deltaPct}%.</p>
          <p className="text-xs text-fit-muted">Protein {input.proteinPerKg} g × {targets.referenceWeight} kg; Fett mindestens 0,6 g/kg und gewählter Energieanteil; Kohlenhydrate als Rest. Makroenergie {targets.macroKcal} kcal (Rundung).</p>
          <h4 className="text-sm font-semibold">Mahlzeitenbudgets</h4>
          <ul className="space-y-3 text-sm">{targets.mealTargets.map((meal, i) => <li key={i}><span className="font-medium">Mahlzeit {i + 1} · {meal.kcal} kcal</span><p className="text-xs text-fit-muted">{meal.protein} g Protein · {meal.fat} g Fett · {meal.carbs} g Kohlenhydrate</p></li>)}</ul>
          <p className="text-xs text-fit-muted">Gleichmäßige Startaufteilung der Tagesziele; keine berechneten Nährwerte der Rezeptideen.</p>
          <ul className="space-y-2 text-xs text-fit-muted">{targets.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!targets} className="vos-btn" onClick={save}><Save size={15} /> Entwurf speichern</button><button type="button" disabled={!targets} className="vos-btn" onClick={download}><Download size={15} /> JSON sichern</button></div>
        <p role="status" className="text-xs text-fit-muted">{dirty ? 'Ungespeicherte Änderungen. ' : savedAt ? `Gespeichert ${new Date(savedAt).toLocaleString('de-AT')}. ` : ''}Nur in diesem Browser, getrennt nach Coach und Klient. Noch nicht in Fuel oder für den Klienten bereitgestellt.</p>
        {error && <p role="alert" className="text-sm text-fit-red">{error}</p>}
        <div className="border-t border-fit-line/30 pt-5 space-y-3">
          <h3 className="font-semibold">KI-Rezeptwerkstatt</h3>
          <div className="text-xs text-fit-muted" role="status">{preferences.status === 'ready' ? preferences.source ? `${preferences.source} gelesen · ${preferences.rules.length} Regeln` : 'Workspace geprüft · keine FUEL.md/NUTRITION.md vorhanden' : preferences.status === 'loading' ? 'Klientenvorgaben werden gelesen …' : preferences.error}<button type="button" className="ml-2 min-h-11 underline" onClick={preferences.retry}>Regeln neu lesen</button></div>
          {preferences.rules?.length > 0 && <ul className="text-xs text-fit-muted space-y-1">{preferences.rules.map((rule, i) => <li key={i}>{rule}</li>)}</ul>}
          <p className="text-xs text-fit-muted">Mit Klick werden Zielmakros, das gewählte Mahlzeitenbudget, Ernährungsstil und deine Vorlieben/Alltagsangaben an Gemini gesendet. Kein Klientenname, keine UID und keine Körperprofildaten. In Freitexten bitte keine personenbezogenen Daten eintragen.</p>
          <label className="coach-nutrition-label">Mahlzeitenbudget<select aria-label="Mahlzeitenbudget" className={field} value={mealIndex} disabled={aiBusy} onChange={(event) => setMealIndex(Number(event.target.value))}>{(targets?.mealTargets || []).map((meal, i) => <option key={i} value={i}>Mahlzeit {i + 1} · {meal.kcal} kcal</option>)}</select></label>
          <div className="flex flex-wrap gap-2"><button type="button" className="vos-btn" disabled={!targets || preferences.status !== 'ready' || aiBusy} onClick={() => generate('single')}><Sparkles size={15} />Ein Gericht erstellen</button><button type="button" className="vos-btn" disabled={!targets || preferences.status !== 'ready' || aiBusy} onClick={() => generate('week')}>Woche · 7 Gerichte</button>{aiBusy && <button type="button" className="vos-btn" onClick={() => controller.current?.abort()}><Square size={14} /> Stoppen</button>}</div>
          <p role="status" className="text-xs text-fit-muted">{progress || 'Ein Klick = ein Gericht für das gewählte Budget. Woche = sieben einzelne Läufe, ein Gericht pro Tag; kein vollständiger Tagesplan.'}</p>
          {aiError && <p role="alert" className="text-sm text-fit-red">{aiError}</p>}
          <p className="text-xs text-fit-muted">KI-Entwurf mit geschätzten Portionen. Zutaten, Ausschlüsse und Rezeptnährwerte vor Verwendung anhand des Fuel-Katalogs prüfen. Die KI verändert keine Zielmakros.</p>
        </div>
        <details className="text-xs text-fit-muted"><summary className="min-h-11 cursor-pointer">Berechnungsgrundlagen</summary><ul className="space-y-2">{NUTRITION_SOURCES.map((source) => <li key={source.url}><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul><p className="mt-3">Allgemeine Fitnessplanung für gesunde Erwachsene; keine medizinische Ernährungstherapie. Faktoren und Planungsgrenzen sind Startannahmen, keine individuelle Eignungsprüfung.</p></details>
      </div>
    </div>
    {!!ideas.entries.length && <section className="coach-feed-section space-y-5" aria-label="KI-Rezeptentwurf">
      <header><h3 className="text-lg font-semibold">Gerichte zum Prüfen</h3><p className="mt-2 text-sm text-fit-muted">Einzelgerichte und Wochenentwürfe · österreichisches Deutsch · Nährwerte aus geschätzten Zutatenwerten berechnet.</p></header>
      <div className="coach-nutrition-recipes">{ideas.entries.map((entry) => {
        const recipe = entry.value?.recipes?.[0];
        return <article key={entry.id} className="space-y-3 min-w-0">
          <p className="text-xs text-fit-muted">{entry.day === null ? 'Einzelgericht' : RECIPE_DAYS[entry.day]} · Mahlzeit {entry.mealIndex + 1}</p>
          {entry.status === 'error' ? <p role="alert" className="text-sm text-fit-red">{entry.error}</p> : <>
            <h4 className="font-semibold">{recipe.name}</h4>
            <p className="text-xs text-fit-muted">{recipe.minutes ? `${recipe.minutes} Minuten · 1 Portion · ` : ''}Nährwerte geschätzt</p>
            {recipe.estimates && <p className="text-sm">{recipe.estimates.kcal} kcal · {recipe.estimates.protein} g Protein · {recipe.estimates.fat} g Fett · {recipe.estimates.carbs} g Kohlenhydrate</p>}
            <p className="text-sm text-fit-muted">{entry.value.rationale}</p>
            <ul className="space-y-1 text-sm">{recipe.ingredients.map((item, n) => <li key={n}>{item}</li>)}</ul>
            <ol className="list-decimal pl-5 space-y-2 text-sm">{recipe.steps.map((step, n) => <li key={n}>{step}</li>)}</ol>
            <details className="text-xs text-fit-muted"><summary className="min-h-11 cursor-pointer">Prüfpunkte</summary>{entry.value.review.map((item, i) => <p key={i}>{item}</p>)}</details>
          </>}
          <button type="button" disabled={aiBusy || !targets || preferences.status !== 'ready'} className="vos-btn" onClick={() => generate('single', { id: entry.id, day: entry.day, mealIndex: entry.mealIndex })}>Dieses Gericht neu erstellen</button>
        </article>;
      })}</div>
    </section>}
  </section>;
}
