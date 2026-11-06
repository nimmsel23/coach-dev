# Audit: Settings

## Zweck
Konfigurationsansicht für Appearance, Training-Präferenzen, SW-Updates, Firestore-Sync und Diagnose — alle Settings leben als lifted State im App-Root und werden als Props durchgereicht.

## Komponenten

| Datei | Zweck | Zeilen |
|-------|-------|--------|
| `index.jsx` | Orchestrierung: hält SW-State + Firestore-State, fetcht Health/Wger/Firestore beim Mount, rendert Sections | 138 |
| `AppearanceSection.jsx` | Theme-Picker (manual/circadian), Layout-Scale-Slider, NavMode (tabs/home), Sidebar-Toggle | 146 |
| `TrainingSection.jsx` | Split/Gender/Location/MuscleLanguage-Picker, Analyse-Sliders (collapsible) | 131 |
| `UpdateSection.jsx` | App-Version Anzeige, SW-Update-Prüfung ("Auf Update prüfen") & Reload-Button | 45 |
| `AdvancedSection.jsx` | Swipe-Navigation, Dashboard-Highlighter-Modus, Firestore-Status-Badge | 73 |
| `LocalDevSection.jsx` | Firestore-Sync-Button, Node-API/wger/Storage-Diagnose — nur sichtbar wenn `isLocalMode()` | 64 |

## Datenfluss

**@db-Funktionen aufgerufen in index.jsx:**
- `api.get('/health')` — Node-API-Status (nur localMode)
- `api.get('/firestore/status')` — Firestore-Verbindungsstatus (nur localMode)
- `api.post('/firestore/sync', {})` — manueller Sync-Trigger (nur localMode)
- `fetch('http://localhost:8000/api/v2/language/?format=json')` — wger Docker-Check (direktes fetch, nicht über api-Helper, nur localMode)
- `isLocalMode()` — Guard für LocalDevSection und alle drei API-Calls

**State in index.jsx (lokal, nicht geliftet):**
- `health` — `{ ok: bool }` oder `null`
- `wger` — `bool` oder `null`
- `firestoreStatus` — `{ ok: bool, project? }` oder `null`
- `syncing` — `bool`
- `swVersion` — String vom SW via postMessage
- `swUpdateAvailable` — `bool`, gesetzt via `sw-update-available` Window-Event oder `reg.waiting`
- `swChecking` — `bool`

**Props die index.jsx von außen bekommt (alle geliftet, kein eigener Persist):**
`layoutScale/setLayoutScale`, `gender/setGender`, `split/setSplit`, `cycleLength/setCycleLength`, `defaultLocation/setDefaultLocation`, `recentDays/setRecentDays`, `coverageThreshold/setCoverageThreshold`, `showAdvanced/setShowAdvanced`, `themeMode/setModeState`, `circLight/setCircLight`, `circDark/setCircDark`, `themes/theme/setThemeState`, `sidebarPinned/setSidebarPinned`, `navMode/setNavMode`, `muscleLanguage/setMuscleLanguage`, `swipeEnabled/setSwipeEnabled`

**Props-Weitergabe:**
- `AppearanceSection` — bekommt alles Appearance-relevante (navMode, sidebarPinned, layoutScale, themeMode, circLight/Dark, themes/theme)
- `TrainingSection` — bekommt Training-Prefs + SW-State + SW-Handler-Callbacks
- `LocalDevSection` — bekommt firestoreStatus, syncing, onSync, health, wger
- `AdvancedSection` — bekommt swipeEnabled (kein firestoreStatus). `dashboardHighlighter` wurde 2026-07-12 entfernt (Dashboard-Tab ist nach vitalos umgezogen, dort eigene State-Verwaltung).

## Inline-Code (Extraktionskandidaten)

- **SW-Logik in index.jsx** (Zeilen 33–88): `useEffect` für SW-Version + `handleSwCheck` + `handleSwApply` sind eigenständige Logik-Einheit. Könnten als `useServiceWorker()` Custom Hook extrahiert werden.
- **Firestore-Fetch-Block in index.jsx** (Zeilen 66–88): `useEffect` + `handleSync` könnten als `useFirestoreStatus()` Custom Hook raus.
- **Status-Badge-Pattern** ist identisch in `LocalDevSection` und `AdvancedSection` (grün/rot Span für Firestore): könnte als `<StatusBadge ok={bool} />` Mini-Komponente zentralisiert werden.
- **Pill-Button-Gruppe** (Training Split, Gender, Location, MuscleLanguage, NavMode — alle gleiche Struktur): könnte als `<SegmentedControl options={[]} value={v} onChange={fn} />` extrahiert werden — ist 5x fast identisch gebaut.
- **Collapsible-Section** mit ChevronDown in `AppearanceSection` und `TrainingSection`: identisches Pattern, je ein lokaler `useState(false)` + ChevronDown-Rotation — könnte `<CollapsibleSection label="">` werden.

