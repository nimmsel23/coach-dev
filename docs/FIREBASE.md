> Coach release instructions: [COACH-ARCHITECTURE.md](COACH-ARCHITECTURE.md). The inherited Fitness paths and services below are historical context, not Coach deploy commands.

# Firebase - AlphaOS Fitness

Stand: 2026-09-06

Firebase-Projekt: **fitness-aos**
PWA: **https://fitness-aos.web.app**

Diese Datei beschreibt den tatsaechlich genutzten Firebase-Pfad, den lokalen
Prod-Backend-Pfad und warum Firebase SDK / Firebase Admin nicht automatisch den
lokalen Coach-Server ersetzen.

## 1. Die drei Ebenen

Fitness hat im Firebase-Betrieb drei verschiedene technische Ebenen:

| Ebene | Laeuft wo? | Zweck |
|-------|------------|-------|
| Firebase Web SDK | Browser / Firebase Hosting | Auth, direkte Firestore-Lese-/Schreibzugriffe, Messaging, Vertex-Fallback |
| Firebase Admin SDK | lokale/Server-Prozesse | privilegierte Firestore-Zugriffe, Mirror, Watcher, Writeback |
| Fitness Prod Backend | lokaler Rechner, `/opt/fitness`, Port `6100` | Coach-Aktionen mit lokaler YAML-KB, Inbox-Enrichment, Source-Merge, Python-Pipeline |

Wichtig: Das Web SDK und Admin SDK sind Firebase-Zugriffe. Sie sind kein
Transportweg vom Handy oder Browser zu einem lokalen Python-Prozess. Wenn die
Firebase-PWA eine Aktion ausloesen soll, die lokale Dateien, lokale YAML-Kataloge
oder lokale Python/Gemini-Pipeline braucht, braucht sie einen erreichbaren HTTP
Endpoint zum lokalen Fitness-Backend.

## 2. Firebase Web SDK

Der Browser nutzt das Firebase Web SDK in:

- `src/firebase.js`
- `src/lib/db/firestore/*`

Das ist die richtige Ebene fuer:

- Login/Auth
- Firestore-Dokumente unter `fitness/{uid}/...`
- direkte Userdaten wie Sessions, Journal, Body, Plan
- Coach-Inbox-Dokumente in Firestore
- Browser-seitige Fallbacks wie Vertex AI, wenn das lokale Backend nicht erreichbar ist

Das Web SDK laeuft mit den Rechten des eingeloggten Users und den Firestore
Security Rules. Es kann nicht einfach lokale Dateien unter `/opt/fitness`,
`~/fitness-dev` oder `~/.aos/fitness` lesen.

## 3. Firebase Admin SDK

Das Admin SDK wird serverseitig genutzt, unter anderem in:

- `fitness/firestore/_db.py`
- `firestore-mirror.mjs`

Credential:

| Datei | Zweck |
|-------|-------|
| `~/.env/firebase-fitness.json` | Service Account fuer lokale Mirror-/Python-Pfade |
| `firebase.config.js` | Web-App Config, gitignored |
| GitHub Secrets | `FIREBASE_CONFIG`, `FIREBASE_SERVICE_ACCOUNT` |

Das Admin SDK ist die richtige Ebene fuer privilegierte Server-Aktionen gegen
Firestore. Es ersetzt aber nicht den Netzwerkweg zum lokalen Backend. Ein Admin
SDK Prozess muss irgendwo laufen. Wenn er auf dem Laptop laeuft, muss der Laptop
trotzdem erreichbar sein, sobald die Firebase-PWA eine lokale Coach-Aktion
ausloesen soll.

## 4. Lokales Fitness Prod Backend

Der lokale Prod-Server ist:

```text
http://127.0.0.1:6100
```

Im aktuellen Prod-Betrieb ist das der Python/FastAPI-Server aus `/opt/fitness`,
nicht `server.mjs` als vorgeschaltetes Edge. `server.mjs` hat kompatible
Proxy-Routen, ist aber fuer den laufenden Port `6100` nicht die aktive Schicht,
wenn `uvicorn`/FastAPI dort direkt lauscht.

Wichtige Coach-Inbox-Endpoints:

