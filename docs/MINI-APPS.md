# MINI-APPS: jeder Tab von fitness-dev als eigene App

Stand 2026-11-04. Aus dem klassischen Fitness Centre (`fitness-aos.web.app`) wird je Tab eine eigenständig installierbare
Mini-App gebaut. Ein Codebase, ein Vite-Build pro App („Flavor“ über `--mode <id>`), eine Hosting-Site pro App.

## Die Apps

| id | Tab | Site | Start | Inhalt |
|---|---|---|---|---|
| `training` | `session` | `vos-training.web.app` | `/#session` | Session-Tab (Training loggen) |
| `logbuch` | `session` | `vos-logbuch.web.app` | `/#session/logbuch` | Logbuch mit Chronik |
| `review` | `review` | `vos-review.web.app` | `/#review` | Wochenreview, Muskeln, Readiness, Protokoll |
| `atlas` | `atlas` | `vos-atlas.web.app` | `/#atlas` | Übungsdatenbank |
| `touren` | `touren` | `vos-touren.web.app` | `/#touren` | Radtouren |
| `setup` | `settings` | `vos-setup.web.app` | `/#settings` | Einstellungen |
| `anamnese` | `anamnese` | `vos-anamnese.web.app` | `/#anamnese` | Anamnese |
| `fokus` | `focus` | `vos-fokus.web.app` | `/#focus` | Fokus-Ebenen |

Nicht dabei (eigene Repos und Sites): **Learn** (`learn-dev`, `learn-vos`), **Plan** (`plan-dev`, `vos-plan`), **6Pack** (`6pack-dev`,
`vos-6pack`), **Skills** (`skills-dev`, `vos-skills`). In der klassischen App leiten die Subtabs 6Pack und Skills auf diese
Standalone-Apps um; Plan und 6Pack leben zusätzlich als Tabs im klassischen Bundle. Die Fuel-Mini-Apps (`vos-fuel-*`) gehören zu `fuel-dev`
und haben bewusst keinen CI-Deploy.

## Single Source of Truth: `scripts/miniapps.json`
Ein Eintrag je App: `id`, `tab` (Wert für `VITE_SOLO_TAB`), `keep` (Views, die im Bundle bleiben), `site`, `name`, `short`, `start`,
`description`, `accent`, `paths` (View-Ordner, die die App betreffen). Gelesen von:

- `vite.config.js`: `soloStubPlugin` ersetzt alle anderen Views durch einen leeren Platzhalter (kleine Bundles); Changelog-Name.
- `scripts/build-miniapp.mjs`: Build und optionales Deployen.
- `scripts/stamp-training.mjs`: Akzentfarbe, Manifest, Splash, Icons.
- `.github/workflows/deploy-miniapps.yml`: Diff-Erkennung je App und Matrix-Deploy.

Weitere Bausteine je App: `.env.<id>` (`VITE_SOLO_TAB=<tab>`), Icons in `solo-icons/<id>/` (erzeugt von `scripts/solo-icons.py`),
Hosting-Target `<id>` in `firebase.json` und `.firebaserc`. `NavigationItems.js` blendet im Solo-Build alle anderen Tabs aus
(`SOLO_TAB`, `IS_SOLO`).

## Bauen und deployen
```bash
pnpm run build:miniapp <id>                 # dist-<id>/ (KB-Daten gestempelt, vite --mode <id>, SW, Manifest, Splash, Snapshot)
pnpm run build:miniapp <id> --deploy        # zusätzlich firebase deploy --only hosting:<id>
pnpm run build:training | build:atlas       # Kurzformen
```
Der Build setzt `VITE_SOLO_TAB` selbst. Das Build-Ergebnis liegt in `dist-<id>/` (per `.gitignore` `dist-*/` ignoriert).

## Deploy per CI: `deploy-miniapps.yml`
- **Auslöser:** Push auf `master` (Pfadfilter auf `src/`, `scripts/`, Build-Konfiguration, `solo-icons/`, `.env.*`) und
  `workflow_dispatch`.
