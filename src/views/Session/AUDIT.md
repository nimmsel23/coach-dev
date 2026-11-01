# Audit: Session

## Zweck
Workout-Journal — Session-Logging mit Satz/Wdh/Gewicht, Session-Modi, intelligenten Empfehlungen und Anatomie-Visualisierung.

## Aktueller Stand (2026-10-30)
Skills und 6Pack sind aus der Fitness-Session herausgelöst. Die Session bietet Links zu den eigenständigen Apps; Fitness-Standalone leitet dorthin weiter, VitalOS öffnet lokale Shell-Wrapper. Alte Session-Deep-Links werden umgeleitet. Das Eintragen abgeschlossener Skills-/6Pack-Workouts ins Fitness-Tageslog liegt beim VitalOS-Shell-Adapter. Fitness-eigene Plan- und Übungskatalogdaten bleiben separat bestehen. Die Auffälligkeiten vom 2026-08-12 unten dokumentieren die frühere integrierte Kopie.

## Komponenten
| Datei | Zweck |
|-------|-------|
| `index.jsx` | Thin Sub-Tab-Router: editor (default) / plan / history / logbuch (→ `views/Logbuch/`) |
| `useSession.js` | State-Owner, alle Handler, Autosave/Flush, Datenfluss |
| `SessionEditor.jsx` | Editor-Assembly: SessionHeader + ExerciseList + ActivityAddon (Basis-Abschnitt) + SessionSlots (zusätzliche Abschnitte) / ActivitySection (Cardio-Mode) |
| `SessionSlots.jsx` | Zusätzliche, frei benannte Abschnitte einer Strength-Session (seit 2026-08-25) — additiv zum Basis-Abschnitt, kein Ersatz. Jeder Slot kombiniert frei Übungen + Activity + Notiz, Slot-Inhalt 1:1 als "Baustein" pro Trainingsblock speicherbar (`slotTemplates.js`) |
| `SessionGateCard.jsx` | Großer Start/Stop-Einstieg für Trainingstag, Timer, Live-Status-Notification und Links zu Skills-/6Pack-Apps |
| `SessionHistory.jsx` | Verlauf-SubTab: Timeline, Drag&Drop-Umdatierung |
| `SessionModeTabs.jsx` | Kraft/Ausdauer-Modus plus Links zu Skills und 6Pack; Shell öffnet lokale Wrapper, Fitness-Standalone leitet zu den Hosting-Apps weiter |
| `SessionHeader.jsx` | Konsolidierter Header (2026-08-20, "Concept A/Ruhig"): ersetzt `DateStrip.jsx` + `SessionSwitcher.jsx` + `ModeSwitcher.jsx` (alle drei gelöscht) — Titel-Zeile mit Kalender-Sprung + Overflow-Menü (Session-Details/Übungsquellen) statt vier Icon-Buttons, flacher Day-Strip ohne Boxen, Session-Pills + Kraft/Ausdauer-Underline-Tabs in einer Zeile |
| `useDayStrip.js` | Aus `DateStrip.jsx` extrahierte Day-Strip-Logik (Fensterung/Navigation), von `SessionHeader.jsx` genutzt |
| `ExerciseList.jsx` | Übungsliste + QuickInput + Search-Trigger + Hint/Gap-Banner |
| `ExerciseCard.jsx` | Einzelübung: setsArray, NxM-Expansion, Drop-Set, Trend, prevMap, Recovery |
| `ActivitySection.jsx` | Cardio-Logger (im Cardio-Mode die ganze Session) |
| `ActivityAddon.jsx` | Optionaler Cardio-Anhang an eine Strength-Session |
| `SessionSidebar.jsx` | Meta-Daten (Block, Ort, Dauer, Effort, Notizen, Exports) |
| `SidebarSheet.jsx` | Bottom-Sheet Wrapper für SessionSidebar |
| `MuscleMapModal.jsx` | Anterior/Posterior BodyMap + Anatomie-Detail-Chain |
| `SourceSettingsModal.jsx` | Übungsquellen-Toggle (wger/yuhonas/coach) via localStorage |
| `utils.js` | `getRollingDays`, `blockColor`, `DAY_LABELS` |
  Im `rest`-Abschnitt kann die Wiederholungszahl des gerade beendeten Satzes per Schieberegler korrigiert werden; der Wert im Workout-Log und die Zielprüfung folgen der Korrektur.