## Kernfeatures (müssen nach jedem Refactoring erhalten bleiben)

- **Circadian Theme Mode**: `themeMode === 'circadian'` zeigt zwei Selects (Light/Dark je für Tag/Nacht) statt der manuellen Farbpalette — komplette Branch-Logik in `AppearanceSection`
- **LocalDevSection nur bei `isLocalMode()`**: Die Section rendert nicht + die drei API-Calls laufen nicht wenn `isLocalMode()` false ist — kein Leak in Firebase-Build
- **SW-Update-Flow**: `swUpdateAvailable` triggert zwei unterschiedliche Button-States (Prüfen vs. Aktualisieren & Reload). `handleSwApply` postet `SKIP_WAITING` an den wartenden SW; falls kein `reg.waiting`, einfaches Reload als Fallback
- **`sw-update-available` Window-Event**: index.jsx hört auf dieses Custom-Event (gesetzt von außen, vermutlich im SW-Register-Code) — Listener wird im Cleanup korrekt entfernt
- **`window.__swRegistration`**: globale Referenz auf SW-Registration (gesetzt beim App-Start irgendwo außerhalb Settings) — SW-Check und Apply greifen darauf zu
- **AdvancedSection nur wenn `showAdvanced`**: die ganze Section + ihre Felder sind hinter dem Toggle in TrainingSection versteckt
- **Firestore-Status in beiden Sections**: `firestoreStatus` wird sowohl in `LocalDevSection` (mit Sync-Button) als auch in `AdvancedSection` (nur Badge) gezeigt — dieselbe Prop, unterschiedliche Darstellung
- **`alive`-Flag in useEffect**: verhindert State-Update nach Unmount beim parallelen Fetch von health/wger/firestoreStatus

## Auffälligkeiten

- **wger-Fetch direkt mit `fetch()`**, nicht über `api`-Helper — hardcoded `http://localhost:8000`. In anderen Builds/Umgebungen potentiell broken, aber durch `isLocalMode()`-Guard abgesichert.
- **`swChecking` Reset per `setTimeout(..., 600)`** in `handleSwCheck` — **behoben (2026-08-20)**: `mountedRef` in `index.jsx` verhindert jetzt den State-Update nach Unmount.
- **`layoutOpen` und `slidersOpen`** sind lokale Collapsible-States in AppearanceSection/TrainingSection — werden nicht persistiert, resetten bei Tab-Wechsel auf closed. Eventuell absichtlich, aber nach Refactoring leicht vergessen.
- **`themes` Prop**: wird in `AppearanceSection` als Objekt genutzt (`Object.keys(themes).length`, `themes[id]`), aber nie in `index.jsx` selbst — kommt direkt vom App-Root durch.
- **`navMode`-Toggle ist `lg:hidden`**: Die Mobile-Navigation-Sektion in AppearanceSection ist CSS-hidden auf Desktop. Ein Desktop-User sieht die Option nicht — kein Bug, aber unklar ob Absicht oder vergessen.
- **`AdvancedSection`** bekommt kein `firestoreStatus` — war früher so, ist behoben, kein doppelter Status mehr (nur noch in `LocalDevSection`).
- **Health/Wger-Loading-State war bereits vorhanden** (`'…'` bei `null`) — die vorherige Version dieses Audits behauptete hier fälschlich einen fehlenden Loading-State; Stand jetzt zeigt Diagnose nie `FAIL` vor Ankunft der Fetch-Antwort.

## Status

Redesign 2026-08-20 (Concept A / "Ruhig", konsistent mit Session/Learn/Review):
alle Sections von `font-black uppercase tracking-widest` auf sentence-case
`font-semibold`/`font-medium` umgestellt, Karten-Padding/Radien vereinheitlicht,
harte `border-t-4`-Akzente entfernt. Struktur ist sauber aufgeteilt, keine
kritischen Bugs mehr offen. Viel Wiederholung beim Segmented-Control-Pattern
die bei einem Refactoring als erstes raus sollte.
