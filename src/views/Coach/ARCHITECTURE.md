# View Architecture: Coach

Command Center für Coach-seitige Exercise-Freigabe, Klienten-Betreuung und Katalog-Enhancer. Läuft als eigenständige App (`coach.html` → `vos-coach.web.app`) in der Coach-Shell (`src/shell/`, siehe unten); Zugriff prüft Coach-eigene Auth-Logik (`useCoachAccess.js`).

## Shell & Design (seit 2026-10-15)

Die App nutzt das Design der VitalOS-Shell (`~/vitalos/src`): `src/styles.css`
enthält die geforkte Shell-Basis (Safe-Area, `vos-*`-Primitives) plus die
Coach-Bausteine (`.card`, `vos-btn`, `vos-panel`, `vos-chip`, `vos-tag`,
`vos-list-row`, `vos-search`, `vos-avatar`, `vos-led`). Themes: `vital` (Default
dunkel) und `vital-light`; Auswahl über `ThemeSheet`. Das frühere
„Hidden Chamber"-Theme (`coach-console.css`, `cc-*`-Klassen) ist entfernt —
neue Views nur mit Theme-Variablen (`var(--accent)`, `fit-*`) und `vos-*`
bauen, keine festen Farben.

`src/shell/` (Forks der VitalOS-Shell, bewusst entkoppelt, nicht synchron gehalten):
- `CoachShell.jsx` — Layout + Auth-Gate + Hash-Route (`useCoachRoute`), hält die Zähl-Badge der Übungsanfragen
- `CoachSidebar.jsx` — Desktop-Glas-Leiste (einklappbar, `sidebarPinned` im Settings-Store)
- `CoachTabBar.jsx` — Mobile Tab-Bar (einklappbar per Griff) + „Mehr"-Sheet (Theme, Neu laden, Abmelden)
- `CoachHeader.jsx` — Sticky `vos-bar`-Kopfleiste
- `ThemeSheet.jsx`, `themes.js`, `NavigationItems.js` — Theme-Picker, Registry, die drei Bereiche
Der Content reserviert unten Platz über `--mobile-nav-height` (auf dem Shell-Wrapper gesetzt).

## Komponenten

- **`index.jsx`**: rendert den Inhalt des per Prop `sub` (Hash-Route) gewählten
  Bereichs; Navigation und Titel liegen seit 2026-10-15 in der Shell. Seit
  2026-08-20 (Teil 2) auf 3 Sub-Tabs reduziert (vorher 5 — siehe Update 2026-08-20 in `AUDIT.md` für die
  Vorgeschichte):
  1. `Übungsanfragen` (`InboxCard` / `useInbox`, weiterhin inline in `index.jsx`)
  2. `Katalog Browser` (`CatalogBrowser.jsx`)
  3. `Klienten` (`ClientsPanel.jsx`, seit 2026-08-20) — ersetzt die vorherigen
     drei getrennten Tabs `Klienten-Workouts`/`Plan-Zuweisung`/`Klienten`
- **`CatalogBrowser.jsx`**: Interaktiver Katalog-Enhancer zum Suchen, Analysieren (Anatomie-Cues, Biomechanik, Muskelgruppen) und Bearbeiten/Speichern von Übungen in Firestore (`fitness/kb/exercises`).
- **`ClientsPanel.jsx`** (seit 2026-08-20): Klientenzentrierter Workflow —
  links eine Liste aller User aus `getAllUserProfiles()` (Klick wählt einen
  Klienten), rechts ein Detail-Bereich mit zwei Sub-Tabs für den gewählten
  Klienten: `Workouts` (rendert `ClientWorkoutsFeed` mit `clientUid`-Prop)
  und `Trainingsplan` (rendert `ClientTrainingWorkspace` mit `clientUid` und
  `clientName`). Ältere Plan-Ansichten bleiben für bestehende Deep-Links.
  Der `client`/`friend`-Status-Toggle (vorher `ClientManagement.jsx`, jetzt
  gelöscht) sitzt im Detail-Header. Löst den vorher dokumentierten
  "kein gemeinsamer State zwischen Tabs"-Punkt: Klientenauswahl passiert
  jetzt an einer Stelle statt separat pro Tab.
- **`ClientWorkoutsFeed.jsx`**: eigenständig nutzbar (Klienten-Dropdown +
  Typ-Filter, `getGlobalJournalFeed()`) **oder** eingebettet mit
  `clientUid`-Prop (kein eigener Dropdown, nutzt stattdessen
  `getClientJournalFeed(clientUid)` — siehe Datenfluss unten).