| Dritte Datenquelle: Plan-Tab hat zusätzlich 14 "Skill: <Name>"-Routinen (Strong-Modell, `category: "calisthenics-skill"`), die aus denselben Skills generiert wurden — listen aber alle Progressionsstufen einer Skill gleichzeitig als flache Übungsliste statt stage-aware wie SkillsCard. Komplett unsynchronisiert mit #1/#2 (siehe Task "Skills/6Pack Learn-Tab-Überschneidung", Konsolidierung noch offen). |
| `SessionEditor.jsx` | `SessionGateCard` ist kein inline Card-Element mehr, sondern ein Sheet (Portal, Bottom-Sheet), das öffnet wenn `currentSubTab === 'today'` (Nav-Klick auf "Heute"/"Session") — Editor bleibt darunter jederzeit erreichbar |

## Auffälligkeiten (2026-10-13)
- **Gefixt:** Push-Notification zur laufenden Workout-Stoppuhr führte beim
  Antippen ins Leere — kein Weg, die Session zu beenden, `sessionGate.endedAt`
  blieb dadurch dauerhaft `null` und brach den Core4-Fitness-Auto-Done-Link
  (Symptom seit `TODO.md`-Eintrag 2026-10-12). Root Cause war zweiteilig:
  (1) `public/sw.js` verlinkte die Notification auf `/#session?date=...`,
  was `App.jsx::parseHashRoute()` absichtlich als gate-loses Deep-Link
  behandelt (Fix 2026-09-07 für Dashboard/Review-Links) — jetzt fest auf
  `/#session/today` umgestellt (einziger Hash, der `subTab='today'` setzt
  und damit das Gate öffnet). (2) `src/views/Session/index.jsx` ließ
  selbst bei korrektem Hash den gate-unwissenden `TodayPlan`-Screen
  weiterhin den `SessionEditor` verdrängen, wenn ein Klient einen aktiven
  Coach-Plan-Zyklus hat — jetzt per `isSessionGateActive(session.sessionGate)`
  ausgenommen, solange ein Gate läuft.

## Auffälligkeiten (2026-09-05)
- **Dual-DB-Layer (`@db`-Alias) — vier konkurrierende SOTs, keine dokumentierte
  Konflikt-Priorität.** Geprüft im Rahmen von PHASE4_TODO.md Stück 4, nach
  Nutzerfrage "was ist mit dem dual-db-layer los?". Zwei komplett getrennte
  `@db`-Implementierungen bleiben bewusst bestehen (`lib/db/local/*.js` für
  Node-Dev/-Prod, `lib/db/firestore/*.js` für die Firebase-PWA ohne
  Node-Backend) — das ist keine Auffälligkeit für sich, sondern Architektur
  (`Dual DB-Layer` steht bereits als ✅ in `../../CLAUDE.md`). Was fehlt, ist
  eine Aussage, welche der vier tatsächlich beteiligten Schichten bei einem
  Konflikt gewinnt:
  1. **JSON-Datei** (`~/.aos/fitness/users/<uid>/sessions/*.json`) — SOT für
     Node/Python-Seite, siehe `docs/ARCHITECTURE.md`s "Session-Storage:
     Schichten & Konfliktmodell" (dort bereits sauber dokumentiert).
  2. **SQLite** (`training_history.sqlite`) — abgeleiteter Index, ein
     Schreiber (Python/SQLAlchemy), ebenfalls in `docs/ARCHITECTURE.md`.
  3. **Firestore** (`fitness/{uid}/sessions/{date__sessionId}`) — bei der
     Firebase-PWA die einzige echte SOT (kein JSON/SQLite dahinter), rev-
     basiertes Last-Write-Wins (`docs/ARCHITECTURE.md`, selber Abschnitt).
  4. **Frontend-Runtime-Draft** (`localStorage`,
     `fitness-session-runtime-v1`, `src/lib/sessionRuntimeStore.js`) — bewusst
     bestehen bleibender lokaler Zwischenstand, auch nachdem ein Save schon
     unterwegs ist (Absicht: Reload/Offline soll nie wie "nicht gespeichert"
     aussehen), siehe `../CLAUDE.md`-Abschnitt "Session-Runtime-Backstop".
  Die ersten drei sind bereits paarweise dokumentiert (JSON↔SQLite↔Firestore
  in `docs/ARCHITECTURE.md`), **nicht dokumentiert war bisher die vierte
  Schicht im selben Konfliktmodell** — konkret: wenn der Firestore-Sync eines
  Saves fehlschlägt/verzögert ankommt, während der Nutzer in der Zwischenzeit
  weiter im Runtime-Draft editiert, gewinnt beim nächsten Laden immer der
  Draft (per `useSession.js`-Merge-Logik), nicht Firestore — das ist so
  gewollt (siehe Backstop-Zweck), war aber nirgends als Teil des
  Vier-Schichten-Modells benannt. Ergänzt in `docs/ARCHITECTURE.md` (siehe
  dort, gleicher Abschnitt) statt hier dupliziert.
  Fund im selben Zug: `firestore/analysis.js::normalizedSessionHits()` fehlte
  der KB-Fallback bei Übungen ohne eigene Muskeldaten (frischer Quick-Add vor
  Enrichment), den `local/analysis.js::sessionHits()` schon hatte — mit
  Nutzer-Freigabe gefixt (`kbMap`-Parameter ergänzt, siehe Git-Log
  "fix(db): Firestore normalizedSessionHits KB-Fallback ergänzt"). `ROLE_W`-
  Gewichte selbst waren bereits identisch, `getPlanSuggestion()` bleibt
  bewusst divergent (Audit-Fund war hier stale). Grundsatzentscheidung "soll
  eine Schicht dauerhaft führend sein" bewusst NICHT getroffen — beide Seiten
  bleiben laut Architektur-Notwendigkeit (PWA muss ohne Node laufen)
  eigenständig, das ist kein offener Punkt, sondern der Zielzustand selbst.

