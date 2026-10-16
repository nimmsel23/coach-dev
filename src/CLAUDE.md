# CLAUDE.md — fitness-app/src

React + Vite Frontend. Übergeordneter Kontext: `../CLAUDE.md` (Repo-Root),
Python-Backend-Details: `../fitness/CLAUDE.md` (API/Dispatcher) und
`../fitness/catalog/CLAUDE.md` (KB/Katalog-Tool-Set).

---

## Tabs (`NAV_ITEMS`, `constants/NavigationItems.js`)

| Tab-ID | Label | View | Anmerkung |
|--------|-------|------|-----------|
| `dash` | Heute | `views/Dashboard/` | Standard-Einstieg |
| `session` | Training | `views/Session/` | Workout-Logging mit Live-BodyMap |
| `habits` | Habits | `views/Habits/` | HabitSync-Integration |
| `journal` | Journal | `views/Journal/` | Text-Notizen |
| `review` | Review | `views/WeeklyReview/` | Charts + Wochenrückblick |
| `learn` | Lernen | `views/Learn/` | Anatomie-Lehre (aus `fitness/catalog/kb/`) |
| `settings` | Setup | `views/Settings/` | Themes, Split, Nav-Modus etc. |

**Coach-App (`coach.html`, Einstieg `coach-main.jsx`)** läuft seit 2026-10-15 in
der eigenen Coach-Shell `src/shell/` (Fork der VitalOS-Shell: Sidebar,
Tab-Bar, Header, Theme-Sheet; Design-CSS `vos-*` in `styles.css`, Default-Theme
`vital`). Details: `views/Coach/ARCHITECTURE.md`. Die Tabelle oben beschreibt
den fitness-dev-Stand und gilt für die Coach-App nur teilweise.

**Versteckte Views** (nicht in Nav, per URL erreichbar): `views/Coach/`
(`#coach`), `views/AppGate.jsx` (Hub-Homescreen, nur `navMode=home` als `#gate`).

**Nicht verlinkt** (Code vorhanden, kein aktiver Tab): `views/Inbox/`
(Exercise-Inbox, Genehmigung neuer KB-Einträge).

**Aktive Sub-View ohne eigenen Haupt-Tab:** `views/Muscles/` —
Superkompensations-Analyse + Body-Map, AKTIV als Subtab `muscles` in
WeeklyReview. ⚠️ NIEMALS als "inaktiv" markieren. Sub-Komponenten:
MuscleAnalysis, MuscleBodyMap, MuscleDetailedMap, MuscleInsights, MuscleHeader.

**Cross-Repo-Symlink-Pattern** (`views/Journal`, `views/Habits`, `views/Learn`):
Symlinks auf Sibling-Repos (`journal-dev`, `habits-dev`, `learn-dev`), weil
`App.jsx` sie per relativem Import einbindet (`./views/Journal/index.jsx`), was
eine physische Datei verlangt. Fitness importiert Fuel bewusst nicht direkt.
Geplante Umstellung (noch nicht umgesetzt): `App.jsx` auf
`@journal`/`@habits`/`@learn`-Aliase umstellen + Symlinks entfernen, dabei
`tailwind.config.cjs`-`content`-Array um die externen Sibling-Pfade erweitern
(analog zu den Sibling-App-Setups), damit fitness-devs eigenes Theme greift.
`Habits`/`Journal`-Views nutzen an vielen Stellen hartcodierte Fuel-Branding-
Klassen (`text-orange-400` etc.) statt `fit-*`-Tokens — unabhängig vom
Symlink-Thema, muss in `habits-dev`/`journal-dev` selbst gefixt werden.

---

## Struktur

**`components/`**:
- `layout/` — Sidebar (Desktop), MobileNav (Bottom-Bar)
- `common/` — ErrorBoundary, UserProfile
- `dashboard/` — ActivityHeatmap, DashboardWidget, MuscleCoverage, SessionStatus u.a.
- Flat (shared): ExerciseSearchOverlay, BodyMap, PlanBuilder, HabitWidget, ExerciseInsightModal, WeightChart, AnatomyDetailModal

