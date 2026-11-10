# FOCUS (coach-dev)

Quartals-Fokus mit **genau drei Monatsmissionen** — worauf die Abteilung Coach
ausgerichtet ist. Pro Quartal eine Bahn, drei Monatsschritte.

Horizon: [FREEDOM.md](FREEDOM.md) — App nutzbar für Klientenbetreuung und
Fortschrittsüberwachung. `FIRE.md` = wöchentliche Hits. `TODO.md` = zweite
Stufe. `HOT.md` = Potential.

---

## 2026-Q4 (Okt–Dez)

Bahn Richtung Freedom: Coach-App im Alltag nutzbar für Betreuung und
Fortschritt. Server-SOT / Keepers / UI ohne Legacy-Hops sind Mittel dazu —
kein Tree-Move-Theater.

| Monat | Mission | Status |
| --- | --- | --- |
| 2026-10 | Coach-Betrieb greifbar (Lokal + Klienten-Pfad) | erledigt |
| 2026-11 | Ein Coach-Server, SOT = coach-dev | aktiv / weitgehend |
| 2026-12 | Catalog-UI aus Coach-Dist; Rest-Upstreams nur bewusst | geplant |

### 2026-10 — Coach-Betrieb greifbar (Lokal + Klienten-Pfad)

Coach als eigenes Produkt-Backend plus Coach-Oberfläche: Local Planning,
Klienten-/Praxis-CLIs, Conversations/Plan-Kontext — ohne Meta-Repo als
Laufzeit-Zuhause.

- Local Planning / ClientForge-Pfade über Coach `:9150`.
- Dispatcher (`coach …`) für Praxis/Klienten/Konsole.
- Coach↔Klienten-Kommunikation dokumentiert und angebunden.

### 2026-11 — Ein Coach-Server, SOT = coach-dev

**Laufzeit + Ownership der Coach-API:** `~/dev/coach-dev/server.py` auf `:9150`
(`coach-api.service`). Ein Listening-Prozess für Catalog/Inbox/Enrichment,
embedded Relax, Legacy-Klienten und Coach-SPA.

- Kein zweites Zuhause unter `vitalos` / `vitalos-prod` für diesen Server.
- Edits am Coach-HTTP-Server nur in coach-dev. Sessions-Code:
  `~/dev/coach-dev/backend/` — Coach mountet `/fitness-api`
  (`COACH_FITNESS_BACKEND_ROOT` Default = `~/dev/coach-dev`).
- Node/Functions in `~/dev/backend`: kein paralleles Coach-Inbox-Zuhause.
- Upstreams in `coach-backends.json` nur noch für Domänen, die bewusst fremd
  bleiben (heute: Fuel → VitalOS `:8000`). Fitness/`fitness.api`, `/fitness-api`
  und Relax sind lokal im selben Prozess.

Details: [docs/COACH-SERVER.md](docs/COACH-SERVER.md),
[docs/OWNERSHIP-MAP.md](docs/OWNERSHIP-MAP.md).

### 2026-12 — Betreuung & Fortschritt ohne Reibung (UI + bewusste Upstreams)

Monatsmission: Coach-Oberfläche so, dass Betreuung und Fortschrittsblick
alltagsfähig sind — Catalog-/Coach-UI aus Coach-Builds unter `:9150`, ohne
Legacy-Fitness-SPA-Hop. Fuel bleibt Proxy bis Domänen-Freigabe.

- FIRE: Frontend-Serve Katalog-UI (Scope `+ceo`) im Dienst der nutzbaren App.
- Optional: Fuel-Upstream-Cutover nur mit Domänen-Freigabe.
- Deploy-/Unit-Quellen (KB-Seed, `coach-sync` Install-Pfad) nachziehen.

---

*Nächstes Quartal (2027-Q1): drei neue Monatsmissionen hier eintragen; Q4 nicht
überschreiben, sondern Abschnitt darunter belassen oder nach RESULTS auslagern.*