## Auffälligkeiten (2026-08-25)
- `SessionSlots.jsx` (neu): erste Version machte den Fehler, `ActivityAddon` als "obsolet" aus `SessionEditor.jsx` zu entfernen — nutzerkorrigiert: der Basis-Abschnitt (ExerciseList + ActivityAddon) bleibt unverändert, Slots sind rein additive Extra-Abschnitte danach, kein Ersatz. Erste Slot-UI war zudem zu klickintensiv (Label-Edit-Modus, Uhrzeit-Klick-zum-Öffnen, 10-Button-Activity-Grid, zweistufiges Anlegen) — auf direkte Inline-Inputs + Dropdown + Ein-Schritt-Eingabe vereinfacht.
- **`time`-Feld pro Slot wieder entfernt** (gleicher Tag): war auf der falschen Annahme aufgebaut, Sessions würden live im Gym geloggt — tatsächlich immer nachträglich, ein Auto-`new Date()`-Zeitstempel beim Anlegen war erfundene Präzision. Merke für zukünftige Agenten: **fitness-dev wird nie live im Gym bedient**, jedes Feature-Design für Session-Logging muss von retrospektiver Batch-Eingabe ausgehen (siehe Memory `feedback_no_live_gym_logging`).
- **Index-Bug gefunden + gefixt:** `ExerciseList.jsx` bekam vor Slots immer das volle `exercises`-Array (lokaler Map-Index == globaler Array-Index). Mit Slots rendert sie gefilterte Teilmengen — `updateEx(i,...)`/`removeEx(i)`/etc. hätten dadurch potenziell die falsche Übung getroffen, sobald ein Slot benutzt wurde. Gefixt via `__i`-Property (echter Index) statt lokalem `idx`, siehe ARCHITECTURE.md. War live deployed, bevor der Bug auffiel — kein bekannter gemeldeter Datenschaden, aber ungeprüft.
- **`addQuick()` erzeugte Übungen ohne `id`-Feld** — nie aufgefallen, weil bis jetzt nichts `ex.id` bei Quick-Adds brauchte; wurde beim DnD-Bau entdeckt (dnd-kit braucht eine stabile, eindeutige Sortable-ID). Gefixt analog zu `addEx()` (`inbox_${slugify(name)}`).
- **Drag & Drop ergänzt:** Übungen sind jetzt per Griff-Icon sortierbar UND zwischen Basis-Abschnitt/Slots verschiebbar (`@dnd-kit`, ein `DndContext` in `SessionEditor.jsx` über alle Container). `@dnd-kit` war zuvor nur transitive Dependency über den Workspace (`cloud_chamber/vitalos`), jetzt explizit in `package.json`.

