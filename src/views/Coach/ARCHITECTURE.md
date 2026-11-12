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
- **`TractionPanel.jsx`** (`Fitness-Nutzung`): Live-Ansicht der letzten sieben
  Tage mit aktiven Nutzern, täglichen Nutzerzahlen, Bereichsaufrufen und
  letzter Aktivität. Die Daten kommen über einen Firestore-
  `collectionGroup("tractionDaily")`-Snapshot. Erfasst werden nur grobe
  Nutzungsmetadaten, keine Workout-Inhalte. Coach-Konten werden mitgezählt und
  als „Coach (eigenes Konto)“ gekennzeichnet (nicht mehr still ausgefiltert —
  sonst wirkte der Tab leer, solange nur Self-Traffic existiert). Letzte
  Aktivitäten verwenden Coach-Profile für Namen/Rolle; nicht zugeordnete
  Konten erscheinen anonym ohne UID. Der Statuschip zeigt die Anzahl geladener
  Tagesdatensätze statt eines immer-grünen „Live-Verbindung“.
- **`CatalogBrowser.jsx`**: Interaktiver Katalog-Enhancer zum Suchen, Analysieren (Anatomie-Cues, Biomechanik, Muskelgruppen) und Bearbeiten/Speichern von Übungen in Firestore (`fitness/kb/exercises`).
- **`ClientsPanel.jsx`** (seit 2026-08-20): Klientenzentrierter Workflow —
  links eine Liste aller User aus `getAllUserProfiles()` (Klick wählt einen
  Klienten), rechts Detail-Tabs. Auswahl öffnet standardmäßig **Verlauf &
  Feedback** (`workouts`) — nicht Trainingsplan — damit Sessions sichtbar
  sind, auch ohne zugewiesenen Cloud-Plan. Trainingsplan / Nachrichten /
  6Pack folgen in der Tableiste; ältere Plan-Ansichten bleiben per Deep-Link.
  Status-Toggle (`client`/`friend`/`hidden`) sitzt im Detail-Header.
- **`ClientConsole.jsx`** (Verlauf-Tab): Konsole für den gewählten Klienten.
  Liest dieselben freigegebenen Pfade wie der restliche Coach-Tab
  (`getClientJournalFeed` auf `fitness/{uid}/…`, plus `nutrition/{uid}/logs`
  mit dem angemeldeten Konto) und behält nur Zeilen mit `userId` dieses
  Klienten. Zeigt die Kraft-Logs, die mittlere Ruhephase (Tage zwischen
  Einheiten desselben Blocks) und die mittleren Makros, sobald ein Tageswert
  in diesen Daten liegt. Aktivität ohne Übungen ist Cardio und geht nicht in
  die Ruhephase ein, auch mit Block. Fehlt die Nutrition-Freigabe, bleibt die
  Makro-Kachel leer — ohne zweiten Zugriffsweg. Auswertung:
  `clientConsoleStats.js`.
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
  Filter sie sieht.   Lokales Pendant: `local/coach.js::getClientJournalFeed()`
  → `GET /fitness/coach/feed?uid=<x>` (`fitness/api/routers/coaching.py`),
  liest nur den einen `~/.aos/fitness/users/<uid>/`-Ordner. Fehlt der Ordner
  oder ist die uid ungültig, bleibt der Feed leer statt andere Klienten zu liefern.
- **Feedback**: `saveCoachFeedback()` speichert Kommentare direkt in der entsprechenden Klienten-Dokument-Referenz.
- **Katalog**: `searchExercises()`, `getAnatomy()`, `saveExercise()` arbeiten direkt mit `fitness/kb/exercises` und `fitness/kb/anatomy`.
- **Plan-Zuweisung**: `assignPlanToClient(coachUid, clientUid, plan)` — Firestore schreibt per `setDoc` (merge) auf `fitness/{clientUid}/wf_workouts/{planId}` (neue ID via `doc(collection(...)).id` falls `plan.id` fehlt); Local-Build ruft `POST /fitness/coach/plans/:clientUid` (`server.mjs`) auf, das nach `~/.aos/fitness/users/<clientUid>/plans/<planId>.json` schreibt. Beide Backends teilen sich dieselbe Funktionssignatur (`src/lib/db/{firestore,local}/assignedPlans.js`). Klienten-seitiges Abarbeiten des zugewiesenen Plans läuft außerhalb dieses View-Ordners in `src/views/Plan/AssignedPlans.jsx` (Training-Tab, kein eigener Coach-Unterpunkt).
- **Trainingsprogramme**: `fitness/{coachUid}/coachTrainingPrograms` enthält Coach-Bibliothek und Versions-Snapshots. Zuweisungen kopieren Routine-Snapshots plus veröffentlichte Makrozyklen nach `fitness/{clientUid}`. Das Modell wird direkt im Coach-Code geschrieben.

