# Coach App - Zielarchitektur

Stand: 2026-09-23

Diese Datei beschreibt die geplante Trennung der Coach-Funktionen von der
Klienten-PWA. Der aktuelle Firebase-Split ist nur der erste Schritt: langfristig
soll die Coach-App eine eigene Arbeitsoberflaeche fuer Fitness- und spaeter auch
Fuel-Daten werden.

## Aktueller Stand

- `fitness-aos.web.app` ist die Klienten-PWA.
- `vos-coach.web.app` ist als eigenes Firebase-Hosting-Ziel vorbereitet.
- `src/coach-main.jsx` und `coach.html` bilden aktuell den Coach-Webapp-Entry.
- `~/coach-dev` existiert als sauberer lokaler Clone des Split-Commits
  `ad44f33`.
- `fitness/coach/` existiert bereits als Python-Domain-Package fuer
  Coach/Client-CLI-Funktionen. Dieser Pfad soll deshalb nicht fuer die
  Coach-Webapp wiederverwendet werden.

## Zielbild

Die Coach-App ist eine Admin-/Workbench-App. Sie sollte fachlich auf dem
lokalen Fitness-Python-API und der lokalen Katalog-Pipeline beruhen, nicht auf
einem halb-authoritativen Firestore-Zwischenstand.

Firestore bleibt wichtig, aber fuer andere Dinge:

| Bereich | Authoritative Ebene |
|---------|---------------------|
| Sessions, Journal, Profile | Firestore / Runtime User Data |
| Coach-Feedback an Klienten | Firestore |
| Katalog-Inbox, Enrichment, Approve | lokale Fitness-Python-API + YAML-KB |
| Expert Exercises im Client | generierte Build-Artefakte |
| Fuel-Runtime-Daten | Firestore, spaeter ueber Coach-App einsehbar |

Der Coach approved also nicht direkt "in den Client hinein". Er approved lokal
gegen die KB. Beim naechsten Build werden die daraus generierten statischen
Client-Daten in die PWA eingebaut und deployed.

## Gewuenschter Flow fuer Exercise Approval

Seit 2026-09-24 nutzt die gehostete Coach-App fuer die Inbox keinen Tailnet-
HTTP-Zugriff mehr. `~/coach-dev` liest `coachInbox/*` und `coachState/mergeCandidates`
aus Firestore und schreibt Aktionen als `coachCommands/*` mit Status `queued`.
Der Python-API-Prozess `:9150` (`fitness/firestore/coach_bridge.py`) ist der
einzige Consumer: er fuehrt die vorhandenen `/fitness/inbox`-Routen lokal aus,
schreibt Ergebnis/Fehler in den Command und spiegelt den YAML-Inbox-Stand
zurueck nach Firestore. `FITNESS_SKIP_WATCHERS=1` deaktiviert auch diesen
Worker; die Dev-API-Instanz muss also laufen. Ein nicht gestarteter Worker
laesst Commands in `queued`, ohne eine Freigabe vorzutaueschen. Rules fuer
diese Collections werden nur aus `~/vitalos` deployed.

Firestore ist hier Transport und Lesekopie, nicht die Exercise-SSOT. Erst
lokales Approve aendert die YAML-KB; erst der folgende Client-Build uebernimmt
die freigegebene Uebung in die PWA.

1. Ein Klient erzeugt eine unbekannte Uebung oder Anfrage.
2. Die Anfrage landet in der lokalen Coach/Katalog-Inbox.
3. Der Python-Worker verarbeitet die Coach-Auftraege gegen die lokale API:
   - Source-Kandidaten pruefen
   - `wger` / `yuhonas` verknuepfen
   - Enrichment/Reenrichment ausloesen
   - final approven
4. Approval schreibt bzw. aktualisiert lokale KB/YAML-Artefakte.
5. Der Firebase-Client-Build generiert daraus statische Katalogdaten.
6. Nach Deploy sieht die Klienten-PWA die neue approved Exercise.

Das macht Approval zu einem Release-Schritt statt zu einem blossen
Firestore-Write. Der Nachteil ist, dass neue Uebungen erst nach Build/Deploy
sichtbar werden. Der Vorteil ist, dass Provenance, Review und Client-Bundle
sauber zusammenbleiben.

## Zwischenwelt reduzieren

Der aktuelle Mischzustand ist absichtlich nur ein Uebergang:

