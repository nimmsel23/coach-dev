# C-Suite workspaces

Sechs Rollen mit einem gemeinsamen lokalen Auftragsablauf: COO, CMO, CSO,
CPO, CTO und CFO. Einstieg: `http://127.0.0.1:9150/coach/ceo`, direkt z. B.
`http://127.0.0.1:9150/coach/coo`.

## Was tatsächlich funktioniert

1. Rolle/Skill wählen und einen eigenen Auftrag mit Kontext eingeben.
2. Coach speichert den Auftrag sofort und erstellt den Entwurf im Hintergrund
   mit Gemini, Claude oder Codex. Eine Engine läuft gleichzeitig, maximal acht
   Aufträge warten/laufen. Browserwechsel beendet den Auftrag nicht.
3. Ergebnis prüfen, bearbeiten und ausdrücklich freigeben oder ablehnen.
4. Freigegebenes Ergebnis als Dokument ablegen und als Markdown herunterladen.
   Abgelegter Inhalt entspricht genau dem freigegebenen Entwurf.

Aufträge, Fehler, ursprünglicher KI-Text, korrigierter Freigabetext, Statusverlauf
und Dokumente liegen in `~/.local/state/coach/csuite.sqlite3` (Dateimodus 0600).
`COACH_CSUITE_DB` überschreibt den Speicherort. Der Browser hält nur Modellwahl
und Konsolenverlauf. Er ist nicht die Quelle für Aufträge oder Freigaben.
Unterbrochene Aufträge werden beim Serverstart als fehlgeschlagen markiert;
KI-Aufrufe werden nicht unbemerkt wiederholt. Abgelehnte Einträge bleiben stehen.
Revisionen schützen vor dem Überschreiben gleichzeitiger Entscheidungen.

## Rollenwissen und Grenzen

`config.json`, `system-prompt.md`, `skills.json` und `knowledge/*.md` gehören zur
Rolle. Der Server lädt Prompt, Skill und Wissen; er speichert den verwendeten
Stand mit einem Hash am Auftrag. Browser-Prompt-Overrides werden ignoriert.
Die Runtime erzeugt Entwürfe aus diesem Rollenwissen und dem eingegebenen
Kontext. Sie liest nicht automatisch Klientenakten, Mail oder Kalender.
Skill-Beschreibungen beschreiben den fachlichen Zweck, keine bereits vorhandenen
Datenzugriffe. Es gibt keinen autonomen Versand oder Deployment durch Freigabe.
Der konkrete Abschluss dieses Ablaufs ist ein abgelegtes Dokument.

## Hosting ist kein Backend

Firebase Hosting liefert Portal und Dashboards unter `/coach/<rolle>` bzw.
`/workspaces/<rolle>/dashboard.html`. Aufträge brauchen den lokalen Coach-Server.
Ohne ihn zeigt das Dashboard „Runtime nicht verbunden“ und einen konkreten Fehler;
es erzeugt keine Demo-Antwort und speichert keine scheinbare Freigabe im Browser.
Google-Anmeldung am Portal baut keine Verbindung zur lokalen Runtime auf.
Die Bridge ist loopback-only; fremde Browser-Origins werden abgewiesen.

## API und Prüfung

- `POST /api/csuite/runs`: Auftrag annehmen (202).
- `GET /api/csuite/runs?workspaceId=coo`: Rollenverlauf.
- `GET /api/csuite/runs/<id>`: Status/Ergebnis.
- `POST /api/csuite/runs/<id>/decision`: `expectedRevision`,
  `status=approved|rejected|completed`, optional bearbeiteter `preview` bei Freigabe.
- `GET /api/csuite/runs/<id>/document`: abgelegtes Dokument herunterladen.
- `POST /api/csuite/run`: synchroner Kompatibilitätsweg, gleicher Auftragsspeicher.

`python3 -m unittest src.test_csuite_runtime` prüft Zustände, Wiederanlauf,
Revisionen, Herkunftsschutz und Fehler. Für Browser-Akzeptanz zuerst
`python3 scripts/tests/csuite-browser-backend.py`, dann
`node src/tests/csuite-runtime-browser.mjs`. Der Browser-Test verwendet eine
kontrollierte Engine und eine temporäre Datenbank; er prüft sechs Rollen sowie
Bearbeitung, Freigabe, Neuladen, Dokument, Ablehnung, Fehler und mobile Breite.