```text
GET  /health
POST /fitness/inbox/{id}/reenrich
POST /fitness/inbox/{id}/approve
POST /fitness/inbox/{id}/link-source
GET  /fitness/inbox/{id}/duplicates
POST /fitness/inbox/{id}/merge-duplicates
```

Die Firebase-Builds loesen die Base URL fuer diese lokalen Coach-Aktionen so
auf:

1. `localStorage["fitness-local-api-base"]`
2. `VITE_LOCAL_FITNESS_API_BASE`
3. Firebase-Hosting-Default:
   `https://ideapad.tail7a15d6.ts.net/fitness/fitness`
4. Desktop-Fallback:
   `http://127.0.0.1:6100/fitness`

Der Desktop-Fallback ist:

```js
LOCAL_FITNESS_API_BASE = "http://127.0.0.1:6100/fitness"
```

Das ersetzt das alte `BRIDGE_API_BASE`. `BRIDGE_API_BASE` ist nicht mehr der
relevante Vertrag fuer den Coach-Inbox-Pfad.

## 5. `0.0.0.0` vs Browser-URL

`0.0.0.0` ist nur eine Bind-Adresse fuer Server. Sie bedeutet:

```text
Der Server lauscht auf allen Interfaces.
```

Sie ist keine sinnvolle URL fuer den Browser.

Richtige Unterscheidung:

| Wert | Bedeutung |
|------|-----------|
| `0.0.0.0:6100` | Server lauscht auf allen Interfaces |
| `127.0.0.1:6100` | Browser und Server laufen auf derselben Maschine |
| `LAN-IP:6100` | anderes Geraet im selben Netz erreicht den Rechner |
| `tailscale-hostname/...` | anderes Geraet erreicht den Rechner ueber Tailscale/Funnel |

Wenn die Firebase-PWA am selben Desktop-Browser laeuft, kann
`http://127.0.0.1:6100/fitness` funktionieren.

Wenn die Firebase-PWA am Handy laeuft, zeigt `127.0.0.1` auf das Handy selbst,
nicht auf den Laptop. Dann braucht die App entweder eine LAN-IP, einen Tailscale
Hostnamen oder einen Cloud-Backend-Pfad.

## 6. Aktueller Tailscale/Funnel-Stand

Der aktuelle Funnel-Status enthaelt fuer Fitness:

```text
/fitness/ proxy http://127.0.0.1:6100/
/fitness-api/ proxy http://localhost:9150/
/fitness-dev/ proxy http://localhost:9100/
/fitness-catalog/ proxy http://localhost:9150/catalog-ui/
```

Damit gibt es jetzt einen extern erreichbaren Funnel-Pfad auf den lokalen
Fitness-Prod-Server:

```text
https://ideapad.tail7a15d6.ts.net/fitness/
  -> http://127.0.0.1:6100/
```

Das heisst: Ein Handy kann den lokalen Prod-Coach-Server grundsaetzlich ueber
den Funnel erreichen. Die Firebase-App muss dafuer aber diese Base URL verwenden:

```text
https://ideapad.tail7a15d6.ts.net/fitness/fitness
```

Der doppelte `fitness`-Teil ist kein Tippfehler: Der Funnel-Pfad `/fitness/`
zeigt auf die Server-Root, und die API-Routen beginnen im Backend ebenfalls mit
`/fitness/...`.

Aktueller Code-Stand:

```js
localStorage["fitness-local-api-base"]
  || import.meta.env.VITE_LOCAL_FITNESS_API_BASE
  || "https://ideapad.tail7a15d6.ts.net/fitness/fitness" // Firebase Hosting
  || "http://127.0.0.1:6100/fitness"                     // Desktop fallback
```

Das funktioniert dadurch auf dem Desktop ohne weitere Einstellung und auf
Firebase Hosting automatisch ueber den Funnel. Fuer Sonderfaelle kann die Base
im Browser ueberschrieben werden:

```js
localStorage.setItem(
  "fitness-local-api-base",
  "https://ideapad.tail7a15d6.ts.net/fitness/fitness"
)
```

Eine reine Server-Bind-Aenderung auf `0.0.0.0` reicht dafuer nicht.

## 7. Coach-Inbox-Fluss

Firestore-Inbox:

