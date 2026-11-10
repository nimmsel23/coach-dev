# Coach (`coach-dev`)

Eigenständiges Coach-Produkt: HTTP-Server, Katalog/Inbox, Anbindung des
Plan-Editors und Firebase-Hosting für die Coach-Oberfläche. Zielbild:
[FREEDOM.md](./FREEDOM.md). Quartalsfokus: [FOCUS.md](./FOCUS.md).
Zuständigkeiten: [docs/OWNERSHIP-MAP.md](./docs/OWNERSHIP-MAP.md).

## Was hier liegt

| Bereich | Ort im Repo | Rolle |
| --- | --- | --- |
| HTTP-Server | [`server.py`](./server.py) | Ein Prozess: Catalog/Inbox (`fitness.api`), optionales `/fitness-api`, Fuel-Proxy, eingebettetes Relax, statische UIs |
| Katalog-CLI / Inbox | [`fitness/catalog/cli.py`](./fitness/catalog/cli.py) | Typer-CLI (`fitness-catalog`); Inbox-Befehle als Unterkommando `inbox` |
| Dispatcher | [`bin/coach`](./bin/coach) | `catalog`, `inbox`, `server`, `release` und weitere Werkzeuge |
| Plan-Editor | [`modules/plan`](./modules/plan) | Gepinntes Submodul; Coach baut ihn ein, besitzt ihn nicht |
| Coach-UI | `src/`, `coach.html`, `coach-shell.html`, `local.html` | Vite-Build nach `dist-coach/` |
| Katalog-UI | `catalog-ui/` | Build nach `dist-catalog/` (`pnpm run build:catalog-ui`) |
| Hosting | [`.firebaserc`](./.firebaserc), [`firebase.json`](./firebase.json) | Target `coach`, Site `vos-coach`, Ausgabeverzeichnis `dist-coach` |

`server.py` hört standardmäßig auf `127.0.0.1:9150` (`COACH_HOST` / `COACH_PORT`,
auch `--host` / `--port`). Die Unit [`systemd/coach-api.service`](./systemd/coach-api.service)
setzt dieselben Werte und trägt den Alias `fitness-api.service`. Zusätzlich
bindet der Prozess den Alias-Port `8788` (`COACH_ALIAS_PORT`), sofern er nicht
auf `0` gesetzt ist. Liveness: `GET /health` und `GET /_coach/health`.

Unter `:9150` liegen die gebaute Katalog-UI auf `/` und `/catalog-ui/`, die
Coach-UI auf `/coach/` und Dateien aus dem Submodul `website/` auf `/website/`.

## Stack

- **Python:** FastAPI und Uvicorn. Server-Abhängigkeiten in
  [`requirements-server.txt`](./requirements-server.txt). Das Paket `fitness`
  (Katalog, API-Router, CLIs) steht in [`pyproject.toml`](./pyproject.toml)
  (Python ≥ 3.11, Poetry).
- **Frontend:** React 18 und Vite 6 (`package.json`, Paketmanager pnpm 11).
  Der Dev-Server lauscht auf Port **5902** und proxyt API-Pfade nach
  `http://localhost:9150`. Der Coach-Build enthält zusätzlich die Vue-Shell
  `coach-shell.html` neben den React-Seiten `coach.html`, `local.html` und
  `clientforge.html`.

## Submodule

Aus [`.gitmodules`](./.gitmodules):

| Pfad | Remote | Branch im Eintrag |
| --- | --- | --- |
| `fitness/catalog/kb` | `git@github.com:nimmsel23/fitness.git` | `main` |
| `modules/plan` | `https://github.com/nimmsel23/plan-dev.git` | `dev` |
| `vitalos` | `git@github.com:nimmsel23/vitalos.git` | `coach` |
| `website` | `git@github.com:nimmsel23/daniel-vitaltrainer-firebase.git` | `main` |

`fitness/catalog/kb` ist die YAML-Wissensbasis. Der Katalog-Python-Code liegt
im umgebenden Paket `fitness/catalog/` in diesem Repo. `modules/plan` ist der
Plan-Editor; Vite löst `@plan` dorthin auf. Der Gitlink pinnt einen Commit,
der Branch-Eintrag `dev` benennt nur die Quelllinie. `website` ist das
Vitaltrainer-Portal. `vitalos` ist ein optionales, historisches Checkout; der
Deploy-Workflow [`.github/workflows/deploy-coach.yml`](./.github/workflows/deploy-coach.yml)
initialisiert es nicht.

```sh
git submodule update --init modules/plan fitness/catalog/kb website
# nur bei Bedarf:
git submodule update --init vitalos
```

## Schnittstellen

**Catalog / Inbox im selben Prozess.** `attach_fitness_api()` hängt die Router
aus `fitness.api` direkt an die Coach-App: Sessions, Journal, Exercises,
Coaching, Pläne, Workouts, Anatomie und die Inbox unter `/fitness/inbox`
(`exercises.py` bindet `exercises_inbox` ein). Dafür gibt es keinen separaten
Upstream-Port.

