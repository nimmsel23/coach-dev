# Audit: Coach

## Zweck
Admin-Ansicht für Coach-seitige Verwaltung — nicht in der Nav, erreichbar per `#coach` (fitness-dev) bzw. eigener Sidebar-Button (vitalos, Sichtbarkeit per UID/Local-Mode-Gate).

## Komponenten
| Datei | Zweck | Zeilen |
|-------|-------|--------|
| `index.jsx` | 4 Sub-Tabs (Übungsanfragen/Klienten-Workouts/Katalog Browser/Plan-Zuweisung), lädt Journal-Feed + User-Profiles | 365 |
| `CatalogBrowser.jsx` | Vierter faktischer Bereich, eingebettet als 3. Sub-Tab: Übungssuche + Enhancer-Editor | 278 |
| `AssignPlan.jsx` | 4. Sub-Tab: Klient wählen, Plan bauen + an Klient pushen, zugewiesene Pläne + Fortschritt anzeigen | 235 |

## Sub-Tabs
1. **Übungsanfragen** (`activeSubTab === 'exercises'`) — nutzt `useInbox({ global: true })` (Hook aus `../Inbox/useInbox`, geteilt mit `Inbox.jsx`) + `InboxCard`-Komponente. Approve/Delete direkt aus dem Hook, keine eigene Logik hier.
2. **Klienten-Workouts** (`activeSubTab === 'journals'`) — `getGlobalJournalFeed()` (collectionGroup über sessions/journal/habitJournals, max. 50 Items) + `getAllUserProfiles()` für Klarnamen. Seit 2026-07-22: Filter-Leiste (Dropdown nach Klient, Toggle nach Typ Workout/Habit, Reset-Button) — vorher ungefiltert und bei vielen Klienten unübersichtlich.
3. **Katalog Browser** (`activeSubTab === 'catalog'`) — eigene Komponente `CatalogBrowser.jsx`, nutzt `searchExercises()` (liefert bei leerem Query bewusst `[]` — "erst tippen, dann suchen" ist Absicht, kein Bug), `getAnatomy()`, `saveExercise()`.
4. **Plan-Zuweisung** (`activeSubTab === 'plans'`) — eigene Komponente `AssignPlan.jsx`. Bis 2026-08-01 reine Stub-Funktionen (`getCoachAssignedPlans`/`assignPlanToClient`/`getClientPlanProgress` in `src/lib/db/index.js` gaben immer `[]`/`false`/`null` zurück, ohne Backend-Anbindung); jetzt echte Implementierung in `src/lib/db/{local,firestore}/assignedPlans.js`. Klienten-Auswahl per Dropdown aus `getAllUserProfiles()` (vorher: manuelle UID-Texteingabe).

## Datenfluss
- Inbox: `useInbox({ global: true })` → `getGlobalInbox()`/`getInbox()` (Firestore `collectionGroup(db, "inbox")`, siehe `firestore/sessions.js`) → State im Hook, nicht hier
- Journals: `getGlobalJournalFeed()` + `getAllUserProfiles()` (beide `firestore/utils.js`, `collectionGroup`-Queries auf `sessions`/`journal`/`habitJournals`/`profile`/`settings`) → lokaler State `journals`/`userProfiles`
- `filteredJournals` (Memo-freies `.filter()` bei jedem Render) — abgeleitet aus `journals` + `filterUserId` + `filterType`, kein eigener Fetch
- `saveCoachFeedback(userId, sessionId, type, text, habitId, date)` — Kommentar-Funktion, schreibt Feedback + Push-Notify (laut UI-Toast-Text)
- Catalog: eigenständiger State/Datenfluss komplett in `CatalogBrowser.jsx`, siehe dort
- Plan-Zuweisung: `getPlanSuggestion()` baut einen Plan (Template-Auswahl, ruft `/fitness/plan` bzw. Firestore-Pendant), `assignPlanToClient(coachUid, clientUid, plan)` schreibt ihn direkt in den Klienten-Datenraum (Firestore `wf_workouts` oder lokal `~/.aos/fitness/users/<uid>/plans/`), `getCoachAssignedPlans()` + `getClientPlanProgress()` laden die Liste + Tages-Fortschritt zurück. Eigenständiger State/Datenfluss komplett in `AssignPlan.jsx`.

