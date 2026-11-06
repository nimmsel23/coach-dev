# src/ — Übersicht

Stand: 2026-06-22

Einstiegspunkt für alle, die sich im Quellcode orientieren wollen.
Jede View hat eine eigene `AUDIT.md` (aktueller Zustand) und `ARCHITECTURE.md` (Komponentenstruktur).

---

## App.jsx — Root-Orchestrator

Hält den gesamten App-State: Auth, aktiver Tab, Themes, Layout-Präferenzen, Swipe-Navigation, Taxonomy.
Rendert Sidebar (Desktop), MobileNav (Mobile), ExerciseInsightModal (global) und den aktiven View.

**Zwei Nav-Modi** (persistiert in `localStorage`):
- `tabs` — klassische Tab-Navigation (Standard)
- `home` — AppGate als Hub-Startscreen, Views schieben sich von unten hoch

**Federation-Mode** (`VITE_FEDERATION=true`): Learn wird als lazy Remote-Modul geladen statt aus lokalen Views.

---

## Views (`src/views/`)

### Aktive Nav-Tabs

| Tab-ID | Label | View | Import-Art |
|--------|-------|------|------------|
| `dash` | Heute | `Dashboard/` | direkt |
| `session` | Training | `Session/` | direkt |
| `review` | Review | `WeeklyReview/` | direkt |
| `learn` | Lernen | remote `learn/LearnApp` | lazy Federation |
| `settings` | Setup | `Settings/` | direkt |

### Versteckte Views (kein Nav-Tab, per URL erreichbar)

| Hash | View | Zugang |
|------|------|--------|
| `#coach` | `Coach/` | nur für lokale Instanz / alpha-User |
| `#inbox` | `Inbox/` | kein Einstiegspunkt für User, kein Badge |
| `#gate` | `AppGate.jsx` | nur wenn `navMode=home` |

### Aktive Sub-Views (kein Nav-Tab, aber eingebunden)

| Ordner | Eingebunden in | Status |
|--------|---------------|--------|
| `Muscles/` | `WeeklyReview/` als Subtab `muscles` | ⚠️ AKTIV — NICHT als inaktiv markieren |

### Inaktive Views (Code vorhanden, nicht eingebunden)

| Ordner | Status |
|--------|--------|
| `Habits.bak2/` | Archiviert. Habits läuft jetzt als Federation-Remote. |
| `Journal.bak2/` | Archiviert. Journal läuft jetzt als Federation-Remote. |

---

## Components (`src/components/`)

### Flat (shared, view-übergreifend)

| Datei | Zweck |
|-------|-------|
| `ExerciseInsightModal.jsx` | Globales Modal für Übungsdetails — wird von App.jsx gehalten, alle Views rufen `onInspectExercise()` auf |
| `ExerciseSearchOverlay.jsx` | Vollbild-Suche (lokal + wger + yuhonas) mit Favoriten |
| `AnatomyDetailModal.jsx` | Muskel-Detail-Modal (Ursprung, Ansatz, Innervation) — per Muskel-Klick in BodyMap |
| `BodyMap.jsx` | Anterior/Posterior BodyMap via `react-body-highlighter` — Input: `[{ slug, muscles, frequency }]` |
| `DetailedMuscleMap.jsx` | Granulare anatomische Karte (70+ Regionen) via `react-muscle-highlighter` — Input: `groupScores { [group]: { score, color } }` |
| `MuscleHighlightMap.jsx` | Heatmap-Variante, nutzt `body-muscles` BodyChart — Input: `bodyState { [granularId]: { intensity, selected } }` |
| `HabitWidget.jsx` | Habit-Übersicht (fetcht selbst, kein Prop-Drilling) |
| `HabitJournalModal.jsx` | Modal für Habit-Notizen |
| `PlanBuilder.jsx` | Trainingsplan-Generator-UI |
| `WeightChart.jsx` | Gewichtsverlauf 30 Tage (fetcht selbst) |
| `TabSettingsModal.jsx` | Tab-Konfiguration |

### `dashboard/`

