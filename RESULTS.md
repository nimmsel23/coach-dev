# Fitness-Dev: Setup-Tab mit Prop `hideAppearance` für den Pulse-Wrapper (2026-11-05)

Der Setup-Tab kann die Themes-Auswahl jetzt ausblenden, weil `vos-fitness` (Pulse) ein festes Design hat. Anlass war die Prüfung des Pulse-Setups: Dort scheiterte „Push aktivieren“ mit „messaging-sw.js load failed“, weil im Wrapper-Build `fitness-messaging-sw.js` fehlte (Fix im Meta-Repo `~/vitalos`, nicht hier). Die Prop ist über `vos-ship fitness --yes` (dev → master → vitalos) ausgeliefert; ob „Erscheinungsbild“ im Live-Setup tatsächlich verschwunden ist, wurde nicht auf der Live-Seite geprüft.

- **`src/views/Settings/index.jsx`** (`35c803d`): Neue Prop `hideAppearance` blendet die Sektion „Erscheinungsbild“ (`AppearanceSection`) aus; Standard bleibt sichtbar, alle anderen Builds unverändert.

---

# Fitness-Dev: Session-Gate-Sheet wird Quick-Entrance-Portal / Nav-Sheet mit Hub (2026-11-05)

Das Session-Gate-Sheet (`src/views/Session/`) wurde vom reinen Start-Sheet zum Schnelleinstieg-Portal ausgebaut: Die untere Nav ist der eingeklappte Rand des Sheets, ein weiteres Hochziehen öffnet den Hub. Alles ist auf `dev` committed und gepusht und über PR #67 bereits in `master` gemergt (`fitness-release` meldete „Bereits aktuell“). Geprüft wurde per Lint/Build und Headless-Firefox-Harness mit simulierten Touch-Events, nicht auf einem echten Gerät.

- **`GatePortalGrid.jsx`** (neu, `1fba0e0`): Portal-Grid mit Suche (`/`, Ziffern, Enter), „Zuletzt genutzt“ (`fitness-gate-portal-recent`) und Einträgen für Heute, Plan, Logbuch, Timer, Skills, Gestern sowie (außerhalb von Solo-Builds) Review, Learn, Atlas, Touren, Settings. Named Export `GateHubBar`: sticky Leiste mit 5 Einträgen und „Hub aufklappen“-Button (Swipe-up).
- **`SessionGateSheet.jsx`, `SessionGateCard.jsx`, `SessionModalsLayer.jsx`, `SessionEditor.jsx`** (`747ac1a`, `1966d4e`, `e5051e5`): Sheet öffnet nicht mehr reflexartig; Hochziehen am Griff expandiert zum Hub (`initialExpanded`, `activeModal` `'gate'|'hub'`). Tageszähler (Übungen/Sätze/Volumen), Kraft/Ausdauer-Toggle und Split-Chips im Gate; kompakter Split-Chip im Session-Tab statt `SplitPicker`.
- **`App.jsx`, `MobileNav.jsx`, `Sidebar.jsx`** (`86ba486`, `e2cf6e4`): `openHub(mode)` ersetzt das alte Auto-Open-Effect; Mobile-Nav hat Hub-Button und Swipe-up/Griff zum Herausziehen des Sheets, Sidebar einen Hub-Eintrag.
- **`SplitPicker.jsx`, `utils.js`**: neue Splits Shoulders und Arms (Farben in `BLOCK_COLORS`), `inferIsolationBlock` erkennt sie über Primärmuskeln.
- **`GateNextPlanCard.jsx`** (neu, `64aafa7`): Karte „Nächster Plan“ (via `useTodayPlan()`), „Übernehmen“ legt die Routine über `applyNextRoutine` an.
- **`SessionGateBar.jsx`, `index.jsx`**: Grid-Button „Schnelleinstieg öffnen“; TodayPlan-Screen wird übersprungen, wenn das Gate automatisch öffnet.
- **`views/Session/ARCHITECTURE.md`, `AUDIT.md`**: Portal, Hub, Dock, Splits und Nächster-Plan-Karte dokumentiert.
- **`.claude/settings.json`** (`14e20f6`): Hook-Pfade zeigten noch auf das nicht mehr existierende `~/fitness-dev`, jetzt `~/dev/fitness-dev` (Backup `.claude/settings.json.bak`); betraf `pre-compact-fill-docs.sh` und `post-edit-commit-docs.sh`.

---

