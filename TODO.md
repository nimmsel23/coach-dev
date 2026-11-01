## 2026-10-21 — Shared Coach backend

- [x] Assign port 9150 to Coach with Fitness/Fuel/Relax domain routing, compatibility paths, readiness, and managed runtime units.

## 2026-10-20 — Python Coach server

- [x] Add a local `server.py` entrypoint with Catalog UI and existing API integration.

## 2026-10-20 — Coach fork tooling

- [x] Audit inherited hooks and active commands; use Coach entrypoints and disable Fitness service deploy/controllers in this fork.

## 2026-10-20 — Repository ownership

- [x] Make Coach the parent product; pin VitalOS on branch `coach`, remove the reverse direct submodule and migrate Coach release ownership.


# 2026-10-30 — Coach-Trainingsprogramme

- [x] Wiederverwendbare Coach-Programmbibliothek, versionierte Veröffentlichung
  und explizite Klientenzuweisung mit eingefrorenen Übungssnapshots.
- [x] Klientenansicht auf Planstatus + Programmwahl konzentriert; Workout-Logs
  bleiben als separate Historie erhalten.
- [x] Coach-Lint und Firebase-Mode-Vite-Build verifizieren.
- [ ] Authentifizierten Cloud-Ablauf mit isoliertem Coach-/Klientenkonto prüfen.
- [ ] Isolierte Browser-Abnahme für Coach-Editor, Veröffentlichung und Zuweisung
  aufsetzen; der frühere Harness prüfte die inzwischen entfernte Plan-Codekopplung.

# [NEW] Coach Office 
Beispielfeature: Trainingsplanbesprechung zwischen Klient und Coach. Social Media Style. Comment-feed per Exercise

# [ ] Coach-Tab stabilisieren / Inbox als verlässlichen Review-Workflow fertigstellen
- Coach-Tab war wiederholt Problemfläche: Firestore-Inbox, lokale Catalog-Inbox,
  Runtime-Watcher und Expert-Approve liefen nicht als ein klarer, durchgehender
  Workflow.
- Stand 2026-09-06: Source-Merge im Coach-Tab ist als expliziter
  `Verbinden`-Flow umgesetzt. Firebase kann bei laufendem lokalem
  FastAPI-Prod-Server wger-/yuhonas-Kandidaten an Inbox-Drafts hängen, sodass
  der spätere Expert-Datensatz beide IDs kennt. Desktop nutzt
  `http://127.0.0.1:6100/fitness`; Firebase Hosting nutzt per Default den
  Funnel `https://ideapad.tail7a15d6.ts.net/fitness/fitness`.
- Stand 2026-09-06: Reenrich ist als Rebuild alter Inbox-Drafts zu verstehen,
  nicht als reines Umformulieren von AI-Coach-Text. Bestätigte Provenance-Felder
  (`wger_id`, `yuhonas_id`, `external_ids`, `origin`, `source_snapshot`) müssen
  beim Rebuild erhalten bleiben und dürfen nicht vom Modell "vergessen" werden.
- Offen als Makro-Ziel: Coach-Tab Ende-zu-Ende zuverlässig machen:
  Source-Kandidaten anzeigen, Quelle verbinden, optional reenrichen,
  approve/reject, lokale YAML-KB und Firestore-Expert-KB synchron halten,
  UI-Zustände/Fehler sichtbar machen und mit Browser-Durchklick gegen Firebase
  plus lokalem `:6100` verifizieren.
- Stand 2026-09-06: Firebase-Inbox ist local-first umgestellt. Firestore ist
  fuer Inbox nur noch Cache/Fallback/Offline-Warteschlange; `approveInbox()` und
  `reenrichInbox()` sollen ohne lokalen `:6100` nicht mehr final cloud-only
  schreiben.
- Offen: Browser-Durchklick gegen `fitness-aos.web.app/#coach` mit laufendem
  Funnel/`:6100`: lokale Drafts sichtbar, Source verbinden, Reenrich, Approve,
  lokale Expert-YAML und Firestore-Mirror pruefen.
- Architekturgrenze: Fitness importiert Fuel nicht direkt. Ernährung/Fuel bleibt
  ein eigener Surface; keine `@fuel/*`-Imports im Fitness-Frontend einführen.