## Hash-Routing (seit 2026-10-15)

Sub-Tab, Klient und Detail-Tab stehen im URL-Hash (`coachRoute.js` rein, `useCoachRoute.js` als Hook):

- `#/exercises` · `#/catalog` · `#/clients` · `#/traction`
- `#/clients/<uid>/<tab>?date=YYYY-MM-DD` — `<tab>` ∈ `workouts` (Standard), `sixpack` (schreibgeschützter 6Pack-Spiegel, `ClientSixPack.jsx`), `insights`, `habits`, `templates`, `trainingplan`, `plan`
- Älterer Push-Link `#/coach?client=<uid>&date=…` wird nach `#/clients/<uid>` übersetzt.

Zurück-Taste und Reload bleiben an derselben Stelle. Die Push-Links der Cloud Function `onClientWorkout`
(fitness-dev, `functions/clientWorkout.js`) zeigen auf dieses Format. Liegt `?date=` auf dem Verlauf,
markiert die Klientenkonsole jede geladene Kraft-Einheit dieses Kalendertags, scrollt die erste
in die Mitte und nennt die Anzahl. Fehlt der Tag in den geladenen Logs, sagt die Leiste das.
„Markierung schließen“ nimmt `date` aus dem Hash. Dieselbe Zuordnung kann der Übersicht-Feed
nutzen, wenn er `highlightDate` bekommt; ein Typ-Filter lässt sich dort zurücksetzen.
Test: `node --test src/views/Coach/coachRoute.test.mjs src/views/Coach/feedHighlight.test.mjs`.


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

## 2026-11-01 — Durchgehender Betreuungsablauf

ClientsPanel zeigt den gemeinsamen PlanDeliveryOverview je Klient; `?plan=<id>` führt direkt in die Planansicht und bleibt über Reload/Zurück erhalten. Wechsel von Klient/Detailtab löscht den Planbezug. ClientTrainingWorkspace zeigt denselben Status mit bereits geladenen Plänen, öffnet nach Programmzuweisung den erzeugten Klientenplan und bietet einen Versionsselektor für historische Snapshots samt Feedback. Fehlende Bibliothek/Vorlagen/Trainingsergebnisse blockieren vorhandene Klientenpläne nicht mehr pauschal (Teilresultate mit sichtbarer Fehlermeldung).

ClientForge ist die gemeinsame Plan-Komposition: der lokale Einstieg liegt unter `/clientforge/`, der Cloud-Klientenbereich nutzt denselben erweiterten Plan-Pin mit Workout-/Übungs-Muskelansicht und Klientenvorschau.

## Klientenwechsel: Insights und Habit-Zyklus (2026-11-12)

`ClientsPanel` bindet auch `ClientInsights` und `ClientHabitCycle` mit
`key={selectedUid}` an die Klientenidentität. Beim Wechsel werden Entwürfe,
Trainingslücken, Zyklus-Konfiguration und laufende UI-Zustände neu initialisiert.
Verspätete Antworten des vorherigen Klienten aktualisieren dadurch keine Ansicht
des nächsten Klienten. Das entspricht den übrigen klientengebundenen Bereichen.

## Insights: bestätigte Ergebnisse und Dienstfehler (2026-11-12)

Die lokalen und Firestore-Datenadapter geben Fehler bei Trainingslücken,
Entwürfen und Review-Entscheidungen an `ClientInsights` weiter. Nur gültige
Arrays gelten als Abfrageergebnis; eine Review-Entscheidung benötigt `ok: true`
vom Dienst. Ein fehlender lokaler Insights-Dienst auf Firebase Hosting wird
explizit als nicht verfügbar angezeigt. Er wird nicht als erfolgreicher Check
mit null Trainingslücken interpretiert.

Die Ansicht zeigt Ladefehler bei Entwürfen mit Wiederholen-Aktion, unterdrückt
in diesem Fall den Leerzustand und behält bei fehlgeschlagenen Reviews den
bisherigen Status. Ein neuer Gap-Check entfernt vorherige Gap-Ergebnisse, damit
ein fehlgeschlagener neuer Versuch keine alten Ergebnisse als aktuell ausgibt.

## Reproduzierbare Insights-Browserprüfung (2026-11-12)