# Fitness-Dev: App-Portal (docs/apps.html) und Fix leere Fokus-/Anamnese-Mini-App (2026-11-05)

Für alle Mini-Apps gibt es jetzt eine aus den vorhandenen Manifesten erzeugte Übersicht. Dabei fiel auf, dass `vos-fokus` nur Hintergrund und Login zeigte; die Ursache liegt in der Flow-Weiterleitung und ist behoben (committed und auf `dev` gepusht, noch nicht per `vos-ship fitness` live).

- **`scripts/portal.mjs`, `docs/apps.html`, `docs/apps.json`** (`b43afeb`, `7f821bb`): Das Skript liest `scripts/miniapps.json`, `mini-app.json` und `.firebaserc` und erzeugt eine durchsuchbare Karten-Übersicht mit Name, Zweck und Site-Link. Das Skript stammt aus `~/vitalos/scripts/vos-portal.mjs` und wird von `~/vitalos/bin/vos-portal` in jedes Repo kopiert; `--check` prüft nur auf veraltete Dateien. Eine eigene Registry ist nicht nötig.
- **`src/App.jsx`** (`679b53e`): `resolveFlowTab` leitete den Fokus-Tab auf die Anamnese um, solange keine Hits gesetzt waren. Im Fokus-Solo-Build ist der Anamnese-View ausgestubbt, daher blieb die Seite leer. In Solo-Builds entfällt die Weiterleitung jetzt (`if (devBypassFlow || IS_SOLO) return id`), Fokus zeigt „Noch keine Hits gesetzt“. Der Gegenfall (`vos-anamnese` leitet bei ausgefüllten Hits auf Fokus um) ist mit demselben Fix behoben, aber ungetestet. Verifiziert nur per `pnpm run build:miniapp fokus`, nicht im Browser.
- **`CLAUDE.md`** (`ce477b9`): Backend-Abschnitte nach `fitness-backend` ausgelagert, Hinweisblock ergänzt.

---

# Fitness-Dev: Mini-Apps als Unterpfade, eigener Cache-Präfix und Master-Deploy (2026-11-05)

Die `fitness-dev`-App wurde um die Möglichkeit erweitert, Mini-Apps als Unterpfade unter einer gemeinsamen Origin (`fitness-aos.web.app/<id>/`) zu hosten. Ein neuer Build-Workflow und Skripte wurden implementiert, um dies zu unterstützen, inklusive eines eigenen Cache-Präfixes für jede Unterpfad-App, um Cache-Kollisionen zu vermeiden. Diese Änderungen wurden in `fitness-dev` committed und der `dev`-Branch erfolgreich gepusht.

-   **`7dbb987` feat(origin) Commit

# Fitness-Dev: Mini-Apps als Unterpfade, eigener Cache-Präfix (2026-11-05)

Die `fitness-dev`-App wurde um die Möglichkeit erweitert, Mini-Apps als Unterpfade unter einer gemeinsamen Origin (`fitness-aos.web.app/<id>/`) zu hosten. Ein neuer Build-Workflow und Skripte wurden implementiert, um dies zu unterstützen, inklusive eines eigenen Cache-Präfixes für jede Unterpfad-App, um Cache-Kollisionen zu vermeiden.

