# Audit: WeeklyReview

## Zweck
Wochenrückblick-Tab der Fitness-App: zeigt Report (Sessions, Muskelbelastung, Insights, Top-Übungen) für eine wählbare Woche, mit Export nach Obsidian.

## Komponenten
| Datei | Zweck |
|-------|-------|
| `index.jsx` | Container: State, View-Modi, Datenfetch, Export-Handler |
| `ReviewHeader.jsx` | Titel, Wochen-Input (Freitext + "Aktuell"-Button), Export-Button, Toast |
| `ReviewOverview.jsx` | Session-Count-Kachel |
| `ReviewInsights.jsx` | Recommendations-Liste + Coverage-Gap-Badges + Erfolgs-Banner |
| `ReviewMuscleImpact.jsx` | Muskelregionen mit relativem Score und Balken-Visualisierung |
| `ReviewSessionList.jsx` | Sessions chronologisch (reversed), klickbar → onNavigate, Recovery-Badges |
| `ReviewTopExercises.jsx` | Top-6-Übungen, Klick → onInspectExercise (mit Prop-Normalisierung) |
| `ReviewAnatomyLayer.jsx` | Trainingswoche als angewandte Anatomie — Top-Übungen mit aufklappbaren Teaching-Karten |
| `utils.js` | `formatRecovery(hrs)` — hrs zu `FRESH`/`2d`/`48h` |

## Datenfluss

**@db-Funktionen (index.jsx):**
- `getWeeklyReport(week)` — Haupt-Fetch, lädt Report-Objekt aus `/fitness/weekly` (Node-Server)
- `exportFitnessData({ kind: 'weekly', week_selector, force: true })` — triggert Obsidian-Export

**State in index.jsx:**
- `week` (string, default `'current'`) — Wochenauswahl, fließt in Fetch-Dependency
- `data` (null | object) — komplettes Report-Objekt vom Server
- `loading` (bool) — Spinner-Toggle
- `toast` (string) — kurze Statusmeldung nach Export (Auto-Reset nach 2600ms)
- `viewMode` (`'report'` | `'muscles'` | `'anatomy'`) — Mode-Switcher oben

**Derived state (inline in index.jsx, keine eigenen State-Variablen):**
- `regionEntries` — `Object.entries(data?.body_region_scores || {}).sort((a,b) => b[1] - a[1])` — sortierte Muskelscores, als Prop an ReviewMuscleImpact
- `missingRegions` — `data?.missing_regions || []` — an ReviewInsights

**Props-Kette:**
```
index.jsx
  → ReviewHeader:      week, setWeek, onExport, toast
  → ReviewOverview:    sessionCount
  → ReviewInsights:    recommendations, missingRegions, muscleLanguage
  → ReviewMuscleImpact: regionEntries, muscleLanguage
  → ReviewSessionList: sessions, onNavigate
  → ReviewTopExercises: topExercises, onInspectExercise
```

**Externe Util-Importe (in Subkomponenten):**
- `translateMuscle(region, taxonomy, muscleLanguage)` aus `../../lib/translations` — in ReviewInsights, ReviewMuscleImpact
- `getMuscleIcon(name)` aus `../../constants/MuscleIcons` — in ReviewInsights, ReviewMuscleImpact

## Inline-Code (Extraktionskandidaten)

- **`onNavigate`-Wrapper in index.jsx** (Zeilen 17–19): Tiny-Funktion, die `onOpenSession` aufruft — kann direkt inline als Arrow-Prop oder in eigene Util.
- **`openTopExercise` in ReviewTopExercises.jsx** (Zeilen 4–20): Prop-Normalisierungslogik (snake_case → camelCase, Fallbacks für alle Felder) — ist ein guter Kandidat für `utils.js` oder ein `normalizeExerciseForInspect(ex)` Helper.
- **Recovery-Status-Logik in ReviewSessionList.jsx** (Zeilen 38–39): Inline `hrs < 24 → 'active'` etc. + `colorMap` — könnte in `utils.js` als `getRecoveryStatus(hrs)` leben.
- **`maxScore`-Berechnung in ReviewMuscleImpact.jsx** (Zeile 14): wird in jedem `map()`-Durchlauf neu berechnet (`Math.max(...regionEntries.map(...))`). Sollte einmal vor dem Return berechnet werden.

