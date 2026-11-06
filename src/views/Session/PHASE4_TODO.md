# Session-Tab Rebuild — Phase 4: Integration & Modals (zuletzt)

Quelle: Haiku-Doppel-Audit 2026-09-05. Setzt [[PHASE3_TODO]] (insbesondere
`useSession.js`-Split) voraus, da hier Modal-State zentralisiert wird, der
aktuell über mehrere Stellen verstreut ist.

**Grundsatz (Nutzer-Korrektur 2026-09-05, siehe globale Memory
`feedback_never_unify_divergent_implementations`): NICHTS angleichen oder
vereinheitlichen.** Diese Phase enthält mehrere Punkte, die ursprünglich
als "Duplikat bereinigen" formuliert waren (Details/Sidebar,
Dual-DB-Layer) — genau das Muster, das bereits einmal zurückgerollt werden
musste (Phase-2-`ActivityPicker.jsx`-Revert). Bevor irgendetwas davon
umgesetzt wird: explizit mit dem Nutzer klären, ob die zwei Stellen
wirklich redundant sind oder ob eine der beiden Seiten eine eigene,
absichtliche Daseinsberechtigung hat. Im Zweifel: nicht anfassen, oder
eher die schwächere Seite an die reichhaltigere angleichen/erweitern statt
umgekehrt zu kürzen.

## Stücke

- [x] **Modals zentralisiert (2026-09-05).** `showSidebar`/
      `showTabSettings` (vorher in `useSession.js`) + lokales
      `gateSheetOpen` (vorher in `SessionEditor.jsx`) → ein einziges
      `activeModal`-State (`null | 'sidebar' | 'settings' | 'gate'`) in
      `useSession.js`. Neuer `SessionModalsLayer.jsx` bündelt alle drei
      Portal-Calls (`SidebarSheet`, `SourceSettingsModal`,
      `SessionGateSheet`) — jede einzelne Modal-Komponente selbst
      unverändert, nur zentral geroutet statt an drei Stellen verstreut.
      `npm run build` grün.

- [x] **Details/Notizen: doppeltes `SessionSidebar`-Rendering geklärt
      (2026-09-05, User-Rückfrage).** Nutzer bestätigt: absichtlich, beide
      Wege (inline Details-Toggle in `SessionEditor.jsx` + Modal via
      `SidebarSheet.jsx`) bleiben unverändert bestehen. Kein Code-Fix.

- [x] **Session-Gate-Sub-Tab-Router untersucht (2026-09-05, nur geprüft/
      dokumentiert, User-Entscheidung: erstmal nur das, kein Code-Fix).**
      Ergebnis: Es gibt **keinen zweiten, unsynchronisierten State-Router**
      — `SessionGateCard.jsx`s Nav-Buttons rufen genau denselben
      `onSubNav`-Callback auf und lesen denselben `currentSubTab`-Wert wie
      `views/Session/index.jsx` (beide letztlich gespeist aus dem einen
      `subTab`-State in `App.jsx`, der auch die Sidebar/Bottom-Nav treibt).
      Kein Sync-Problem, keine zwei Wahrheiten über "welcher Sub-Tab ist
      aktiv".

      Was tatsächlich dupliziert ist: **zwei unabhängig gepflegte Listen
      derselben 5 Sub-Tab-IDs** (`today`/`plan`/`history`/`timer`/`skills`),
      mit bereits sichtbarem Drift:
      - `src/constants/NavigationItems.js` (Sidebar/Bottom-Nav, die
        "kanonische" Config): Reihenfolge `today, timer, skills, plan,
        history`; Labels `"Timer"`, `"History"`; kein `comingSoon`-Flag.
      - `SessionGateCard.jsx::SESSION_NAV_ITEMS` (Gate-Sheet-eigene Nav):
        Reihenfolge `today, plan, history, timer, skills`; Labels
        `"6 Pack"`, `"Verlauf"`; zusätzliches `comingSoon`-Flag auf
        `plan`/`timer`/`skills` (in `NavigationItems.js` nicht vorhanden).

      Nicht angefasst — genau die Sorte Divergenz, die laut Grundsatz oben
      erst geklärt werden muss: könnte absichtlich sein (Gate-Sheet ist ein
      kompakteres Mobile-Sheet, andere Label-Länge/Reihenfolge/"kommt
      bald"-Markierung könnten dort bewusst anders sinnvoll sein als in der
      Desktop-Sidebar) oder tatsächlich unbeabsichtigter Drift seit
      Einführung von `comingSoon`. Nächster Schritt wäre eine explizite
      Rückfrage, ob `SESSION_NAV_ITEMS` aus `NavigationItems.js`s
      `sub`-Array abgeleitet werden soll (plus optionalem Label-/
      Reihenfolge-Override fürs Sheet) oder ob beide Listen bewusst
      eigenständig bleiben.