# [ ] Session Gate / ("Skills") Thenics-Runner Ausbau (Calisthenics)
- Today-Session zuerst als `Gym Session Gate`: großer Start-/Stop-Button, Trainingstag sofort loggen, manuelles Nachtragen bleibt darunter offen.
- Während aktiver Session Thenics-artigen Guided Runner bauen:
  - Quelle: im `Plan`-Tab gepflegtes Workout oder Coach-Zuweisung, aber nicht erzwungen.
  - Fokus: `jetzt`-Übung groß, `als Nächstes` klein, klare Reihenfolge statt Formularwand.
  - nicht verhandelbar: Reps-Schieberegler während Rest, Rest-Timer, Finished-Screen.
- Session-Notification über App-Service-Worker:
  - während aktiver Session laufende Status-Benachrichtigung mit Stoppuhr,
  - beim Stop statischer Abschlussstatus,
  - Plattformgrenze sauber beachten: echtes sekundengenaues Weiterlaufen bei komplett geschlossener PWA ist browser-/OS-abhängig.

## [ ] ("Timer") 6Pack-Runner Ausbau (Tabata-like HIIT Core-Workouts) heavily inspired by ATHLEAN-X 6Pack App
wird so ähnlich erfolgen wie der Skills-Runner

# [Push Messages] 
tägliche Push benachrichtigungen bei fehlenden Logs - direkt im Benachrichtigungscenter interaktiv? 
weiteführende Idee: falls in Settings PPL-Split eingestellt dann könnte täglich eine zB Pull=done? Message aufs handy kommen bis das jeweils nächste Workout done ist.
Impuls hierzu: Klient:Matthias fehlende Ambition zum kontinuierlichen Loggen von Workouts.

## [x] 2026-10-16: nimmdaniel@gmail.com als Coach freischalten
Coach-Zugang anhand der verifizierten Firebase-UID ergänzen und zentrale Rolle setzen.


## 2026-10-16: Coach-Upgrade — Trainingspläne und Klientenablauf

- [x] Gemeinsamen Plan-Editor und Yuhonas-/Atlas-Auswahl integrieren.
- [x] Trainingsplanentwurf und explizites Bereitstellen aus Plan wiederverwenden.
- [x] Klientenpfad fest binden und tatsächliche Plan-Ergebnisse anzeigen.
- [x] Hauptablauf vereinfachen; ältere Zusatzbereiche und Deep-Links erhalten.
- [x] Rollenprüfung an tatsächliche Claims/Rollen statt E-Mail-Heuristik binden.
- [x] Isolierten Browserdurchlauf, Build, Lint und Routingtests prüfen.
- [ ] Authentifizierter Cloud-Durchlauf mit isolierten Coach-/Klientenkonten.
- [ ] Coach-Release nach ausdrücklichem Push-/Merge-/Deploy-Auftrag.

Dokumentation: `docs/COACH-PLAN-WORKFLOW.md`.

- [x] Offline-Cache über App-Updates erhalten: gemeinsame SW-Strategie, API-Migration, vollständiges Asset-Precache und sichere Installation.

## 2026-10-30 — Plan-Kompatibilität nach Coach-Entkopplung

- [x] Tatsächlichen Coach → Plan-Reader/Logger-Vertrag isoliert prüfen.
- [x] Übungen bei Klientenzuweisung in Subcollections schreiben; Null-Pausen erhalten.
- [x] Veröffentlichte Snapshots, Klientengrenze und Fehlerbereinigung testen.

## 2026-10-30 — Vue-Shell über Coach-Hosting

- [x] Vue-Shell aus dem Workbench-Muster als Hosting-Startseite einbinden;
  React-Coach unter `/coach.html` same-origin weiterverwenden.
- [ ] Preview und installierte PWA visuell sowie mit Coach-Login prüfen.

## 2026-10-30 — Plan editor ownership

- [x] Pin Plan as `plan` submodule; source editor and program logic from it.
- [x] Connect program and individual-client editor routes; remove duplicate logic.
- [x] Configure Vite/Tailwind/CI and document deliberate pointer updates.

## 2026-10-30 — Plan-/Coach-Dokumentation

- [x] Plan-Eigentümerschaft, Submodulpfad, Verantwortungsmatrix und unabhängige Fitness-/Shell-/Hosting-Übernahmen in den Entwicklerdokumenten ergänzt.

- [x] 2026-10-31: Bestehenden Coach-Server, Klientenregister und Planeditor als lokalen Arbeitsplatz mit Speichern, Versionen, Export und explizitem Versand verbinden.

- [x] 2026-10-31: Richtige Planansicht statt Textblock anbieten, mit A4-Druck und mobiler Übungsdarstellung.

## 2026-10-31 — Shared plans and catalog reconnect

