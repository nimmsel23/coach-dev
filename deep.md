## Wo das Repo steht
- `dev` und `master` sind gleich (`f88361d4`); die letzten Läufe Check, Auto-Promote und Gemini CI Agent sind grün (Run 44721977725, 44722052452). Keine offenen Issues/PRs (evidence.json).
- Aktivität: 20.11. wieder 13 Commits, 16.–19.11. fast Stillstand (evidence.json, activity). Heute: Aufräumen (`27650757`), cli.py-Auslagerung (`de0ed798`), pnpm→npm (`5acb9d67`), GitHub-Issues als Inbox-Quelle (`f88361d4`).
- Das Repo existiert seit 2026-05-07 (`fc282af9`), 2968 Commits. Gebaut wird nur der Coach-Modus: Einstiege `coach-shell`, `index` (nur Redirect), `coach`, `local`, `clientforge` (`vite.config.js:137-144`). Produktion nur per manuellem `workflow_dispatch` (`deploy-coach.yml`).

## Risiken
- Live-Wirkung unbelegt: Taskwarrior-Anzeige, echter `tractionDaily`-Event (Abfrage ergab 0), Coach Sheet gegen Inbox-Records (`NEXT.md:3-4,14`).
- KB-Ordner ist vendored Tree, aber `.gitmodules` führt ihn als Submodul `nimmsel23/fitness`. Exercises/Inbox divergieren bidirektional; kein Blind-rsync (`TODO.md:15-22`, seit `710614d9`).
- `website`-Gitlink: lokal ungepushter SHA `71f101a` darf nicht gepinnt werden (`NEXT.md:12`, `TODO.md:35`). In dieser Checkout-Kopie ist `website/` leer.
- Gemini-Reparaturkette nie an einem echten roten Lauf geprüft; WhatsApp-Zusammenfassung für Jakob ungetestet (`NEXT.md:40-45`).
- Inbox im Fluss: Revert `d03ca3e5` und Feature `f88361d4` im Abstand von einer Minute.

## Widersprüche Doku ↔ Code
- `README.md:35,92-100` nennt pnpm 11/Vite 6. Code: `vite 8.3.6` (`package.json:89`), `package-lock.json`, kein `pnpm-lock.yaml`, CI nutzt npm (`check.yml:80-81`). pnpm steht noch in `AGENTS.md` und 10 `docs/*.md` (u. a. `DEPLOY.md` 8×).
- `src/OVERVIEW.md` (Stand 2026-06-22) nennt Tab `dash`/`Dashboard/` und `Habits.bak2/`/`Journal.bak2/`. Diese Ordner gibt es nicht (`ls src/views`). Es fehlen Atlas, Anamnese/Fokus-Umschaltung und Logbuch als Sub-Tab (`src/constants/NavigationItems.js:4-31`).
- `src/views/DISCONNECTED.md:#2` sagt, Muscles sei nicht gerendert und der Tab entfernt. Tatsächlich ist die View in WeeklyReview eingebunden (`WeeklyReview/index.jsx:17,111`). Eintrag #1 (Inbox „konzeptionell falsch“) ist durch die Coach-Inbox überholt.
- `src/plan-main.jsx:4` importiert `./views/Plan/StrongApp.jsx`; die Datei fehlt, `plan.html` existiert nicht (`prepare-plan-dist.mjs:5` erwartet es). Toter Einstieg.
- `NEXT.md:10` kennt nur `github_pr` („Link statt Fake-Approve“); der Code arbeitet jetzt mit Issues (`githubInbox.js:32`, `inbox.js:315,376`). `NEXT.md:1` ist ein losgelöster Punkt vor der Überschrift.
- `docs/ROADMAP.md:1` heißt „fitness-dev Roadmap“ (zuletzt 2026-06-18, `669c690d`).

