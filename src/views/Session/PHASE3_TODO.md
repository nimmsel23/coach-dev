# Session-Tab Rebuild — Phase 3: Groß, verwoben (riskant)

Quelle: Haiku-Doppel-Audit 2026-09-05. Das ist der Kern des eigentlichen
Rebuilds — beide Audits (DB-Layer + UI-Reihenfolge) landen unabhängig
voneinander bei denselben drei Baustellen. Nicht ohne Tests/manuelle
Verifikation pro Schritt angehen, nicht alles auf einmal.

**Grundsatz (Nutzer-Korrektur 2026-09-05, siehe globale Memory
`feedback_never_unify_divergent_implementations`): NICHTS angleichen oder
vereinheitlichen.** Wo zwei Stellen im Code unterschiedlich aussehen oder
sich unterschiedlich verhalten, ist die Standard-Annahme, dass das Absicht
ist oder bei einem früheren Refactor verloren ging — nicht dass es
bereinigt gehört. "Zusammenführen"/"Deduplizieren" ist selbst der
riskante Schritt, auch wenn er verhaltenserhaltend gemeint ist (siehe
Phase-2-Revert des `ActivityPicker.jsx`-Merges). Jeder Punkt unten, der
nach Zusammenlegen von zwei Implementierungen klingt, braucht VOR der
Umsetzung eine explizite Rückfrage an den Nutzer — nicht nur bei
offensichtlichen fachlichen Unterschieden, auch bei vermeintlich reinem
Copy-Paste-Code.

## Stücke (Reihenfolge wie unten empfohlen)

### 1. ExerciseCard.jsx (~600 Zeilen — größte Einzeldatei im Tab)
- [x] In Sub-Komponenten aufteilen (2026-09-05, rein mechanisch, keine
      Logik/Werte verändert, `npm run build` grün):
      - `ExerciseCardHeader.jsx` (Name, Muscle-Tags, Trend, Recovery-Hours,
        Volume-Summary, Delete-Button)
      - `SetGridEditor.jsx` (Set-Grid, Reps/Weight-Inputs + Steppers,
        NxM-Expansion, Drop-Set-Detection)
      - `ExerciseHistoryCollapse.jsx` (Previous-Stats/`prevMap`-Anzeige)
      - `ExerciseCard.jsx` ist jetzt reiner Orchestrator (State + berechnete
        Werte + Handler + Zusammensetzen + Notiz-Footer inline).
- [x] `stepReps()`/`stepWeight()` gegengelesen (2026-09-05): **nicht
      identisch**, bewusst getrennt gelassen. `stepReps` parst als Integer
      und blockt bei aktivem NxM-Pattern; `stepWeight` parst als Float mit
      Komma→Punkt-Konvertierung und rundet auf 2 Nachkommastellen —
      unterschiedliche Domänen (Wiederholungen vs. Gewicht), kein
      zufälliges Copy-Paste. Kein Merge-Vorschlag nötig.
- [x] Async-Trend-Fetch (`getProgressTrend(ex.name)`) hat jetzt eine
      `useEffect`-Cleanup (`cancelled`-Flag) — verhindert, dass ein
      schneller Übungs-Wechsel einen veralteten Trend setzt.
- [x] `tryExpandReps()` toastet jetzt bei echtem Parse-Fehler (NxM-Pattern
      matcht, aber `nSets < 1`, z.B. "0x5"). Normale Reps-Eingabe (kein
      NxM-Match) bleibt bewusst ohne Toast — das ist der Standardfall,
      kein Fehler. `showToast` dafür neu aus `useSession.js` exportiert
      und über `SessionEditor→ExerciseList/SessionSlots→ExerciseCard`
      als `onToast`-Prop durchgereicht.
- [x] `muscleTags` (einziger Konsument von `formatMuscle()`) ist jetzt
      `useMemo`-gecacht auf `[ex.primaryMuscles, muscleLang, muscleDetail]`
      — `formatMuscle` selbst als separate Funktion entfernt (war nach
      dem Memo ungenutzt).