```text
lokale YAML-KB  <->  Firestore Cache  <->  clientseitig verbaute JS-Daten
```

Diese Zwischenwelt soll kleiner werden. Firestore darf fuer Katalogdaten
anzeigen, puffern oder Runtime-Signale transportieren, aber nicht die
fachliche Wahrheit der Expert Exercises sein. Die fachliche Wahrheit entsteht
im Coach-/Backend-Pfad und wird danach als Client-Artefakt gebaut.

Ziel:

```text
kb/        -> YAML, Python-Backend, Coach-Review, Provenance
catalog/   -> generierter Client-Katalog, JS/JSON-Artefakte, PWA-Verbrauch
firestore  -> Runtime-Daten, User-Daten, optionaler Cache/Index
```

Damit gibt es eine klare Richtung:

1. `kb/` wird gepflegt.
2. Build-Skripte erzeugen daraus `catalog/` bzw. clientseitige Artefakte.
3. Die PWA importiert nur diese generierten Artefakte.
4. Firestore bleibt fuer Runtime- und User-Zustand zustaendig.

## KB vs Catalog

Aktuell ist unter `fitness/catalog/` noch zu viel gemischt:

- Python-Code fuer Loader, Resolver, Enrichment, Audit und Inbox
- YAML-Daten unter `fitness/catalog/kb/`
- generierte clientseitige Daten unter `src/lib/db/firestore/*.generated.js`
- Firestore-Sync-/Cache-Pfade

Die Zieltrennung sollte nach Zustaendigkeit passieren:

| Bereich | Aufgabe | Darf schreiben? |
|---------|---------|-----------------|
| `kb/` | YAML-SSOT fuer Exercises, Anatomy, Muscles, Inbox-Drafts, Provenance | Coach/Python-Backend |
| `catalog/` | clientseitig verbaute Katalog-Ausgabe, JS/JSON, Suchindex, PWA-Bundle | Build-Skripte |
| `fitness/catalog/` Python | Tools/Pipeline, die aus `kb/` liest und `catalog/` erzeugt | Code, keine Runtime-Wahrheit |
| Firestore `fitness/kb/*` | optionaler Cache/Index fuer Cloud-Sichten | Mirror/Sync, nicht SSOT |

Langfristig waere also sinnvoll:

```text
fitness-dev/
  kb/                         # YAML fuer Python/Coach, reviewed + inbox
  catalog/                    # generierte Client-Katalogdaten
  fitness/catalog/            # Python-Pipeline / CLI / API
  src/lib/db/firestore/       # konsumiert generierte Catalog-Artefakte
```

Falls ein harter Move zu gross ist, kann der erste Schritt kleiner sein:

- `fitness/catalog/kb/` bleibt physisch noch liegen.
- Docs und Code behandeln es aber bereits als `kb`-SSOT.
- Neue generierte Client-Dateien werden konsequent als `catalog` benannt,
  nicht als `kb`.
- Firestore-Felder bekommen klare Namen wie `cache_source`, `generated_from`,
  `kb_revision` oder `catalog_build`, statt implizit Wahrheit zu behaupten.

## Repo-Topologie

Kurzfristig:

```text
/home/alpha/fitness-dev
  coach.html
  src/coach-main.jsx
  src/views/Coach/

/home/alpha/coach-dev
  sauberer Clone / spaeter eigenstaendige Coach-App
```

Mittelfristig sollte `coach-dev` der fuehrende Arbeitsbereich fuer die
Coach-Webapp werden. Im Fitness-Repo kann die Coach-App dann als Subtree liegen,
zum Beispiel:

```text
fitness-dev/
  coach/          # Webapp-Subtree aus ~/coach-dev, nicht Python-Package
```

Da aber `fitness/coach/` bereits ein Python-Package ist, muss die Benennung
bewusst sein. Gute Kandidaten:

| Pfad | Bewertung |
|------|-----------|
| `coach/` | knapp, gut als Repo-Root-Subtree |
| `apps/coach/` | eindeutiger, falls spaeter weitere Apps dazukommen |
| `fitness/coach/` | vermeiden, kollidiert mit Python-Domain-Package |

Empfehlung: `coach/` oder `apps/coach/`, nicht `fitness/coach/`.

## Subtree-Richtung

Wenn `coach-dev` fuehrend wird:

- Entwicklung passiert in `~/coach-dev`.
- Fitness kann die Coach-App per Git subtree einbetten.
- Pulls vom Coach-Repo/Subtree aktualisieren den eingebetteten Stand.
- Pushes aus `fitness-dev` zurueck in `coach-dev` sollten nur bewusst und
  selten passieren.

Beispielhafte Richtung:

```text
~/coach-dev  ->  fitness-dev/coach/
```

Das ist besser als ein Symlink, weil Releases und Builds dann einen konkreten
Source-Stand enthalten. Es ist auch besser als Copy/Paste, weil die Herkunft
und Updates nachvollziehbar bleiben.

## Firebase Hosting

Aktuelle Ziele:

| Target | Site | Public dir |
|--------|------|------------|
| `client` in `fitness-dev` | `fitness-aos` | `dist-firebase` |
| `coach` in `coach-dev` | `vos-coach` | `dist-coach` |

`fitness-release` baut und deployt nur `hosting:client` aus dem Fitness-Repo.
Der Coach-Build und `hosting:coach` kommen ausschliesslich aus `~/coach-dev`.
Beide Sites nutzen das Firebase-Projekt `fitness-aos`; Firestore-Rules werden
weiterhin als gemeinsames Set aus `~/vitalos` deployed.

## Nicht-Ziele

- Kein Cloud-only Approve ohne lokale KB/Pipeline.
- Kein Firestore als alleinige Wahrheit fuer Expert Exercises.
- Keine Vermischung von `fitness/coach/` Python-CLI und Coach-Webapp.
- Keine Vermischung von `kb`-YAML-SSOT und generiertem `catalog`-Clientbundle.
- Keine automatischen Writes in Runtime-Daten ohne klare User-/Klienten-Grenze.

## Update 2026-10-16: `coach-sync.service` statt Bridge-Thread im :9150-API-Prozess

**Befund:** Der Consumer der `coachCommands` lief nur als Thread in `fitness-api.service` (:9150) und rief per
HTTP die eigenen Routen auf. Mit abgeschalteter API blieben alle Freigaben/Zusammenführungen auf `queued`
(21 Stück seit 2026-10-15), das Frontend lief nach 190 s in `coach_command_timeout`. Lief die API, feuerte der
Thread vor dem ersten Socket-Accept → `Connection refused` → Befehl endgültig `error` (kein Retry); beim Beenden
mitten in der Arbeit blieben Befehle auf `processing` hängen.

**Jetzt:** `fitness/coach/sync.py` (`python -m fitness.coach.sync run`), User-Unit `coach-sync.service`
(Quelle `fitness/coach/deploy/coach-sync.service`, enabled). Ohne API-Server:
- Befehle transaktional übernehmen (queued → processing mit 5-min-Lease), Inbox-Routen **im Prozess**
  über Starlette-`TestClient` ausführen (kein Port, kein Startrennen), Ergebnis zurückschreiben.
- Verwaiste `processing`-Befehle → `error` mit klarer Meldung, **nie** blind wiederholen (Approve/Delete/Merge
  sind nicht idempotent). Befehle älter als `--max-age-hours` (6) werden nicht angefasst, nur gezählt;
  `coach-sync drain --include-stale [--dry-run]` arbeitet sie bewusst ab.
- Heartbeat `coachState/bridge` (`last_seen`, `queued`, `processing`, `stale`, `worker`) — die Coach-App kann
  damit „Worker offline“ von echten Fehlern unterscheiden.
- Inbox-Snapshot (`coachInbox`, `coachState/mergeCandidates`) nur bei Änderung bzw. alle 5 min (vorher alle 5 s).
- Katalog-Listener (Firestore-Inbox → lokale YAMLs, freigegebene Übungen zurück) und Gemini-Enrichment-Watcher
  laufen im selben Prozess (`--no-catalog` schaltet sie ab).
- `fitness-api.service` überspringt seine Coach-Teile, solange `coach-sync.service` aktiv ist (ein Worker).

Befehle: `coach-sync status` (Heartbeat + Zähler), `drain`, `run`. Erster Lauf 2026-10-16: 21 aufgestaute
Freigaben abgearbeitet (21 ok), Selbsttest-Round-Trip 2,2 s.

**Nebenfund:** `scripts/build-catalog.py` zeigte per Default auf das nicht mehr existierende `~/fitness/catalog/kb/…`
→ der Katalog-Rebuild nach jedem Approve schlug still fehl. Default jetzt repo-relativ.