```text
fitness/{uid}/inbox/{doc_id}
```

Lokale Katalog-Inbox:

```text
fitness/catalog/kb/inbox/*.yml
```

Der Coach-Tab liest die Inbox im Firebase-Build jetzt **local-first** ueber den
Fitness-Prod-Server auf Port `6100`. Firestore ist fuer die Inbox semantisch nur
noch Cache/Fallback: letzter bekannter Stand, Offline-Warteschlange und
Spiegelung fuer Handy/Cloud.

Der beabsichtigte Review-Fluss:

1. Ein Item liegt primaer als lokaler Inbox-Draft vor; Firestore kann eine
   Cache-Kopie davon enthalten.
2. Das Coach-Sheet zeigt vorhandene Source-Links und Kandidaten.
3. Der Coach verbindet passende `wger`- und `yuhonas`-Kandidaten.
4. Das Inbox-Item bekommt beide Referenzen:
   - `wger_id`
   - `yuhonas_id`
   - `external_ids`
   - `origin.source_refs`
   - `origin.wger`
   - `origin.yuhonas`
5. Reenrich baut das Inbox-Item neu auf dem aktuellen Pipeline-Stand auf, behält
   aber bestaetigte Provenance-Felder.
6. Das daraus entstehende Expert-Exercise soll beide Quellen referenzieren.

Das UI soll sich vom Gefuehl her wie ein Kontakte-Merge verhalten: Kandidaten
sehen, bestaetigen, zusammenfuehren, danach ein konsolidiertes Objekt behalten.

## 8. Was Firebase allein nicht loest

Firebase Web SDK loest:

- Browser liest/schreibt Firestore
- Auth/User-Kontext
- Offline-/Realtime-Client-Verhalten

Firebase Admin SDK loest:

- privilegierte Firestore-Schreibzugriffe
- serverseitige Sync- und Mirror-Jobs
- Push/Messaging-Serverlogik

Beides loest nicht automatisch:

- Zugriff auf lokale YAML-Dateien
- Zugriff auf lokale wger/yuhonas-Rohdaten
- lokale Python-Pipeline
- lokale CLI/Agent-Logik
- Netzwerkzugriff vom Handy auf den Laptop

Dafuer gibt es zwei saubere Zielarchitekturen:

| Variante | Beschreibung |
|----------|--------------|
| Hybrid lokal | Firebase bleibt Cloud-State, lokaler FastAPI-Server macht Coach-Workbench-Aktionen |
| Cloud-only | Coach-Backend wird nach Cloud Run / Cloud Functions verlegt und nutzt Admin SDK dort |

Der aktuelle Stand ist Hybrid lokal, aber fuer die Coach-Inbox mit harter
Local-First-Regel: Firestore darf anzeigen und puffern, aber nicht mehr alleine
final reenrichen oder approven.

## 9. Approve-Grenze im Coach-Tab

Source-Link, Reenrich und Approve gehen im Firebase-Build ueber den lokalen
Prod-Server. Beim Approve schreibt der lokale Server die Expert-YAML in:

```text
fitness/catalog/kb/exercises/*.yml
```

Danach spiegelt der Server den Status nach Firestore zurueck:

```text
fitness/{uid}/inbox/{doc_id} -> status: approved
fitness/kb/exercises/{exercise_id}
```

Wenn der lokale Server nicht erreichbar ist, zeigt der Firebase-Client nur noch
Firestore als `firestore_cache`/Offline-Cache an. Finales Reenrich und Approve
sollen dann fehlschlagen statt einen Cloud-only Expert-Datensatz ohne lokale
YAML-Lineage zu erzeugen.

Offen bleibt deshalb nicht mehr die Verdrahtung selbst, sondern der
Browser-Durchklick gegen die deployte Firebase-App plus laufendem `:6100`:
Source verbinden, Reenrich, Approve, danach Firestore und lokale YAML pruefen.

## 10. Deploy-Linien

Es gibt drei Linien, die man nicht vermischen darf:

### `~/fitness-dev`

- aktiver Dev-Checkout
- Branch `dev`
- hier passieren Implementierung, lokale Builds und lokale Desktop-Deploys
- hier startet auch die Preview-/CI-Linie

### `/home/alpha/vitalos/fitness-app`