- [x] Open published client plans with the pinned Plan document/PDF renderer.
- [x] Show worker action failures separately from heartbeat status.
- [x] Verify program assignment contract and Coach build; repair Fitness upstream.
- [ ] Publish frontend changes through the explicit release workflow when requested.

## 2026-10-31 — Quellen korrigierbar machen

- [x] Falschen Vorschlag ablehnen und alternative Rohquelle suchen/auswählen.
- [x] Freigegebene Einträge korrigieren und erneutes automatisches Verknüpfen verhindern.
- [x] Sichtbarkeit freigegebener Import-IDs und Varianten in der Suche korrigieren.
- [ ] Gehosteten Coach nach explizitem Release mit angemeldetem Konto abnehmen.

## 2026-10-31 — Coach Python dispatcher

- [x] Zentralen coach-Einstieg für fitness-log clients und weitere Coach-Python-Werkzeuge erstellen.
- [x] Bestehende Implementierungen/Argumente kompatibel durchreichen; Hilfe und Fehler prüfen.

## 2026-11-01 — Coach ↔ Klienten-Kommunikation

Nachrichten-Tab pro Klient ergänzt, Gesprächsbereich in der Fitness-Inbox angebunden: Textaustausch mit veröffentlichtem Planbezug, bestätigte Speicherung und sichtbarkeitsabhängige Lesestände. Client-/Klientenwechsel isolieren Verlauf und Entwürfe. Bestehende Kommentar-Meldung behauptet keinen Push mehr. Firestore-Protokoll und Freigabereihenfolge dokumentiert.

Abnahme: mobile 390px-Browser-Fixture mit echten Adaptern gegen isolierten Emulator bestanden (Plan-Nachricht → Klienten-Antwort → Lesestände → Klientenwechsel); fünf Rules-Tests, Routing- und zwei Plan-Vertragstests bestanden. Coach- und Fitness-Firebase-Build bestanden. Rules separat im VitalOS-Feature-Worktree vorbereitet; kein Push/Deployment und keine echten Nachrichten.

## 2026-11-01 — Kommunikation vollständig dokumentiert

Bedienung, Besitzgrenzen, Planbezug, vollständiges Firestore-Schema, Rollenmatrix, Cache-/Entwurfs-/Lesestand-Semantik, Limits und Ausbaupunkte gegen Implementierung abgeglichen. Eigenes Runbook für reproduzierbare Tests, Port-/Abhängigkeitsvoraussetzungen, manuelle Release-Reihenfolge, Geräteabnahme, Fehlerbilder und Rücknahme. In AGENTS, Hauptarchitektur und View-Dokumenten verlinkt. Nur Dokumentation; keine neuen Builds/Deployments oder echten Nachrichten.

## Nächste Umsetzung: Kommunikationsausbau (2026-11-01)

- [ ] Historie mit Cursor nachladen; neue Live-Nachrichten dürfen ältere geladene Seiten nicht verdrängen.
- [ ] Entwürfe pro Konto/Klient dauerhaft auf diesem Gerät sichern und nach Versand löschen.
- [ ] Ungelesen-Zähler außerhalb des geöffneten Gesprächs in Coach und Fitness anzeigen.
- [ ] Exakt die referenzierte Planversion aus einer Nachricht öffnen.
- [ ] Neue Nachrichten per Push ankündigen; fehlende Tokens/Opt-out behandeln.
- [ ] Sichere Anhänge mit Uploadstatus, Größen-/Typgrenzen und Storage-Regeln.
- [ ] Trainer-/Klientenzuordnung statt nur projektweiter Coach-Rolle.
- [ ] Suche und kontrollierte Bearbeitungs-/Lösch-/Aufbewahrungsabläufe ergänzen.
- [ ] Nach autorisiertem Release echte Konten/Geräte, Netzwechsel und Plan-Head-Wechsel abnehmen.

## 2026-11-01 — Priorität: Planbereitstellung und planbezogenes Feedback

- [x] In „Plan ansehen“ gemeinsamen Plan-Feedbackbereich einschließlich Empfangsbestätigung und Coach-Antwort integrieren.
- [ ] Veröffentlichung über Plan → Coach-Pin → zentrale Rules → Apps abschließen, sobald Push/Release beauftragt ist.
- [x] Offene Plan-Rückmeldungen in der Klientenübersicht zusammenfassen.
- [x] Frühere Versionen einschließlich ihrer Rückmeldungen direkt im Planverlauf öffnen.
- Freier Chat-Ausbau (Push, Anhänge, weitere Komfortfunktionen) ist zugunsten dieses Ablaufs zurückgestellt.

## 2026-11-01 — Standalone Coach shipping