Die isolierte Fixture `insights.browser.html` rendert `ClientInsights` mit den
Produktionsstyles und einem kontrollierten Datenadapter ohne echte Konten.
Start: `node src/views/Coach/insights.browser-server.mjs` (:15918).
Ein separater Chromium-/Thorium-Testprozess mit eigenem temporären Profil muss
CDP auf localhost:19238 bereitstellen. Anschließend:
`node src/views/Coach/insights.browser-test.mjs`.
Benötigt initialisierte `modules/plan` am gepinnten Commit für Tailwind sowie
die gemeinsame Fitness-Quelle gemäß `scripts/shared-fitness-root.cjs`.

Geprüft: Ladefehler statt Leerzustand, Retry, abgelehnte und bestätigte
Freigabe, fehlerhafter Gap-Check, neuer Zustand bei geänderter Klienten-Key,
44px-Trefferflächen und kein horizontaler Überlauf bei 390/844/768/1024px.
Die Schlüsselbindung im Fixture entspricht `ClientsPanel`; der komplette
ClientsPanel-Router wird hier nicht gerendert. Screenshot:
`/tmp/coach-insights-browser.png` (temporär, nicht versioniert).
Die Prüfung nutzt Chromium-Emulation; echte Safari-/Geräteabnahme und
Authentifizierung gegen Firebase sind davon nicht abgedeckt.

## Habit-Zyklus: expliziter Konfigurationsentwurf (2026-11-12)

`ClientHabitCycle` hält bearbeitete und zuletzt angenommene Konfiguration
getrennt. Tags und Zyklusziel ändern zunächst den sichtbaren Entwurf;
„Änderungen speichern“ führt einen Schreibvorgang aus. Währenddessen sind
Eingaben gesperrt und ein Ref verhindert doppelte Übermittlung. Nur `ok: true`
übernimmt den Entwurf als neuen Ausgangsstand. Fehler lassen Änderungen zur
Korrektur/erneuten Übermittlung stehen; „Verwerfen“ stellt den Ausgangsstand
wieder her. Ganze, nicht negative Zyklusziele werden vor Übermittlung geprüft.
Die Fortschrittsanzeige verwendet den sichtbaren Entwurf als Vorschau.

Fehlgeschlagene Konfigurationsabfragen werden von beiden Datenadaptern
weitergegeben statt als leere Konfiguration zurückgegeben. Die Ansicht bietet
in diesem Fall Wiederholen statt eines bearbeitbaren leeren Formulars.
Firestore verwendet weiterhin die gemeinsame Offline-Schreibqueue; deren
lokale Annahme ist keine Bestätigung der späteren Serversynchronisierung.

Die Browser-Fixture unterstützt `?habits` und prüft zusätzlich Lade-Retry,
explizite Speicherung, abgelehnte/erfolgreiche Speicherung und Verwerfen.
Der gemeinsame Browser-Test durchläuft Insights und Habit-Zyklus nacheinander
mit kontrollierten Adaptern ohne reale Klientendaten.

## Aktivitätsfeed: Feedback-Identität (2026-11-12)

`feedEntryKey` in `feedHighlight.js` bildet die Identität als JSON-Tupel aus
`userId`, `type` und `id`. Dokument-IDs allein sind in einem globalen Feed
nicht eindeutig. `ClientWorkoutsFeed` verwendet den Schlüssel für React-Karten,
Kommentarentwürfe, laufende Speicherungen und Datumsmarkierungen. Der an den
Datenadapter übergebene Dokument-Identifier bleibt unverändert.

Speicherungen sind pro Eintrag gesperrt (Ref plus sichtbares Set); parallele
Speicherungen anderer Einträge bleiben unabhängig. Nur der passende Eintrag
bekommt nach Erfolg das Feedback. `{ok:false}` wird als Fehler angezeigt.
Die Browser-Fixture `?feed` prüft gleiche IDs bei zwei Klienten und in einem
Journal, getrennte Texte, korrekte Schreibparameter und zwei unabhängig
abgeschlossene Schreibvorgänge. Testdaten bleiben im Fixture-Adapter.

## Habit-Entwürfe im aktuellen Tab (2026-11-12)

`habitCycleDraft.js` speichert die Konfiguration samt noch nicht hinzugefügtem
Tag und ursprünglichem Ausgangsstand in `sessionStorage`, getrennt nach
angemeldetem Coach (`getUid()`) und Klienten-ID. Der Editor stellt einen
validierten Entwurf nach Remount/Reload wieder her. Bei verändertem gespeicherten
Ausgangsstand bleibt ein Konflikthinweis bis Speichern oder Verwerfen sichtbar;
das Wiederherstellen allein bestätigt den neuen Ausgangsstand nicht.