**`lib/db/`** — Dual DB-Layer (flach, kein Local/Firebase-Unterverzeichnis):
- `core.js` — api helpers (fetch Wrapper), auth stubs (lokal), `isLocalMode()`, `watchAuth()`
- `sessions.js` — getSession, saveSession, getRecentSessions, getProgressTrend, getPlan, getPlanSuggestion
- `journal.js` — getJournal, saveJournal, getJournalHistory
- `habits.js` — getHabits, recordHabit, unrecordHabit
- `kb.js` — getExercise, getAllExercises, searchExercises, getAnatomy
- `analysis.js` — getDashboardAnalytics, getMuscleCoverage, getWeeklyReport, getCoverageGaps
- `user.js` — getSettings, saveSettings, getBodyEntry, getBodyEntries
- `utils.js` — parseQuick, exportCsv

**`@db` Vite-Alias** (`vite.config.js`):
- Default-Build: `@db` → `src/db.js` (Barrel für `lib/db/*.js`, alle Calls → Node-Server :9100, lokal/Coach, kein Auth-Gate)
- Firebase-Build (`npm run build:firebase`): `@db` → `src/db.firestore.js` (Single-File, direkte Firestore SDK), Output nach `~/fitness/dist-firebase/`

Dev-Port 5902, Proxy zu Backend-API-Routen (:9100).

**BodyMap in Session:** Zeigt nur Muskeln von Exercises mit `done: true`. Kein
Preview, kein Plan — nur was bereits abgehakt ist.

---

## Drei Body-Highlighter (NICHT verwechseln)

| Bibliothek | Komponente | Datenformat | Verwendet in |
|------------|------------|-------------|--------------|
| `react-body-highlighter` | `BodyMap.jsx` | `[{ slug, muscles: [slug], frequency: 1–4 }]` | Dashboard MuscleBody, Muscles/MuscleBodyMap |
| `react-muscle-highlighter` | `DetailedMuscleMap.jsx` | `[{ slug, color: '#hex' }]` | Dashboard MuscleBody, Muscles/MuscleDetailedMap |
| `body-muscles` BodyChart | `BodyMusclesMap.jsx` | `{ [granularId]: { intensity: 0–10, selected: bool } }` | Learn/Explorer |

**groupScores** ist das interne Format zwischen DB-Layer und Komponenten:
`{ [groupName]: { score: 1–4, color: '#hex' } }` — score für RBH frequency,
color für react-muscle-highlighter direkt.

**Stale-Doc-Fund (2026-08-06):** Dieser Absatz behauptete bis eben, `lib/muscleMapping.js`
(RBH_SLUGS/SLUG_TO_GROUP) sei noch aktiv und hartcodiert — die Datei existiert
im laufenden Code längst nicht mehr, abgelöst durch `lib/muscleMap.js`
(`useMuscleMap()`), das live von `/fitness/muscles/viz` (`fitness/api/routers/
exercises.py`) liest, welches wiederum dynamisch aus `kb/muscles/*.yml`
aufbaut (`iter_muscle_documents()`, `muscle_index.yml`) — keine Region-Priorität
hartcodiert, sortiert nach aufsteigender Mitgliederzahl der Region-Bucket-
Dateien (kleine/spezifische zuerst, `back.yml`/`legs.yml` als Fallback zuletzt).
`src/views/Muscles/AUDIT.md` und `fitness/catalog/ARCHITECTURE.md` hatten diesen
Übergang bereits korrekt festgehalten — nur diese eine Datei war seit dem
Refactor nie nachgezogen worden. Lehre: Doku-Claims zu Architektur-Schuld vor
dem Weiterverwenden gegen den aktuellen Code prüfen, auch wenn andere Docs im
selben Repo sich widersprechen könnten (ein einzelnes CLAUDE.md ist keine
verlässliche SOT für sich allein).

---

## Superkompensation — HIT-Zeitfenster

| Phase | Zeitfenster | score | color |
|-------|-------------|-------|-------|
| Stark belastet | 0–3 Tage | 1 | `#ef4444` |
| Erholung | 3–7 Tage | 2 | `#f59e0b` |
| Superkompensation (Peak) | 7–14 Tage | 3 | `#22c55e` |
| Fenster schließt sich | 14–21 Tage | 4 | `#3b82f6` |

Cardio: kürzer (≤1d→1, ≤4d→2, ≤10d→3, kein Blau). Kraft überschreibt Cardio am
selben Tag. Implementiert in `buildLastTrainedMap()` + `superKompFreq()` in
`components/dashboard/MuscleBody.jsx`.

