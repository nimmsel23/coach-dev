# Python Backend — Refactor Plan

Stand: 2026-06-18

---

## Kontext & Ziel

Das Fitness-Ecosystem hat zwei klare Betriebswelten:

| Welt | Nutzer | Datenhaltung | Server |
|------|--------|-------------|--------|
| **PWA (Cloud)** | Clients + Coach mobil | Firebase/Firestore | Firebase Hosting (kein lokaler Server) |
| **Coach Local** | Coach am Desktop | `~/.aos/fitness/` (JSON/SQLite) | Lokale Server |

Das Problem: `server.mjs` versucht beide Welten zu bedienen und hat dabei Verantwortlichkeiten aufgesammelt, die nicht zusammengehören. Gleichzeitig existieren zwei Python-Server (`:9120` und `:9200`) mit erheblicher Überlappung.

---

## Ist-Zustand: Drei Server, unklare Grenzen

```
:9100  server.mjs (Hono/Node)
       └── Sessions, Journal, Body, CSV-Exports
       └── Static/SPA serving
       └── wger-Proxy (Fallback für Exercise-Suche)  ← falsch platziert
       └── Proxy → :9120 (muscles, inbox, teaching)  ← Durchleitung ohne Mehrwert
       └── muscleToGroupId, computeCoverage* (KB-Logik in Node)  ← Duplikat

:9120  catalog/server.py (aiohttp)
       └── /exercises, /exercise/{id}, /resolve
       └── /muscles, /taxonomy, /snapshot
       └── /plan, /weekly
       └── /inbox/* (Approve/Reject Workflow)
       └── /export/{kind}

:9200  anatomy-kb/server.py (aiohttp)
       └── /api/exercises, /api/exercise/{id}/teaching
       └── /api/muscles, /api/muscles/{id}/enrich
       └── /api/resolve, /api/plan/generate
       └── /api/firestore/sync/* (Firestore-Sync)
       └── /api/db/sync, /api/db/status, /api/db/query
       └── importiert catalog direkt als Python-Modul
```

`anatomy-kb/server.py` importiert `catalog` bereits als internes Modul — d.h. `:9200` hat `:9120` konzeptionell schon absorbiert. `:9120` läuft trotzdem noch parallel.

---

## wger — kein Teil dieses Servers

wger ist der **Ursprung** der Katalogdaten — einmaliger Import, keine laufende Abhängigkeit. Die `catalog`-Pipeline hat die wger-Daten bereits verarbeitet, normalisiert und in den Katalog (lokal) und Firestore (Cloud) geschrieben. Danach ist wger aus dem Bild.

`server.mjs` hat fälschlicherweise einen Live-Proxy zu wger als Exercise-Fallback eingebaut. Der war nie nötig — die Daten sind bereits im Katalog. Im Python-Backend existiert kein wger-Proxy.

---

## Soll-Zustand: Zwei klare Server

```
:9100  server.mjs (Hono/Node)  — "Session Store"
       └── Sessions (GET/POST/DELETE, multi-user)
       └── Journal (GET/POST/LIST)
       └── Body metrics (GET/POST)
       └── CSV-Exports (csv, pflichtaufgabe)
       └── Firestore-Mirror (mirrorSession, mirrorJournal)
       └── Static/SPA fallback für lokale Entwicklung
       └── HabitSync-Proxy (bleibt, gehört zu Coach-UX)

:9200  anatomy-kb/server.py  — "Coach Brain API"
       └── /api/exercises, /api/exercise/{id}
       └── /api/exercise/{id}/teaching
       └── /api/muscles, /api/muscles/{id}
       └── /api/resolve, /api/plan/generate
       └── /api/inbox/* (Approve/Reject)       ← von :9120 migrieren
       └── /api/weekly                          ← von :9120 migrieren
       └── /api/firestore/sync/*
       └── /api/db/*
```

`:9120` fällt weg. `server.mjs` proxied direkt nach `:9200` (statt `:9120`).

---

## Migrationsschritte (non-destruktiv, reihenfolge-sicher)

### Phase 1 — Inbox + Weekly nach :9200 portieren
`anatomy-kb/server.py` bekommt die fehlenden Routen:
- `GET/POST/DELETE /api/inbox/*` — Handler aus `catalog/server.py` übernehmen
- `GET /api/weekly` — analog

**Datei:** `anatomy-kb/anatomy_kb/inbox_handler.py` (neu)
**Einbinden in:** `anatomy-kb/server.py` → `create_app()`

Parallel: `catalog/server.py` bleibt unverändert (kein Breaking Change).

### Phase 2 — server.mjs Proxy auf :9200 umlenken
In `server.mjs` die 5 Proxy-Calls von `:9120` → `:9200` umstellen:

```js
// vorher
fetch("http://localhost:9120/muscles")
fetch("http://localhost:9120/inbox")
// nachher
fetch("http://localhost:9200/api/muscles")
fetch("http://localhost:9200/api/inbox")
```

Verifizieren, dass alle Endpunkte auf `:9200` antworten. Dann `:9120` stoppen.

### Phase 3 — wger-Proxy aus server.mjs entfernen
`fetchWger()` und die zwei Endpunkte die es nutzen aus `server.mjs` raus:
- `/exercises/search` — nur noch lokale KB
- `/exercises/by-group` — analog

Kein Ersatz nötig — die Daten sind bereits im Katalog.

### Phase 4 — KB-Logik aus server.mjs entfernen
Diese Funktionen sind in Node doppelt zu Python vorhanden und können weg,
sobald Coverage-Endpoints auf `:9200` delegieren:
- `muscleToGroupId()`
- `normMuscleKey()`
- `displayMuscleName()`
- `computeCoverage()`
- `computeCoverageAnatomy()`
- `/coverage/detailed`, `/coverage/anatomy`, `/coverage/gaps`

**Voraussetzung:** `:9200` bietet äquivalente Coverage-Endpoints (teilweise schon vorhanden via `/api/exercise/{id}/coverage`).

### Phase 5 — catalog/server.py deaktivieren
Sobald Phase 1+2 verifiziert: `catalog/server.py` aus systemd-Unit entfernen, Port `:9120` freigeben.

---

## Was NICHT geändert wird

- Session-Format (`~/.aos/fitness/users/{uid}/sessions/*.json`) — bleibt stabil
- Firestore-Mirror-Logik (`firestore-mirror.mjs`) — bleibt in Node
- `fitness-runtime.mjs` — bleibt (wird von `server.mjs` für Plan-Logik genutzt)
- SQLite dual-write (`syncSessionToDb`) — bleibt in Node
- `catalog` Python-Paket (Katalog-CLI, Audit, Enricher) — wird nicht angefasst, nur `server.py` davon

---

## CLAUDE.md Update (nach Abschluss)

```
| Fitness-Session | 9100 | ~/fitness-dev/server.mjs   | 6100 | /opt/fitness/server.mjs |
| Fitness-Brain   | 9200 | ~/fitness-dev/anatomy-kb/  | —    | (lokal only, Coach)     |
```

`:9120` wird aus der Tabelle entfernt.