-   **`7dbb987` feat(origin) Commit**: Implementierung der Unterpfad-Struktur, eigener Cache-Präfixe (`vos-<id>-`

# Fitness-Dev: Mini-Apps als Unterpfade, eigener Cache-Präfix (2026-11-05)

Die `fitness-dev`-App wurde um die Möglichkeit erweitert, Mini-Apps als Unterpfade unter einer gemeinsamen Origin (`fitness-aos.web.app/<id>/`) zu hosten. Ein neuer Build-Workflow und Skripte wurden implementiert, um dies zu unterstützen, inklusive eines eigenen Cache-Präfixes für jede Unterpfad-App, um Cache-Kollisionen zu vermeiden.

-   **`7dbb987` feat(origin) Commit**: Implementierung der Unterpfad-Struktur, eigener Cache-Präfixe und des neuen Merge

# Fitness-Release dev → master → vitalos, Firebase-Konto (2026-11-04)

Release der Logbuch- und Mini-App-Änderungen über `vos-ship fitness`: PR #40 (`dev` → `master`) wurde gemergt und der Standalone-Live-Deploy lief grün. Der Schritt `vos-release` (`master` → `vitalos`) scheiterte zunächst am Pre-Push-Hook von `fitness-app`, weil die lokale Firebase-Anmeldung für `fitness-aos` keine Berechtigung hatte.

- **Firebase-Login (Systemeinstellung, kein Repo-Inhalt)**: `firebase login:use nimmsel23@gmail.com` setzt das Konto mit Zugriff auf `fitness-aos` für das Projektverzeichnis. Danach lief `vos-release fitness --yes` (ohne TTY nötig) durch.
- **`fitness-app` / Meta-Repo `~/vitalos`**: 13 Commits auf `vitalos` gepusht, Pointer-Bump auf `master` (`84d3a0b`); der Push löste die CI für Shell und `vos-fitness` aus. Deren Ergebnis wurde nur für `deploy-vos-fitness.yml` geprüft (grün, ca. 1m20s).
- **`dev`**: `7421fc9` (Stempel-Build) und `33df556` (Lint-Hook, CI-Cache in `check.yml`) nach `origin/dev` gepusht; der Pre-Push-Hook meldete „Build-Verifikation OK“.

---

# 2026-11-04 — Fuel-App-Wrapper (vos-fuel)

Ein neuer Wrapper für die Fuel-App (`vos-fuel`) wurde im `vitalos`-Monorepo erstellt, der die bestehenden Fuel-Funktionen in einer neuen React-Hülle zusammenführt. Der Fokus liegt auf einem integrierten Home-Screen und der Nutzung der vorhandenen Fuel-Tabs über Hash-Routen.

-   **`vos-fuel` App-Wrapper (`src/FuelApp.jsx`, `src/Menu.jsx`, `src/nav.js`, `src/home/*.jsx`)**: Die Kernkomponenten des Wrappers wurden erstellt. `FuelApp.jsx` dient als Haupt-Container und verw

# Results

## 2026-11-04 — Mini-Apps pro Tab, Ship-Hook, TWA-APK

Jeder Tab aus fitness-dev bekommt eine Solo-Mini-App mit eigenem Hosting-Target, deren Deploy per CI tabellengesteuert läuft. Dazu kommt ein `[ship]`-Hook, der den Release bis `fitness-vos` anstößt, und eine signierte Android-APK (TWA) der klassischen Fitness-Centre-App. Die APK wurde im Android-Emulator getestet (Start, Vollbild ohne Adressleiste); ein Test auf einem echten Gerät steht aus.

- **`scripts/miniapps.json` + `.github/workflows/deploy-miniapps.yml`**: SSOT für alle Solo-Mini-Apps (training, logbuch, review, atlas, touren, setup, anamnese, fokus → Sites `vos-<id>`); Workflow baut per Matrix nur diffgesteuert die geänderten Apps. Nach dem Release-Merge löst ein Dispatch den Deploy aus (`96d64c4`).
- **`firebase.json` / `.firebaserc` / `package.json` / `vite-miniapp-submodules.mjs`**: Deploy-Target `plan` und verschachtelte Mini-App-Fallbacks entfernt, `build:miniapp <id>` als einheitlicher Build.
- **`.githooks/pre-push` + `scripts/ship-after-push.sh`**: `[ship]` im dev-Push startet den Release dev → master → vitalos bis zum Deploy von `fitness-vos`.
- **`src/components/common/SoloHelper.jsx` / `src/App.jsx`**: kleiner Login- und Update-Helfer für die Mini-Apps. Firebase-Auth-Domains für die Mini-App-Sites eingetragen.
- **`twa/`, `public/.well-known/assetlinks.json`, `firebase.json` (Target `client`), `.gitignore`**: Fitness Centre als TWA (`app.vitalos.fitnesscentre`, minSdk 24), mit Gradle/`zipalign`/`apksigner` gebaut und signiert, Fingerabdruck entspricht der live ausgelieferten `assetlinks.json`. Keystore liegt außerhalb des Repos.
- **`docs/TWA-APK.md`, `docs/MINI-APPS.md`**: Bauanleitung der APK (inkl. Gradle statt `bubblewrap build`) und Beschreibung der Mini-App-Struktur.
- **Branch `feat/shared-origin`** (Worktree `~/dev/fitness-dev-origin`): Variante, in der alle Mini-Apps unter einer gemeinsamen Origin als Unterpfade laufen (`scripts/build-miniapps-origin.mjs`); als Branch gepusht, nicht nach `dev` gemergt.
- **Waydroid/Emulator**: Netz in Waydroid über `DOCKER-USER`-Regeln (iptables) repariert, um die APK testen zu können; Systemänderung außerhalb des Repos.

---

## 2026-10-31 — Dependabot

Enabled Dependabot alerts and security updates. Configured weekly GitHub Actions and npm/pnpm updates plus Python dependency updates; version updates target `dev`. Minor/patch updates are grouped; vendored mini-app-shell copies stay maintained at their source. Validated YAML, repository manifest paths and update targets.

## 2026-11-01 — Coach ↔ Klienten: Gesprächsbereich

Statische Inbox-Roadmap durch Auth-gebundenen Nachrichtenverlauf ersetzt: echte Antworten, Planbezug, bestätigte Writes und sichtbarkeitsabhängige Lesestände. Client-Adapter bindet Pfad an eigene Firebase-UID; kein Laptop-Worker nötig. Lokaler mobiler Emulator-Ablauf bestanden (Coach mit Planbezug → Antwort → Lesestände → Klientenwechsel ohne Verlauf-/Entwurfsleck); Firebase-Client-Build und ESLint bestanden. Regeln separat im VitalOS-Feature-Worktree vorbereitet und mit fünf Rules-Tests geprüft. Keine echten Nachrichten, kein Push/Release/Deployment.

## 2026-11-01 — Kommunikationsdokumentation vervollständigt

Klienten-Handbuch für Auth, Planantwort, Datenpfade, Speicher-/Lesestände, Cache-/Entwurfsgrenzen, Release und Diagnose ergänzt. AGENTS und Inbox-Architektur/Audit verlinken zum gemeinsamen Vertrag/Runbook. Projektweite Coach-Rolle und fehlende Cloud-/Geräteabnahme ausdrücklich beschrieben. Nur Dokumentation; keine Dienste, Deployments oder echten Nachrichten.

## 2026-11-01 — Coach-Worker wiederhergestellt

`coach-sync.service` um 18:01 CET mit `systemctl --user enable --now`
wieder aktiviert. Firestore bestätigt Worker `Alpha:2344779` mit einem
eine Sekunde alten Heartbeat; queued/processing/stale jeweils 0, keine
Neustarts. Beim beobachteten Start keine neuen Katalog-Commits oder
Katalog-Rebuilds; semantischer Replay-Schutz ist in der geladenen Quelle
vorhanden. Bestehende neun historische Command-Fehler unverändert, keine
Aufträge erneut ausgeführt. Keine App-/Rules-Änderung und kein Deployment.

## 2026-11-01 — Splash blockiert nicht mehr auf Service-Worker-Update

Die vendorte Mini-App-Shell mit der aktuellen VitalOS-Quelle synchronisiert. Ein langsamer Netzwerk-/Service-Worker-Updatecheck hält den Splash nicht mehr offen; er verschwindet nach dem App-Start (mindestens 200 ms, maximal 12 s nur falls der App-Root gar nicht bereit wird).

## 2026-11-01: Push-Test nach Admin-SDK-Update repariert

Firebase-Log von sendTestPush: `TypeError: admin.firestore is not a function` (HTTP 500). `firebase-admin` 14.5.0 entfernt die Namespace-API. Alle Firestore-, FieldValue-, Messaging- und Auth-Aufrufe in functions/index.js nutzen jetzt die modularen Einstiegspunkte. Damit erhalten auch Reminder, Coach-Workout-Push und Strava denselben Fix. Keine Änderung an Rules oder Klientendaten.

## 2026-11-02 — Exercise Buckets als Katalog-Entwurf

- `docs/EXERCISE-BUCKETS.md` dokumentiert das additive Bucket-Modell für
  Übungsfamilien, konkrete Varianten, Quellenbelege und Muskel-/Regionsbrücken.
- Dips- und Seitheben-Beispiele grenzen verwandte Varianten explizit ab.
- Den Bench-Dips-Eintrag von der generischen wger-Dips-ID 194 auf den
  passenden wger-Quellbeleg 1324 korrigiert.
- Keine Neuimport- oder Build-Änderung: vorhandene wger-/yuhonas-Daten bleiben
  Quellenbestand. Unvollständige automatische Namens-Deduplikation und ein
  unsicherer Akzentzeichen-Sprachfilter wurden verworfen.

- 2026-11-05: Changelog fehlte nach CI-Live-Deploys — automerge startet deploy-master.yml per workflow_dispatch (kein Push-Event mit Commits), der Checkout war flach (depth 1), `git log parent..HEAD` lief ins Leere → keine release-info.json. Fix: `fetch-depth: 0` im Checkout von fitness-dev (deploy-master.yml).
