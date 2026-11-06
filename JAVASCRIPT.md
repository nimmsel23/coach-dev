# Fitness als JavaScript-Stack

Stand: 2026-09-24. Dieses Dokument wächst mit der Umsetzung. Das Produktziel
ist ein Coach-UI am Laptop, in dem ich einem Klienten seine Routine als
Trainingsplan zusammenstelle und als App bereitstelle. Zwischen Coach-Laptop
und Klienten-PWA liegt Firebase/Firestore. Die Klienten-App muss auf
Mobilgeräten auch offline funktionieren. React stellt beide Oberflächen,
Node soll die lokale Coach-Fachlogik, API und CLI tragen. Der bestehende
Python-Code bleibt als Referenz und laufender Pfad erhalten, bis eine Funktion
nachweislich vollständig übernommen ist.

## Produktfluss und Architekturgrenze

```text
Coach-UI auf dem Laptop → Plan bearbeiten → Firestore → Klienten-PWA
                                                ↕
                                    persistenter lokaler Cache
```

Der Node-Server ist ein Werkzeug auf der Coach-Seite. Die Klienten-PWA darf
für Plananzeige, Training und Erfassung nicht von der Erreichbarkeit des
Coach-Laptops abhängen. Firestore ist Transport und gemeinsamer
Synchronisationspunkt zwischen den Geräten. Offline-Zugriff und ausstehende
Schreibvorgänge müssen in der Klienten-PWA sichtbar und verlässlich sein.

Der vorhandene Firebase-Build initialisiert Firestore mit
`persistentLocalCache({ tabManager: persistentSingleTabManager() })` in
`src/firebase.js`. Das ist ein IndexedDB-gestützter Firestore-Cache.
`public/sw.js` hat zusätzlich eine eigene IndexedDB-Warteschlange für
HTTP-Requests. Diese beiden Mechanismen haben verschiedene Aufgaben; ihre
Existenz allein beweist noch keinen vollständigen Offline-Trainingsablauf.
Der Ablauf Plan empfangen → offline öffnen → Training erfassen → nach
Reconnect synchronisieren braucht einen eigenen Ende-zu-Ende-Test.

Im heutigen Code existieren mehrere Planbegriffe: `routines` als
Vorlagen, `wf_workouts` als zugewiesene Pläne und `macrocycles` als
Trainingszyklen. Vor einem produktiven Node-Umschalten muss klar sein,
welches Objekt der Coach veröffentlicht, was der Klient als Plan sieht
und wie Versionen, Änderungen und abgeschlossene Trainings dazu gehören.

## Tatsächlicher Ausgangspunkt

- Der lokale Vite-Proxy in `vite.config.js` schickt API-Aufrufe derzeit an
  Python/FastAPI auf `:9150`. Staging/Prod starten ebenfalls
  `fitness.api.main:app` über `deploy.sh`.
- `server.mjs` bietet eine parallele Hono-API auf `:9100`. Einige Routen
  arbeiten selbst mit JSON-Dateien, andere leiten an Python weiter.
- Der Firebase-Build verwendet einen eigenen Firestore-`@db`-Adapter.
  `src/lib/db/firestore/routines.js` schreibt Routine-Dokumente und
  Übungen direkt nach Firestore;
  `src/lib/db/firestore/assignedPlans.js` schreibt Zuweisungen unter
  `fitness/{clientUid}/wf_workouts`. Bestimmte Coach-/Inbox-Funktionen
  sprechen zusätzlich die lokale Python-API.
- Python besitzt derzeit u. a. Routines/Workouts, Session-Sync nach SQLite,
  Katalog/YAML, Inbox/Enrichment und Firestore-Watcher. Die Fitness-CLI ist
  ebenfalls Python.

Ein Umzug ist erst abgeschlossen, wenn Coach-UI, Klienten-PWA, API/CLI und
Firestore denselben Planvertrag sprechen und der Offline-Pfad funktioniert.
Ein weiterer Proxy zählt nicht als Migration.

## Leitplanken

1. React ruft einen Datenadapter auf. Node-Domainmodule teilen Fachregeln
   zwischen Coach-API und CLI; der mobile Client verwendet einen klaren,
   versionierten Firestore-Vertrag.
2. Pro lokaler Datei gibt es genau einen aktiven Schreiber. Python und Node
   schreiben nicht gleichzeitig in dieselbe Live-Datei. Für Firestore werden
   Coach-Änderungen und Klienten-Trainings als unterschiedliche Vorgänge mit
   eigenen Berechtigungen und Konfliktregeln modelliert.