- **`AssignPlan.jsx`** (Legacy-Ansicht): eigenständig nutzbar (Klienten-Dropdown aus
  `getAllUserProfiles()`) **oder** eingebettet mit `clientUid`+`clientName`-
  Props (`embedded`-Flag intern, blendet den Dropdown aus, lädt den Klienten
  per `useEffect` sofort). Baut einen Plan (`getPlanSuggestion()`,
  Template-Auswahl) und pusht ihn direkt an den Klienten
  (`assignPlanToClient()`). Zeigt bereits zugewiesene Pläne dieses Coaches an
  diesen Klienten inkl. Tages-Fortschritt (`getClientPlanProgress()`).
- **`ClientTrainingWorkspace.jsx`**: Klientenansicht plus Coach-eigene
  Programmbibliothek. `CoachRoutineEditor.jsx` bearbeitet Vorlagen im Coach-
  Datenraum. `trainingProgramStore.js` veröffentlicht immutable Programm-
 Snapshots und erstellt bei Zuweisung den bestehenden Klienten-Makrozyklus.
- **Firestore-Integration**: `firestore/routines.js` und `firestore/macrocycles.js`
  gehören zum Coach-Repo. Die Makrozyklus-Dokumente halten den von der
  Klienten-Plan-App konsumierten Vertrag ein; Coach importiert keine
  Laufzeitkomponenten oder Adapter aus `plan-dev`.

## Datenfluss (Firebase / Firestore)

- **Inbox**: `getGlobalInbox()` (in `firestore/sessions.js`) fragt `collectionGroup(db, "inbox")` ab und lädt alle ausstehenden Übungsanfragen (`pending_review`, `ai_enriched`), filtert `approved`/`rejected` raus.
- **Klienten-Feed (global, `ClientWorkoutsFeed` standalone)**: `getGlobalJournalFeed()` (`firestore/coach.js`) lädt per `collectionGroup` Daten aus `sessions`, `journal` und `habitJournals` über **alle** User, gedeckelt auf 50 Items **insgesamt** (nicht pro Klient). `getAllUserProfiles()` löst Namen/Metadaten über `profile` und `settings` Subcollections auf.
- **Klienten-Feed (gezielt, `ClientWorkoutsFeed` mit `clientUid`-Prop)**:
  `getClientJournalFeed(clientUid)` (`firestore/coach.js`, seit 2026-08-20) —
  direkte `collection(db, "fitness", clientUid, "sessions"|"journal"|"habitJournals")`-Query,
  keine `collectionGroup`, kein globaler Cutoff. Grund: der globale Feed kann
  bei mehreren aktiven Usern (Coach nutzt die App auch selbst) die Einträge
  eines bestimmten Klienten komplett verdrängen, bevor ein clientseitiger
  Filter sie sieht. Lokales Pendant: `local/coach.js::getClientJournalFeed()`
  → `GET /fitness/coach/feed?uid=<x>` (`server.mjs`), liest nur den einen
  `~/.aos/fitness/users/<uid>/`-Ordner statt aller.
- **Feedback**: `saveCoachFeedback()` speichert Kommentare direkt in der entsprechenden Klienten-Dokument-Referenz.
- **Katalog**: `searchExercises()`, `getAnatomy()`, `saveExercise()` arbeiten direkt mit `fitness/kb/exercises` und `fitness/kb/anatomy`.
- **Plan-Zuweisung**: `assignPlanToClient(coachUid, clientUid, plan)` — Firestore schreibt per `setDoc` (merge) auf `fitness/{clientUid}/wf_workouts/{planId}` (neue ID via `doc(collection(...)).id` falls `plan.id` fehlt); Local-Build ruft `POST /fitness/coach/plans/:clientUid` (`server.mjs`) auf, das nach `~/.aos/fitness/users/<clientUid>/plans/<planId>.json` schreibt. Beide Backends teilen sich dieselbe Funktionssignatur (`src/lib/db/{firestore,local}/assignedPlans.js`). Klienten-seitiges Abarbeiten des zugewiesenen Plans läuft außerhalb dieses View-Ordners in `src/views/Plan/AssignedPlans.jsx` (Training-Tab, kein eigener Coach-Unterpunkt).
- **Trainingsprogramme**: `fitness/{coachUid}/coachTrainingPrograms` enthält Coach-Bibliothek und Versions-Snapshots. Zuweisungen kopieren Routine-Snapshots plus veröffentlichte Makrozyklen nach `fitness/{clientUid}`. Das Modell wird direkt im Coach-Code geschrieben.

## Hash-Routing (seit 2026-10-15)

Sub-Tab, Klient und Detail-Tab stehen im URL-Hash (`coachRoute.js` rein, `useCoachRoute.js` als Hook):

- `#/exercises` · `#/catalog` · `#/clients`
- `#/clients/<uid>/<tab>?date=YYYY-MM-DD` — `<tab>` ∈ `workouts` (Standard), `sixpack` (schreibgeschützter 6Pack-Spiegel, `ClientSixPack.jsx`), `insights`, `habits`, `templates`, `trainingplan`, `plan`
- Älterer Push-Link `#/coach?client=<uid>&date=…` wird nach `#/clients/<uid>` übersetzt.