## Ausbaustufen
| Bereich | Stufe | Was fehlt zum nächsten Schritt | Beleg |
|---|---|---|---|
| Fitness-SPA (`main.jsx`→`App.jsx`: Training, Review, Lernen, Atlas, Setup) | Gerüst/verwaist | Kein HTML-Entry und kein Build-Skript im Coach-Modus; entweder Entry/Build ergänzen oder als extern deklarieren | `vite.config.js:137-144`, `src/main.jsx`, App.jsx zuletzt `7235c384` (12.11.) |
| Plan-Einstieg `plan-main.jsx` | Gerüst (defekt) | `StrongApp.jsx` und `plan.html` fehlen; löschen oder Modul-Pfad klären | `src/plan-main.jsx:4` |
| Anamnese / Fokus | verwaist | Nur über Nav-Umschaltung erreichbar; seit 09.08. unberührt | `NavigationItems.js:42-55`, `ab2b7e2d` |
| Plan-Tab (`views/Plan`, 5 Dateien) | halb fertig | Nur `api.js`, `TrainingPlans.jsx` aus Coach genutzt; Rest liegt im Submodul `modules/plan`; zuletzt 14.10. | `AssignPlan.jsx:6`, `1f860950` |
| Gemini-CI-Reparatur | halb fertig | Ein echter roter Lauf bis grün fehlt | `NEXT.md:40-42` |
| GAS Coach-Summary (Telegram-Briefing) | verwaist? | Kein Verweis in CI/package.json; zuletzt 21.10. Status unbekannt | `gas-coach-summary/README.md`, `bef8949f` |
| Vault-Inbox-Enricher, Postgres-Schicht | Idee | Nur Doku/Hot | `NEXT.md:15-16`, `hot/*.md` |
| Coach-Shell (Anfragen/Katalog/Klienten/Nutzung) | benutzbar | Live-Prüfung offen | `src/shell/NavigationItems.js:7-10` |
| Klienten-Konsole `/konsole`, `/schmiede` | benutzbar | Von `server.py:412-427` ausgeliefert | `server.py:412` |
| Lokale Pläne (`local.html`, `index.html`-Redirect) | benutzbar | – | `index.html:6` |
| Python-CLIs (`bin/*`, `coach_*.py`) | benutzbar | Meist seit 10.11. unberührt; `fitnessctl`/`fitness-devctl`/`fitness-prodctl` seit 20.10. | `710614d9`, `c1a00bff` |
| `monolith.py`, `refactor_catalog.py` | verwaist | Kein Verweis außerhalb Git; seit 11.07. | `0875e371`, `a1f84e42` |

## Vergessene Schätze
- `scripts/mini-app-shell/cli.mjs` (Stempel-/Mini-App-Tooling), eingebunden in `build:firebase:coach` (`package.json:26`), plus `docs/MINI-APPS.md`.
- `gas-coach-summary/`: Gemini-gestütztes Telegram-Tagesbriefing aller Klienten (`README.md:3`). Seit 21.10. unberührt.
- `twa/` und `public-coach/*.apk`: Android-Hüllen für 6Pack und Fitness (`twa/README.md`, `docs/TWA-APK.md`).
- `skills/anatomy-agent`, `fitness-agent` und `anatomy-kb` (Stand 09.11., `7e57e326`).
- `src/views/Muscles/` (11 Dateien, aktiv als Review-Subtab; `DISCONNECTED.md` behauptet das Gegenteil).

## Empfehlung für diese Woche
1. Entscheiden: Fitness-SPA (`App.jsx`-Baum) als Entry ergänzen oder als extern/archiviert markieren; `plan-main.jsx` löschen oder reparieren.
2. Verifizieren: `tractionDaily` und Taskwarrior-Anzeige live (`NEXT.md:3-4`), dann KB-Gitlink klären (`TODO.md:15`).
3. Korrigieren: README/AGENTS/docs auf npm und Vite 8 umstellen; `OVERVIEW.md`, `DISCONNECTED.md` und `NEXT.md` angleichen.

## Seit letzter Woche
- HEAD unverändert gegenüber der vorigen Analyse (`f88361d4`); keine neuen Commits seit dieser.
- Weiterhin offen: README-pnpm-Widerspruch, KB-Gitlink, Live-Verifikation.
- Neu geprüft: kein Build-Entry für die Fitness-SPA, `plan-main.jsx` defekt, Doku-Drift in `OVERVIEW.md`/`DISCONNECTED.md`.
