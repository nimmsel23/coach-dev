## Wo das Repo steht
- `dev` und `master` stehen beide auf `c0c2c4a1` (12:21, docs: npm statt pnpm). Check (Lauf 44726960777), Auto-Promote (44727084021) und Gemini CI Agent (44722052452) sind grün (evidence.json).
- Aktivität: 16.–19.11. fast Stillstand (3/1/0/0 Commits), 20.11. wieder 14 Commits: Aufräumen (`27650757`), cli.py-Auslagerung (`de0ed798`), pnpm→npm (`5acb9d67`), GitHub-Issues als Inbox (`f88361d4`).
- Gebaut wird nur der Coach-Modus mit fünf Einstiegen: shell, index, coach, local, clientforge (`vite.config.js:137-144`). Produktion nur per manuellem Deploy (`NEXT.md:12`).
- Offen sind die vier Issues #22–#25 (Label `ausbaustufe`), automatisch aus der letzten Tiefenanalyse erzeugt; `NEXT.md` bittet, sie zu sichten.

## Risiken
- Live-Wirkung unbelegt: Taskwarrior-Anzeige, `tractionDaily` (Abfrage ergab 0 Events), Coach Sheet, Live-Deploy steht aus (`NEXT.md:3-4,12`).
- KB-Ordner ist ein vendored Tree, `.gitmodules` führt ihn aber als Submodul `backend/fitness/catalog/kb` (`NEXT.md`, KB-Gitlink; Tree seit `710614d9`). Kein Blind-rsync.
- `website/` und `modules/plan/` sind im Checkout leer. Ein lokal ungepushter Pin `71f101a` darf nicht gepinnt werden (`NEXT.md`, website-Punkt).
- Gemini-Reparaturkette nie an einem echten roten Lauf geprüft; WhatsApp-Zusammenfassung für Jakob ungetestet (`NEXT.md`, Gemini-Review 2026-11-13).
- Inbox erst heute umgebaut (Revert `d03ca3e5`, Feature `f88361d4` eine Minute später); noch nicht live belegt.

## Widersprüche Doku ↔ Code
- Behoben seit letzter Woche: README nennt jetzt Vite 8 und npm (`README.md:35`, `c0c2c4a1`). Rest-pnpm: `docs/DEPLOY.md` (8×), `docs/CLAUDE.md`, `COMMUNICATION-RUNBOOK`, `MINI-APPS` je 1×. Der Commit sagt, DEPLOY.md betreffe Nachbar-Repos; die übrigen Treffer nicht geprüft.
- `src/OVERVIEW.md:29,53-54` nennt Tab `dash`/`Dashboard/` sowie `Habits.bak2/`, `Journal.bak2/`; `src/views` enthält diese nicht (Anamnese, Coach, Exercises, Fokus, Inbox, Logbuch, Muscles, Plan, Session, Settings, SixPack, WeeklyReview).
- `src/views/DISCONNECTED.md:25` sagt, Muscles werde nicht gerendert. Tatsächlich importiert und rendert `WeeklyReview/index.jsx:17,111` die View. Eintrag #1 (Inbox „konzeptionell falsch“) ist durch die Coach-Inbox überholt.
- `src/plan-main.jsx:4` importiert `./views/Plan/StrongApp.jsx`, die Datei fehlt; `plan.html` fehlt ebenfalls.
- `docs/ROADMAP.md` trägt noch den Titel „fitness-dev Roadmap“ (letzte Änderung `669c690d`).

## Ausbaustufen
| Bereich | Stufe | Was fehlt zum nächsten Schritt | Beleg |
|---|---|---|---|
| `plan-main.jsx` | Gerüst | Import auf fehlende `StrongApp.jsx`, kein HTML-Einstieg; löschen oder reparieren | `src/plan-main.jsx:4` |
| Fitness-SPA (`main.jsx`→`App.jsx`) | Gerüst | In keinem Coach-HTML eingebunden (nur `coach-main`/`local-main`); Entry ergänzen oder als extern markieren | `coach.html:29`, `7235c384` (12.11.) |
| Plan-Tab `views/Plan` | halb | Nur 2 Dateien plus `components/`; Editor liegt im Submodul (leer im Checkout, Stand unsicher); zuletzt 14.10. | `1f860950`, #23 |
| Gemini-CI-Reparatur | halb | Ein echter roter Lauf bis grün | `NEXT.md` Gemini-Abschnitt, #24 |
| Anamnese / Fokus | verwaist | Nur per Nav-Umschaltung erreichbar; seit 09.08. unberührt; Nutzung unbekannt | `NavigationItems.js:43-48`, `ab2b7e2d`, #22 |
| `gas-coach-summary/` | verwaist | Telegram-Briefing; kein Verweis in `package.json`/`.github`; seit 21.10.; Betrieb unbekannt | `bef8949f` |
| `monolith.py`, `refactor_catalog.py` | verwaist | Keine Referenz im Code; seit 11.07.; löschen oder archivieren | `0875e371`, #25 |
| Muscles | benutzbar | Als Review-Subtab aktiv, nur Doku falsch | `WeeklyReview/index.jsx:111` |
| Coach-Shell (Anfragen, Katalog, Klienten) | benutzbar | Live-Prüfung offen | `src/shell/NavigationItems.js` |
| Lokale Pläne / ClientForge | benutzbar | – | `local.html`, `clientforge.html` |
| Vault-Enricher, Postgres-Schicht | Idee | Nur NEXT-Einträge, wartet auf „Urgency“ | `NEXT.md` |

## Vergessene Schätze
- `gas-coach-summary/`: Gemini-Tagesbriefing per Telegram (Code.js, `telegramClient.mjs`), seit 21.10. unberührt.
- `scripts/` mit Mini-App-/Katalog-/KB-Buildern (`build-miniapp.mjs`, `build-catalog-ui.mjs`), dokumentiert in `docs/MINI-APPS.md`.
- `anatomy-agent.skill` und `anatomy-kb/` im Repo-Root (`7e57e326`).
- `twa/` (Android-Hüllen) laut `docs/TWA-APK.md`; Stand nicht geprüft.
- `src/views/Muscles/` (12 Dateien) lebt im Wochenrückblick.

## Empfehlung für diese Woche
1. Entscheiden: Fitness-SPA und `plan-main.jsx` löschen, reparieren oder als extern markieren; dann #22–#25 schließen oder behalten.
2. Prüfen: `tractionDaily`, Taskwarrior-Anzeige und neue GitHub-Inbox live, dann Deploy Coach mit production=true.
3. Korrigieren: `OVERVIEW.md` und `DISCONNECTED.md` an den Code angleichen; verbleibende pnpm-Stellen in `docs/` sichten.

## Seit letzter Woche
- HEAD ist `c0c2c4a1` statt `f88361d4`; ein Docs-Commit, der den README-pnpm-Widerspruch behebt.
- Neu: Issues #22–#25 aus der letzten Analyse; Backlog-Punkt in `NEXT.md`.
- Unverändert offen: `plan-main.jsx` defekt, Doku-Drift in `OVERVIEW.md`/`DISCONNECTED.md`, KB-Gitlink, Live-Verifikation.