- [x] **Dual-DB-Layer — geprüft statt zusammengelegt (2026-09-05).**
      `local/sessions.js` (Node-Proxy) vs. `firestore/sessions.js`
      (Firestore-SDK-Calls) bleiben zwei komplett getrennte
      Implementierungen (bewusst — Firebase-PWA muss ohne Node-Backend
      laufen). Live gegengelesen statt aus dem alten Audit-Text
      übernommen:
      - **`ROLE_W`-Gewichte** (`{primary:1, secondary:0.5,
        stabilizer:0.2}`) sind in `local/analysis.js` UND
        `firestore/analysis.js` inzwischen identisch — der ursprüngliche
        Audit-Punkt "Firestore hat ein zusätzliches Gewicht" ist stale,
        nicht mehr aktuell.
      - **KB-Fallback bei fehlenden Muskeldaten** war der einzige real
        noch bestehende Unterschied: `local::sessionHits()` fiel bei
        leeren `ex.primaryMuscles/secondaryMuscles/stabilizers` auf einen
        KB-Lookup zurück, `firestore::normalizedSessionHits()` nicht —
        eine Übung ohne eigene Muskeldaten (z.B. frischer Quick-Add vor
        Enrichment) zählte auf der Firebase-PWA gar nicht zur Coverage,
        lokal schon. **Mit expliziter Nutzer-Freigabe gefixt**: `kbMap`-
        Parameter (optional, Default `null`) + identischer Fallback in
        `firestore/analysis.js::normalizedSessionHits()`; `kbMap` wird in
        `getMuscleCoverage()` neu aus `getAllExercises()` gebaut (vorher
        dort gar nicht geladen) und in `getMonthlyReport()`s bereits
        vorhandenem `kbMap` einfach mitgegeben. Kein "Zusammenlegen"
        zweier Implementierungen — beide Dateien bleiben eigenständig,
        nur dieselbe Fallback-*Logik* jetzt auf beiden Seiten vorhanden.
        `npm run build` grün.
      - `getPlanSuggestion()` bleibt komplett divergent (lokal simpler
        DOW-Fallback, Firestore volles Template-Regel-System) —
        unangetastet, das ist laut Audit selbst schon immer beabsichtigt.
      - Grundsatzentscheidung (eine DB-Schicht dauerhaft führend machen,
        oder Online/Offline-Split bewusst beibehalten) weiterhin NICHT
        getroffen — war auch nicht Teil dieser Freigabe, bleibt offen.
      - Verwandt, weiterhin offen: vier konkurrierende SOTs ohne
        dokumentierte Priorität (JSON-Datei, SQLite, Firestore,
        localStorage-Runtime-Draft) — reine Doku-Aufgabe, noch nicht
        geschrieben.

## Definition of Done

1. [x] Modal-States über ein einziges `activeModal`-Feld statt N Booleans
       (erledigt 2026-09-05, siehe Stück 1 oben).
2. Kein Duplicate-Rendering von `SessionSidebar` mehr.
3. [x] Vier-SOT-Konfliktmodell dokumentiert (2026-09-05): dritte Schicht
   (Firestore) war bereits in `docs/ARCHITECTURE.md` beschrieben, die vierte
   (Frontend-Runtime-Draft, `localStorage`) fehlte dort — ergänzt inkl.
   Konfliktregel ("Draft gewinnt immer über Server-Stand, bis Save
   bestätigt"). Zusätzlich in `src/views/Session/AUDIT.md` als
   "Auffälligkeiten 2026-09-05" mit dem vollen Dual-DB-Befund (ROLE_W stale,
   KB-Fallback-Fix, getPlanSuggestion divergent) querverwiesen. Keine neue
   "eine Schicht führt dauerhaft"-Entscheidung getroffen — bewusst weiterhin
   Online/Firestore vs. Offline/Node-JSON-Split, das ist der Zielzustand,
   kein offener Punkt.