- **Welche Apps:** Der Schritt „Betroffene Apps“ diffed den Push:
  - Datei in den `paths` einer App → diese App (`training` und `logbuch` teilen `Session/` und `Logbuch/`).
  - `solo-icons/<id>/` oder `.env.<id>` → diese App.
  - gemeinsamer Code (`src/` außerhalb von `views/`, `scripts/`, `vite.config.js`, `package.json`, Lockfile, `mini-app.json`,
    `firebase.json`, `miniapps.json`, die Workflow-Datei) → alle Apps.
  - andere Views (etwa Plan) → keine App, dort sind sie ausgestubbt.
- **Matrix:** je betroffene App ein Job (Build und `FirebaseExtended/action-hosting-deploy`, Target `<id>`, Kanal `live`), `fail-fast: false`,
  `max-parallel: 3`. Aufbau wie `deploy-master.yml` (Nachbarn auf `master`, je eigener Lockfile, Secret `FIREBASE_CONFIG`).
- **Der Release-Merge löst keinen Push-Trigger aus.** Der Auto-Merge (`automerge.yml`) merkt mit dem `GITHUB_TOKEN`, und solche Merges lösen keine
  Workflows aus. Deshalb startet `automerge.yml` nach dem Merge `deploy-master.yml` und `deploy-miniapps.yml` per `workflow_dispatch`; den
  Mini-Apps gibt es den Stand vor dem Merge als Eingabe `before` mit, damit der Diff wie bei einem Push arbeitet.
  Ohne diese Ergänzung (Fix: Branch `fix/miniapps-dispatch`) lief der erste Release **nicht** an und musste von Hand gestartet werden.
- **Von Hand:** `gh workflow run deploy-miniapps.yml --ref master -f app=all` (oder `-f app=<id>`).

## Login und Updates in den Mini-Apps
Die Solo-Apps haben keine Sidebar und keine Einstellungen, also keinen Ort für Konto und Update. `src/components/common/SoloHelper.jsx`
(nur `IS_SOLO`) zeigt eine kleine Pille oben rechts:
- abgemeldet: „Anmelden“ öffnet das bestehende `AuthGateModal` (Event `fitness-auth-gate-trigger`).
- angemeldet: Initiale, Menü mit E-Mail, „Nach Updates suchen“ (`registration.update()`), „Update installieren“ (`SKIP_WAITING` und Reload) und
  „Abmelden“.
- Ein Punkt an der Pille zeigt ein bereitliegendes Service-Worker-Update (Event `sw-update-available` oder `registration.waiting`).
Die Update-Leiste unten (`PwaUpdateBanner`) bleibt unverändert. Der Helfer ist gebaut und gelinted, im Browser noch nicht gesichtet.

## Einrichtung einer neuen Mini-App
1. Eintrag in `scripts/miniapps.json` (und `paths`).
2. `.env.<id>` mit `VITE_SOLO_TAB=<tab>`. Ist der Tab kein fester Haupttab (wie `anamnese`/`focus`), in `getNavItems()` den Solo-Eintrag ergänzen.
3. Icon-Funktion und Eintrag in `scripts/solo-icons.py`, `python3 scripts/solo-icons.py` ausführen, PNGs einchecken.
4. Hosting-Target `<id>` in `firebase.json` (Block von `training` kopieren, `public: dist-<id>`) und in `.firebaserc` (`targets.fitness-aos.hosting.<id>`).
5. Site anlegen: `firebase hosting:sites:create vos-<id> --project fitness-aos` (mit einem Konto mit Zugriff, hier `nimmsel23@gmail.com`).
6. Autorisierte Domains eintragen (`vos-<id>.web.app` und `vos-<id>.firebaseapp.com`), sonst scheitert der Google-Login.
7. `pnpm run build:miniapp <id>` lokal prüfen, committen, über `dev` → `master` ausliefern. Am Workflow ändert sich nichts.

### Autorisierte Domains per Admin-API
Firebase Auth erlaubt nur Domains aus der Liste „Autorisierte Domains“; die Standarddomains des Projekts sind automatisch drin, zusätzliche
Hosting-Sites nicht. Schreiben geht mit dem Dienstkonto `~/.env/firebase-fitness.json` über die Identity-Toolkit-Admin-API
(`GET`/`PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/fitness-aos/config`, `updateMask=authorizedDomains`). Das `PATCH`
ersetzt die ganze Liste: vorher lesen, ergänzen, vollständig zurückschreiben und danach erneut lesen (so am 2026-11-04 für die sechs
neuen Sites geschehen: 81 → 93 Einträge, nichts verloren). Alternativ in der Konsole unter Authentication → Einstellungen.