### 2. ExerciseList.jsx
- [x] Props-Drilling reduziert (2026-09-05): `useSession.js` liefert jetzt
      zusätzlich ein gebündeltes `exerciseOps`-Objekt (`updateEx, addSet,
      removeSet, removeEx, replaceSets, moveEx, addEx, quickInput,
      setQuickInput, addQuick, onToast`) statt 11 einzelner Props.
      `SessionEditor.jsx` reicht nur noch `exerciseOps` an
      `ExerciseList`/`SessionSlots` durch (statt 11 Einzel-Props je
      Aufrufstelle); reine Anzeige-/Kontext-Props (`exercises`, `restHours`,
      `muscleRecovery`, `date`, `prevMap`, `onInspectExercise`) bleiben
      bewusst einzeln, weil Basis-Abschnitt und Slots hier unterschiedliche
      Werte brauchen. `SessionSlots.jsx` (Stück 3) musste dafür an zwei
      Stellen mitgezogen werden, da es `addEx` nicht nur durchreicht,
      sondern selbst konsumiert (Slot-Override zum Anhängen der `slotId`,
      Template-Anwendung in `handleUseTemplate()`) — beide Stellen greifen
      jetzt auf `exerciseListProps.exerciseOps.addEx` statt
      `exerciseListProps.addEx`. Kein dedizierter Hook-File nötig, da
      `useSession.js` selbst schon der Hook ist — die Kapselung ist einfach
      ein weiteres Feld in dessen Rückgabe-Objekt.
- [x] `addQuick()` war bereits vor diesem Stück in `useSession.js`
      implementiert (Quick-Input-Parser via `parseQuick()` + State-Update),
      nicht in der View — `ExerciseList.jsx` ruft es nur noch über
      `exerciseOps.addQuick` auf. Punkt war bereits erfüllt, hier nur
      verifiziert + im neuen Bündel nachgezogen.
- [x] DndContext-Abhängigkeit dokumentiert: JSDoc-Kommentar am Dateikopf von
      `ExerciseList.jsx` — `useDroppable()`/`useSortable()` werfen ohne
      umschließenden `<DndContext>` (kein lokaler Fallback), aktuell stellt
      `SessionEditor.jsx` genau einen gemeinsamen Context für Basisliste +
      alle Slot-Listen bereit.

### 3. SessionSlots.jsx (~220 Z.)
- [x] Nested-DnD-Problem gelöst (2026-09-05, User-Entscheidung: volles
      nested dnd-kit-Sortable statt Pfeil-Buttons). Slots sind jetzt per
      eigenem Griff-Icon (`SortableSlotRow` in `SessionSlots.jsx`, gleiches
      Muster wie `SortableExerciseRow` in `ExerciseList.jsx`) untereinander
      sortierbar — eigene `SortableContext` über die Slot-IDs, im selben
      `DndContext` wie die Exercise-Listen (dnd-kit erkennt Drags nur über
      den nächsten Vorfahren-Context, ein zweiter, verschachtelter
      `DndContext` wäre nicht nutzbar gewesen). Unterscheidung der beiden
      Reorder-Pfade in `SessionEditor.jsx::handleDragEnd()` über
      `active.data.current?.type` (`'slot'` vs. `'exercise'`, letzteres neu
      an `ExerciseList.jsx`s Sortable-Items ergänzt). Neuer Handler
      `reorderSlots(activeId, overId)` in `useSession.js` nutzt
      `arrayMove()` aus `@dnd-kit/sortable` und vergibt `order` für alle
      Slots neu (das Feld existierte vorher schon, wurde aber nie geändert
      außer beim Anlegen). `npm run build` grün.
- [x] Template-Persistenz verifiziert (2026-09-05): `getSlotTemplates()`/
      `saveSlotTemplate()` laufen sauber über `@db` →
      `lib/db/local/slotTemplates.js` (lokal) bzw.
      `lib/db/firestore/slotTemplates.js` (Firebase-Build), beide korrekt
      in ihrem jeweiligen Barrel (`lib/db/index.js` /
      `lib/db/index.firestore.js`) re-exportiert. Kein Fix nötig.