**Firestore-Session-Lookup:** `getWeeklyReport()` (`lib/db/firestore/analysis.js`)
muss `listSessionsForDate(date)` (Query auf das `date`-**Feld**) nutzen, nicht
`getSession(date)` (Direkt-Lookup auf die Dokument-ID) — `useSession.js`
(`handleNewSession()`) vergibt bei **jeder** neuen Session `String(Date.now())`
als ID-Suffix (Standardfall, nicht nur Mehrfach-Sessions), ein Direkt-Lookup auf
die reine Datums-ID findet das Dokument deshalb nie und fällt still auf den
leeren Stub `{ exercises: [] }` zurück.

**Firebase v9-modulares SDK:** `QueryDocumentSnapshot.ref`, nicht `.reference`
(das ist die alte v8/Namespaced-API und im v9-Import immer `undefined` —
Optional-Chaining danach rettet nichts, weil der Crash beim ersten
ungesicherten Zugriff selbst passiert).

**Firestore-Inbox-Writes:** `sendToInbox()` (`lib/db/firestore/kb.js`) muss das
`userId`-Feld mitschreiben — `firestore.rules` verlangt für Inbox-Writes von
Nicht-Coach-Usern `resource.data.userId == request.auth.uid`, sonst
Permission-Denied (leicht im try/catch verschluckt).

---

## Swipe-Navigation

**Swipe-Navigation** (Mobile): Links/Rechts wischen wechselt zwischen Views
(minSwipeDistance: 75px, jank-freier vertikaler Scroll-Lock, schließt
horizontal scrollbare/interaktive Elemente aus).

("Gym Mode" — `layoutScale`, rem-skaliertes `document.documentElement.fontSize`
— wurde am 2026-08-06 komplett entfernt: brach auf Mobile den Viewport, weil
feste `100vw`/`max-width`-Container nicht mitskalierten → horizontaler
Overflow, den `overflow-x-hidden` nur noch unscrollbar abschnitt statt
sichtbar zu machen.)

---

## PWA / Offline

**Service Worker** (`public/sw.js`, `fitness-v1`):
- Install: `public/` statische Assets vorcachen
- GET `/session*`, `/coverage*`, `/fitness/weekly`, `/plan/today`, `/blocks` → stale-while-revalidate
- Navigate → network-first + app-shell fallback
- Hashed Vite-Assets → cache-first + runtime fill
- Background Sync Tag `fitness-flush-queue` → flusht IDB-Queue beim Reconnect

**Offline-Queue** (`public/offline-queue.js`):
- IDB: `aos-offline-fitness` (stores: `queue`, `cache`)
- `window.aosOfflineQueue.fetch` — drop-in für `fetch`, von `api.js` genutzt
- GET offline → IDB-Cache zurückgeben statt Fehler
- POST offline → in Queue einreihen, Background Sync registrieren, 202 zurück
- Auto-flush beim `online`-Event
- Queue-Events `fitness:queue-enqueued` / `fitness:queue-flushed` stehen der UI
  für Rehydration nach Offline-Saves zur Verfügung

**Session-Runtime-Backstop** (`src/lib/sessionRuntimeStore.js`, Stand 2026-08-30):
- Während Session-Edits hält der Client einen lokalen Runtime-Draft in
  `localStorage` (`fitness-session-runtime-v1`)
- Bei offline/queued Saves bleibt dieser Draft bewusst bestehen und wird in
  `useSession()` in Tagesliste + Verlauf wieder über die geladenen Sessions
  gelegt
- Ziel: Reload, Tab-Kill oder kurzzeitige Offline-Phasen dürfen nicht wie
  "Workout nicht gespeichert" aussehen, auch wenn der Netz-Sync noch aussteht

**Firestore Sync** (`firestore-mirror.mjs`, firebase-admin, Node-seitig):
- Creds: `~/.env/firebase-fitness.json` (Service Account), Projekt: `fitness-aos`
- Dual-write bei `POST /session` + `POST /journal` (fire-and-forget)
- `/firestore/status` → Verbindungsstatus; `/firestore/sync` → letzte 30 Sessions pushen

---

## Build-Time-KB-Import statt Hardcoding (`views/Session/sixpackData.js`)

**Architekturentscheidung (2026-08-22):** Der Timer-Tab (`SixPackPromiseCard.jsx`,
6-Pack-Promise-Programm + Calisthenics-Skills) braucht seine Übungs-/Workout-/
Skill-Daten **offline** (PWA-Constraint, kein Firestore-Roundtrip beim Öffnen von
Learn) — aber die KB (`fitness/catalog/kb/exercises/6pack/`,
`fitness/catalog/kb/exercises/calisthenics/`) muss trotzdem die einzige Quelle
bleiben, die von Menschen/Agents editiert wird. **Erster Anlauf war falsch:**
Inhalte (Coaching-Notizen, Übungslisten, Woche-1-Workouts) wurden von Hand aus
den YAMLs in `sixpackData.js` abgetippt — Doppelpflege, garantiert Drift bei
jeder neuen Übung/Woche.