**Offen (Coach-Frontend, ~/coach-dev):** `coachCommand()` blockiert bis zu 190 s. Besser: Befehl sofort quittieren
(„in Warteschlange“), Fertigstellung per Live-Listener auf das Command-Dokument anzeigen, Heartbeat-Alter als
Statuschip. Deploy von `vos-coach.web.app` nur nach ausdrücklicher Bestätigung.

## 2026-10-31: Re-enrichment fix and Coach upstream restoration

A manual inbox exercise without an external source match could produce
`AttributeError: NoneType ... get` in `build_inbox_draft_seed` before reaching
Gemini. Treat missing external seeds as empty; preserve origin/external IDs.
`coach-sync` propagates in-process route exceptions and logs tracebacks instead
of hiding them behind a generic HTTP 500. Its heartbeat now includes `last_error`
and failure counts; Coach displays these separately from online status.

Coach's configured Fitness upstream remains `127.0.0.1:8100`. The existing
`fitness-preview.service` had stopped and referenced an old deployment with a
broken KB symlink after the dev-directory move. Repo unit:
`fitness/coach/deploy/fitness-preview.service`. It uses the installed editable
fitness-agent interpreter and `~/dev/fitness-dev`, matching coach-sync's catalog.
Install the unit as a symlink under `~/.config/systemd/user`, daemon-reload, start.
`FITNESS_SKIP_WATCHERS=1` prevents duplicate catalog workers;
`FITNESS_SYNC_OWNER=1` retains this service's existing user-data sync ownership
(the separate fitness-sync service is inactive). This is a source-based domain
API for Coach; it is separate from the self-contained /opt product deploy.
No replacement service or port, no automatic approvals or plan publication.

Re-enrichment now writes into the selected inbox file ID rather than creating
a second exercise-ID-based draft. An empty model response returns 502 even if
an older file exists; stale content can no longer masquerade as a new result.

## 2026-10-31 — Correctable source assignments

Coach can inspect, search, replace and remove source links in the inbox and
approved single-exercise files. Raw source search includes variants hidden by
normal curated-catalog deduplication. These operations use existing `link-source`
commands with `operation=inspect|search|set`, preserving deployed command rules.
Search/inspect are read-only and skip the worker's inbox publication step.

A set operation replaces that source's IDs instead of appending to stale IDs.
`source_selection` stores explicit source IDs, or null for deliberate no-link.
Selection is honored by source inference, resolver, enrichment provenance and
schema/approval. Removing a proposal blocks automatic reconnection for that
source until the coach chooses an alternative. Existing AI content is marked
`source_review_required`; on pipeline restart this bypasses mixed expert content.
Fuzzy matches use a full-name ratio and remain proposals; automatic name links
require an exact normalized name. Explicit source IDs remain supported.

Approved edits back up the file, commit only its path, update the corresponding
Firestore KB document and rebuild the local catalog. Existing exercise IDs and
workout references are retained. No automatic re-enrichment or approval occurs.
Validation: source-selection/route/schema and existing enrichment/inbox tests.

## 2026-10-31 — Catalog snapshot replay without Git churn

`on_kb_exercises` compares semantic exercise content before touching the local
approved mirror. Dictionary key order and transport-only `_hash`, `updated_at`
and `synced_at` fields do not count as catalog changes. Approval timestamps and
nested dates remain serializable catalog data. Unchanged initial/reconnected
snapshots do not rewrite files, remove review drafts, commit or rebuild.
Actual changes in one callback share one mirror write, one scoped commit and
one runtime-catalog rebuild. A lock serializes callback writes.

Verification: six regression tests; actual 22 approved Firestore documents
replayed against a temporary copy four times, with zero writes/commits/rebuilds.
The service was already stopped and disabled at 17:00:37; this change preserves
that operational state. The next start loads the fix. No history rewriting/push.

## 2026-10-31 — Coach CLI namespace

Coach-owned Python dispatcher: `~/dev/coach-dev/bin/coach`. Examples:
`coach clients matthias --days 30`, `coach fitness-log clients --help`,
`coach console`, `coach drafts`, `coach workout --help`, `coach catalog --help`,
`coach inbox --help`, `coach sync status`, `coach data-sync --help`.
The dispatcher uses the existing fitness-agent uv environment and this sibling
Fitness source; no implementation or mutable data is copied into Coach.
Standalone fitness-* commands remain compatible. Full mapping:
`~/dev/coach-dev/docs/COACH-CLI.md`.