## Kernfeatures (müssen nach jedem Refactoring erhalten bleiben)

- **Wochenauswahl**: Freitext-Input (`2026-W19`-Format) ODER `'current'`-String — beide Pfade müssen an `getWeeklyReport()` weitergegeben werden
- **`week`-State als Fetch-Dependency**: `useEffect(() => { ... }, [week])` — Refetch bei Wechsel
- **Toast nach Export**: kurze inline-Rückmeldung mit Pfad oder Fallback-Text, Auto-Reset 2600ms
- **Sessions reverse-sortiert**: `sessions.slice().reverse()` — neueste zuerst (kein Mutate des Props)
- **Recovery-Badge-Logik**: 3-State (`active <24h` / `recovering <48h` / `fresh ≥48h`) mit korrektem `colorMap`, max 4 Muskeln pro Session angezeigt
- **`regionEntries` immer sortiert descending**: `sort((a,b) => b[1]-a[1])` — höchster Score oben links
- **Top-Exercises auf 6 gecapped**: `topExercises.slice(0, 6)` — nicht alle zeigen
- **`onInspectExercise` Prop-Normalisierung**: snake_case (API) → camelCase (ExerciseInsightModal), inkl. `display_name || exercise_id`-Fallback und `source_file`-Stripping für category
- **`missingRegions.length > 0` Branch**: zeigt Coverage-Gap-Badges; empty = Erfolgs-Banner (grün)
- **Empty-States**: jede Subkomponente hat eigenen leeren Zustand (dashed border, sentence-case text seit Redesign 2026-08-20, vorher uppercase)
- **Loading-State**: Spinner + Text, zentral im Container — keine Subkomponente ist für Loading zuständig
- **`taxonomy` Prop**: wird von index.jsx an ReviewInsights + ReviewMuscleImpact weitergegeben (taxonomy={taxonomy} — war früher fehlend, ist jetzt korrekt)

## Auffälligkeiten

- **View-Modi**: `'muscles'` bettet die Muscles-View direkt ein (`<Muscles gender={gender} ... />`), `'anatomy'` rendert `ReviewAnatomyLayer` mit `data.top_exercises`. Nur `'report'` macht den eigentlichen Weekly-Report-Fetch sinnvoll.
- **`ReviewInsights.jsx.bak` im Repo**: Identische Datei mit einem Bug (fehlendes `Trophy`-Import aus `lucide-react` in der .bak). `.bak` sollte nicht im src-Ordner liegen.
- **`maxScore` wird in jedem Map-Iteration neu berechnet** (ReviewMuscleImpact, Zeile 14): `Math.max(...regionEntries.map(e => e[1]), 5)` steht innerhalb des `regionEntries.map()`-Callbacks — O(n²). Kein Bug, aber unnötig.
- **`ARCHITECTURE.md` ist veraltet**: utils.js laut ARCHITECTURE.md enthält `formatVolume` — tatsächlich enthält es `formatRecovery`. Kein Code-Bug, aber falsche Doku.
- **`ReviewOverview` zeigt nur Session-Count**: Die Komponente hat eine `grid`-Struktur (mit `grid-cols-1`) als ob weitere Kacheln geplant waren. Aktuell nur eine einzige Kachel.
- **`onNavigate` in index.jsx bindet `tab` hart auf `'session'`**: Andere Tabs nie genutzt, Parameter existiert aber im Callback-Signature. Tote Flexibilität.
- **`isActivity`-Flag in ReviewSessionList** (Zeile 15): `!!session.activity` — wenn truthy, zeigt 'Activity Log' statt Übungscount. Kein sichtbarer Einfluss auf Klick-Verhalten oder Recovery-Badges — Sonderbehandlung ist halb fertig.
- **Export-Fehler werden nur im Toast gemeldet**: kein `console.error`, kein Stacktrace — stille Fehlverdeckung in der Catch-Branch.
- **`muscleLanguage` Default `'de'`** in mehreren Komponenten doppelt deklariert (index.jsx und ReviewInsights, ReviewMuscleImpact) — konsistent, aber redundant.

## Status

**okay** — Architektur sauber, Komponenten klar getrennt, keine kritischen Bugs. Kleinere Performance-Wart (`maxScore`), tote `.bak`-Datei im Ordner, und `taxonomy`-Prop ist stille Zeitbombe wenn der Parent sie je befüllen soll.