**Fix:** `scripts/build-sixpack-data.mjs` liest die KB-YAMLs zur Build-/Dev-Zeit
(kein Firestore, keine Laufzeit-API) und generiert
`src/views/Session/sixpackData.generated.js` (git-ignored, nie von Hand
editieren). `sixpackData.js` selbst ist nur noch ein stabiler Re-Export dieser
generierten Datei — der Import-Pfad für Components bleibt gleich, der Inhalt
kommt vollständig aus der KB.

- **Läuft automatisch** via `predev`/`prebuild`/`prebuild:firebase`-Hooks in
  `package.json` (npm führt `pre<script>` vor `<script>` aus) — bei
  `npm run dev`/`build`/`build:firebase` immer aktuell. Manuell:
  `npm run build:sixpack-data`.
- **Ausnahme:** `scripts/dev-runner.mjs` (von `fitness-dev.service` teils
  indirekt genutzt) spawnt `vite` direkt statt über `npm run dev` — der
  `predev`-Hook greift dort NICHT. Nach KB-Änderungen im laufenden Dev-Betrieb
  notfalls `npm run build:sixpack-data` manuell nachziehen (Vite HMR pickt die
  neu geschriebene Datei danach automatisch auf).
- Absolute Tage statt Wochen-Sonderfall: `week{N}_workouts.yml`-Dateikonvention
  (aktuell nur `week1_workouts.yml`) — der Generator berechnet
  `(Woche-1)*7 + Tag` selbst. Neue Wochen = einfach `week2_workouts.yml` in
  `kb/exercises/6pack/` anlegen, kein Code-Update nötig.
- Gleiches Prinzip gilt für `SIXPACK_CALISTHENICS_SKILLS` (aus
  `kb/exercises/calisthenics/*.yml`) und die Core-Coaching-Notizen/Common-
  Errors, die im Exercise-Insight-Screen des Timer-Tabs angezeigt werden.
- `fitness/catalog/core/loader.py::iter_catalog_yaml_files()` (rglob statt
  glob, Fix im selben Arbeitsgang) sorgt dafür, dass dieselben `6pack/`- und
  `calisthenics/`-Unterordner auch im Python-Exercise-Resolver (Coverage,
  Firestore-Push, Coach-Katalog-Browser) sichtbar sind — beide Fixes zusammen
  schließen die KB-Subordner-Blindheit app-weit, nicht nur im Timer-Tab.

### Zweiter Fall: Bulk-Exercise-Daten (`lib/db/firestore/kb.js`, 2026-08-22)

**Hintergrund:** Am selben Tag wurde entdeckt, dass `resolver.py::build_exercise_index()`
den `"expert"`-Tier rein über den Speicherort vergibt (`kb/exercises/` vs.
`kb/inbox/`), nicht über ein echtes `approved_at` — 38 Übungen trugen den
`expert`-Tag, ohne je den Approve-Workflow durchlaufen zu haben (u. a. das
mehrfach fälschlich re-committete `020.yml`, siehe Git-Log
`chore(catalog): approve 020 ... via Firestore`, 24× zwischen 08-08 und
08-21 — Ursache war `on_kb_exercises()` in `fitness/firestore/mirror.py`,
das bei JEDER Änderung an einem bereits approved Dokument erneut als
"approve" feuerte, nicht nur beim echten Übergang). Alle 38 wurden per neuem
CLI-Befehl `fitness-catalog inbox demote <id>` zurück nach `kb/inbox/`
geschickt (Gegenstück zu `approve`, in `fitness/catalog/agent/inbox_actions.py`).

Im Zuge dessen fiel auf, dass die **Firebase-PWA** (`lib/db/firestore/kb.js`)
bei jeder ersten Suche die **komplette** `fitness/kb/exercises`-Collection aus
Firestore lud (>1700 Docs) — nur um daraus lokal zu scoren. Der überwiegende
Teil davon (`unreviewed_wger.yml` + `unreviewed_yuhonas.yml`, ~1717 Übungen)
ist reiner, praktisch nie wechselnder Rohimport — ändert sich nur, wenn
jemand explizit `fitness-catalog import` (One-Shot-Bulk-Import) erneut laufen
lässt. Nach demselben Muster wie oben (Build-Time-KB-Import) generiert
`scripts/build-exercise-bulk-data.mjs` daraus
`src/lib/db/firestore/exerciseBulkData.generated.js` (git-ignored) —
`kb.js::searchExercises()` merged dieses statische Array jetzt mit einem
Firestore-Fetch, der die bereits im Bundle enthaltenen IDs rausfiltert
(`_getCuratedExercises()`), statt sie doppelt zu laden.

