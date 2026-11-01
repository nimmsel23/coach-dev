# Fitness Dev

## Repo- und Branch-Rollen

- `dev` ist der Entwicklungsbranch von `fitness-dev`; relevante Änderungen starten den CI-Preview-Deploy.
- `vitalos` ist der Firebase-Release-Branch dieser Fitness-App.
- In `~/vitalos` liegt dasselbe Repo als Submodul `fitness-app`; dessen Gitlink pinnt den Fitness-Commit, den die VitalOS-Shell verwendet.
- Ein Push auf `dev` oder `vitalos` aktualisiert den `fitness-app`-Gitlink in `~/vitalos` nicht selbst. Für einen neuen Shell-Quellstand muss dieser Pointer separat aktualisiert werden.

## Mini-App-Integration

- Plan ist die Quelle für Trainingsplan-/Programmeditor und Planlogik. Coach nutzt einen eigenen Pin unter `coach-dev/modules/plan`; daraus folgt kein automatisches Fitness-Update.
- `vite-miniapp-submodules.mjs` löst die Mini-App-Quellen derzeit zuerst über benachbarte Checkouts auf (`plan-app`/`plan-dev`, entsprechend 6Pack/Skills); historische verschachtelte Pfade bleiben Fallbacks. In diesem Checkout existiert derzeit keine `.gitmodules` und kein Plan-Gitlink.
- Vor Builds und Übernahmen den tatsächlich aufgelösten Quellcheckout samt Commit prüfen. Nicht allein aus alten Submodul-Anweisungen auf den aktuellen Stand schließen.
- Standalone-Releases, Coach-Plan-Pointer, Fitness-Integration und VitalOS-Shell-Pointer sind getrennte Schritte.
- Details zur Zuständigkeit: `docs/PLAN-OWNERSHIP.md`.

## Fitness-Release

- Für Fitness-Prod läuft der Weg `dev` → `master` (PR, `vos-release-pr fitness`) → `vitalos` (`fitness-release`, mergt `origin/master` in `~/vitalos/fitness-app` auf `vitalos`). Danach wird der `fitness-app`-Commit als Gitlink in `~/vitalos` aktualisiert; ein Push von `~/vitalos/master` deployed die Shell samt gepinnten Quellen. Details im Block `release-weg` unten.

<!-- release-weg:start -->
## Release-Weg und Branches (Fitness)

Stand 2026-10-29. Ausführlich: `~/vitalos/docs/DEPLOYMENT.md` (GitHub: nimmsel23/vitalos, `docs/DEPLOYMENT.md`).

**dev → master → vitalos**

| Branch | Rolle | Lokal |
|---|---|---|
| `dev` | Edits und Previews (Preview-Channel `dev`, PR-Channel je PR) | ja — dieser Klon steht fest auf `dev` |
| `master` | **Standalone-Prod** (Hosting-Target `client` = fitness-aos.web.app (plus Training/Atlas); Plan, 6Pack und Skills kommen als Nachbar-Checkouts, nicht mehr als Gitlinks); deployt nur per CI (`Live Deploy (Fitness master)`) | nein, muss nicht existieren |
| `vitalos` | Stand für die Shell (`~/vitalos/fitness-app`); darf hinter `master` liegen | nur als `-app`-Checkout im Meta-Repo |

- Release: `vos-release-pr fitness` öffnet den PR `dev → master`. `Check (Fitness)` läuft, bei Grün mergt der Auto-Merge
  (Merge-Commit) und startet den Live-Deploy per Dispatch. Nie von Hand auf `master` pushen, außer Hotfix.
- Shell: `vos-release fitness` merged `origin/master` nach `vitalos` und bumpt den Pointer im Meta-Repo (deployt die Shell).
  Vorher `vos-overview`.
- `master` wird nie lokal ausgecheckt; `git fetch` genügt. Das Meta-Repo `vitalos` deployt nur noch die Shell.
- Nicht auf `dev` im Hauptordner arbeiten, wenn ein Agent-/Feature-Branch nötig ist: Worktree
  (`git worktree add .worktrees/<name> <branch>`).
- Default-Branch des Repos ist `master`; die `.github/workflows/*.yml` auf `master` bestimmen das Live-Verhalten.
<!-- release-weg:end -->
