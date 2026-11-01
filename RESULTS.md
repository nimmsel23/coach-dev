# Results

## 2026-10-31 — Dependabot

Enabled Dependabot alerts and security updates. Configured weekly GitHub Actions and npm/pnpm updates plus Python dependency updates; version updates target `dev`. Minor/patch updates are grouped; vendored mini-app-shell copies stay maintained at their source. Validated YAML, repository manifest paths and update targets.

## 2026-11-01 — Coach ↔ Klienten: Gesprächsbereich

Statische Inbox-Roadmap durch Auth-gebundenen Nachrichtenverlauf ersetzt: echte Antworten, Planbezug, bestätigte Writes und sichtbarkeitsabhängige Lesestände. Client-Adapter bindet Pfad an eigene Firebase-UID; kein Laptop-Worker nötig. Lokaler mobiler Emulator-Ablauf bestanden (Coach mit Planbezug → Antwort → Lesestände → Klientenwechsel ohne Verlauf-/Entwurfsleck); Firebase-Client-Build und ESLint bestanden. Regeln separat im VitalOS-Feature-Worktree vorbereitet und mit fünf Rules-Tests geprüft. Keine echten Nachrichten, kein Push/Release/Deployment.

## 2026-11-01 — Kommunikationsdokumentation vervollständigt

Klienten-Handbuch für Auth, Planantwort, Datenpfade, Speicher-/Lesestände, Cache-/Entwurfsgrenzen, Release und Diagnose ergänzt. AGENTS und Inbox-Architektur/Audit verlinken zum gemeinsamen Vertrag/Runbook. Projektweite Coach-Rolle und fehlende Cloud-/Geräteabnahme ausdrücklich beschrieben. Nur Dokumentation; keine Dienste, Deployments oder echten Nachrichten.

## 2026-11-01 — Coach-Worker wiederhergestellt

`coach-sync.service` um 18:01 CET mit `systemctl --user enable --now`
wieder aktiviert. Firestore bestätigt Worker `Alpha:2344779` mit einem
eine Sekunde alten Heartbeat; queued/processing/stale jeweils 0, keine
Neustarts. Beim beobachteten Start keine neuen Katalog-Commits oder
Katalog-Rebuilds; semantischer Replay-Schutz ist in der geladenen Quelle
vorhanden. Bestehende neun historische Command-Fehler unverändert, keine
Aufträge erneut ausgeführt. Keine App-/Rules-Änderung und kein Deployment.

## 2026-11-01 — Splash blockiert nicht mehr auf Service-Worker-Update

Die vendorte Mini-App-Shell mit der aktuellen VitalOS-Quelle synchronisiert. Ein langsamer Netzwerk-/Service-Worker-Updatecheck hält den Splash nicht mehr offen; er verschwindet nach dem App-Start (mindestens 200 ms, maximal 12 s nur falls der App-Root gar nicht bereit wird).