## Origins, Caches und Login
Jede Site ist eine eigene Origin (`web.app` steht auf der Public-Suffix-Liste). Service Worker, Cache Storage, IndexedDB und der Firebase-Login sind
**pro App getrennt**; man meldet sich in jeder Mini-App einzeln an. Die Mini-Apps teilen nichts mit `fitness-aos.web.app`, auch nicht die
yuhonas-DB (das klassische Bundle enthält die Bulk-Daten ohnehin, die Solo-Builds stubben sie aus).

## Zwei Varianten
**A, live: eine Site pro App** (`vos-<id>.web.app`). Saubere Isolation und je eigene Installation; ein Fehler betrifft nur eine App; Cache
und Login sind getrennt; jede neue App braucht Site und autorisierte Domain.

**B, Branch `feat/shared-origin`, nicht live: Unterpfade einer gemeinsamen Origin** (z. B. `fitness-vos.web.app/<id>/`). Cache, IndexedDB und
Login wären mit Pulse geteilt (einmal anmelden, Atlas-Daten für Pulse); keine neuen Sites und keine zusätzlichen Domains. Dafür sind zwei
Pipelines an einer Site gekoppelt (ein Hosting-Deploy ersetzt den kompletten Inhalt der Site) und alle Apps teilen das Fehlerrisiko.
Stand des Branches: `pnpm run build:origin` (`scripts/build-miniapps-origin.mjs`) baut alle Apps nach `dist-origin/<id>/` mit SW-Scope `/<id>/`,
Manifest-Scope und `start_url` unter dem Pfad und schreibt `dist-origin/_hosting-rewrites.json`. Offen: Einbindung in den
`fitness-vos`-Deploy (Meta-Repo, `deploy-vos-fitness.yml`: nach dem Pulse-Build in `fitness-app` `pnpm run build:origin` ausführen, `dist-origin/*` nach
`vos-fitness/dist-firebase/` kopieren, Rewrites vor dem `**`-Catch-all einfügen) und ein Laufzeittest im Browser (SW-Scopes, Login über Pfade).

Beide Varianten sind erwünscht; sie schließen sich nicht aus, weil dieselben Builds (`--mode <id>`) zugrunde liegen.

## Android
Die klassische App gibt es als TWA-APK-Vorbereitung (`docs/TWA-APK.md`). Für die Mini-Apps wäre jede eine eigene TWA mit eigener Package-ID und
`assetlinks.json` auf ihrer Site. Ein Store-Verkauf gehört zur Premium-Schiene (`~/vitalos-prod`), nicht hierher.

## Fehlerbild → Ursache
| Fehlerbild | Ursache |
|---|---|
| Release-Merge, aber keine Mini-App deployt | Merge mit `GITHUB_TOKEN` löst keinen Push-Trigger aus; `automerge.yml` muss `deploy-miniapps.yml` dispatchen (siehe oben), sonst `gh workflow run … -f app=all` |
| Google-Login in einer Mini-App schlägt fehl | Domain nicht in „Autorisierte Domains“ |
| Mini-App zeigt eine andere Tab-Ansicht | `.env.<id>`/`VITE_SOLO_TAB` passt nicht zum Tab; `build-miniapp.mjs` setzt ihn aus `miniapps.json` |
| Build meldet fehlenden Checkout | `../plan-app|plan-dev`, `../6pack-…`, `../skills-…` fehlen neben dem Repo (kein verschachtelter Fallback mehr) |
| Deploy: „Site not found“/Target unbekannt | Hosting-Target in `.firebaserc` fehlt oder Site nicht angelegt |
| `build:origin`: `register('/sw.js')` nicht gefunden | index.html hat das Inline-Skript geändert; Patch in `build-miniapps-origin.mjs` anpassen |

## Offen
- [ ] Mini-Apps im Browser prüfen (Login-Pille, Update, Installation je Site).
- [ ] Variante B: Einbindung in `fitness-vos` und Laufzeittest.
- [ ] Entscheidung, ob Learn/Plan ebenfalls in die Tabelle aufgenommen werden (aktuell eigene Repos).
- [ ] Settings-Mini-App (`setup`) und die Ankerseiten auf Sinn prüfen.
