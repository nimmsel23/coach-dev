# Session-Tab Rebuild — Phase 1: Klein & isoliert (zuerst)

Quelle: Haiku-Doppel-Audit 2026-09-05 (DB-Layer + UI-Reihenfolge), siehe
`AUDIT.md` für den Gesamtkontext. Ziel dieser Phase: risikoarme, kleine
Stücke sauber ziehen, ohne den Rest anzufassen.

## Stücke

- [x] **SplitPicker.jsx** (~65 Z.) — sauber isoliert (nur `block`/`setBlock`
      Props). Duplikat-Check gemacht (Sonnet-Agent, 2026-09-05): `SPLITS`-
      Vokabular auch in `src/components/PlanBuilder.jsx` (`push_day`/
      `pull_day`/`legs_day`/`full_body`-Templates, "Full Body" statt "Full")
      und `src/views/WeeklyReview/ReviewPPLBalance.jsx` (nur push/pull/legs
      + Muskel-Region-Zuordnungen) — bewusst NICHT zusammengeführt (zu
      riskant für diese Phase), nur als Kommentar im Code dokumentiert.
      `utils.js::normalizeBlock()` kennt das "Full"/"Full Body"-Mismatch
      bereits separat.
- [x] **EffortPicker.jsx** (~50 Z.) — sauber isoliert (nur `effort`/`setEffort`
      Props). Farbtoken-Umstellung gemacht (Sonnet-Agent, 2026-09-05):
      `#22c55e`→`var(--green)`, `#fb923c`→`var(--orange)`,
      `#ef4444`→`var(--red)` (verifiziert gegen `src/styles/themes/*.css`).
      `#f59e0b` (mittlerer RPE-Bereich) hat KEINEN passenden Token im
      Projekt (Themes kennen nur --green/--red/--orange) — bewusst als
      Hex-Wert belassen statt einen neuen Token zu erfinden, im Code
      kommentiert.
- [x] **Toast** → extrahiert nach `SessionToast.jsx` (Sonnet-Agent,
      2026-09-05). Korrektur zur ursprünglichen Annahme: es gab bereits ein
      Auto-Clear (`showToast()` in `useSession.js` setzt
      `setTimeout(() => setToast(''), 2200)`, einziger Schreibpfad für
      `toast`) — kein zusätzlicher Timer ergänzt, nur JSDoc-Hinweis für
      künftige Leser.
- [x] **Speichern-FAB (Mobile)** → extrahiert nach `SessionSaveFab.jsx`
      (Sonnet-Agent, 2026-09-05). `bottom-24` ersetzt durch
      `calc(6rem + env(safe-area-inset-bottom))` (kein `pb-safe`-Utility im
      Projekt vorhanden, daher inline style).
- [x] **Activity-Addon-Historie** → extrahiert nach
      `ActivityAddonHistory.jsx` (Sonnet-Agent, 2026-09-05), mit
      JSDoc-Kommentar zur Naming-Klarstellung `activityAddons` (Historie)
      vs. `activity` (aktueller Entwurf).

## Definition of Done pro Stück

1. In eigene Datei extrahiert (falls noch inline).
2. Props-Interface klar dokumentiert (JSDoc-Kommentar reicht).
3. Kein Verhaltensunterschied zum Ist-Zustand (reines Refactoring, keine
   Feature-Änderung in dieser Phase).
4. Kurzer manueller Test im Browser (Session anlegen, Feld ändern, speichern).

## Nicht in dieser Phase

ExerciseCard/ExerciseList/SessionSlots/ActivityAddon+ActivitySection-Merge/
useSession.js — siehe [[PHASE2_TODO]] / [[PHASE3_TODO]].