## Kernfeatures (müssen nach jedem Refactoring erhalten bleiben)
- Journal-Feed: `coachFeedback` wird beim Laden in `commentsText` vorbefüllt, damit bestehende Kommentare beim erneuten Öffnen sichtbar sind
- Filter-Leiste (Klient-Dropdown + Typ-Toggle) ist rein clientseitig, kein Re-Fetch bei Filterwechsel — `journalClients` wird aus den bereits geladenen `userProfiles` + tatsächlich vorkommenden `userId`s in `journals` abgeleitet, nicht aus der vollen Profil-Liste (sonst tauchen Klienten ohne Aktivität im Filter auf)
- Header-Zähler zeigt `gefiltert/gesamt` im Journals-Tab, reine Zahl in den anderen Tabs
- `onInspectExercise` wird an `InboxCard` (Übungsanfragen) und `CatalogBrowser` (Detail Inspector Button) durchgereicht — optional, beide Views funktionieren ohne

## Auffälligkeiten
- Kein eigener Loading-/Error-State für die Filter-Leiste selbst (rein synchron, unkritisch)
- `CatalogBrowser.jsx` und `index.jsx` haben keinen gemeinsamen State — Auswahl einer Übung im Katalog-Browser wirkt sich nicht auf die anderen Tabs aus (z.B. kein "diese Übung wurde gerade in der Inbox freigegeben, jetzt im Katalog bearbeiten"-Fluss)
- `journals`-Feed ist auf 50 Items gedeckelt (`getGlobalJournalFeed(limitCount = 50)`) — bei aktiven Klienten mit vielen Sessions könnten ältere Einträge rausfallen, ohne dass das in der UI sichtbar wäre (kein "mehr laden")

## Bekannte, in dieser Session gefixte Bugs (nicht mehr aktuell, zur Historie)
- `.reference` statt `.ref` in `getGlobalInbox()`/`getGlobalJournalFeed()`/`getAllUserProfiles()` (Firestore v8-vs-v9-API-Verwechslung) — verursachte einen stillen Crash, alle drei Sub-Tabs zeigten nichts an. Fix: Commit `c46c713`.
- Inbox-Writes von Nicht-Coach-Usern schlugen an `firestore.rules` fehl (fehlendes `userId`-Feld) — Klienten-Einträge kamen nie an. Fix: Commit `4647717`.

## Status
Funktioniert (Stand 2026-07-22, nach den o.g. Fixes live verifiziert: Übungsanfragen zeigen Daten). Katalog-Browser- und Klienten-Workouts-Sub-Tab in derselben Session ebenfalls verifiziert bzw. um Filter ergänzt. Plan-Zuweisung (2026-08-01) per Build-Check verifiziert (Lint + `npm run build` sauber), nicht live gegen Prod-Firestore getestet — siehe `~/.claude/projects/-home-alpha-vitalos--git-modules-fitness-dev/memory/project_coach_assigned_plans_vs_klienten_dev.md` für den vollen Architektur-Kontext (klienten-dev/klienten-python als älteres Parallelsystem, VitalOS als geplante Coach-Shell).

## Update 2026-08-20 (Teil 3): Habit-Beobachtung für Coach
Neuer 3. Sub-Tab `Habits` in `ClientsPanel.jsx` (zwischen Workouts und
Trainingsplan) — read-only Sicht auf die Ziel-Häufigkeiten, die der Klient
selbst pro Routine im Strong-Style Plan-Tab (`views/Plan/WorkoutList.jsx`,
"Ziel festlegen") gesetzt hat. Neue Komponente `ClientHabits.jsx`, nutzt
`getClientRoutinesProgress(clientUid)` (lokal: `?uid=`-Override auf
`/routines`+`/workouts`; Firestore: direkte `fitness/{uid}/routines`+
`.../workouts`-Query statt `collectionGroup`, bypass `getUid()`). Fortschritts-
Formel lebt jetzt zentral in `src/lib/habitProgress.js` (vorher in
`WorkoutList.jsx` dupliziert), geteilt zwischen Plan-Tab (Self-Service) und
Coach-Tab (Beobachtung). Live verifiziert (`?uid=`-Query liefert korrekt
fremde Klienten-Routine mit gesetztem Ziel).

