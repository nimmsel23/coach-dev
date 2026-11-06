# Body-Highlighter — Architektur

Drei unabhängige Libraries zeigen Muskelbelastung im Körperbild. Sie sind NICHT
austauschbar (unterschiedliche Slug-Vokabulare, unterschiedliche Granularität)
und wurden bis 2026-07-26 über eine hartcodierte, bei jeder Katalog-Umnummerierung
veraltende ID→Slug-Tabelle (`src/lib/muscleMapping.js`) bedient — diese Datei
ist gelöscht und darf nicht wiederkommen. Jede neue Zuordnung MUSS live aus der
KB abgeleitet werden (`getAllMuscles()` aus `@db`, gespeist von
`GET /fitness/muscles/all` lokal bzw. `fitness/kb/muscles` in Firestore), nie
als literale Tabelle im Code stehen.

## Die drei Libraries

| Library | Komponente | Datenformat | Granularität |
|---|---|---|---|
| `react-body-highlighter` | `BodyMap.jsx` | `[{ name, muscles: [slug], frequency }]` | grob (~19 Slugs, keine Chest-Anteile, keine Front/Rear-Delt-Trennung außer front/back-deltoids) |
| `react-muscle-highlighter` | `DetailedMuscleMap.jsx` | `[{ slug, color }]` | grob, eigenes Vokabular (`deltoids` statt front/back-deltoids) |
| `body-muscles` | `MuscleHighlightMap.jsx` | `{ view, ids: [...] }` pro Aufruf | fein (links/rechts, mehrere Segmente pro Muskel) |

## Woher jede Library ihre Daten bekommt

**RBH und RMH brauchen KEINE Einzelmuskel-Auflösung.** Beide sind zu grob, um
z.B. Pectoralis-Sternal- von -Clavicular-Kopf zu unterscheiden — deshalb reicht
ihnen das **Region-Wort** (`"chest"`, `"back"`, `"shoulders"`, ...), das direkt
aus den Top-Level-Regionsdateien abgeleitet wird (`kb/muscles/*.yml`, z.B.
`chest.yml` mit `id: 100_chest` + `muscles: [...]`-Mitgliederliste). Das Wort
`"chest"` ist zugleich exakt der RBH-Slug — reine Wiederverwendung, keine
Übersetzungstabelle. RMH bekommt dasselbe Wort (leichte Abweichungen wie
`deltoids` statt `front-deltoids` werden nicht übersetzt, sondern bleiben
ungehighlightet — ehrlich statt erfunden).

**body-muscles braucht die Einzelmuskel-Files**, weil es links/rechts +
mehrere Segmente pro Muskel kennt (`viz.body_muscles.ids`, z.B.
`["chest-upper-left", "chest-upper-right"]`). Das steht nur in den
individuellen Dateien unter `kb/muscles/<region>/<id>.yml`, nicht in den
Top-Level-Regionsdateien.

## Live-Datenvertrag: `getAllMuscles()`

```
{
  "wger": { "101_pectoralis_major": 4, ... },        // Catalog-Makro (wger-Abgleich), NICHT fürs Grouping
  "region": { "101_pectoralis_major": "chest", ... },// Coverage-Bucket + RBH/RMH-Grundlage
  "region_labels": { "chest": "Brust", ... },
  "labels": { "101_pectoralis_major": "Großer Brustmuskel", ... },
  "body_muscles": { "101_pectoralis_major": { view, ids: [...] } },
  "body_muscles_slugs": { "101_pectoralis_major": "chest-upper-left" }
}
```

Lokal: `fitness/api/routers/exercises.py::muscles_all()` liest
`kb/muscles/*.yml` + `kb/muscles/*/*.yml` direkt. Firebase:
`src/lib/db/firestore/kb.js::getAllMuscles()` liest die Firestore-Collection
`fitness/kb/muscles`. Beide geben beide KB-Ebenen zurück: Top-Level-Dateien
als `kb_level: region`, Unterordner-Dateien als `kb_level: muscle`.

## Coverage-Bucket (Review-Tab "Coverage-Lücken") = Region, keine Einzelmuskeln

Für Klienten muss verständlich bleiben, was das Frontend zeigt — deshalb
taucht im Coverage/Review-Tab kein einzelner Muskelname auf, nur die Region
(`muscleToRegion(muscleId)` in `src/lib/db/shared/muscle.js`,
`muscleToGroupIds()` der Array-Wrapper darum). `wger_id` ist dabei nie die
Gruppierungs-Ebene — das ist reines Catalog-Makro/-Skelett für den
wger-Abgleich.

Die Region kommt aus allen Top-Level-Regionsdateien (`kb/muscles/*.yml`),
sortiert nach aufsteigender Mitgliederzahl: kleine, spezifische Dateien
(`quadriceps.yml`, `bizeps.yml`, `hamstrings.yml`, `upper_back.yml`, ...)
zuerst, große Sammel-Dateien (`back.yml`, `legs.yml`, `arms.yml`) zuletzt als
Fallback. So bleibt z.B. der Quadrizeps in `quadriceps` statt in einem
pauschalen `legs` zu verschwinden — ohne hartcodiertes Ranking, rein aus der
Struktur der Dateien.

Cardio-Aktivitäten (`ACTIVITY_MUSCLE_GROUPS`) kennen von Haus aus nur das
grobe Regionswort — das ist bereits dieselbe Sprache wie `muscleToRegion()`,
keine Übersetzung nötig.

## Regel für zukünftige Änderungen

Wenn ein Highlighter falsch aussieht: zuerst prüfen, ob die KB-Datei
(Region-Datei oder Einzelmuskel-Datei) das richtige Feld hat — NICHT eine neue
Übersetzungstabelle im JS/Python-Code schreiben. Die einzigen legitimen
Konstanten im Code sind Dinge, die eine externe Library selbst fest vorgibt
und idealerweise von ihr exportiert werden (z.B. `MuscleType` aus
`react-body-highlighter` in `BodyMap.jsx`) — niemals eine von Hand erfundene
ID→Slug- oder Gruppe→Slug-Zuordnung.
