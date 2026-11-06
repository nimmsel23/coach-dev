# Integration Report: anatomy-kb → fitness-dev Exercise Detail View

**Datum:** 2026-05-21
**Repo:** anatomy-kb → fitness-dev
**Status:** Implementiert, produktionsbereit

---

## Was gebaut wurde

Exercise Detail View in fitness-dev: Wenn der User in der Session-Ansicht auf eine Übung tippt, öffnet ein Modal mit vollständigen Anatomy-Daten aus anatomy-kb.

**Datenfluss:**

```
anatomy-kb/catalog/kb/anatomy_teaching/<id>.yml   (SSOT)
    ↓ sync (bereits etabliert)
fitness-dev/catalog/kb/anatomy_teaching/<id>.yml
    ↓ GET /exercise/:id/teaching  (neuer Endpoint)
App.jsx inspectExercise()
    ↓ merge als ex.lesson
ExerciseInsightModal  (existierte, zeigt jetzt echte Daten)
```

---

## Änderungen fitness-dev

### server.mjs — neuer Endpoint

```
GET /exercise/:id/teaching
```

- Liest `catalog/kb/anatomy_teaching/<id>.yml` via js-yaml
- Sucht zuerst Einzeldatei `<id>.yml`, dann Fallback durch Multi-Lesson-Dateien (z.B. `chest_lessons.yml`, `supplementary_mvp_lessons.yml`)
- Gibt die Lesson als JSON zurück: `{ ok: true, lesson: {...} }`
- 404 wenn keine Lesson vorhanden: `{ ok: false, error: "no_lesson" }`

### App.jsx — async inspectExercise()

- Modal öffnet sofort mit Session-Daten (kein Lag)
- Teaching-Daten werden parallel nachgeladen und als `lesson` gemerged
- Wenn Lesson bereits vorhanden (z.B. beim zweiten Öffnen): kein erneuter Fetch

### ExerciseInsightModal + exerciseInsights.js

Keine Änderungen nötig. `exerciseInsights.js` prüft bereits `ex.lesson` und rendert:
- `learning_goal` (kurz + detailliert)
- `feel_cues` + `coaching_cues`
- `common_errors` (Fehler, anatomischer Grund, Korrektur)
- `trainer_explanation` (simple / technical / client_friendly)
- `quiz` (Lernfrage)
- `muscle_anatomy` (Ursprung, Ansatz, Innervation pro Muskel)

---

## Abgedeckte Übungen (23 Lessons)

| Exercise ID | Titel |
|-------------|-------|
| bench_press | Bankdrücken — Horizontales Drücken verstehen |
| pull_up | Klimmzug — Lat-Mechanik und Scapula-Kontrolle |
| deadlift | Kreuzheben |
| squat | Kniebeuge |
| barbell_row | Rudern |
| incline_dumbbell_press | Schrägbankdrücken |
| chin_up | Untergriff-Klimmzug |
| close_grip_bench_press | Enggiff Bankdrücken |
| cable_fly | Kabelzug Fly |
| cable_pushdown | Kabelzug Trizeps |
| calf_raise | Wadenerheben |
| chest_supported_row | Rudermaschine |
| face_pull | Face Pull |
| hammer_curl | Hammer Curl |
| hip_thrust | Hip Thrust |
| lateral_raise | Seitheben |
| leg_curl | Beinbeuger |
| lunge | Ausfallschritt |
| overhead_triceps_extension | Trizeps Overhead |
| rear_delt_fly | Hintere Schulter Fly |
| romanian_deadlift | Rumänisches Kreuzheben |
| + chest_lessons.yml | Mehrere Brustübungen |
| + supplementary_mvp_lessons.yml | Ergänzende MVP-Lessons |

---

## Dependency

```
fitness-dev/package.json:
  "js-yaml": "^4.x"   (neu hinzugefügt für YAML-Parsing in Node.js)
```

---

## Offene Punkte / Nächste Schritte

- **Ladeindikator** im Modal während Teaching-Fetch läuft (aktuell kein Spinner)
- **Muscle Anatomy Sektion** im Modal — `muscle_anatomy` Daten (Ursprung/Ansatz/Innervation) werden noch nicht explizit angezeigt, nur indirekt über `exerciseInsights.js`. Eigene Sektion wäre wertvoller für die Ausbildung.
- **Mehr Übungen enrichen** — Lücken schließen via `anatomy enrich <id>` (Gemini → anatomy-kb → sync → fitness-dev)
- **Quiz-Modus** — `quiz_prompts` aus den Lessons für interaktives Lernen in `/learn`-View nutzen