| Datei | Zustand |
|-------|---------|
| `DashboardWidget.jsx` | Wrapper: Click-to-navigate, Doppelklick-Modal, Drag-Handle |
| `DashboardHeader.jsx` | Header mit Export + Edit/Reset-Buttons |
| `SessionStatus.jsx` | Plan-Vorschlag + letzte 3 Sessions |
| `ActivityHeatmap.jsx` | 10-Tage-Raster, klickbar |
| `MuscleBody.jsx` | BodyMap-Widget im Dashboard-Grid |
| `MuscleCoverage.jsx` | Gap-Liste unter Threshold |
| `HealthWidget.jsx` | Fitbit-Vitals (Gewicht, Schlaf, Schritte, HR) — **nicht im Dashboard-Grid registriert** |
| `MuscleStatus.jsx` | Alter Wrapper (MuscleBody + Coverage) — **toter Code**, nicht mehr verwendet |
| `utils.js` | `getRolling10Days()`, `DAY_LABELS` |

### `layout/`

| Datei | Zweck |
|-------|-------|
| `Sidebar.jsx` | Desktop-Sidebar mit Nav-Links |
| `MobileNav.jsx` | Mobile Bottom-Bar mit Swipe-Hint |

### `common/`

| Datei | Zweck |
|-------|-------|
| `ErrorBoundary.jsx` | React Error Boundary (global in App.jsx) |
| `UserProfile.jsx` | User-Avatar + Auth-State |

---

## Lib (`src/lib/`)

### `db/` — Datenzugriffsschicht

Alle Komponenten importieren via `@db` (Vite-Alias → `src/db.js` Barrel).
Kein direktes `fetch()` in Views — alles läuft durch diese Schicht.

| Datei | Zuständigkeit |
|-------|---------------|
| `core.js` | `api`-Helper (fetch-Wrapper), `isLocalMode()`, `watchAuth()` |
| `sessions.js` | `getSession`, `saveSession`, `getRecentSessions`, `getProgressTrend`, `getPlan`, `getPlanSuggestion` |
| `journal.js` | `getJournal`, `saveJournal`, `getJournalHistory` |
| `habits.js` | `getHabits`, `recordHabit`, `unrecordHabit` |
| `kb.js` | `getExercise`, `getAllExercises`, `searchExercises`, `getAnatomy`, `getMuscle`, `approveInbox`, `deleteInbox`, `getInbox`, `getGlobalInbox`, `queueForEnrichment` |
| `analysis.js` | `getDashboardAnalytics`, `getMuscleCoverage`, `getWeeklyReport`, `getCoverageGaps` |
| `user.js` | `getSettings`, `saveSettings`, `getBodyEntry`, `getBodyEntries` |
| `utils.js` | `parseQuick`, `exportCsv`, `exportFitnessData` |

**Firebase-Build**: `@db` zeigt auf `src/db.firestore.js` (direkte Firestore SDK statt Node-Server).

### Weitere lib-Dateien

| Datei | Zweck |
|-------|-------|
| `exerciseInsights.js` | `buildSessionCoachSheet()` — strukturierte Coach-Daten aus Session |
| `muscleMap.js` | `useMuscleMap()` Hook — Slug-Tabelle (YAML-basiert) für BodyMusclesMap-Highlighting |
| `translations.js` | `translateMuscle(region, taxonomy, lang)` — Muskelname DE/EN |
| `utils.js` | Shared Helpers (datumsBerechnungen etc.) |

---

## Constants (`src/constants/`)

| Datei | Inhalt |
|-------|--------|
| `NavigationItems.js` | `NAV_ITEMS` (Standard + Federation-Variante), `VALID_TABS` |
| `Themes.js` | `THEMES` — alle Theme-Definitionen (CSS-Variablen-Map) |
| `MuscleIcons.js` | `getMuscleIcon(name)` — Muskelgruppe → Lucide-Icon |
| `ActivityConstants.js` | Aktivitäts-Typen + Farben für Heatmap |

---

## Bekannte Baustellen

| Problem | Ort | Priorität |
|---------|-----|-----------|
| `HealthWidget.jsx` nicht registriert | `dashboard/` | niedrig |
| `MuscleStatus.jsx` toter Code | `dashboard/` | niedrig |
| `showDetails`-State ohne Panel | `Session/ExerciseItem.jsx` | offen |
| `trainingsart` ohne UI-Input | `Session/index.jsx` | offen |
| `taxonomy` nicht weitergegeben | `WeeklyReview/index.jsx` | stille Zeitbombe |
| `navigate`-Prop ungenutzt | `Dashboard/index.jsx` | toter Slot |
| Viele `.bak`-Dateien in `lib/` + `constants/` | überall | aufräumen |