## Update 2026-08-20 (Teil 4): Basic Schreib-UI nachgezogen
Der oben genannte "kein Schreib-Pfad"-Punkt ist überholt: `ClientHabits.jsx`
kann jetzt für den gewählten Klienten Routinen anlegen, Übungen per Suche
hinzufügen (`searchExercises` aus `@db`) und Ziel-Häufigkeit setzen —
`createClientRoutine`/`addClientRoutineExercise`/`setClientRoutineTarget`/
`deleteClientRoutine`/`getClientRoutine` in `firestore/coach.js` +
`local/coach.js`. Backend brauchte dafür **keine** Änderung: Pythons
`_uid_from_request()` akzeptiert `?uid=` schon für alle HTTP-Methoden, nicht
nur GET (live verifiziert: POST/PATCH/DELETE mit `?uid=` funktionieren
identisch zum Klienten-eigenen Self-Service-Pfad). Bewusst weiterhin
schlank: kein Reorder, kein Template-Sets-Feintuning (RIR/Tempo/Satz-Typ) im
Coach-UI — das bleibt Sache des Klienten in dessen eigenem
`RoutineBuilder.jsx`. Live end-to-end getestet (Routine anlegen → Übung
hinzufügen → Ziel setzen → verifizieren → löschen).

## Update 2026-08-20 (Teil 2): Klienten-zentrierter Workflow + echter Feed-Bug behoben
- **Struktur**: `index.jsx` von 5 auf 3 Sub-Tabs reduziert (Übungsanfragen /
  Katalog Browser / Klienten). `ClientManagement.jsx` (Status-Toggle) +
  `ClientWorkoutsFeed.jsx` (global) + `AssignPlan.jsx` (Klient-Dropdown) waren
  vorher drei unabhängige Tabs ohne gemeinsamen State — behoben durch neue
  `ClientsPanel.jsx`: links Klientenliste, rechts Detail mit `Workouts`/
  `Trainingsplan` als Sub-Tabs. `ClientManagement.jsx` **gelöscht**, Status-
  Toggle-Logik lebt jetzt in `ClientsPanel.jsx`. `AssignPlan.jsx` und
  `ClientWorkoutsFeed.jsx` akzeptieren jetzt optional `clientUid`
  (+ `AssignPlan`: `clientName`) und blenden ihre eigene Klientenauswahl aus,
  wenn sie eingebettet unter `ClientsPanel` laufen — bleiben aber als
  eigenständige Komponenten mit interner Auswahl nutzbar, falls sie je wieder
  standalone gebraucht werden.
- **Echter Bug behoben (nicht nur der alte Filter-Dropdown, der jetzt
  ohnehin durch die Klientenliste ersetzt ist):** `getGlobalJournalFeed()`
  holt/deckelt global über ALLE Klienten (50 Firestore / 100 lokal), bevor
  überhaupt gefiltert wird. Bei mehreren aktiven Usern (der Coach selbst
  nutzt die App ebenfalls für eigene Sessions) konnten die Einträge eines
  bestimmten Klienten dadurch komplett aus dem Feed fallen, obwohl sie
  existieren — sichtbar als "Filter zeigt nichts/falsches an". Fix: neue
  `getClientJournalFeed(clientUid)` (`firestore/coach.js`: direkte
  `collection(db, "fitness", uid, ...)`-Query statt `collectionGroup` über
  alle User; `local/coach.js` + `server.mjs` `/fitness/coach/feed?uid=`:
  liest nur den einen User-Ordner). `ClientWorkoutsFeed.jsx` nutzt diese
  Funktion automatisch, sobald `clientUid` gesetzt ist. Live gegen
  `server.mjs` verifiziert: `?uid=<x>` liefert ausschließlich Einträge dieses
  einen Users, ohne den Parameter waren 3 User gemischt und bei `limit=100`
  gekappt.
- **Redesign (Concept A / "Ruhig")**: alle Sub-Views von
  `font-black uppercase tracking-widest` auf sentence-case `font-semibold`/
  `font-medium` umgestellt, harte Boxen/Badges durch `rounded-full` Chips
  ersetzt, `var(--dim)`-Inline-Styling für de-emphasized Labels — konsistent
  mit Session/Learn/Review/Settings. Titel "Hidden Chamber" → "Coach".