- **Semantik-Korrektur ab 2026-08-30:** Die beiden Quelldateien heißen zwar
  weiterhin `unreviewed_wger.yml` / `unreviewed_yuhonas.yml`, aber sobald ihr
  Inhalt clientseitig in `exerciseBulkData.generated.js` eingebaut ist, gilt
  er NICHT mehr als `unreviewed`. Im Bundle sind das einfach statische
  `wger`-/`yuhonas`-Importe (`bulk_import`), damit `unreviewed` nur noch echte
  Review-Kandidaten im KB-Sinn bezeichnet.

- **Bewusst NICHT** wie beim 6-Pack vollständig ersetzt: der kuratierte/
  expert-Teil des Katalogs wächst laufend über Coach-Approvals in der
  Firestore-UI — der ganze Sinn dieses Kanals ist, dass eine Freigabe **ohne
  App-Redeploy** sichtbar wird. Nur der statische Bulk-Anteil eignet sich für
  Build-Time-Bundling; würde man den ganzen Katalog so bündeln, bräuchte
  jede Coach-Freigabe einen `npm run build:firebase && deploy`-Zyklus statt
  eines einzelnen Firestore-Writes. Diese Abwägung wurde mit dem User
  explizit durchgesprochen, bevor der Scope auf die zwei Bulk-Dateien
  begrenzt wurde.
- **Ehrliche Einschränkung (noch offen):** `_getCuratedExercises()` liest
  Stand 2026-08-22 weiterhin die volle Firestore-Collection und filtert erst
  danach client-seitig — das spart also (noch) keine Firestore-Reads, nur
  die doppelte Listung im Suchindex. Der volle Nutzen (Firestore-Fetch nur
  noch über den kleinen kuratierten Rest) erfordert zusätzlich, dass
  `fitness/catalog/api/firestore_push.py::sync_exercises()` die beiden
  `unreviewed_*`-Dateien beim Push nach Firestore ausklammert — das würde
  über die bestehende Orphan-Cleanup-Logik automatisch ~1717 Docs aus
  Firestore löschen. Bewusst noch nicht umgesetzt (großer, irreversibel
  wirkender Firestore-Delete, braucht eigene Freigabe), nur der
  client-seitige Teil ist live.
- **Selbstheilend bei Reimport:** Läuft `fitness-catalog import` erneut und
  ändert die beiden `unreviewed_*.yml`-Dateien, holt sich der nächste
  `npm run dev`/`build`/`build:firebase` (via `predev`/`prebuild`/
  `prebuild:firebase` → `build:kb-data` → `build:bulk-data`) automatisch den
  neuen Stand — kein manueller Nacharbeitsschritt nötig, gleiches Prinzip wie
  bei `build:sixpack-data`.
- `getAllExercises()` (voller Fetch) bleibt für den Coach-Katalog-Browser
  unverändert bestehen — nur `searchExercises()` nutzt den neuen,
  bulk-gefilterten Pfad.

---

## Session-JSON-Format

`~/.aos/fitness/sessions/YYYY-MM-DD.json` — das Objekt, das Session-View
speichert/lädt:
```json
{
  "date": "2026-05-17",
  "block": "Push",
  "exercises": [
    {
      "exercise_id": "barbell_bench",
      "id": "barbell_bench",
      "name": "Barbell Bench Press",
      "sets": "", "reps": "", "weight": "", "note": "",
      "primaryMuscles": ["Chest"],
      "secondaryMuscles": ["Shoulders", "Triceps"],
      "isHIT": true,
      "done": true
    }
  ],
  "effort": 8, "mood": "", "notes": "",
  "saved_at": "2026-05-17T18:30:00Z"
}
```
`sets`/`reps`/`weight` sind Strings (leer wenn nicht eingetragen). `isHIT`
kennzeichnet HIT-Trainingseinheiten (kein Satz/Wdh-Tracking, Training bis zum
Muskelversagen).

