# Plan-Quelle und Coach-Einbindung

Stand: 2026-10-30.

- `~/plan-dev` besitzt Trainingsplan-/Programmeditor und Planlogik. Änderungen
  daran werden dort implementiert; Fitness pflegt keinen zweiten Editor.
- Coach nutzt diesen Code über sein gepinntes Submodul `modules/plan`. Dort
  werden geprüfte Plan-Commits bewusst übernommen; Rollen und Klientenwahl
  bleiben Coach-Aufgaben.
- Fitness ist ein separater Verbraucher. `vite-miniapp-submodules.mjs` sucht
  derzeit zuerst benachbarte `plan-app`-/`plan-dev`-Checkouts und erst danach den
  historischen verschachtelten `plan`-Pfad. Im geprüften `fitness-dev/dev` gibt
  es derzeit keinen Plan-Gitlink und keine `.gitmodules`.
- Ein Coach-Pointer-Bump aktualisiert Fitness, die eigenständige Plan-Website
  und den VitalOS-Shell-Pointer nicht. Für Builds/Übernahmen immer den tatsächlich
  aufgelösten Plan-Checkout und dessen Commit prüfen.
- Klientenpläne bleiben unter `fitness/{uid}/macrocycles`, Workout-Vorlagen unter
  `routines` mit Übungs-Subcollections, Trainingslogs unter `workouts`. Entwurf,
  veröffentlichter Snapshot und absolvierte Trainings bleiben getrennt.

Details: `plan-dev/docs/PLAN-COACH-INTEGRATION.md` und
`coach-dev/docs/COACH-PLAN-WORKFLOW.md`. Dieser Dokumentationsstand ändert keine
Fitness-Integration, Daten, Gitlinks oder Deployments.
