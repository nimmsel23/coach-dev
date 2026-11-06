# Muscles Module Architecture

Muskelabdeckungs- und Superkompensations-Analyse mit interaktiver Body-Map. War früher aktiver Nav-Tab — aktuell nicht in der Navigation, aber vollständig implementiert und einbindbar.

## Komponenten

- **`index.jsx`**: Haupt-Container — State (days, loading, showDetailed), Datenfetch. Die eigentliche Score-Berechnung (`computeMuscleScores`) lebt seit 2026-08-06 in `../../lib/superkompensation.js` (geteilt mit dem Readiness-SubTab in WeeklyReview, siehe `WeeklyReview/ARCHITECTURE.md`) — nicht mehr inline in dieser Datei.
- **`MuscleHeader.jsx`**: Zeitraum-Toggle (7/14/28d) + Map-Mode-Toggle (Standard / Detailliert).
- **`MuscleBodyMap.jsx`**: Standard-Heatmap (Anterior + Posterior) via `BodyMap`-Komponente, coloriert nach HIT-Score.
- **`MuscleDetailedMap.jsx`**: Granulare anatomische Karte via `DetailedMuscleMap`, mit Side- und Gender-Toggle (lokal verwaltet).
- **`MuscleAnalysis.jsx`**: Textuelle Statusliste — Muskeln kategorisiert nach heavy / recovering / supercomp / ready.
- **`MuscleInsights.jsx`**: Ein-Satz-Coaching-Hinweis basierend auf HIT-Analyse.

## Datenfluss

- Die Heute-Karte lädt mit `listSessionsForDate()` alle Workouts des lokalen Tages und kombiniert deren Übungen.
- Die Sessionliste filtert die Historie auf das gewählte lokale Kalenderfenster; beim Öffnen wird die angeklickte Session direkt an das Detailmodal übergeben, auch wenn mehrere Sessions dasselbe Datum haben.
- `getSessionHistory(60)` → letzte 60 Sessions (Basis für `lastSeen`-Berechnung)
- `getAllExercises()` → KB-Map für Muskel-Lookup (custom YAML überschreibt Session-Daten)
- `getMuscle(selectedMuscleId)` → `AnatomyDetailModal` bei Muskel-Klick

## HIT-Kategorien (nach Stunden seit letztem Training)

| Kategorie | Schwelle |
|-----------|----------|
| heavy | < 72h |
| recovering | 72–96h |
| supercomp | 96–168h |
| ready | > 168h, Cardio, oder nie |

## Anatomy Explorer (implementiert)

Muskel-Klick in beiden Map-Modi öffnet `AnatomyDetailModal` mit Ursprung, Ansatz, Innervation — via `getMuscle(id)`. Cardio-Aktivitäten beeinflussen `lastSeen` für Beinmuskeln, werden aber nie als `strength` klassifiziert.