3. Node liest bestehende Datenformate, validiert Eingaben und schreibt
   atomisch. Unbekannte Felder bleiben bei Änderungen erhalten.
4. Ein Umschalten erfolgt pro Funktion erst nach API-Vertrag, CLI-Bedienung,
   Tests und Vergleich mit dem Python-Verhalten. Danach werden Vite und
   Deployment bewusst umgestellt.
5. Runtime- und Firestore-Daten werden durch diese Codearbeit nicht migriert
   oder bereinigt.

## Reihenfolge

| Bereich | Ist-Eigentümer | JavaScript-Schritt | Status |
|---|---|---|---|
| Coach → Klient Planvertrag | Firestore-`routines`, `wf_workouts`, `macrocycles` | Veröffentlichungsobjekt, Versionen und Klientenansicht festlegen | als nächster Produkt-Schnitt prüfen |
| Offline-Klienten-PWA | Firestore-Cache + Service-Worker-Queue | Plan/Training/Reconnect Ende-zu-Ende prüfen | offen |
| Routinen | Python `workouts.py`, `routines.json` | Node-Domainmodul, Hono-API, CLI auf isoliertem Datenverzeichnis | Prototyp fertig; Umschaltung offen |
| Workout-Instanzen | Python `workouts.py`, `workouts.json` | danach; Ghost-Sets und Session-Historie mitnehmen | offen |
| Sessions | Python API + Node-Parallelimplementierung | JSON/SQLite/Firestore-Schreibkette vereinheitlichen | offen |
| Katalog/Inbox | Python CLI, YAML, Watcher | Datenformat und Review-Workflow zuerst vermessen | offen |
| Firestore | Python-Watcher + Firebase-Client | UID- und Konfliktregeln festlegen | offen |
| Deploy | Python FastAPI | erst nach vollständigen Fachpfaden auf Node umstellen | offen |

## Erster Schnitt: Routinen

Quelle für den API-Vertrag und das Dateiformat:
`fitness/api/routers/workouts.py`, `src/lib/db/local/coach.js` und
`src/lib/db/local/core.js`. Das Python-Verhalten enthält Liste, Detail,
Anlegen, Patch, Löschen sowie Übungen hinzufügen, ändern, sortieren und
entfernen. Die Node-Version wird diese Operationen auf einem **explizit
konfigurierten Test-Datenverzeichnis** bereitstellen. Die produktiven
`~/.aos/fitness/users/*/routines.json` bleiben Python-eigen, bis der
Umschaltpfad vollständig geprüft ist.

### Umgesetzt

- `server/domain/routines.mjs`: gemeinsamer Store für API und CLI. Er liest
  das vorhandene Listenformat, erhält Zusatzfelder und normalisiert
  Übungs-/Set-Felder.
- Änderungen pro UID werden im Node-Prozess nacheinander verarbeitet und
  durch Schreiben einer temporären Datei mit anschließendem Rename
  abgeschlossen. Fehlerhafte JSON-Dateien werden nicht überschrieben.
- `server/routes/js-routines.mjs`: neun Hono-Operationen für Routine und
  Übungen. Der Mount unter `/js/routines` erscheint nur bei gesetztem
  `FITNESS_JS_ROUTINES_DATA_DIR`.
- `scripts/fitness-routines.mjs`: CLI für Liste, Detail, Erstellen,
  Umbenennen und Löschen. Aufruf über `npm run fitness:routines -- <Befehl>`.
- `server/tests/routines.test.mjs`: API-Ablauf, Reihenfolge, Erhalt von
  Zusatzfeldern, ungültige IDs, parallele Writes und defekte JSON-Dateien.

Beispiel für einen isolierten Durchlauf:

```sh
mkdir -p /tmp/fitness-js-routines
FITNESS_JS_ROUTINES_DATA_DIR=/tmp/fitness-js-routines FITNESS_JS_UID=test-user \
  npm run fitness:routines -- create "Push"
FITNESS_JS_ROUTINES_DATA_DIR=/tmp/fitness-js-routines FITNESS_JS_UID=test-user \
  npm run fitness:routines -- list
node --test server/tests/routines.test.mjs
```

Die UI, Vite-Proxy-Konfiguration und produktiven Python-Routen verwenden
weiterhin Python. Vor der Umschaltung fehlen mindestens ein Vergleich mit
repräsentativen bestehenden Routinen, die Identitätsauflösung wie in
`fitness/api/config.py`, ein Deployment-/Rollback-Pfad und vor allem
der Coach→Firestore→Klient-Vertrag. Der isolierte Routinen-Prototyp ist
damit ein technischer Baustein, noch nicht der Kern des Produkts.