- Release-Vessel fuer Firebase
- von `fitness-dev` wird hierhin weitergereicht
- von hier laeuft der eigentliche Firebase-Live-Deploy
- der Top-Level-Wrapper dafuer ist `fitness-release`

### `/home/alpha/vitalos`

- Parent-Repo
- bekommt am Ende den Submodule-Pointer-Bump
- relevant fuer Shell-/Meta-Repo-CI

Kurz:

- `fitness-dev` = Dev + lokale Deploys + CI-Ausgangspunkt
- `vitalos/fitness-app` = Firebase-Live-Release
- `vitalos` = Parent/Submodule-Pointer + Shell-CI

Der bequeme Top-Level-Wrapper fuer den Release-Pfad ist:

```bash
fitness-release
```

## 11. Lokaler Desktop-Deploy

Der localhost-Deploy ist bei Fitness dieselbe Grundidee wie bei Fuel:

1. Dev -> Staging
   - Quelle: `~/fitness-dev`
   - Ziel: `~/.local/fitness`
   - Mechanik: `./deploy.sh staging`
   - Wrapper: `fitness-devctl deploy` bzw. `fitnessctl dev deploy`

2. Staging -> Localhost-Prod
   - Quelle: `~/.local/fitness`
   - Ziel: `/opt/fitness`
   - Mechanik: `./deploy.sh prod`
   - Wrapper: `fitness-prodctl deploy` bzw. `fitnessctl prod deploy`

Wichtig:

- `~/.local/fitness` ist Staging, nicht Prod
- `/opt/fitness` ist der echte localhost-Prod-Stand
- `deploy.sh prod` liest aus `~/.local/fitness`, nicht direkt aus `~/fitness-dev`

Lokale Ports:

- Dev Backend: `:9100`
- Dev Python/API: `:9150`
- Dev Frontend: `:5902`
- Localhost-Prod: `fitness.service` auf `:6100` aus `/opt/fitness`

## 12. Firebase-Live-Release

Der Firebase-Live-Release passiert nicht aus einem historischen `~/fitness`
Vessel, sondern ueber den tatsaechlichen Release-Pfad:

1. Aenderungen in `~/fitness-dev` auf `dev`
2. weiter nach `/home/alpha/vitalos/fitness-app`
3. dort Live-Build + Firebase-Deploy
4. danach Parent-Pointer-Update in `/home/alpha/vitalos`

Praktische Antwort auf "wo deployt Fitness wirklich nach Firebase?":

- nicht aus einem separaten alten `~/fitness`-Vessel
- sondern aus `vitalos/fitness-app`

## 13. Build-Abhaengigkeiten

Vor Dev-/Prod-/Firebase-Builds laufen bei Fitness KB-Generierungen:

```bash
npm run build:kb-data
```

Das haengt bereits an:

- `predev`
- `prebuild`
- `prebuild:firebase`

Es umfasst:

- `build:sixpack-data`
- `build:bulk-data`
- `build:coaching-notes`

Wenn Generated-Dateien fehlen, ist zuerst zu pruefen, ob `build:kb-data`
wirklich vor dem eigentlichen Build lief.

## 14. Pruefkommandos

Lokaler Prod-Server:

```bash
curl -sS http://127.0.0.1:6100/health
```

Listener:

```bash
ss -ltnp
```

CORS-Preflight von Firebase Hosting Richtung lokalem Prod-Server:

```bash
curl -sSI \
  -X OPTIONS \
  -H 'Origin: https://fitness-aos.web.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  http://127.0.0.1:6100/fitness/inbox/example/link-source
```

Tailscale/Funnel:

```bash
tailscale funnel status
```

## 15. Nicht veraendern

- `fitness-dev` = Dev/localhost und `vitalos/fitness-app` = Firebase-Live-Release
- lokale Kette `~/fitness-dev -> ~/.local/fitness -> /opt/fitness`
- `fitness-release` als Top-Level-Release-Wrapper
- `@vos/cross-app-aliases` als SSOT fuer Cross-Repo-Aliase
- `build:kb-data` als feste Vorbedingung der Build-Pfade
- fuer Coach-Inbox-Aktionen nicht wieder `BRIDGE_API_BASE` einfuehren