**`/fitness-api` aus dem Ordner `backend/`.** `load_fitness_app()` lädt
`backend/api/app.py` und mountet unter `/fitness-api`. Default:
`COACH_FITNESS_BACKEND_ROOT=~/dev/coach-dev` (Repo-Root mit Ordner `backend/`).
Fehlt die Datei, startet Coach ohne diesen Mount. Die Unit setzt die Variable.

**Fuel-Proxy.** [`coach-backends.json`](./coach-backends.json) enthält als
einzigen Eintrag `fuel` → `http://127.0.0.1:8000/api/fuel`. Daraus werden
`/api/fuel` und `/fuel-api` weitergereicht. Ein Upstream auf den eigenen
Coach-Port wird abgelehnt. Weitere Proxys stehen in derselben Datei bzw. über
`COACH_<NAME>_API_URL`; siehe [coach-backends.README.md](./coach-backends.README.md).

**Relax**, wenn vorhanden: `src/relax_api.py` lädt eine fremde FastAPI-`app`
(`COACH_RELAX_API_FILE`, Code-Default `~/dev/relax-dev/server.py`) und mountet
sie unter `/api/relax` und `/relax-api`. Fehlt die Datei, entfallen die Routen.

## Lokal starten

```sh
pnpm install
python3 -m venv .venv
.venv/bin/pip install -r requirements-server.txt

pnpm run build:catalog-ui    # dist-catalog/; Quelle catalog-ui/ (oder COACH_CATALOG_SOURCE)
.venv/bin/python server.py   # 127.0.0.1:9150

# liegt FastAPI im aufgerufenen python3:
pnpm start                    # python3 server.py
pnpm run server:dev           # python3 server.py --reload

# Frontend, startet den Python-Server nicht:
pnpm run dev                  # Vite :5902, öffnet /coach.html
pnpm run ui:dev               # Vite :5902, öffnet /coach-shell.html
```

User-Unit: `bin/coach-server install|start|status|health|logs`. Vor einem
zweiten Prozess auf demselben Port den laufenden Dienst stoppen.
`/fitness-api` erscheint nur, wenn `COACH_FITNESS_BACKEND_ROOT` gesetzt ist
und das Paket importierbar ist.

Die Katalog-CLI ist `fitness-catalog` (`fitness.catalog.cli:main` in
`pyproject.toml`). `bin/coach catalog` und `bin/coach inbox` zeigen auf
dieselbe Typer-App. `coach_cli.py` setzt `FITNESS_ROOT` auf `../fitness-dev`
und startet das Paket von dort; der Quelltext liegt in diesem Checkout unter
`fitness/`. Ob der Dispatcher ohne dieses Nachbarverzeichnis startet, ist
offen. Details: [docs/COACH-CLI.md](./docs/COACH-CLI.md).

## Deploy

Firebase-Projekt `fitness-aos`, nur Hosting-Target `coach` (Site `vos-coach`,
öffentlich `https://vos-coach.web.app` — diese URL prüft
[`bin/coach-release`](./bin/coach-release)). Firestore-Regeln stehen nicht in
`firebase.json` und werden von hier nicht ausgerollt.

```sh
pnpm run build:firebase:coach   # vite build --mode coach → dist-coach/
pnpm run firebase               # dieser Build plus firebase deploy --only hosting:coach
```

`pnpm run deploy` akzeptiert nur den Modus Firebase und ruft danach
`npm run firebase` auf. `deploy.sh`, `pnpm run deploy:local` und
`pnpm run deploy:prod` beenden sich mit dem Hinweis, dass es kein lokales
Staging-/Prod-Dienst-Deploy gibt.

CI ([`.github/workflows/deploy-coach.yml`](./.github/workflows/deploy-coach.yml)):

- Push auf `dev` (Pfadfilter): Preview-Channel `dev`, 24 Stunden, nur `hosting:coach`.
- Manuell `workflow_dispatch` mit `production=true`, und nur von `dev`: Live-Deploy.
- `bin/coach-release` stößt denselben Production-Lauf für den bereits
  veröffentlichten `origin/dev` an und prüft `release.json` auf
  `https://vos-coach.web.app`.

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [docs/OWNERSHIP-MAP.md](./docs/OWNERSHIP-MAP.md) | Wer welche Quelle besitzt |
| [docs/COACH-SERVER.md](./docs/COACH-SERVER.md) | Prozess, Routen, Umgebungsvariablen |
| [docs/COACH-ARCHITECTURE.md](./docs/COACH-ARCHITECTURE.md) | Shell, Releases, Submodule |
| [docs/COACH-PLAN-WORKFLOW.md](./docs/COACH-PLAN-WORKFLOW.md) | Plan-Editor und Pointer |
| [docs/COACH-CLI.md](./docs/COACH-CLI.md) | `bin/coach` |
| [AGENTS.md](./AGENTS.md) | Arbeitsregeln für dieses Repo |