Zurück-Taste und Reload bleiben an derselben Stelle. Die Push-Links der Cloud Function `onClientWorkout`
(fitness-dev, `functions/clientWorkout.js`) zeigen auf dieses Format. `?date=` wird gelesen, der Eintrag aber
noch nicht hervorgehoben. Test: `node --test src/views/Coach/coachRoute.test.mjs`.


## 2026-10-30: Coach-owned Trainingsprogramme

Die Klientenansicht bündelt Planstatus, Programmauswahl und Verlauf. Coach
erstellt wiederverwendbare Workout-Vorlagen und Programme im eigenen Firebase-
Datenraum. Ein Programm wird als Version veröffentlicht und erst auf explizite
Zuweisung in den Datenraum des gewählten Klienten kopiert. Die Version enthält
Übungssnapshots, damit spätere Änderungen an Coach-Vorlagen bestehende
Zuweisungen nicht verändern.

Die Zuweisung erstellt Klienten-Routinen plus einen veröffentlichten
`macrocycles`-Datensatz, den die bestehende Plan-App lesen kann. Trainingslogs
bleiben unabhängig davon in den normalen Klienten-Workouts. Autor, Editoren und
Plan-/Routine-CRUD nutzen Coach-UID bzw. die fest ausgewählte Klienten-UID;
veraltete Antworten nach einem Klientenwechsel werden verworfen.

Firestore Rules und ihre Durchsetzung bleiben im VitalOS-Owner. Datenmodell und
Bedienung: `../../../docs/COACH-PLAN-WORKFLOW.md`.

## Plan source ownership — 2026-10-30

`modules/plan/` is the pinned source owner for program authoring and assignment.
`ClientTrainingWorkspace` owns client context and navigation, opens Plan's
`ProgramEditor` for program composition and `TrainingPlans` for individual plans.
`CoachRoutineEditor` delegates to Plan's RoutineBuilder. `trainingProgramStore`
and the Firestore routine/macrocycle adapters are thin re-exports. Heavy editor
surfaces load lazily. Vite and Tailwind resolve only the pinned submodule; CI
initializes it explicitly. No runtime sibling checkout is used.

## 2026-10-31 — Shared plan documents

Published client cards open Plan's lazy `PlanDocument` renderer. Plan's
`clientView` selects the released snapshot, so later draft edits do not change
this view. This is the same table/mobile/print renderer used by local planning;
Coach owns the back navigation and rejects reads for a previously selected client.

## 2026-10-31 — Source corrections

CatalogBrowser and the exercise inspector reuse Inbox SourceEditor for approved
single-exercise records. Inbox cards use the same component. Sources can be
searched by name/ID, replaced or disconnected; raw alternatives remain searchable
regardless of curated search suppression. Approved edits retain exercise IDs.
Search keeps approved records that share an import ID, deduplicates by ID with
curated precedence, and hides raw records only by explicit confirmed references.

## 2026-11-01 — Coach/Klienten-Nachrichten

`ClientMessages` ist ein eigener, pro Klient gekeyter Detail-Tab (`messages`).
Er nutzt `firestore/communication.js` für Live-Nachrichten und Lesestände in
`coachConversations/{uid}`. Optionaler Bezug auf die veröffentlichte Planversion;
vor dem Senden wird deren Stand geprüft. Gespeichert/Gesehen/Pending sind getrennt.
Der Laptop-Worker wird dafür nicht verwendet. Protokoll und Release-Reihenfolge:
`docs/COACH-COMMUNICATION.md`. Die zugehörige Client-UI liegt in Fitness Inbox.

### Nachrichten: ausführliche Dokumentation

[Protokoll und Zuständigkeiten](../../../docs/COACH-COMMUNICATION.md),
[Test-/Release-/Diagnose-Runbook](../../../docs/COACH-COMMUNICATION-RUNBOOK.md).
Lesestände sind zeitbasierte UI-Signale, nicht Push-Zustellung. Alle qualifizierten
Coaches haben derzeit projektweiten Zugriff; keine zugewiesene-Coach-ACL annehmen.

## 2026-11-01 — Planbereitstellung und Rückmeldungen

ClientTrainingWorkspace lädt unter „Plan ansehen“ neben PlanDocument auch den gemeinsamen PlanFeedback-Baustein aus dem gepinnten Plan-Modul. Klient, Plan-ID und freigegebene Versionsnummer bilden den Schlüssel. Empfangsbestätigung und Antworten kommen aus `planResponses`, unabhängig vom freien Nachrichtenbereich. Der individuelle Planeditor bindet denselben Plan-Baustein ein. Vertrag: `modules/plan/docs/PLAN-FEEDBACK.md`. Keine Änderung an Gateway, lokaler Registry oder Katalog-Enrichment.
