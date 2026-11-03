# Weekly Review Module Architecture

This folder contains the modularized components for the Weekly Performance Review view.

## Component Structure

- **`index.jsx`**: Main container. Manages state for the selected week, loading status, and coordinate data fetching from `getWeeklyReport`.
- **`ReviewHeader.jsx`**: The top section with "Performance Review" title and the week selection input.
- **`ReviewOverview.jsx`**: Displays core metrics like total session count and volume/recovery focus (HIT mode).
- **`ReviewInsights.jsx`**: Shows textual recommendations and lists "Coverage Gaps" (untrained muscle regions).
- **`ReviewMuscleImpact.jsx`**: Visualizes relative muscle load using bar charts.
- **`ReviewSessionList.jsx`**: A chronological list of sessions with date cards and recovery indicators. Its navigation callback includes the selected session as a third argument, so workouts on the same date stay distinct.
- **`ReviewTopExercises.jsx`**: Displays the most frequent exercises of the week with deep-dive inspection (Coaching Notes, Errors).
- **`utils.js`**: Helper functions like `formatRecovery`.

## SubTabs (`report` | `muscles` | `readiness` | `strength` | `verlauf`)

`index.jsx` switches on `subTab` between the default weekly report and four
nested views:
- **`readiness`** → `ReviewReadiness.jsx` — Overall-Readiness-Score, ACWR
  (Acute:Chronic Workload Ratio), Tages-Empfehlung, Regenerations-Matrix.
  Scoring kommt aus `../../lib/superkompensation.js` (geteilt mit dem
  Muskeln-Tab, `views/Muscles/index.jsx`) — bewusst dieselbe Datenquelle,
  damit Readiness und Muskeln-Tab nie auseinanderlaufen.
- **`strength`** → `ReviewStrengthMatrix.jsx` — 1RM-Rechner (Epley/Brzycki/
  Wathan-Konsens) + prozentuales Last-/Rep-Spektrum. Rein clientseitige
  Berechnung, keine Session-Daten involviert.
- **`muscles`** → `../Muscles/index.jsx` (Superkompensations-Body-Map).
- **`verlauf`** → `ReviewHistory.jsx` (chronologische Session-Liste).

Bis 2026-08-06 lebten Readiness und Stärke-Matrix in einer einzigen
`ReviewReadinessMatrix.jsx` mit eigenem, vom Muskeln-Tab abweichendem
Recovery-Modell — aufgetrennt + auf geteiltes Scoring umgestellt.

## Intelligence Features (Local Super-Version)
- **Obsidian Sync**: Direct export of the weekly report to the local markdown vault.
- **Deep Inspection**: Clicking an exercise in `ReviewTopExercises` opens a full biomechanical profile including coaching notes and common errors.

## Data Flow

The rolling monthly report cache is scoped to the signed-in user and local calendar day; saving or deleting a session invalidates it. A pending calculation is discarded or retried if invalidated during loading.

1.  **Selection**: User changes the `week` in `ReviewHeader`.
2.  **Fetching**: `index.jsx` triggers a re-fetch via `db.js` (`getWeeklyReport`).
3.  **Distribution**: Data is passed down to specialized presentational components.
4.  **Navigation**: `ReviewSessionList` uses `onNavigate` to jump to specific session details in the main app.

## Update 2026-10-15 — Stärke-Matrix ist nach Learn umgezogen

Der SubTab `strength` (`ReviewStrengthMatrix.jsx`, 1RM-Rechner) existiert im Review nicht mehr.
Die Komponente lebt jetzt im Learn-Tab (`learn-dev`: `src/views/Learn/StrengthMatrix.jsx`, Header-Tab
„Stärke", Sub-Tab-ID `strength`). Alte Deep-Links `#review/strength` werden in `App.jsx`
(`parseHashRoute`) auf `learn/strength` umgeleitet.
