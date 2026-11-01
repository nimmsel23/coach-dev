# Fitness — Deploy, Release und Lockfile

Stand 2026-11-01. Kurzfassung für Agents: `AGENTS.md` (Abschnitt „Fitness-Release"). Hosting/Firebase im
Detail: `docs/FIREBASE.md`. Meta-Repo und Shell: `~/vitalos/docs/DEPLOYMENT.md`.

## 1. Release-Weg (nur in eine Richtung)

`dev` → `master` → `vitalos`. Rückwärts wird nur gemergt, wenn am falschen Checkout editiert wurde.

| Branch | Rolle | Wohin |
|---|---|---|
| `dev` | Edits, Previews | Preview-Channel, PR-Check |
| `master` | **Standalone-Prod** (`fitness-aos.web.app`, Target `client`) | Live-Deploy per CI |
| `vitalos` | stabiler Stand für die **Shell** (`~/vitalos/fitness-app`); darf hinter `master` liegen | Shell-Build im Meta-Repo |

Ein Befehl für beide Schritte: **`fitness-ship`** (= `vos-ship fitness`, liegt in `~/vitalos/bin`).

```
fitness-ship --dry-run   # Preflight + Plan, ändert nichts
fitness-ship             # fragt vor dem Start nach
fitness-ship --yes       # ohne Rückfragen — nur nach ausdrücklicher Freigabe
```

Ablauf: Preflight → PR `dev`→`master` → CI-Checks → Auto-Merge → Live-Deploy → `vos-release fitness`
(`master`→`vitalos`, Pointer, Meta-Repo-Push) → bei Lockfile-Fehler im Live-Deploy: Neustart.
Einzelschritte: `vos-release-pr fitness`, danach `fitness-release`. Nie von Hand auf `master` pushen
(außer Hotfix).

## 2. Kritische Änderungen 2026-11-01

1. **`@vos/cross-app-aliases` aus `fitness-dev` entfernt** (`f58a032`). Fitness nutzt nur `@relax` und
   `@learn`; `siblingDir()` in `vite.config.js` löst beide über die Nachbar-Checkouts auf. Der
   pfadabhängige `link:` kippte den Lockfile je nach Installationsort (`../../vitalos/packages/…` aus
   `~/dev/fitness-dev`, `../packages/…` im Worktree `~/vitalos/fitness-app`). **Nicht wieder einführen.**
2. **Muscle-Coverage-Cache** speichert Tageswerte (`daily_region_scores`); Details `src/CLAUDE.md`.
   Cloud Functions neu deployt (`firebase deploy --only functions:fitness`, Codebase `fitness`).
3. **HIIT (`wger_529`) ist keine Übung**: Sperrliste `fitness/catalog/kb/registry/non_exercises.yml`.
4. **Neuer, getrennter Standalone-Workflow** `.github/workflows/deploy-standalone.yml` (siehe 4).
5. **Release-Werkzeug**: `vos-ship`/`fitness-ship`; `vos-release-pr` bricht bei >30 Commits nicht mehr
   ab (SIGPIPE-Fix); `vos-release` toleriert im `-app`-Worktree eine reine `link:`-Umschreibung der
   `pnpm-lock.yaml`.

## 3. Lockfile — der Dauer-Stolperstein

Es gibt **zwei** Lockfiles mit verschiedenen Aufgaben:

- `fitness-dev/pnpm-lock.yaml`: Wahrheit für den Standalone-Weg.
- `~/vitalos/pnpm-lock.yaml` (Root des Meta-Workspaces): Wahrheit für die Shell **und** (heute noch) für
  den alten Live-Deploy `deploy-master.yml`.

Der alte Live-Deploy checkt das Meta-Repo aus und installiert dort mit `--frozen-lockfile`. Der PR-Merge
nach `master` löst ihn sofort aus, der Root-Lockfile wird aber erst im zweiten Schritt (`vos-release`)
nachgezogen. Folge: **Bei geänderten Dependencies ist der erste Live-Deploy-Run rot**
(`ERR_PNPM_OUTDATED_LOCKFILE` bei „Install (Workspaces)"), `vos-ship` startet ihn nach dem Sync neu.
Man kann den Root-Lockfile nicht früher pushen: `deploy-shell.yml` läuft bei **jedem** Push auf
`vitalos master` (außer reiner Doku) mit `--frozen-lockfile` gegen die **gepinnten** Submodule und würde
rot, solange der Pointer noch auf das alte Modul zeigt. Lockfile und Pointer müssen in **einem Push** raus.

Manuell, falls nötig: `cd ~/vitalos && pnpm install --lockfile-only --no-frozen-lockfile`, dann
`git commit -m "fix(lock): …" -- pnpm-lock.yaml`, `vos-release` wiederholen, Live-Deploy neu starten
(`gh workflow run "Live Deploy (Fitness master)" -R nimmsel23/fitness-dev --ref master`).

**Lösung auf Dauer: der Standalone-Weg (4).** Er braucht den Root-Lockfile nicht.

## 4. Standalone-Deploy ohne Meta-Repo (Zielbild, in Arbeit)

Entscheidung: **alle Standalone-Deploys laufen aus den `master`-Checkouts der eigenen Repos, nicht aus
dem Meta-Repo.** Das Meta-Repo gehört der Shell.

`deploy-standalone.yml` (neu, parallel zu `deploy-master.yml`):

- Checkout `fitness-dev` plus `plan-dev`, `6pack-dev`, `skills-dev`, `learn-dev`, `relax-dev` als
  Geschwister (der Fitness-Build kompiliert sie mit: `vite-miniapp-submodules.mjs`, `siblingDir()`).
- Jedes Repo wird mit seinem **eigenen** Lockfile installiert (`--frozen-lockfile --ignore-scripts`).
  Ein gemeinsamer `node_modules`-Symlink scheiterte: die Nachbarn brauchen teils andere Versionen
  (`6pack-dev` `js-yaml` 4 mit Default-Export, Fitness `js-yaml` 5).
- `firebase.config.js` aus dem Secret `FIREBASE_CONFIG`.
- Deploy nur auf `master` und nur bei `push` oder `workflow_dispatch` mit `deploy=true`. Auf `dev` läuft
  er bei Änderung der Datei als reiner Build-Test (Nachbarn von `dev`).

**Status:** Build-Test auf `dev` läuft. **`deploy-master.yml` ist noch nicht ersetzt** — die Umschaltung
ändert die Prod-Pipeline und braucht eine ausdrückliche Freigabe.

**Voraussetzung:** Jedes Nachbar-Repo muss auf `master` mit `pnpm install --frozen-lockfile` standalone
installierbar sein. Stand der Prüfung (frische Klone von `master`): `6pack-dev`, `skills-dev`,
`learn-dev`, `relax-dev` ok; `plan-dev` war defekt (`workspace:*` ohne Lockfile-Eintrag) und ist auf
`plan-dev/dev` behoben (Commit `8097ef5`), `master` folgt mit dem nächsten Plan-Release.
Ähnliches Muster, aber mit echter Alias-Nutzung (also kein bloßes Entfernen): `coach-dev` (Paket nicht
im Lockfile, 19 Dateien nutzen Aliase), `habits-dev` (14 Dateien).

## 5. Shell-Kopplung

Die Shell (`~/vitalos`) importiert alle Apps als Submodule, jedes auf seinem `vitalos`-Branch (stabiler
Stand, kommt nach `master`). Shell-Code verweist mit Pfaden wie `../../fitness-app/src/lib/…` in die Apps.
Entfernt oder verschiebt ein Modul eine dort importierte Datei, bricht der **Shell**-Build erst nach dem
Push (CI), obwohl das Modul-Release grün ist.

Beispiel 2026-11-01: `caa0a2a` entfernte `src/lib/sixpackPush.js` aus Fitness (6Pack-Push gehört nur der
6Pack-App); `~/vitalos/src/shell/SixPackApp.jsx` importierte sie weiter → `Could not resolve …` im
Shell-Deploy. Fix im Meta-Repo: Import und `enablePush` entfernt (die 6Pack-Karte zeigt dann einen
Hinweis). `6pack-dev/standaloneSync.js::enableSixpackPush` taugt für die Shell **nicht** (legt eine eigene
Firebase-Instanz an). Saubere Lösung: ein shell-taugliches Push-Modul aus `6pack-dev`.

Vor einem Release prüfen: alle `../../<app>/…`-Importe der Shell existieren am neuen Pointer (Skript-Idee
„Option C" in `~/vitalos/docs/DEPLOYMENT.md`).

## 6. Fehlerbild → Ursache

| Symptom | Ursache | Vorgehen |
|---|---|---|
| Live-Deploy rot, `ERR_PNPM_OUTDATED_LOCKFILE` | Root-Lockfile im Meta-Repo veraltet | `fitness-ship` (macht den Sync + Neustart) oder Abschnitt 3 manuell |
| `vos-release`: „pnpm-lock.yaml passt nicht …" | wie oben, Preflight | Lockfile nachziehen, `vos-release` wiederholen |
| `vos-release`: „unexpected changes: M pnpm-lock.yaml" im `-app`-Worktree | pnpm hat `link:`-Pfad umgeschrieben | seit 2026-11-01 toleriert, wenn nur `link:`-Zeilen |
| `vos-release-pr` Exit 141 | SIGPIPE bei >30 Commits | behoben; sonst PR per `gh pr create` |
| Shell-Deploy rot, `Could not resolve ../../<app>/…` | Modul hat importierte Datei entfernt | Shell-Import anpassen (Abschnitt 5) |
| Standalone-Build: `does not provide an export named 'default'` | Nachbar bekommt falsche Dependency-Version | jedes Repo mit eigenem Lockfile installieren |
