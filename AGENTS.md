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
- **Vollständige Deploy-Doku:** `docs/DEPLOY.md` (Release-Weg, Lockfile, Standalone-Zielbild, Shell-Kopplung, Fehlerbild→Ursache).
- **Ein Befehl für beide Schritte:** `fitness-ship` (= `vos-ship fitness`, liegt in `~/vitalos/bin`) macht `dev` → `master` (PR) → `vitalos` in einem Lauf: Preflight, PR, auf Checks und Auto-Merge warten, auf den Live-Deploy warten, dann `vos-release fitness`, am Ende startet er einen am Lockfile gescheiterten Live-Deploy neu. `--dry-run` zeigt den Plan und ändert nichts, `--yes` nur nach ausdrücklicher Freigabe. Scheitert `vos-release` am Lockfile des Meta-Repos, zieht das Skript ihn selbst nach (nur `pnpm-lock.yaml`, Pathspec-Commit) und wiederholt `vos-release`; ein am Lockfile gescheiterter Live-Deploy wird danach neu gestartet.
- **⚠️ Lockfile ist wahrscheinlich ein Problem (nicht überraschen lassen):** `Live Deploy (Fitness master)` checkt das Meta-Repo `vitalos` (master) aus und läuft dort mit `pnpm install --frozen-lockfile` gegen dessen `pnpm-lock.yaml`. Der PR-Merge `dev → master` startet diesen Deploy sofort, der Lockfile im Meta-Repo wird aber erst im zweiten Schritt (`fitness-release` → `pre-commit`-Hook `vos-sync-submodule-pointers`, `pnpm install --lockfile-only`) nachgezogen. Sobald sich `package.json` ändert (neue/gebumpte Dependencies, Dependabot), scheitert der erste Live-Deploy deshalb mit `ERR_PNPM_OUTDATED_LOCKFILE` bei „Install (Workspaces)". Das ist ein Reihenfolge-, kein Code-Problem. Vorgehen: `fitness-release` laufen lassen (zieht den Lockfile nach) und danach den Live-Deploy neu starten (`gh workflow run "Live Deploy (Fitness master)" -R nimmsel23/fitness-dev --ref master`). Vor dem Release mit `git diff origin/master origin/dev -- package.json` prüfen, ob das droht.
- **Erledigt (2026-11-01):** `@vos/cross-app-aliases` ist aus `fitness-dev` entfernt (nur `@relax`/`@learn` gebraucht, Auflösung über `siblingDir()`); damit kippt der pfadabhängige `link:` im Lockfile nicht mehr zwischen `~/dev/fitness-dev` und `~/vitalos/fitness-app`. Zusätzlich toleriert `vos-release` im `-app`-Worktree eine reine `link:`-Umschreibung in `pnpm-lock.yaml` (Option A, nur wenn ausschließlich `link:`-Zeilen geändert sind).
- **Option B ist als „Lite" umgesetzt (in `vos-ship`), die volle Variante geht nicht ohne Workflow-Umbau:** Das Meta-Repo hat zwei Workflows, die bei **jedem** Push auf `vitalos master` mit `--frozen-lockfile` gegen die **gepinnten** Submodule bauen (`deploy-shell.yml`, `deploy-vos-fitness.yml`). Würde man den Lockfile vor dem Merge pushen, solange der Pointer noch auf das alte `fitness-app` zeigt, würden die rot — man tauscht nur einen roten Run gegen den anderen. Lockfile und Pointer müssen deshalb **zusammen in einem Push** raus (so macht es `vos-release`). Der Standalone-`Live Deploy (Fitness master)` feuert aber schon beim Merge nach `master`, vorher. Folge: **Bei geänderten Dependencies ist der erste Live-Deploy-Run immer einmal rot** und wird von `vos-ship` neu gestartet. Beheben ließe sich das nur im Workflow selbst: `deploy-master.yml` müsste den Lockfile in der CI nachziehen (`pnpm install --lockfile-only --no-frozen-lockfile`, danach frozen) oder ohne Root-Lockfile bauen. Das schwächt die Reproduzierbarkeit der Prod-Pipeline und braucht eine eigene Entscheidung (nicht umgesetzt).
- **Hinweis `vos-release-pr`:** Bei mehr als 30 Commits zwischen `dev` und `master` bricht das Skript mit Exit 141 (SIGPIPE durch `git log … | head -30` unter `pipefail`) ab, ohne PR. Dann PR von Hand mit `gh pr create` anlegen (Konfliktcheck: `git merge-tree --write-tree --name-only origin/master origin/dev`).

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

## Coach ↔ Klienten-Kommunikation (2026-11-01)

Details: [docs/COACH-COMMUNICATION.md](docs/COACH-COMMUNICATION.md). Fitness besitzt
die Klienten-Inbox und bindet deren Gesprächspfad an die tatsächliche Firebase-
Auth-UID. Coach besitzt seine Klientenauswahl; VitalOS besitzt die Regeln.
`coachConversations` nicht mit Katalog-Inbox/Enrichment oder Session-Kommentaren
vermischen. Neue Rules müssen vor App-Veröffentlichung im VitalOS-Owner freigegeben
sein. Keine offenen Fallback-Regeln, automatische realen Testnachrichten oder
zweite Klienten-Registry. Aktuelle Limits/Release-Nachweise im gemeinsamen Runbook.
