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

## Update 2026-11-04 — Daten kommen aus Monats-Digests statt aus allen Sessions

`useLogbook.js` ruft `getLogbookSessions()` (`@db`) statt `getSessionHistory(2000)`.

- **Firestore** (`lib/db/firestore/workoutIndex.js`): `fitness/{uid}/logbookDigest/{YYYY-MM}` →
  `{ docs: { [sessionDocId]: Digest } }`, `_meta` → `{ schema, builtAtMs, builtThrough }`. Gleiche
  Monats-Pools und gleiche Pflege wie der `workoutIndex` (`indexUpsert`/`indexRemove`/Verdichtung
  inkl. Nachzügler über `saved_at`). Gelesen werden alle Monats-Docs (≈ 1 Read pro Monat) plus die
  letzten 7 Tage live aus `sessions`.
- **Digest** = `sessionToDigest()` in `logbookStats.js`: Warm-ups raus, Alt-Format zu `setsArray`,
  je Übung nur id/Name/Muskeln, je Session Datum/Block/Activity/Modus/Ort/Gate-Zeiten. Er ist selbst
  ein gültiger `buildLogbook`-Input, die Auswertung bleibt also unverändert (Test: „Digest: …").
- **Aufbau**: fehlt `_meta` oder passt `schema` nicht (`LOGBOOK_DIGEST_SCHEMA`), liest das Logbuch
  einmal wie bisher die volle Historie und baut den Digest im Hintergrund (`rebuildLogbookDigest()`).
  Schema-Änderung am Digest = Konstante erhöhen, dann baut sich alles von selbst neu.
- **Lokal** (`lib/db/local/historyEntries.js`): unverändert `getSessionHistory(2000)`, kein Digest.
- Grenzen: In Firestore gelöschte Sessions außerhalb der App bleiben im Digest, bis
  `rebuildLogbookDigest()` läuft (gleiche Einschränkung wie der Index). Die Rules decken
  `fitness/{uid}/**` bereits ab.
- Nächste Abnehmer für das gleiche Pool-Muster: Review (`TrainingProtocol`, Monatsbericht),
  Recovery/Superkompensation, `getExerciseHistory`, Touren.

### Weitere Abnehmer (2026-11-04, gleicher Tag)

- **Digest Schema 2** trägt zusätzlich `duration`, `trainingsart`, `effort`, `activityAddons`. Neuer
  Reader `getDigestSessions({ sinceDate })` (`workoutIndex.js`), `getLogbookSessions()` ist der
  Alias für die komplette Historie.
- **Trainingsprotokoll** (`WeeklyReview/TrainingProtocol.jsx`): `getLogbookSessions()` statt `getSessionHistory(2000)`.
- **Touren** (`firestore/tours.js`): Digest-Monate im Fenster statt jeder Session (ohne Login weiter alter Pfad).
- **Wochen-/Monatsbericht** (`firestore/analysis.js`): Sessions je Tag kommen aus dem schon geladenen
  `getSessionHistory(120)` (`sessionsByDateFromHistory`) statt einer Query pro Tag (7× bzw. 28×);
  nur Tage älter als das Fenster (alte Wochen-Selektoren) fragen einzeln ab.
- **`getSessionHistory(days)`** (`firestore/sessions.js`) hat einen 60-s-Cache mit Single-Flight:
  Recovery, Berichte, Analytics-Update und `getExerciseHistory` teilen sich dasselbe Fenster.
  Jeder Schreibweg (`saveSession`, `deleteSession`, `deleteActivityAddon`) leert ihn vor dem
  Analytics-/Report-Refresh. Fremd geschriebene Sessions (anderes Gerät) erscheinen nach ≤ 60 s.
- **Bewusst nicht auf den Digest gestellt:** `getExerciseHistory`/`getLastExercisePerformance`/
  `getProgressTrend` (Geister-Sätze brauchen Warm-ups/Distanz/Dauer, Fenster nur 28–90 Tage) und
  Dashboard/Heute (lesen schon `analytics/dashboard`). Learn liest keine Sessions, nur
  `getLatestSession()` (1 Doc) und den KB-Katalog (`getAllExercises()`, siehe `src/CLAUDE.md`).
