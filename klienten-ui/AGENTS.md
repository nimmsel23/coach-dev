# Klienten-UI — Agenten-Guide (ClientForge + Konsole)

## Produkt-Schnitt

| Oberfläche | Route | Aufgabe |
|---|---|---|
| **ClientForge** | `:9150/schmiede/`, `/k/<id>/` | Coaching-Werkstatt: Yuhonas, Trainingsplan, Ernährung, Habits/Journal |
| **Konsole** | `:9150/konsole/` | CRM + Buchhaltung (EspoCRM, Rechnungen, hledger) |

Nicht vermischen: Pläne/Ernährung in ClientForge, Geld/CRM in der Konsole.

**ClientForge** (Build unter `schmiede/`, Route `/schmiede/`) = lokale Klienten-Werkstatt.  
**Coach-Firebase-App** (`dist-coach`, `/coach/`, Hosting `coach`) bleibt eigenständig —
nicht durch ClientForge ersetzen und umgekehrt.

## Quellen

- Schmiede-Source: `klienten-ui/schmiede-src/` → Build nach `klienten-ui/schmiede/`
- Konsole-Source: `klienten-ui/konsole-src/` → Build nach `klienten-ui/konsole/`
- Daten: `~/.local/Klienten/<client_id>/` (u. a. `fuel-plan.json`, Pläne, Journal)
- Yuhonas-DB: `coach-dev/fitness/catalog/kb/vendor/free-exercise-db/`

## Build

```bash
cd ~/dev/coach-dev/klienten-ui/schmiede-src && npm install && npm run build
cd ~/dev/coach-dev/klienten-ui/konsole-src && npm install && npm run build
```

Coach-Server nicht killen — Static-Builds greifen sofort unter `/schmiede/` und `/konsole/`.
API-Änderungen (`coach_yuhonas.py`, `coach_legacy_clients.py`, `klienten-python`) brauchen Reload des Coach-Prozesses (Owner).

## Cursor-Agent / CLI-first

Bevor UI-Fläche angefasst wird: bestehende CLIs nutzen.

```bash
coach clients                          # Klientenliste
coach fitness-log clients <id>         # Trainingslog
fitness catalog search "bench"         # Katalog (angereichert)
curl -s 'http://127.0.0.1:9150/yuhonas/search?q=squat&limit=5'
curl -s 'http://127.0.0.1:9150/k/<id>/plan/fuel'
curl -s -X POST 'http://127.0.0.1:9150/k/<id>/plan/fuel' \
  -H 'content-type: application/json' \
  -d '{"makros":{"kalorien":2200,"protein":160},"mahlzeiten":[{"name":"Frühstück","zeit":"07:30","items":["…"]}]}'
coach konsolectl --help                # CRM/Buchhaltung CLI
```

### Agent-Hooks (ClientForge)

1. Übung finden → `/yuhonas/search` oder `fitness catalog search`
2. Ernährungsplan schreiben → POST `/k/<id>/plan/fuel` (Datei `fuel-plan.json`)
3. Trainingsplan → nativer ClientForge-Tab bzw. GET/POST `/api/client/<id>/plan`
4. Keine Espo/hledger-Mutationen aus ClientForge
5. In ClientForge keine iframes auf `/coach/*` einbetten

### Agent-Hooks (Konsole)

1. Übersicht → `/api/overview` bzw. `coach praxis`
2. CRM-Link / Rechnungen → `/api/client/<id>/crm`, `/api/client/<id>/billing`
3. Buchhaltung → `coach konsolectl`, hledger-Export unter `/konsole/api/hledger/export`

## UI-Erwartungen

- ClientForge-Tabs: Heute · Trainingsplan · **Yuhonas** · **Ernährung** · Habits · Journal · Entspannung · Kalender
- Konsole-Tabs: Übersicht · **CRM** · **Zahlung** · Notizen · HabitSync · → ClientForge