## Auffälligkeiten (2026-08-20)
- `SessionEditor.jsx`: **Gefixt (2026-08-22).** Gate-Sheet öffnete vorher über die normale Navigation nie automatisch, weil `subTab === 'today'` durch `App.jsx`s URL-Routing nie gesetzt wurde. Jetzt setzt `parseHashRoute()` `subTab = 'today'` explizit bei jedem Einstieg ohne explizites Datum (leerer Hash/PWA-Start-URL, oder `#session/today`) — ein Deep-Link mit explizitem ISO-Datum (Dashboard/Review) setzt weiterhin kein `subTab` und öffnet das Gate nicht.
- `SplitPicker.jsx`: Split-Auswahl leitet sich jetzt automatisch aus den eingetragenen Übungen ab (`inferBlockFromExercises()` in `utils.js`), solange der User selbst noch nichts gewählt hat. `EffortPicker.jsx` (neu) zeigt RPE direkt unter dem SplitPicker statt nur in der Sidebar.

## Auffälligkeiten (2026-08-12)
- `SixPackPromiseCard.jsx`: Übungskategorisierung (Lower/Bottom-up/Top-down/Upper Abs) ist eigene fachliche Einordnung der 10 verifizierten echten Übungsnamen, nicht aus der App selbst bestätigt — vom Nutzer als Vitaltrainer ggf. zu korrigieren.
- `Skills/SkillsCard.jsx`: Skill/Progressions-Daten sind im Component hardcodiert (`SKILLS`-Array), obwohl es seit heute auch `kb/exercises/calisthenics/*.yml` mit identischem Inhalt gibt — kein API-Endpoint verbindet beide, zwei Quellen für dieselben Daten. Bei künftiger Änderung an einer Stelle die andere nicht vergessen (oder auf einen einzigen Ladepfad umstellen).
- `useSession.js` (`getRollingDays`, Zeile ~112): war fix 30 Tage — Date-Picker konnte nie weiter zurück (betraf Klient Matthias, konnte alte Workouts nicht nachloggen). **Gefixt**: Fenster auf 365 Tage erweitert, zusätzlich `DateStrip.jsx` bekam einen echten Kalender-Sprung (natives `<input type="date">`, Icon-Button links) statt nur 3-Tage-Klicks — `setDate()` funktioniert dort auch für Daten außerhalb der 365-Tage-`rollingDays` (nur die horizontale Strip-Hervorhebung greift dann nicht, die Session lädt trotzdem korrekt).
- `getSessionHistory(n)`-Limit (früher fix 60) ist jetzt `historyLimit`-State mit "Mehr laden"-Button in `SessionHistory.jsx` — Fix wirkt identisch für lokalen Dev-Build und Firebase-Prod, da beide `n` direkt in ihre jeweilige Query (Datei-Slice bzw. Firestore `limit(n)`) durchreichen.
- `Skills/SkillsCard.jsx` `WorkoutRunner`: Hold-Typ-Sätze zählen aktuell immer als "geschafft" für `metTarget` (Auto-Unlock), weil der Countdown im UI immer vollständig durchläuft — es gibt keinen Weg, einen Hold als vorzeitig abgebrochen/nicht geschafft zu markieren. Bei reps-Typ funktioniert das korrekt über den Reps-Stepper (Nutzer trägt echte Zahl ein). Für ehrliches Auto-Unlock bei Hold-Skills müsste der Runner einen "Abgebrochen nach Xs"-Pfad bekommen.
- `Skills/SkillsCard.jsx` (2026-08-12, Nutzer-Vorgabe, korrigiert): Front-Lever-Stufen Tuck/Advanced Tuck/Straddle bekamen konkrete sets/seconds aus einer Nutzer-Vorgabe (ersetzen die generischen 3×15s-Defaults). Ein zunächst mit derselben Vorgabe eingeführtes `module`-Feld (Zuordnung zu 3 Ausbildungsmodulen, Coach-Approval/Video-Verification-Konzept) wurde noch am selben Tag wieder entfernt — der zugrunde liegende Web-Agent war laut Nutzer vom Ausbildungskontext verwirrt, das Konzept war unbegründet. `rest_seconds` aus der ursprünglichen Vorgabe (90/120/180s pro Stufe) wurde nie übernommen — `WorkoutRunner` vergibt Pausen pro Rolle (Primär 150s/Sekundär 75s/Conditioning 45s), nicht pro Stufe.
- `Skills/SkillsCard.jsx` `SkillDetailScreen`, manueller "Stufe gemeistert"-Button (2026-08-12): von prominentem Primary-Button auf dezenten Text-Link ("Manuell auf nächste Stufe springen") herabgestuft, damit der Runner (mit `metTarget`-Auto-Unlock) der offensichtliche Hauptweg bleibt und der manuelle Override nicht zum Schummel-Reflex einlädt. `metTarget` selbst verlangt bereits 100%-Erfüllung jedes einzelnen Satzes der Primär-Übung (`.every()`, nicht aggregiertes Volumen) — kein Fast-Fail-Leck. Downgrade wird bereits als eigener `{ reset: true }`-History-Eintrag geloggt und von `SkillLevelChart` als sichtbarer Einbruch dargestellt, nächstes Workout lädt automatisch die neue Stufe (`buildWorkoutBlocks` liest `stage` frisch bei jedem Runner-Start). Sekundär-/Conditioning-Übung werden weiterhin programmatisch abgeleitet (eine Stufe zurück bzw. fix pro Kategorie), nicht explizit pro Stufe im Katalog hinterlegt — bewusste Design-Entscheidung gegen Mehraufwand bei 14 Skills, kein bekannter Fehlerfall. Ein vorgeschlagenes Links/Rechts-Tracking für einseitige Übungen (Archer Pull-Ups, Pistol Squat, One-Arm-Progressionen) wurde explizit abgelehnt ("merkt man eh selber"), nicht gebaut.
- `Skills/SkillsCard.jsx` `WorkoutRunner` (2026-08-12): zwei praktische Ergänzungen. **Crash-Sicherheit** — strukturelle Fortschritts-Punkte (`skillId`, `stage`, `blockIndex`, `setIndex`, `log`, `rpe`, `startedAt`) werden bei jeder Änderung in `localStorage` (`fitness-skills-active-runner-v1`) gesichert, NICHT die laufenden Countdown-Millisekunden (kein 100ms-Schreib-Spam). Schließt der Tab/Browser mitten im Workout, zeigt `SkillDetailScreen` beim nächsten Öffnen desselben Skills+Stufe einen Resume-Banner ("Unterbrochenes Workout gefunden") mit Fortsetzen/Verwerfen — Resume startet den aktuellen Satz immer bei "prep" neu (kein Versuch, einen exakten Countdown-Stand zu rekonstruieren), bereits geloggte Sätze bleiben aber erhalten. Storage wird bei `saveWorkout()` und bei "Abbrechen" (`handleExit`) geleert. **Block überspringen** — Sekundär/Conditioning (nicht Primär, `blockIndex > 0`) kann jederzeit übersprungen werden, springt direkt zum nächsten Block bzw. zu "done", falls letzter Block. Beide Ergänzungen aus einer User-Anfrage, die zusätzlich Plateau-Popup/ZNS-Cooldown-Warnung vorschlug — die wurden explizit abgelehnt (generische SaaS-Nudges mit unverifizierten Schwellwerten, User ist selbst angehender Vitaltrainer und trifft solche Einschätzungen selbst).