- [x] `SlotCard.jsx` als eigene Datei herausgelöst (rein mechanisch, keine
      Logik verändert) — `SessionSlots.jsx` importiert sie jetzt und
      kümmert sich nur noch um Slot-Liste + Reorder + Templates + Add-Button.
- [x] Props reduziert: profitiert direkt von Stück 2s `exerciseOps`-Bündel
      — `...exerciseListProps` (Rest-Spread in `SessionSlots`s
      Funktionssignatur) enthält jetzt `restHours, muscleRecovery, date,
      prevMap, onInspectExercise, exerciseOps` (6 statt vorher 16 Keys).

### 4. useSession.js (771 Zeilen — der State-Monolith)
- [x] In Mini-Hooks aufgespalten (2026-09-05): `useExerciseList.js`
      (Übungs-Mutationen + Quick-Input, 181 Z.), `useSessionActivity.js`
      (`activity`/`hasActivity`/`activityAddons`, 47 Z.),
      `useSessionSlots.js` (Slots-State + Handler inkl. `reorderSlots`,
      61 Z.), `useSessionGateController.js` (GPS-Start/Stop + Timer,
      113 Z.). Haupthook `useSession.js`: 771 → 548 Zeilen (Ziel war ~300,
      real erreicht ~30% Reduktion — Koordination + Load/Save + History/
      Hints/Autosave-Effects sind selbst noch beträchtlich, siehe Rest der
      Datei; eine weitere Aufspaltung dieser verbleibenden Effects wäre ein
      eigenes, separates Stück gewesen und ist nicht Teil dieses Splits).
      Externer Rückgabe-Vertrag von `useSession()` unverändert (identische
      Feld-Namen/-Struktur) — `SessionEditor.jsx` (per `{...session}`-
      Spread aus `views/Session/index.jsx`) brauchte keine Anpassung außer
      dem separaten Orchestrator-Punkt unten. `npm run build` grün.
- [x] Zweiter Split-Durchgang (2026-09-06, Fortsetzung, rein mechanisch,
      keine Logik/Werte verändert): die vier zuvor noch verbliebenen
      großen Blöcke wurden ebenfalls in eigene Mini-Hooks ausgelagert —
      `useSessionHistory.js` (History-Load-Effect, `prevMap`-Bau,
      Multi-Doc-Merge, `restHours`, `loadMoreHistory`, 89 Z.),
      `useSessionRuntimeSync.js` (localStorage-Runtime-Draft-Sync-Effect
      inkl. `savingRef`-Race-Guard + `fitness:queue-flushed`-Listener,
      84 Z.), `useSessionCrud.js` (`loadSessionData`/`resetSessionData`/
      `selectSession`/`handleDeleteSession`/`handleNewSession`, 130 Z.),
      `useSessionExport.js` (`exportObsidian`/`handleDownload`/
      `moveSessionToDate`, 61 Z.). `useSessionRuntimeSync.js` bündelt die
      vielen benötigten Session-Felder bewusst als ein `sessionState`-
      Objekt statt 14 Einzel-Parametern (Trade-off, siehe JSDoc-Kopf dort).
      Haupthook `useSession.js`: 548 → 357 Zeilen. Externer Rückgabe-
      Vertrag weiterhin unverändert — `index.jsx`/`SessionEditor.jsx`
      brauchten keine Anpassung. `npm run build` grün (inkl. Lint).
