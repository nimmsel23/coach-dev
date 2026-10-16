# Firestore-Sync

Bisher gab es hier keine eigene Doku, obwohl `docs/ARCHITECTURE.md` schon
länger darauf verlinkte (toter Link) — nachgezogen im Zuge der Diagnose eines
Datenstand-Verdachts vom User (2026-08-23, siehe unten).

## Zwei Sync-Pfade, ein gemeinsamer Konflikt-Helper

| Pfad | Datei | Trigger | Scope |
|------|-------|---------|-------|
| Realtime (Push→Pull-Echo) | `fitness/firestore/mirror.py::on_session()` | `on_snapshot`-Listener, läuft eingebettet in `fitness-api.service` | Ein User (`UID`), läuft dauerhaft |
| One-Shot (CLI/manuell) | `fitness/firestore/sync.py::pull()`/`push()` | `fitness sync pull\|push`, `/firestore/pull` | Alle User oder gezielt einer |

Beide Pfade nutzten bis 2026-08-23 **unabhängige, leicht unterschiedliche**
Implementierungen derselben Konfliktentscheidung ("wessen Version gewinnt?")
— das war selbst schon ein Robustheitsproblem: ein Fix in einer Datei (siehe
`rev`-Feld-Einführung im Session-Storage-Redesign) erreichte die andere nicht
automatisch. Seit 2026-08-23 teilen sich beide `fitness/firestore/_db.py::
remote_wins(local_data, remote_data)` — eine einzige, getestete Funktion statt
zweier driftender Kopien.

`remote_wins()`: vergleicht `rev` (serverseitig hochgezähltes Feld, siehe
`docs/ARCHITECTURE.md` → "Session-Storage: Schichten & Konfliktmodell"), bei
echtem Gleichstand `saved_at` als Tie-Breaker. Kein Feld-Merge/CRDT.

## Push darf `saved_at` nicht überschreiben (Fix 2026-08-23)

`mirrorSession()` (Node, `firestore-mirror.mjs`) und `mirror_session()`
(Python, `fitness/firestore/mirror.py`) setzten beim Push bisher **immer**
`saved_at = jetzt`, auch beim reinen Resync unveränderter Daten (z.B.
`POST /firestore/sync`, das periodisch/manuell die letzten 30 Sessions
erneut pusht). Das täuschte der eigenen `rev`-Gleichstand-Tie-Break-Logik
eine "neuere" Remote-Version vor — der `on_session()`-Listener pullte den
Push unmittelbar wieder zurück und überschrieb die lokale Datei mit einem
frischen, aber inhaltlich unveränderten `saved_at`. Live reproduziert bei der
Diagnose des unten beschriebenen Verdachts. Fix: `saved_at` kommt nur noch
aus der Session selbst (`freezeSnapshot()`/`_freeze_snapshot()`, echte
Editierzeit), Push reicht es unverändert durch — wie `rev` bereits vorher.

## ADDED-Events beim Listener-Bootstrap sind keine echten Neuanlagen (Fix 2026-08-23)

Firestores `on_snapshot`-API liefert beim **ersten** Verbindungsaufbau eines
Listeners (also bei jedem Neustart von `fitness-api.service`) **alle**
Bestandsdokumente als `change.type == "ADDED"` aus — nicht nur echte
Neuanlagen seit dem letzten Lauf. `on_session()` prüfte die
Konfliktentscheidung (`remote_wins()`) bisher nur bei `"MODIFIED"`, nicht bei
`"ADDED"` — ein `ADDED`-Event mit bereits vorhandener lokaler Datei wurde
dadurch **blind überschrieben**, unabhängig von `rev`. Live reproduziert:
ein einfacher Service-Neustart schrieb ohne diesen Fix jede einzelne lokale
Session-Datei mit dem Firestore-Stand neu. Fix: Konfliktprüfung greift jetzt
bei jedem Event-Typ, sobald eine lokale Datei existiert.

## Diagnose-Hintergrund: Massen-`saved_at`-Neuschreibung vom 2026-08-06

Der User vermutete initial einen Datenfehler im Juni-Zeitraum ("31 Tage Gym-
Pause" vs. scheinbar längere Lücke in `fitness log clients`). Bei der
Prüfung fiel auf: **fast jede Session von November 2025 bis Ende Juli 2026**
trägt exakt denselben `saved_at`-Zeitstempel-Cluster (2026-08-06,
21:36:25–32 Uhr, ~40 Dateien in 7 Sekunden durchnummeriert) — offensichtlich
keine echten Speicherzeiten, sondern eine Massen-Neuschreibung in einem
einzigen Batch. Trainingsinhalte (Übungen, Sätze, Gewichte) waren davon
NICHT betroffen, nur die Metadaten. Der Juni-Verdacht selbst hat sich nicht
bestätigt — die Session-Dichte (Push/Pull Anfang Juni, danach fast
durchgehend `sessionMode: cardio` mit `activity: swimming`) deckt sich mit
"Donauinsel statt Gym" (User-Aussage).

**Ursache nicht abschließend rekonstruierbar** (kein Commit/Tool im Repo
schreibt je das auf einer der betroffenen Dateien gefundene `_merged_from:
"firestore/default/..."`-Feld — vermutlich ein nie committetes Ad-hoc-Skript
einer früheren Session), aber die beiden oben behobenen Bugs
(`saved_at`-Überschreiben bei jedem Push + ungeprüfte `ADDED`-Events beim
Listener-Neustart) sind ein plausibler, live reproduzierter Mechanismus für
genau dieses Schadensbild — ein `fitness sync push`/`/firestore/sync`-Lauf
über viele Sessions gefolgt von einem Service-Neustart hätte exakt so einen
Cluster erzeugt. Mit beiden Fixes sollte sich das nicht mehr wiederholen.

## Push-Fehler nicht mehr unsichtbar (Fix 2026-08-23)

`firestore-mirror.mjs::fire()` markiert fehlgeschlagene Pushes jetzt in
`~/.aos/fitness/users/<uid>/.pending-firestore-retries.json` statt sie nur zu
loggen. `POST /firestore/sync` liest diese Datei bei jedem Aufruf, versucht
die markierten Sessions erneut zu pushen und leert die Datei danach
(best-effort — ein erneuter Fehlschlag hängt sich über denselben
`fire()`-Pfad wieder an).

## coachCommands / coachState (Stand 2026-10-16)

Coach-Web-App (`vos-coach.web.app`) → Coach-Rechner: `coachCommands/{id}`
(`action`, `item_id`, `uid`, `payload`, `status` queued → processing → done|error,
`result`/`error`) wird vom Worker `coach-sync.service` verarbeitet (transaktionaler
Claim mit 5-min-Lease). `coachState/bridge` ist der Heartbeat (`last_seen`,
`queued`, `processing`, `stale`); die App zeigt daraus den Statuschip und lehnt
Befehle bei Worker-Alter > 60 s ab. `coachInbox/*` ist der Inbox-Snapshot für die
App. Frontend-Seite: `src/CLAUDE.md` → „Coach-Befehle & Coach-Rechner-Status".