**Session-Slots** (`slots[]`, optional, additiv seit 2026-08-25): zusätzliche,
frei benannte Abschnitte innerhalb einer Session, jeweils gleich aufgebaut
wie der Basis-Abschnitt (`views/Session/SessionSlots.jsx`, State/Handler in
`useSession.js`). Mentalmodell: die Session **ohne** Slots (Basis-
`ExerciseList` + `ActivityAddon`, unverändert wie seit jeher) ist der
implizite erste Abschnitt; jeder per "+ Slot hinzufügen" angelegte Slot ist
ein weiterer, gleichartiger Abschnitt danach (z. B. Basis="Rücken",
Slot="Bizeps" als zweiter Pull-Day-Teil). Kein exklusiver Typ: ein Slot
kann Übungen, einen Activity-Block (`activityType`/`duration`) und eine
Notiz (`text`) beliebig kombiniert enthalten — `{ id, label, order,
activityType?, duration?, text? }`. Passende `exercises[]`-Einträge
referenzieren ihren Slot über das optionale Feld `slotId` (fehlt/`null` =
unzugeordnet, rendert im Basis-Abschnitt). Leeres `slots`-Array =
unverändertes Alt-Verhalten, kein Zwang. **Kein `time`-Feld** (kurz
eingeführt, gleichentags revertiert): fitness-dev wird nie live im Gym
bedient, Sessions werden immer nachträglich geloggt — ein automatischer
"jetzt"-Zeitstempel beim Anlegen eines Slots wäre erfundene Präzision.
Uhrzeit/Ort sind Session-weite Attribute, nicht pro Slot dupliziert.

**Drag & Drop**: Übungen sind per Griff-Icon sortierbar und zwischen
Basis-Abschnitt/Slots verschiebbar (`@dnd-kit`, ein `DndContext` in
`SessionEditor.jsx` über Basis-`ExerciseList` + alle Slot-`ExerciseList`s).
`useSession.js::moveExercise(exerciseId, targetSlotId, targetIndex)` ist
der zentrale, Container-bewusste Reorder-Pfad — sowohl DnD als auch die
Pfeil-Buttons in `ExerciseCard.jsx` laufen darüber.

**Slot-Bausteine**: der Slot selbst ist der Baustein — "Als Baustein
speichern" snapshotted 1:1 den aktuellen Slot-Inhalt (welche Kombination
aus Übungen/Activity/Notiz auch immer gerade drin ist), keine separate,
enger gefasste Template-Struktur. Persistenz: `getSlotTemplates(block)`/
`saveSlotTemplate()` (`lib/db/local|firestore/slotTemplates.js`), gruppiert
nach Trainingsblock (Push/Pull/Legs/...) — perspektivisch die Brücke
zwischen Session-Tab und Plan-Tab (noch nicht umgesetzt). Der Basis-
`ActivityAddon`-Finisher bleibt unverändert bestehen — Slots sind rein
additive Extra-Abschnitte, kein Ersatz dafür.

**Response Pattern** (API): `{ ok: true, data: {...} }` oder `{ ok: false, error: "..." }`

---

## Exercise Insight Modal / "Coach Sheet" (`ExerciseInsightModal.jsx`, `lib/exerciseInsights.js`)

Öffnet sich global bei jedem Exercise-Klick in der ganzen App (nicht nur im
Coach-Tab) — trotz des Namens "Coach Sheet" kein reines Coach-Feature.
`buildExerciseInsights(ex)` hat zwei Modi:
- **Mit `lesson`** (echte `anatomy_teaching`-YAML vorhanden): normale
  Anatomie-Lektion mit Coaching-Cues, Fehlerbildern, Quiz.
- **Ohne `lesson`** (Stand 2026-08-15: ~22 von ~50+ Übungen): zeigt die
  echten `instructions`/`original_description`-Rohfelder aus wger/yuhonas
  (kommen bereits über `dataclasses.asdict()` vom Backend, siehe
  `ExerciseRecord` in `fitness/catalog/core/resolver.py` — kein Backend-Fix
  nötig). Sichtbarer "Ungeprüfte Rohdaten"-Badge im Modal-Header. **Vorher**
  gab's hier ~250 Zeilen Keyword-Matching (`inferMovement()`), das bei jeder
  lessonlosen Übung denselben erfundenen Bewegungsmuster-Text ausgegeben hat
  ("Drückmuster"/"Zugmuster"/etc., unabhängig von der tatsächlichen Übung) —
  ersatzlos entfernt, war reine Fake-Generik.
