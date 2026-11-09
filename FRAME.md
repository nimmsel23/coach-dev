# FRAME — coach-dev

Stand: 2026-11-09. Ehrliche Bestandsaufnahme (Repo + App), kein Wunschdenken.

## Was ist das?

| | |
|---|---|
| **Rolle** | Coach-Produkt: Schmiede, Zuweisung, Local-Backdoor, Catalog-Python, API |
| **Repo** | `~/dev/coach-dev` → `nimmsel23/coach-dev` |
| **Branch** | `dev` @ aktuell sync `origin/dev` |
| **Pkg** | `coach` 3.0.0 |
| **Laufzeit** | `coach-api.service` **active** → `127.0.0.1:9150` |

## App / Oberfläche

- Coach-UI (Inbox, Klienten, Plan-Host, Local-Planning, Kommunikation)
- Plan-Editor aus Submodul `modules/plan` (Pin, kein Sibling-Fallback in Prod-Logik)
- Hosting/Preview über Coach-Workflows; Rules-Teil `firestore.rules.part` → VitalOS

## Backend / Daten (hier SOT für Tooling)

| Domäne | Ort |
|---|---|
| Catalog = KB (Exercises+Muscles) | Submodul `fitness/catalog/kb`; Gate = Inbox; Build → JS in Apps |
| Catalog-CLI / Enrichment | `fitness/catalog/` — `coach catalog` (Werkzeug, nicht App-Kern) |
| Atlas | Frontend: aktive DB anzeigen + IndexedDB-Mirror am Gerät; Default = Yuhonas |
| FastAPI Sessions/Workouts/Inbox | `fitness/api/` gemountet in `server.py` |
| Klienten-Python | `klienten-python/` in-tree; UI noch `~/dev/klienten-dev` |
| Praxis-CLIs | `coach praxis` / `klientenctl` / `konsolectl` → `~/dev/praxis-dev` |

**Nicht SOT:** `~/dev/backend` (Node only), `fitness-dev/fitness/` Fork,
archivierte `fitness-cli` / `fitness-backend`.

## Submodule (Stand)

| Path | Pin / Hinweis |
|---|---|
| `fitness/catalog/kb` | `nimmsel23/fitness` @ `9a850a1` |
| `modules/plan` | plan-dev Pin (Pointer-Hygiene bei Plan-Releases) |
| `vitalos` | Kontext/Checkout — lokal dirty möglich, nicht Hosting-SOT |
| `website` | untracked Inhalt möglich |

## Repo-Zustand

- Breakthrough in `ARCHITECTURE.md` + `docs/OWNERSHIP-MAP.md`
- KB nicht mehr in-tree YAML-Kopie — echte Gitlink-Bindung
- Orphans: `~/dev/_archive/2026-11-09-fitness-orphans/`;
  `archive/obsolete-units-2026-11-09/` (tote `:8100`-Unit)
- Dispatcher: Catalog, Praxis, Klienten über `coach` CLI

## Release

`dev` push → CI; Plan-Änderungen erst in plan-dev, dann Gitlink hier bumpen.
Coach Hosting eigenständig; Shell-Pfad historisch/gesondert (kein `vitalos/coach-app`-Zwang).

## Offen / Drift

- `modules/plan` ggf. hinter neuestem `plan-dev/dev` — nach Plan-Push Pointer prüfen
- `vitalos`/`website` Working-Tree-Noise aufräumen wenn störend
- Klienten-UI noch Sibling; Absorption in Coach offen
- Enricher-Unit ggf. noch auf alte WDs prüfen (`FITNESS_AGENT_KB` → Submodul-Pfad)

## Ein Satz

Coach ist Betrieb und Gehirn; Plan ist der Editor-Vertrag; Fitness ist der Klient.