- [x] VitalOS workspace aliases and sibling Tailwind scans removed from Coach build.
- [x] Coach-owned CI release and live commit verification exposed through vos-ship coach.
- [x] Coach rules fragment prepared for central VitalOS import.
- [ ] Publish integrated Coach source and verify live Hosting release.


# 2026-11-01 — Task-Sync pro Klient (Taskwarrior → Firebase → Handy)

Ziel: Die Tasks jedes Klienten landen getrennt pro Klient in Firebase, damit das Handy sie sauber
nach Klient getrennt zeigt. Ausgangslage geprüft am 2026-11-01:

- Es gibt eine Taskwarrior-DB je Klient, aber **nicht** im Klienten-Workspace (`~/.local/Klienten/<id>/`),
  sondern von `modules/plan/fitness/plan_tasks.py` angelegt: `~/.aos/fitness/users/<firebase_uid>/taskwarrior/`
  (`data/` + eigenes `taskrc`, UDAs `occkey`/`planid`/`routineid`/`workoutid`). Der Ordner entsteht erst beim
  ersten `python -m fitness.plan_tasks sync <uid>`; für Jakob (`fxohGl4Zn5ZUqXzTHjBsye5MmFu1`) gibt es den
  Nutzerordner, aber noch keinen `taskwarrior`-Unterordner.
- Bisher einseitig und lokal (Stufe 1, siehe `modules/plan/src/views/Plan/ARCHITECTURE.md`): Plan-Vorkommen →
  Tasks, kein Rückweg, kein Firebase.

- [x] Task-Sync pro Klient nach Firestore: `modules/plan/fitness/task_sync.py` (`python -m fitness.task_sync push <uid>`, Ziel
      `fitness/<uid>/tasks/<uuid>`, Schlüssel `firebase_uid`). Probelauf ohne `--yes`; **erster echter Push steht noch aus**.
- [x] Rückweg: `task_sync pull <uid> --yes` schließt lokal nur ab, was am Handy erledigt wurde (`status == completed`); alles andere
      gewinnt lokal. Die Firestore-Regeln (`fitness/{uid}/**`) erlauben Besitzer und Coach, keine Regeländerung nötig.
- [ ] Handy-Ansicht: Tasks nach Klient getrennt, auf der bestehenden Klientenliste aufsetzen.
- [x] Mit dem aos-Framework für Klienten abgestimmt: Das Map-CLI (`frame|freedom|focus|fire --client <id>`)
      nutzt dieselbe Klienten-DB für Fire; Pfad nicht doppelt festlegen.
- [x] **Pfad umgestellt (2026-11-01):** `~/.aos/fitness` wird nach Firestore gepusht. Entscheidung 2026-11-01: Die Klienten-Task-DB
      liegt in `~/.local/Klienten/<client-id>/tw-data/` (so nutzt sie das Map-CLI mit `--client`, siehe
      `~/aos/game/CLAUDE.md`). `plan_tasks.py` (`_taskwarrior`, bisher `<runtime>/users/<uid>/taskwarrior/`) auf diesen
      Pfad umstellen, die Klienten-ID aus der `firebase_uid` über `client.json` auflösen, bestehende DBs per `mv` übernehmen.

- [ ] Handy-Ansicht: Tasks nach Klient getrennt aus `fitness/<uid>/tasks` anzeigen (Frontend, noch nicht begonnen).
- [ ] Sync automatisieren (Timer/Daemon) und den ersten Push mit `--yes` bewusst auslösen; Konfliktfall prüfen, wenn Handy und lokal
      denselben Task unterschiedlich ändern (heute: lokal gewinnt, vom Handy zählt nur Erledigt).
- [ ] UUID-Kollision zwischen Klienten bei Map-Tasks: Die UUID aus `tw_maps.identity` enthält den Klienten nicht; in `fitness/<uid>/tasks`
      ist das unkritisch (pro uid getrennt), nur ein gemeinsamer Pfad wäre ein Problem.

## [x] Ausstehende Coach-Gesprächserweiterungen sichern und pushen (2026-11-01)

Historie, lokale Entwürfe, Versionsansicht und Ungelesen-Anzeigen gemeinsam
prüfen; Index im VitalOS-Owner vorbereiten; Feature-Branch zur Übernahme pushen.

## [x] ClientForge Trainingsstudio (2026-11-01)

Gemeinsamen Planeditor für lokale und Cloud-Planung aufwerten; Workout- und
Übungs-Muskelansicht samt Klientenvorschau verbinden; bestehenden ClientForge-
Einstieg im Coach erreichbar machen.
