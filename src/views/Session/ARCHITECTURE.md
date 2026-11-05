# View Architecture: Session

Workout-Journal für Kraft- und Ausdauertraining. Zwei Session-Modi, Multi-Session pro Tag, Autosave, lokale Intelligenz (prevMap, Coverage-Gaps, Plan-Hint).

## Komponenten

- **`index.jsx`**: Thin Sub-Tab-Router — editor (default) / plan / history / logbuch (lazy, eigener View `../Logbuch/`, siehe dort). Skills und 6Pack sind eigenständige Apps, keine Session-Untertabs mehr.
- **`useSession.js`**: State-Owner — Session-Modi, Multi-Session, Autosave/Flush, alle Handler.
- **`SessionEditor.jsx`**: Editor-Assembly — SessionHeader + ExerciseList + ActivityAddon (Basis-Abschnitt) + SessionSlots (zusätzliche Abschnitte) / ActivitySection (Cardio-Mode).
- **`SessionSlots.jsx`**: zusätzliche, frei benannte Abschnitte einer Strength-Session — jeder Slot ein weiterer Übungen+Activity+Notiz-Block wie der Basis-Abschnitt, additiv, kein Ersatz für ihn. Slot-Inhalt 1:1 als wiederverwendbarer "Baustein" pro Trainingsblock speicherbar (`lib/db/local|firestore/slotTemplates.js`).
- **`SessionGateCard.jsx`**: großes Start/Stop-Gate für den Trainingstag inkl. laufender Session-Stoppuhr und Live-Notification-Anbindung.
- **`SessionHistory.jsx`**: Verlauf-SubTab — Timeline, Drag&Drop-Umdatierung.
- **`SessionHeader.jsx`**: konsolidierter Header (ersetzt `DateStrip.jsx`/`SessionSwitcher.jsx`/`ModeSwitcher.jsx`) — Titel + Kalender-Sprung + Overflow-Menü, flacher Day-Strip, Session-Pills + Kraft/Ausdauer-Underline-Tabs.
- **`useDayStrip.js`**: Day-Strip-Fensterung/Navigation, von `SessionHeader.jsx` genutzt.
- **`ExerciseList.jsx`**: Übungsliste + QuickInput + ExerciseSearchOverlay + Hint/Gap-Banner.
- **`ExerciseCard.jsx`**: Einzelübung — `setsArray` (multi-set), NxM-Expansion, Drop-Set, prevMap-Stats, Trend-Badge, Recovery.
- **`ActivitySection.jsx`**: Cardio-Logger — im `cardio`-Mode die gesamte Session.
- **`ActivityAddon.jsx`**: Optionaler Cardio-Anhang an eine Strength-Session.
- **`SidebarSheet.jsx`**: Bottom-Sheet mit SessionSidebar (Block, Ort, Dauer, Effort, Notizen, Exports).
- **`MuscleMapModal.jsx`**: Anterior/Posterior BodyMap aller Session-Exercises + Anatomie-Detail.
- **`SourceSettingsModal.jsx`**: Übungsquellen-Toggle (wger/yuhonas/coach) via localStorage.
- **`SessionModeTabs.jsx`**: Kraft/Ausdauer setzen den Session-Modus. Skills und 6Pack öffnen eigene Apps: im VitalOS-Shell-Build lokale Shell-Routen, im Fitness-Standalone die Hosting-Sites.
- **`SessionGateSheet.jsx` / `GatePortalGrid.jsx`** (2026-11-05): kein Auto-Open mehr beim Wechsel auf „Heute"; das Sheet öffnet über die Gate-Leiste (Grid-Button / Tap). Nach oben herausziehen (oder Chevron) = Hub-Modus: Vollbild mit großem Schnelleinstieg (Suche, Kürzel `/`, `1`–`9`, Zuletzt genutzt, Ziele über alle Tabs). Dock (mobil, 2026-11-05): Die Bottom-Nav ist die eingeklappte Unterkante des Gate-Sheets — Hochwischen (oder Griff tippen) zieht das Sheet heraus (`App.openHub('gate')`); dort ersetzt die Hub-Leiste (`GatePortalGrid.jsx::GateHubBar`) die Nav, Hochwischen darauf oder Tipp auf „Hub" klappt den Hub-Vollbild auf. Bottom-Nav (mobil): Training · **Hub** · Atlas · Mehr — der Hub-Button (`App.openHub`) wechselt auf Session/Heute und öffnet das Gate direkt im Hub-Modus (`activeModal='hub'`); Plan/Logbuch/Timer/Skills liegen dort. Im Session-Tab zeigt nur noch ein Chip den Split (Tap → Gate; Long-Press auf Chips im Gate → Plan-Vorlagen). Das Gate fängt außerdem Kraft/Ausdauer und die Split-Chips (inkl. neu **Shoulders**, **Arms**) ab, bevor man in den Session-Tab geht; Autoerkennung (`utils.js::inferBlockFromExercises`) erkennt reine Schulter-/Arm-Tage über die Primärmuskeln.
- **`SessionGateCard.jsx`**: enthält ebenfalls direkte Einstiege zu den eigenständigen Skills- und 6Pack-Apps; deren Inhalte werden nicht in der Fitness-Session gerendert.

