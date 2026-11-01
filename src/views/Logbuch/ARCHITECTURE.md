# View Architecture: Logbuch

Makro-Gegenstück zum Einzelsession-Tab: Training → **Logbuch** (`#session/logbuch`, Sub-Tab `logbuch`
in `constants/NavigationItems.js`, `SESSION_SUB_TABS` in `App.jsx`, Router in `Session/index.jsx`,
lazy geladen). Der History-Tab (`Session/SessionHistory.jsx`) bleibt unverändert — Drag&Drop-
Umdatieren und Löschen bleiben dort; das Logbuch ist rein lesend und öffnet Sessions über
`onOpenSession`.

## Komponenten

- **`index.jsx`**: Shell — KPI-Leiste, Linsen-Umschalter (zuletzt gewählte Linse in `localStorage`
  `fitness-logbuch-lens`), Filter (Suche, Status, Block, Sortierung, Zeitachse), `focusExercise()`
  springt aus Rekorde/Rhythmus in den Kodex und klappt die Übung auf.
- **`useLogbook.js`**: lädt `getSessionHistory(2000)` einmal (lokal = Anzahl Sessions, Firestore =
  Tage — wie `TrainingProtocol.jsx`), legt Runtime-Drafts darüber, ruft `buildLogbook()`.
- **`logbookStats.js`**: reine Aggregation, keine React-/Alias-Imports (Test:
  `node --test src/views/Logbuch/logbookStats.test.mjs`).
- **`ExerciseCodex.jsx`**: eine Karte pro Übung — Zuletzt, Gipfel, Abstand-Chip, Gipfel-Profil;
  aufgeklappt das Dossier (große Kurve, Kennzahlen, alle Einträge, Sprung in Session/Übungs-Insight).
- **`PeakProfile.jsx`**: SVG-Kurve auf **gemeinsamer Zeitachse** aller Zeilen (gestrichelt =
  Gipfel-Höhe, Dreieck = Gipfel, Punkt = zuletzt).
- **`RecordChronicle.jsx`**: Rekorde nach Monaten; Erstbesteigungen (Ausgangswert) optional.
- **`RhythmGrid.jsx`**: Stempelkarte Übung × Woche (13/26/52 Wochen), Zellfarbe = Nähe zum Gipfel,
  Ring = Gipfel-Woche.
- **`WeekChronik.jsx`**: Wochen-Timeline, abgeleitet von `SessionHistory.jsx` (Wochenköpfe,
  Zeitstrahl, einklappbar) plus Pausen-Hinweise, Top-Lifts, Volumen, Rekord-Sterne.

## Datenmodell (`buildLogbook`)

- Docs desselben Datums werden zu einem Tag zusammengelegt; Übungs-Key = `exercise_id`/`id`, sonst
  Slug des Namens (`n:<slug>`). Gleiche Übung zweimal am Tag → Sätze zusammen.
- Aufwärmsätze (`setType: 'warmup'`) und leere Sätze zählen nicht. Alt-Format `sets/reps/weight`
  wird zu N gleichen Sätzen aufgefächert.
- **Score**: Epley-1RM (`w·(1+min(r,20)/30)`); Übungen, bei denen < 50 % der Einträge Gewicht haben,
  laufen im Modus `reps` (Score = höchste Wdh.-Zahl eines Satzes).
- **Gipfel** = höchster Score; **Abstand** = `1 − zuletzt/Gipfel`. Status: `gipfel` (≤ 1 %), `nah`
  (≤ 10 %), `tal`, `neu` (nur ein Eintrag). `dormant` = ≥ 42 Tage ohne Einheit (eigenes Flag, kein Status).
- **Rekord** = Score ≥ 0,5 % über bisherigem Gipfel; erster Eintrag = `erst`.

## Bewusste Entscheidungen

- Kein Live-Gym-Bezug: alles nachträglich geloggt, keine Echtzeit-Annahmen.
- Keine Vereinheitlichung mit History/Review-Verlauf — Logbuch ist eine eigene Linse, die
  Chronik-Linse ist bewusst eine reduzierte Kopie.