## Session-Modi

| Mode | Bedeutung |
|------|-----------|
| `strength` | Krafttraining — ExerciseSection + optionaler ActivityAddon, plus beliebig viele zusätzliche SessionSlots |
| `cardio` | Ausdauer — nur ActivitySection, keine Exercises |

Umschaltbar per Mode-Switcher in der UI. Wird im Session-JSON als `sessionMode` gespeichert. Legacy-Sessions ohne `sessionMode` werden erkannt: hat eine Session `activity` aber keine Exercises → `cardio`.

## Session Gate

Zusätzlich zum bestehenden manuellen Workout-Editor kann eine Session jetzt ein `sessionGate` enthalten:

- `startedAt` markiert den Start des Workouts.
- `endedAt` markiert das Ende.
- ohne Übungen/Activity zählt ein gestartetes oder beendetes Gate trotzdem als geloggter Trainingstag.
- die Oberfläche bleibt absichtlich zweistufig: erst Start/Stop, dann optionales Nachtragen.
- `gps` wird beim Start einmalig erfasst (15s Timeout, `enableHighAccuracy`, Fehlgrund `denied`/`timeout`/`unavailable` landet als Toast) und client-seitig via `lib/geoLocate.js` (Overpass + Nominatim, kein API-Key, kein Server-Roundtrip) aufgelöst: nächstes Gym (250m Radius) > Adresse > rohe Koordinaten. Client-seitig bewusst statt Server-Endpoint, weil der Firebase-Hosting-Build `server.mjs` nicht erreicht. Befüllt `location` nur wenn leer, liefert zusätzlich `mapsUrl` für den Navigation-Icon-Link im Location-Feld.

