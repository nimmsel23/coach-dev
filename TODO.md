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