- Coaching-Cues-/Fehlerbilder-/Lernfrage-Sektionen erscheinen im Modal nur
  noch, wenn echte Daten vorhanden sind (`insight.coachCues.length`,
  `insight.commonErrors.length`, `insight.quiz[0]?.question`) — keine leeren
  Platzhalter-Boxen mehr. `buildExerciseCoachSheet()` (Markdown-Export)
  zieht mit, inkl. `status: unreviewed|reviewed` im Frontmatter.

---

## Vertex-AI-Enrichment-Fallback (`lib/exerciseAiEnrich.js`, `lib/aiRetry.js`)

Zweiter Enrichment-Pfad für `reenrichInbox()` (Coach-Inbox, `views/Inbox/`,
eingebunden im Coach-Tab `activeSubTab === 'exercises'`) — greift, wenn der
primäre Pfad (FastAPI-Backend über Tailscale-Funnel, Gemini→Haiku→Codex-Kette
serverseitig) fehlschlägt, weil der lokale Coach-Rechner gerade nicht läuft.
Der Pfad ist Fitness-eigen: lokaler Coach-Backendpfad zuerst, Browser-/Cloud-
Fallback nur wenn der lokale Coach-Rechner nicht erreichbar ist.

- `src/firebase.js`: `vertexAI = getAI(app, { backend: new VertexAIBackend() })`
  — bewusst die aktuelle `firebase/ai`-API.
- `lib/exerciseAiEnrich.js`: Prompts 1:1 aus
  `fitness/catalog/agent/gemini.py` (`PROMPT_EXERCISE_ENRICH`/`_NEW`)
  portiert, aber mit `responseSchema`/`responseMimeType: "application/json"`
  statt fragilem Markdown-Fence-Parsing — Vertex liefert garantiert valides
  JSON. Die dort serverseitig erzwungene Muskel-Vokabular-Liste
  (`_muscle_prompt_vocab()`, gespeist aus `kb/muscles/*.yml`) ist hier
  bewusst nur eine Prompt-Empfehlung statt Hard-Constraint — der Coach
  reviewt jeden Draft ohnehin vor Freigabe (siehe Exercise-Insight-Modal
  oben), ein leicht unpräziser Muskel-Name ist kein Datenintegritätsproblem.
- `lib/db/firestore/inbox.js::reenrichInbox()`: Backend-Call zuerst, bei
  Fehlschlag (Netzwerkfehler/Funnel down) `enrichExerciseViaVertex()` +
  direktes `updateDoc()` auf denselben Firestore-Inbox-Doc
  (`status: 'ai_enriched'`, `enriched: {...}`) — identisches Zielformat wie
  der Python-Pfad (`_write_back_to_firestore_inbox` in
  `fitness/catalog/api/watcher.py`), damit die Coach-UI keinen Unterschied
  sieht.
- **Nicht portiert** (bewusst, siehe `anatomy-kb/VERTEX_AI_ROADMAP.md`):
  die anatomy-kb-eigene Muskel-Anatomie-Anreicherung (`anatomy_kb/gemini.py`,
  Ursprung/Ansatz/Innervation pro Muskel) — anderes Zielschema, eigener
  CLI/Daemon-Workflow, kein Browser-Trigger-Punkt vorhanden. Nur der
  Exercise-Draft-Reenrich (Coach-Inbox) hat den Browser-Fallback.

**Coach-Tab-Struktur-Split erledigt (2026-08-15):** `views/Coach/index.jsx`
war 374 Zeilen mit allen 5 Sub-Tabs ("Hidden Chamber": Übungsanfragen/
Klienten-Workouts/Katalog-Browser/Trainingspläne/Klienten) in einer Datei
inkl. riesigem inline Feed-View-Block. Jetzt: `index.jsx` (~90 Zeilen) ist
reiner Tab-Router, der Klienten-Workouts-Feed lebt in eigener
`ClientWorkoutsFeed.jsx` — Muster jetzt konsistent mit den bereits
bestehenden `AssignPlan.jsx`/`CatalogBrowser.jsx`/`ClientManagement.jsx`
(je eine Datei pro Sub-Tab). Der Dedup-Merge-Bug (mehrere unreviewte
wger/yuhonas-Duplikate statt EINEM Inbox-Draft) ist separat in
`../fitness/catalog/CLAUDE.md` dokumentiert (Fix in `resolver.py`
umgesetzt, Yuhonas-Anteil hängt noch am kaputten Datenpfad dort).