Nur erfolgreich angenommene Änderungen oder ausdrückliches Verwerfen entfernen
den Entwurf. Ein angefangener Tag wird beim Speichern mit übernommen. Ohne
verfügbare Tab-Sicherung zeigt der Editor eine Fehlermeldung. `beforeunload`
warnt ergänzend bei offenen Änderungen; das Betriebssystem kann dieses Ereignis
beim Beenden mobiler Apps auslassen. Die Entwürfe gehören zum aktuellen Tab,
sind keine Cloud-Synchronisierung und kein dauerhafter Browser-Backup.

Die Schreibwirkung ist an die erfolgreich geladene Coach/Klient-Kombination
gebunden, damit ein Identitätswechsel keine alten Eingaben unter einem neuen
Schlüssel ablegt. Unit-Tests prüfen Identitätstrennung, Entfernung, beschädigte
Daten und nicht verfügbaren Storage. Die Browser-Fixture prüft Wiederherstellung
nach Reload, fortbestehenden Konflikthinweis nach erneutem Reload und Verwerfen.


## Unread-Zähler vor Authentifizierung (2026-11-12)

`useCoachUnreadCounts(actor)` erhält seine freigegebene Coach-ID explizit aus
`CoachShell` (`allowed && !authLoading ? user?.uid : null`). Ohne Actor werden
keine Profile gelesen oder Gesprächslistener gestartet. Der Hook ruft beim
Rendern kein `getUid()` auf, da dies vor Authentifizierung wirft und die gesamte
Hosting-App vor dem Login leerlaufen ließ. Ein Actor-Wechsel räumt bestehende
Listener und Zähler/Profile auf. Die isolierte Browser-Fixture `?auth` prüft
Rendern bei werfendem `getUid`, null Reads ohne Actor, Listener nach Freigabe
und Cleanup bei Abmeldung. Sie ersetzt nicht die erneute Hosting-Abnahme.

## Übungsinspektor: ein Anatomie-Ladeweg (2026-11-12)

`CoachShell` und der ältere `App`-Einstieg wählen die Übung und öffnen `ExerciseInsightModal`; sie laden keine
zusätzliche Anatomie. Der Modal-Effekt besitzt den einzigen Ladeweg und
verwirft Antworten nach Übungswechsel oder Schließen über sein Cleanup.
Die funktionale Aktualisierung der Shell-Auswahl prüft zusätzlich die
ursprüngliche Objektreferenz, damit auch eine unmittelbar vor der Antwort
eingereihte Auswahländerung oder Schließung erhalten bleibt.
Vorher konnten zwei weitere Shell-Requests ihre verspätete Antwort an eine
inzwischen andere Auswahl hängen. Die Browser-Fixture `?inspector` prüft
verzögerte Antworten A/B, genau einen Request pro Auswahl und Schließen vor
Antwort C. Dabei werden ausschließlich Fixture-Daten verwendet.

## Übungsinspektor: ausstehende Schreibaktionen (2026-11-12)

Der äußere `ExerciseInsightModal` bindet eine Inspektor-Instanz an
Benutzer, Inbox-Datei und Katalog-ID. Ein Wechsel oder Schließen entfernt die
alte Instanz samt Formular- und Ladezuständen. Alle Rückmeldungen an die
Shell-Auswahl werden funktional gegen das ursprüngliche Auswahlobjekt geprüft;
eine alte Speicherantwort darf eine neuere Auswahl nicht ersetzen. Bereits
abgeschickte Schreiboperationen werden dadurch nicht abgebrochen; ihre
Inbox-Ereignisse betreffen weiterhin den ursprünglichen Eintrag.

Notiz-, Lesson-, Freigabe- und Verwerfen-Aktionen verlangen `ok:true`, bevor
sie Erfolg anzeigen oder den lokalen Datensatz als geändert darstellen.
Die Browser-Fixture prüft zwei Inbox-Dateien mit derselben Katalog-ID,
Speichern über einen Auswahlwechsel hinweg, Schließen vor Speicherantwort,
negative Adapterantworten in allen vier Aktionen und einen erfolgreichen
Lesson-Save. Die beiden Save-Buttons haben zugängliche Namen und mindestens
44px große Touch-Flächen. Firebase-Serverbestätigung bleibt durch die gemeinsame
Offline-Schreibqueue begrenzt; die Prüfung von `ok:true` ändert diesen Vertrag
nicht.
