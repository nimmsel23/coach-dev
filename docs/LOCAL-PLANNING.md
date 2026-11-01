# Lokal mit Klienten und Trainingsplänen arbeiten

Stand: 2026-10-31.

## Ein Einstieg

Öffnen: **http://127.0.0.1:9150/clientforge/** oder
`~/coach-dev/bin/coach-server open`. In der lokalen Vue-Shell führt **ClientForge**
dorthin. Dafür ist keine Firebase-Anmeldung nötig. Es gibt keinen zusätzlichen
Server: Die Seite und ihre API laufen im bestehenden `coach-api.service` auf 9150.

1. Einen bestehenden Klienten auswählen.
2. **Neuer Trainingsplan → Plan gestalten**: Tage, Übungen, Satzvorgaben,
   Pausen und Hinweise im gemeinsamen Planeditor erstellen.
3. **Entwurf sichern** schreibt auf die lokale Festplatte. Noch kein Versand.
4. **Version freigeben** hält einen lokalen, unveränderlichen Stand fest.
5. **Markdown / JSON** lädt den Arbeitsstand herunter. Unter **Versionen** kann
   ein alter Stand als neuer Entwurf übernommen werden; die Historie bleibt.
6. **An Klienten senden** überträgt nach Bestätigung nur die freigegebene Version.
   Das benötigt die `firebase_uid` aus der vorhandenen Klientenverwaltung,
   Internet und die bestehende serverseitige Firebase-Konfiguration.

Ein lokaler Entwurf kann nach der Freigabe weiterbearbeitet werden. Versendet
wird weiterhin die bestätigte Version. Fehler beim Versand löschen keine lokalen
Daten. Wiederholte Übertragung desselben veröffentlichten Snapshots ist idempotent.
Die Cloud-Bearbeitung und authentifizierte Firebase-Abnahme bleiben separate Abläufe.

## Was zusammengeführt wurde

- **Coach:** lokaler Einstieg, HTTP-Server, Bedienoberfläche und Versand-Grenze.
- **Plan:** derselbe Editor wie in der App, lokale Speicher-/Versionslogik,
  ClientForge-Import, Export und das Firestore-Planformat.
- **klienten-python:** maßgebliche Klientenwurzel aus `klienten_manager/config.py`
  und bestehende `client.json`-Profile inklusive UID-Zuordnung. Kein zweites Register.
- **klienten-dev / ClientForge:** vorhandene `data/plan.json` können ausdrücklich
  übernommen werden. Quelldateien werden weder migriert noch überschrieben.
- **workspace:** bleibt Gestaltungs-/Entwicklungskontext. Es wird nicht als
  zusätzlicher Server oder ungefilterte statische Wurzel veröffentlicht.

Die frühere Kombination auf 5200 wird hierfür nicht benötigt. Bestehende
Klienten-, CRM-, Praxis- und Buchhaltungsdaten werden nicht umgebaut.

## Speicherung und Zugriff

`CLIENTS_ROOT` überschreibt die Klientenwurzel; andernfalls wird sie aus
`~/klienten-python/klienten_manager/config.py` bezogen (aktuell `~/.local/Klienten`).
Native Pläne liegen pro Klient unter:

```text
<client>/data/training-plans/<plan-id>.json
<client>/data/training-plans/<plan-id>/versions/vN.json
```

Schreibzugriffe sind atomar und prüfen den Bearbeitungsstand. Ungesicherte
Editoränderungen bleiben zusätzlich gerätegebunden im Browser. Die API
`/api/coach/local/*` ist nur für Loopback-Verbindungen zugelassen, fremde Origins
können keine Schreibvorgänge auslösen. Profile werden auf die benötigten
Listenfelder reduziert; Zugangsdaten bleiben im Server.

Cloud-Ziele bleiben `fitness/{uid}/macrocycles/{local-plan-id}` samt `versions/vN`.
Der Browser greift dabei nicht direkt auf Firebase zu. Es gibt keinen automatischen
Push nach lokalem Speichern oder Freigeben. Die alte ClientForge-Auto-Push-Route
ist nicht Teil dieses lokalen Ablaufs.

## Entwicklung und Prüfung

- `pnpm run build` baut lokale Seite, Vue-Shell und Cloud-Coach gemeinsam.
- `pnpm run ui:dev`, dann `local.html` öffnen; API geht an den bestehenden Server.
- Planänderungen zuerst in `~/plan-dev` committen, danach den geprüften Pointer
  `modules/plan` übernehmen. Nicht im Submodul einen zweiten Editor entwickeln.
- `python3 -m unittest discover -s tests -p test_local_plans.py`: temporäre
  Klientenwurzel, Konflikte, Snapshots, Export und simulierter Versand.
- `aos-kitty-launch 'cd /home/alpha/coach-dev && bash scripts/tests/run-local-browser.sh'`:
  echter Browser, gebautes Frontend und isolierter lokaler Testserver; keine echten
  Klientendaten und kein echter Firebase-Versand. Standardmäßig wird der Build
  aus `/tmp/coach-local-build` gelesen; `COACH_LOCAL_TEST_DIST` kann ihn ersetzen.

Service prüfen/starten: `bin/coach-server status|health|start`. Nach Quelländerungen
am Python-Server den vorhandenen Dienst über `bin/coach-server restart` neu laden.

## ClientForge und Muskelansicht

ClientForge ist der lokale Planungsplatz. Im gemeinsamen Editor zeigt jeder
Trainingstag Vorder- und Rückseite der betroffenen Körperregionen. Eine
angeklickte Übung schaltet auf ihre Haupt-/Nebenmuskeln, Ausführung und
Coaching-Hinweise um. Die Klientenvorschau und Planansicht bieten denselben
Ablauf; der PDF-Druck bleibt ein Trainingsblatt. Fehlende Muskelmetadaten
werden ausdrücklich angezeigt, nicht aus Übungsnamen ergänzt.

Die bisherige ClientForge-SPA bindet diesen Planungsplatz im Trainingsplan-Tab
ein. `VITE_COACH_STUDIO_URL` kann dessen URL beim Build überschreiben.
`coach/clientforge.html?client=<slug>` öffnet einen bestimmten lokalen Klienten;
`embed=1` blendet die doppelte Navigation aus. `local.html` bleibt kompatibel.
Der Cloud-Coach nutzt denselben erweiterten Plan-Code für seine angemeldeten
Klienten, aber keine lokalen Dateipfade oder Loopback-API.

## Lokale Freigabe und veraltete Browser-Caches

Lokale GET-Aufrufe sind mit individuellen URLs und `no-store` gegen alte
Cache-first-Service-Worker geschützt. Der obsolete Root-Worker `/sw.js` wird
gezielt durch einen stillgelegten Worker ersetzt; offene Editorfenster werden
nicht neu geladen. Nur alte lokale Plan-API-Cacheeinträge werden entfernt.
Vor Freigabe wird der Plan frisch gelesen; abweichende Revisionen verlangen
eine erneute Prüfung. Offene Übungen erscheinen namentlich auf der Plankarte
mit direktem Zugang zu „Vorgaben ergänzen“. Freigeben bleibt vom Versand getrennt.
