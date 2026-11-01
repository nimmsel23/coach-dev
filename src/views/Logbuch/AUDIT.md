# Audit: Logbuch

## Zweck
Makro-Sicht auf alle Sessions: pro Übung zuletzt/Gipfel/Rekorde, Rhythmus über Wochen, Wochen-Chronik.

## Komponenten
| Datei | Zweck |
|-------|-------|
| `index.jsx` | Shell, Linsen, Filter, KPIs |
| `useLogbook.js` | Historie laden + aggregieren |
| `logbookStats.js` / `.test.mjs` | Aggregation + 8 Unit-Tests (`node --test`) |
| `ExerciseCodex.jsx` | Übungs-Kodex + Dossier |
| `PeakProfile.jsx` | Gipfel-Profil (SVG) |
| `RecordChronicle.jsx` | Rekord-Chronik |
| `RhythmGrid.jsx` | Stempelkarte Übung × Woche |
| `WeekChronik.jsx` | Wochen-Timeline (read-only Ableger von SessionHistory) |

## Stand 2026-10-31 (Erstversion)
- Geprüft: ESLint sauber, `vite build` ok, Unit-Tests grün, SSR-Screenshot mit echten lokalen Daten.
- **Nicht** gegen Firestore-Prod-Daten oder im laufenden Dev-Server getestet (`:9100` war nicht gestartet).

## Auffälligkeiten / offen
- Übungen werden nach `exercise_id` bzw. Namens-Slug gruppiert: dieselbe Übung unter zwei Namen
  (Sprachmix, mit/ohne ID) erscheint doppelt. Zusammenführen bewusst nicht automatisiert.
- Körpergewicht-Übungen mit eingetragenem Körpergewicht als `weight` (z. B. Dips 84 kg) laufen im
  Modus `load` — der Score ist dann das Körpergewicht-1RM, nicht die Wiederholungszahl.
- `getSessionHistory(2000)` ist lokal ein Sessions-Limit, in Firestore ein Tage-Limit.
- Kodex rendert alle Übungen ohne Virtualisierung — bei mehreren hundert Übungen Pagination ergänzen.