**Coach-seitiges Split-Zyklus-Habit-Tracking (2026-08-27,
`views/Coach/ClientHabitCycle.jsx`, neuer `ClientsPanel.jsx`-Sub-Tab
"Habits"):** HabitShare-artige Wochenübersicht + Zyklus-Zähler ("Push/Pull/
Legs x10") pro Klient. Baut **bewusst nicht** auf `habits-dev` auf (das kennt
Fitness/Fuel nicht, komplett isolierte Habit-Collection) — liest stattdessen
retroaktiv das ohnehin vorhandene `session.block`-Feld aus (`SplitPicker.jsx`,
bereits seit längerem Teil des Session-JSON-Formats), keine neue
Datenstruktur, funktioniert sofort auf der kompletten Historie. Coach
konfiguriert pro Klient frei wählbare Tags (müssen mit den SplitPicker-Werten
übereinstimmen, sonst kein Match) + optionale Zielzahl; Zyklen laufen
unbegrenzt weiter (kein Endzustand bei Zielerreichung, nur Anzeige-Marker).
`lib/habitProgress.js::computeSplitCycleProgress()`/`getRecentBlockDays()`
sind die Kernlogik, `views/Session/utils.js::normalizeBlock()` vereinheitlicht
dabei die zwei bisher parallel existierenden Block-Vokabulare (`"Full"` vs.
`"Full Body"`). Konfig-Persistenz: lokal
`~/.aos/fitness/users/{uid}/habit-cycle.json`, Firestore
`fitness/{uid}/settings/habitCycle` (`lib/db/{local,firestore}/coach.js`).
**Bekannte Lücke:** Tag-Eingabe ist Freitext ohne Autocomplete gegen die
tatsächlichen `SPLITS`-Werte aus `SplitPicker.jsx` — Tippfehler/Groß-
Kleinschreibungs-Varianten jenseits von `normalizeBlock()`s einfachem
Lowercase+"full body"-Mapping matchen nicht.

---

## Coach-Befehle & Coach-Rechner-Status (2026-10-16, `lib/db/firestore/inbox.js`)

Im Coach-Build (`MODE === "coach"`) führt die Web-App Inbox-Aktionen (approve,
reenrich, delete, link-source, duplicates, merge-duplicates) **nicht selbst**
aus: `coachCommand()` legt ein Dokument in `coachCommands` (Status `queued`) ab,
der **Worker auf dem Coach-Rechner** (`coach-sync.service`, Code
`~/fitness-dev/fitness/coach/sync.py`) übernimmt es und schreibt `done`/`error`
samt `result` zurück. Vorher lief dieser Consumer nur als Thread im
`:9150`-API-Prozess; war der aus, scheiterte jede Freigabe nach 190 s.

- **Kein Polling mehr:** das Ergebnis kommt per `onSnapshot` auf das
  Befehls-Dokument (Timeout weiter 190 s → `coach_command_timeout`; Ergebnis dann
  unklar, Liste neu laden).
- **Offline-Worker sofort melden:** vor dem Ablegen wird `coachState/bridge`
  gelesen. Ist `last_seen` älter als 60 s (Worker schreibt alle ≤15 s), wirft
  `coachCommand()` `coach_worker_offline` und legt **keinen** Befehl ab, damit
  nichts Stunden später überraschend ausgeführt wird (der Worker fasst
  `queued`-Befehle älter als 6 h ohnehin nicht an). Heartbeat nicht lesbar →
  Befehl wird trotzdem versucht.
- **Fehlertexte:** `describeCoachError(err, fallback)` (aus `@db`) macht aus den
  Codes Klartext für Toasts; `useInbox.js` und `ExerciseInsightModal.jsx` nutzen
  es in ihren `catch`-Zweigen.
- **Statuschip:** `watchCoachWorker(cb)` (Live-Listener + 15-s-Neubewertung)
  speist `src/shell/WorkerChip.jsx` im Header (`CoachShell.jsx` →
  `CoachHeader actions`): grün „Coach-Rechner online [· N wartend]", rot „offline
  seit …"; ohne Heartbeat-Dokument unsichtbar.
- Rules (SSOT `~/vitalos/firestore.rules`, nur von dort deployen):
  `coachState` lesbar für Coaches, `coachCommands` create nur mit
  Whitelist-Feldern/-Aktionen, kein update/delete — daher kann die App einen
  einmal abgelegten Befehl nicht zurückziehen.
- Betrieb Worker: `coach-sync status|drain` (`~/fitness-dev/bin/coach-sync`),
  Details `~/fitness-dev/docs/COACH_APP.md`.