- Build grün (`npm run build`), lokaler API-Test der neuen `?uid=`-Route
  bestanden. Noch **nicht** live gegen Firestore-Prod getestet (nur
  Struktur-Parität zur Firestore-Dokumentstruktur per `firebase-admin`
  live verifiziert, siehe Fund oben zu `fitness/{uid}/sessions/...`).

## Update 2026-08-15: Struktur-Split + 5. Sub-Tab nachgetragen
- `index.jsx` ist jetzt 5 Sub-Tabs (diese Tabelle/Auflistung oben nannte nur 4 —
  `Klienten` (`ClientManagement.jsx`, seit 2026-08-06) fehlte hier schlicht).
- `index.jsx` selbst: 374 → ~90 Zeilen, reiner Tab-Router. Der komplette
  "Klienten-Workouts"-Block (Zeile 15 oben, Filter-Leiste + Feed-Rendering)
  lebt jetzt in eigener `ClientWorkoutsFeed.jsx` — gleiches Verhalten, nur
  eigene Datei, Muster jetzt konsistent mit `CatalogBrowser.jsx`/`AssignPlan.jsx`/
  `ClientManagement.jsx`. Build grün, keine funktionale Änderung.
- Der unter "Auffälligkeiten" genannte Punkt (kein gemeinsamer State zwischen
  Tabs) besteht unverändert fort — reiner Struktur-Split, keine State-Arbeit.

## Update 2026-10-15 — Coach-Shell auf VitalOS-Design
- Die Tabelle/Sub-Tab-Liste oben ist historisch: aktuell 3 Bereiche (Übungsanfragen, Katalog, Klienten), Klienten-Detail-Tabs in `ClientsPanel.jsx`, Routing per Hash (`coachRoute.js`).
- `index.jsx` enthält keine Navigation/Command-Bar mehr; die liegt in `src/shell/` (Sidebar/Tab-Bar/Header). Der offene-Anfragen-Zähler wird per `onInboxCount` an die Shell gemeldet.
- `coach-console.css` und alle `cc-*`-Klassen entfernt → `vos-*` (siehe ARCHITECTURE.md). Kernfeature, das erhalten bleiben muss: Auswahl Klient/Detail-Tab/Datum steckt im URL-Hash (Push-Links aus `functions/clientWorkout.js`).
- `CatalogBrowser` ist mobil als Liste → Detail (mit „Übungen"-Zurück-Button) nutzbar.
- Nicht visuell im Browser abgenommen (nur Lint/Build/Route-Tests) — bei Gelegenheit auf Handy + Desktop, dunkel + hell prüfen.


## 2026-10-16: Trainingspläne und Klientenablauf

Den bisherigen Basis-Template-Editor durch den gemeinsamen Plan-Editor ersetzt:
Yuhonas-Suche mit Anleitung und Atlas-Link, Satzvorgaben, Pausen, Reihenfolge und
Hinweise. Trainingsplanentwürfe werden explizit bereitgestellt. Vorlagen und
Trainingspläne haben einen sichtbaren nächsten Schritt; echte Plan-Ergebnisse
stehen im selben Klientenkontext. Ältere Zusatzbereiche sind weiterhin erreichbar.
E-Mail-Heuristik zur Coach-Freigabe entfernt; die gemeinsame Rollenprüfung gilt.

Browserabnahme mit isolierten Testidentitäten bestanden: Vorlage beim Klienten
anlegen, Sätze/Hinweise bearbeiten, Plan bereitstellen, gespeicherte Klientenwerte
prüfen und leeren Coach-Datenpfad bestätigen. 390-px-Ansicht ohne horizontalen
Überlauf, keine unbehandelten Browser-Ausnahmen. Build und Routingtests bestanden.

Offen: authentifizierte Firebase-Abnahme, Versionierung veröffentlichter Pläne,
Mehrgeräte-Konfliktauflösung und persistenter Entwurf ungespeicherter
Vorlagenänderungen. Die Snapshot-Grenzen des Plan-Owners gelten auch in Coach.