## Multi-Session pro Tag

Pro Tag können mehrere Workouts existieren (`daySessions`-Array). Sessions haben entweder `id: null` (Hauptsession, Default) oder einen Suffix-String (Timestamp). Switcher-Bar oben zeigt alle Sessions des Tages als Buttons. "+ Neues Workout" legt eine Suffix-Session an. Löschen ist für jede Session der Tagesliste möglich — auch die Hauptsession (seit 2026-07-13, Klienten-Request).

## Autosave / Dirty-Flush

Kein Zeit-Debounce mehr. `scheduleAutoSave()` setzt nur das `dirty`-Flag; gespeichert wird an semantischen Commit-Punkten: sofort bei `addEx`/`addQuick`, sonst via `flushDirty()` bei Tab-Hide/`pagehide`, Unmount (Haupt-Tab-Wechsel), Datumswechsel, Session-Wechsel und neuem Workout. `saveRef`/`dirtyRef`/`dateRef` halten die aktuellen Closures (stale-closure Workaround); der `dateRef`-Guard verhindert, dass der `listSessionsForDate`-Nachlauf eines Flush-Saves nach Datumswechsel die frische Tagesliste überschreibt.

## Datenfluss
- `listSessionsForDate(date)` → alle Sessions des Tages laden — liefert **volle** Session-Objekte (Contract identisch in local `/sessions` + Firestore; meta-only war der Datenverlust-Bug bis 2026-07-12)
- `saveSession(date, data, sessionId)` → dual-write JSON + SQLite
- `getSessionHistory(60)` → prevMap + recentSessions aufbauen
- `getCoverageGaps(recentDays, coverageThreshold)` → Gap-Hints (nur im Strength-Mode)
- `getPlanSuggestion(date)` → Plan-Hint
- `getExercise(id)` → Muskel-Enrichment beim Hinzufügen
- `queueForEnrichment(ex)` → fire-and-forget für non-expert Sources
- `exportFitnessData()` → Obsidian-Sync

## Kernfeatures (müssen nach jedem Refactoring erhalten bleiben)
- **prevMap** — Previous-Stats (Datum + Sätze/Gewicht) unter jeder Übung, aus letzten 60 Sessions
- **restHours** — Stunden seit letztem Training mit gleichem Block/trainingsart
- **muscleRecovery** — Recovery-Hours pro Muskel im ExerciseItem
- **Gap-Hints** — rote Coverage-Lücken-Badges, nur im Strength-Mode
- **Plan-Hint** — Zap-Banner mit Vorschlag für heutigen Block
- **Multi-Session** — mehrere Workouts pro Tag über daySessions + Switcher-Bar
- **Autosave** — Save an Commit-Punkten (addEx/addQuick) + Dirty-Flush bei Tab-Hide, Unmount, Datums-/Session-Wechsel
- **BodyMap** — zeigt alle Exercises der Session (kein `done: true`-Filter)

## Auffälligkeiten
- `coachFeedback` wird geladen und an SidebarSheet übergeben — unklar ob dort editierbar