- [x] Interdependenzen vor dem Split dokumentiert (als JSDoc-Kopf in den
      jeweiligen Dateien, nicht nur hier):
      - `moveExercise()` (jetzt in `useExerciseList.js`) braucht NUR
        `exercises` (über das `slotId`-Feld) — keinen direkten Zugriff auf
        `slots[]`. Die einzige echte Kopplungsstelle zwischen den beiden
        Mini-Hooks ist `removeSlot()` (in `useSessionSlots.js`), das
        `setExercises` von `useExerciseList.js` braucht, um `slotId` bei
        betroffenen Übungen zurückzusetzen — nicht umgekehrt.
      - `addEx()`/`addQuick()` brauchen `saveRef` + `setDirty` von außen
        (Sofort-Save-Pattern nach dem State-Update); alle übrigen
        Exercise-Mutationen laufen über das normale `scheduleAutoSave()`
        des Haupthooks — beides als Parameter in `useExerciseList.js`.
      - `startSessionGate()`/`stopSessionGate()` (jetzt in
        `useSessionGateController.js`) brauchen `save` (per Hoisting aus
        `useSession.js` referenzierbar, da dort als `async function`
        deklariert), `setDirty`, `showToast` sowie `location`/`duration`
        lesend UND schreibend — beide Felder bleiben bewusst im Haupthook
        (Basis-Session-Felder, existieren auch ganz ohne Gate-Feature).
      - `buildSessionPayload()`/`save()`/der Dirty-Autosave-Effect bleiben
        zwangsläufig im Haupthook, da sie fast jedes Stück Session-State
        lesen (block/exercises/effort/location/duration/notes/
        trainingsart/sessionMode/activity/hasActivity/slots/sessionGate) —
        keine sinnvolle Aufteilung ohne eine gemeinsame Schnittstelle, die
        am Ende wieder alles zusammenführen müsste.
- [x] Bekannte Einzel-Bugs im selben Aufwasch mitgenommen:
      - GPS-Fehlerpfade geklärt statt vereinheitlicht (Doku-Kommentar in
        `useSessionGateController.js`): es gibt real nur EIN Fehler-Enum
        (`getCurrentPosition()`s `errorReason`) — `resolveGeoLocation()`
        hat keins, fängt jeden eigenen Fehlschlag intern ab und degradiert
        still auf den nächstschwächeren Fallback (Gym → Adresse →
        Koordinaten). Kein zweites Enum zu vereinheitlichen; nur
        dokumentiert, damit das nicht erneut gesucht wird. Kein UI-Fix
        nötig/vorgenommen (Koordinaten-Fallback zeigt sich bereits selbst
        sichtbar im `gps.label`).
      - Auto-Save-Race behoben: neuer `savingRef`-Guard in `useSession.js`
        — der Dirty-Draft-Effect (schreibt `syncState:'local'` in den
        Runtime-Draft) überspringt den Schreibvorgang jetzt, solange ein
        echter API-Save (`save()`) in Flight ist (`savingRef.current`
        zwischen `try` und `finally` gesetzt) — verhindert, dass ein
        während eines laufenden Saves noch geändertes Feld den von
        `save()` gesetzten `'saving'`/`'queued'`-Status fälschlich auf
        `'local'` zurückstuft. Kein Datenverlust vorher (API-Call lief
        unbeeinflusst weiter), nur ein potenziell falscher Sync-Status bei
        Reload mitten im Save.
- [x] `SessionEditor.jsx` auf reinen Orchestrator zurückgestutzt
      (2026-09-05): Cardio-Modus-Block → `CardioSection.jsx`, Gate-Sheet-
      Portal → `SessionGateSheet.jsx` (beide rein mechanisch extrahiert,
      keine Logik verändert). Verbleibendes Inline-JSX in
      `SessionEditor.jsx` sind nur noch Layout-Wrapper (Grid/Spacing-Divs,
      Details-Collapse-Toggle) um die Sub-Komponenten. `npm run build`
      grün.

## Definition of Done pro Stück

1. Kernfeatures aus `AUDIT.md`-Abschnitt "Kernfeatures (müssen nach jedem
   Refactoring erhalten bleiben)" explizit gegengetestet: prevMap,
   restHours, muscleRecovery, Gap-Hints, Plan-Hint, Multi-Session,
   Autosave, BodyMap.
2. Manuelle End-to-End-Session (anlegen → Übung hinzufügen → Slot
   hinzufügen → speichern → History prüfen) nach jedem Teil-Schritt.
3. Kein Verhaltensunterschied im Session-JSON-Format (Feld-Shape bleibt
   stabil, siehe `../CLAUDE.md`-Abschnitt "Session-JSON-Format").

## Nicht in dieser Phase

Dual-DB-Layer (local vs. Firestore) grundsätzlich bereinigen, Modal-
Zentralisierung — siehe [[PHASE4_TODO]].
