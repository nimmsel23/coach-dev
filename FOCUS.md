# FOCUS (coach-dev)

Monatsmission — worauf die Abteilung Coach ausgerichtet ist.
`FIRE.md` = wöchentliche Hits. `TODO.md` = zweite Stufe. `HOT.md` = Potential.

## 2026-11 — Ein Coach-Server, SOT = coach-dev

**Laufzeit + Ownership der Coach-API:** `~/dev/coach-dev/server.py` auf `:9150`
(`coach-api.service`). Ein Listening-Prozess für Catalog/Inbox/Enrichment,
embedded Relax, Legacy-Klienten und Coach-SPA.

- Kein zweites Zuhause unter `vitalos` / `vitalos-prod` für diesen Server.
- Kein Pflicht-Tree-Move von `~/dev/backend` hierher — Trees dürfen liegen;
  Edits am Coach-HTTP-Server nur in coach-dev.
- `~/dev/backend`, `plan-backend`, `fuel-backend` / alte `fitness-backend`-Pfade:
  Pointer „nicht Coach-:9150-SOT“, keine parallele Coach-API-Entwicklung.
- Upstreams in `coach-backends.json` nur noch für Domänen, die bewusst fremd
  bleiben (heute: Fuel → VitalOS `:8000`). Fitness/`fitness.api` und Relax sind
  lokal im selben Prozess.

Details: [docs/COACH-SERVER.md](docs/COACH-SERVER.md),
[docs/OWNERSHIP-MAP.md](docs/OWNERSHIP-MAP.md).