## Session-Modi

- **`strength`**: Krafttraining — Basis-ExerciseList + optionaler ActivityAddon-Anhang, plus beliebig viele zusätzliche `SessionSlots` (je ein weiterer Übungen+Activity+Notiz-Abschnitt).
- **`cardio`**: Ausdauer — nur ActivitySection, keine Exercises, keine Gap-Hints, keine Slots.

## Session-Slots (seit 2026-08-25)

Zusätzliche, frei benannte Abschnitte einer Strength-Session — additiv zum
Basis-Abschnitt (Basis-`ExerciseList` + `ActivityAddon`), kein Ersatz dafür.
Mentalmodell: die Session ohne Slots ist der implizite erste Abschnitt,
jeder per "+ Slot hinzufügen" angelegte Slot ist ein weiterer, gleichartiger
Abschnitt danach (z.B. Basis="Rücken", Slot="Bizeps" als zweiter Teil eines
Pull-Days). Kein exklusiver Typ: ein Slot kombiniert frei Übungen, einen
Activity-Block (`activityType`/`duration`) und eine Notiz (`text`).
`exercises[]`-Einträge referenzieren ihren Slot über `slotId` (fehlt/`null`
= Basis-Abschnitt). Der Slot selbst ist der Baustein: "Als Baustein
speichern" snapshotted den kompletten Slot-Inhalt, wiederverwendbar pro
Trainingsblock (`getSlotTemplates(block)`/`saveSlotTemplate()`) —
perspektivisch die Brücke zwischen Session-Tab und Plan-Tab (noch nicht
umgesetzt).

**Kein `time`-Feld pro Slot** (2026-08-25, revertiert): Sessions werden nie
live im Gym geloggt, immer nachträglich — ein "jetzt"-Zeitstempel beim
Anlegen eines Slots wäre erfundene Präzision, kein echter Trainingszeitpunkt.
Uhrzeit/Ort sind Session-weite Kontext-Attribute (gehören ggf. in die
`SessionSidebar`, nicht dupliziert pro Slot) — aktuell nirgends als Feld
umgesetzt, da kein konkreter Bedarf.

**Drag & Drop (seit 2026-08-25):** `@dnd-kit` (schon Dependency von
`Plan/RoutineBuilder.jsx`, jetzt auch explizit in `package.json`) erlaubt
Übungen per Griff-Icon innerhalb einer Liste umzusortieren UND zwischen
Basis-Abschnitt und Slots zu verschieben. Ein einziger `DndContext` in
`SessionEditor.jsx` (strength-Zweig) umschließt Basis-`ExerciseList`
(`containerId="__base__"`) + alle Slot-`ExerciseList`s (`containerId=slot.id`).
`useSession.js::moveExercise(exerciseId, targetSlotId, targetContainerIndex)`
ist der eine Ort, der Container-Zugehörigkeit + Position im flachen
`exercises`-Array anfasst — sowohl DnD (`onDragEnd`) als auch die
Pfeil-Buttons in `ExerciseCard.jsx` (`moveEx(i, direction)`, jetzt ein
dünner Wrapper um `moveExercise`) laufen darüber, damit Nachbarn aus
fremden Containern nicht dazwischenrutschen.

**Bugfix 2026-08-25:** `ExerciseList.jsx` bekam vor Slots immer das volle,
ungefilterte `exercises`-Array — der lokale Map-Index (`idx`) war identisch
zum globalen Array-Index, den `updateEx`/`addSet`/`removeSet`/`removeEx`/
`replaceSets` erwarten. Mit Slots rendert `ExerciseList` nur noch gefilterte
Teilmengen (Basis: `!ex.slotId`, Slot: `ex.slotId === slot.id`) — der lokale
Index zeigte dadurch potenziell auf die falsche Übung im Gesamt-Array.
Fix: `SessionEditor.jsx` versieht jede Übung einmalig mit `__i` (ihr echter
Index im ungefilterten Array), `ExerciseList` nutzt `ex.__i` statt `idx` für
alle Mutations-Callbacks. `moveEx`/`moveExercise` sind davon unabhängig
korrekt (id-basiert). Ebenfalls gefixt: `addQuick()` erzeugte Übungen ganz
ohne `id`-Feld (nötig als Sortable-/Dedup-Key) — jetzt analog zu `addEx()`
`inbox_${slugify(name)}`.

## Session Gate

Vor dem manuellen Editor liegt ein leichtgewichtiges `sessionGate` im selben Session-Dokument:

```json
{
  "sessionGate": {
    "status": "active|completed",
    "startedAt": "2026-08-09T11:23:00.000Z",
    "endedAt": "2026-08-09T12:14:00.000Z"
  }
}
```

- Start loggt sofort den Fakt "Workout läuft", auch ohne Übungen.
- Stop beendet die Session und füllt bei leerem `duration` automatisch grob die Minuten.
- Der manuelle Editor bleibt bewusst getrennt darunter für das Nachtragen.
- Eine aktive Session kann best-effort eine laufende App-Service-Worker-Benachrichtigung halten.

**Bugfix 2026-10-13 (Notification führte ins Leere):** Antippen der
Workout-Stoppuhr-/Stunden-Erinnerung-Notification öffnete bisher nie das
Gate-Sheet mit dem "Workout beenden"-Button — zwei unabhängige Sackgassen,
beide gefixt:
1. `public/sw.js`: `showWorkoutNotification()`/`showHourReminderNotification()`
   verlinkten auf `/#session?date=...`, was `App.jsx::parseHashRoute()`
   absichtlich als gate-loses Deep-Link behandelt (Fix 2026-09-07 für
   Dashboard/Review-Links). `notificationclick`-Fallback war ebenfalls
   `/#session`. Alle drei zeigen jetzt fest auf `/#session/today` — der
   einzige Hash, der `subTab='today'` setzt und damit das Gate öffnet.
2. `src/views/Session/index.jsx`: Selbst mit korrektem Hash verdrängte
   `TodayPlan` (gate-unwissend) weiterhin den `SessionEditor`/das Gate,
   solange ein Klient einen aktiven Coach-Plan-Zyklus hat. Fix: der
   `isTodayTab`-Zweig prüft jetzt zusätzlich `isSessionGateActive(session.sessionGate)`
   und lässt `TodayPlan` bei aktivem Gate nicht mehr zum Zug kommen.

## Multi-Session pro Tag

Pro Tag können mehrere Sessions existieren. `id: null` = Hauptsession, `id: "<timestamp>"` = Suffix-Session. Switcher-Bar zeigt alle Sessions des Tages. "+ Neues Workout" legt eine neue Suffix-Session an. Löschen ist für jede Session der Tagesliste möglich — auch die Hauptsession (seit 2026-07, Klienten-Request).

## Übungs-Trend

Die Übungskarte fragt den Gewichtstrend mit Übungs-ID und Name ab. Lokaler und Firebase-Pfad nutzen dieselbe Berechnung: konkrete IDs müssen übereinstimmen; ein exakter Name dient nur für ältere Einträge ohne ID als Fallback. Verglichen wird das höchste protokollierte Gewicht mit dem Durchschnitt der vorangehenden verfügbaren Messungen.

Die Vorwerte zum Übernehmen folgen derselben Übungs-ID-Regel. Frühere Tage zählen immer; Workouts am selben Tag zählen nur, wenn beide gespeicherten Zeitstempel ihre Reihenfolge gegenüber dem geöffneten Workout belegen.

## Autosave

Kein Zeit-Debounce mehr (seit 2026-07). `scheduleAutoSave()` setzt nur das `dirty`-Flag. Gespeichert wird an semantischen Commit-Punkten: sofort bei `addEx`/`addQuick`, sonst via `flushDirty()` bei Tab-Hide/`pagehide`, Unmount (Haupt-Tab-Wechsel), Datumswechsel, Session-Wechsel und neuem Workout. `saveRef`/`dirtyRef`/`dateRef` halten die aktuellen Closures (stale-closure Workaround); der `dateRef`-Guard verhindert, dass der `listSessionsForDate`-Nachlauf eines Flush-Saves nach Datumswechsel die frische Tagesliste überschreibt.

## Datenformat

```json
{
  "date": "2026-06-22",
  "sessionMode": "strength",
  "block": "Push",
  "exercises": [{ "id": "...", "name": "...", "setsArray": [{"reps": "8", "weight": "80"}], "primaryMuscles": [...], "slotId": null }],
  "effort": 8,
  "location": "",
  "duration": "",
  "notes": "",
  "activity": { "type": "hiit", "duration": "", "notes": "" },
  "slots": [
    { "id": "uuid", "label": "Bizeps", "order": 0, "activityType": "hiit", "duration": "5", "text": "" }
  ]
}
```


## App-Übergänge

Legacy-Routen `#session/timer`, `#session/skills`, `#timer` und `#skills` werden
im Fitness-Standalone auf `vos-6pack.web.app` bzw. `vos-skills.web.app`
weitergeleitet. VitalOS fängt dieselben IDs am Shell-Adapter ab und öffnet
seine lokalen SixPack-/Skills-Wrapper. Das Eintragen abgeschlossener
App-Workouts ins Fitness-Tageslog bleibt eine Funktion des VitalOS-Shell-
Adapters.
