# Coach → Trainingsplan → Klient

Stand: 2026-10-16. Entwicklungsstand, noch kein veröffentlichter Coach-Release.

## Bedienung

1. **Klienten** öffnen und den gewünschten Klienten wählen.
2. **Workout-Vorlagen bearbeiten** führt zur Vorbereitung einzelner Einheiten.
   Namen eingeben, **Erstellen**, Übungen aus Yuhonas auswählen und deren
   Satzvorgaben, Pausen und Hinweise im Plan-Editor bearbeiten. Das Informationssymbol
   öffnet Ausführung/Bildpaar und den Link zur separaten Atlas-App.
3. Nach dem Speichern zurück zur Liste und **Weiter zum Trainingsplan**.
4. **Neuer Trainingsplan** erstellt einen Entwurf. Über **Workout-Vorlage
   hinzufügen** Einheiten samt Häufigkeit und Zeitraum aufnehmen.
5. **Trainingsplan für Klienten bereitstellen** macht den gebündelten Plan im
   persönlichen Plan-Bereich des Klienten sichtbar. Vorlagen selbst liegen
   bereits im Klientenpfad und sind für ihn verfügbar.
6. Der Klient öffnet Plan → Training → Trainingspläne und startet seine Einheit.
   Er protokolliert tatsächliche Sätze im normalen Workout-Logger.
7. **Ergebnisse aus Plan** zeigt in Coach die abgeschlossenen Workouts des
   gewählten Klienten; Aufklappen zeigt dessen tatsächliche Satzwerte.

Die bisherigen Bereiche KI-Insights, Habits und Rotation bleiben unter
**Weitere Bereiche** verfügbar. Vorhandene Hash-/Push-Links funktionieren weiter.

## Gemeinsame Quelle und Build

Vorlageneditor, Übungsauswahl, Katalogadapter, API-Adapter, Trainingsplankomposition
und Makrozyklus-Vertrag gehören zu **plan-dev**. Coach importiert diese Bausteine
über `@plan`; kein zweiter Editor und keine zweite Publikationslogik.

`scripts/shared-plan-root.cjs` findet die Quelle für Vite und Tailwind gemeinsam;
`scripts/shared-plan.mjs` exportiert den Resolver für ESM. Gefunden wird die Quelle als Geschwister `plan-app`, `plan-dev`
oder als isolierten CI-Checkout `.shared/plan`. Das Vorhandensein des neuen
Workflow-Moduls wird geprüft. Der Coach-CI-Workflow checkt Plan auf dem geprüften
Commit `0643b99` aus. Im VitalOS-Workspace pinnt der vorhandene Plan-Gitlink den
verwendeten Stand. Eine Änderung dieser Quelle benötigt entsprechende Builds
und Prüfungen der Consumer.

Vor dem Coach-Build führt `scripts/prepare-shared-plan.mjs` den vorhandenen
Yuhonas-/Bulk-Generator aus Plan aus. Keine neue Importpipeline und kein
weiteres verschachteltes Submodule. React/Firebase bleiben über Vite dedupliziert.
Coach nutzt auch im normalen Dev-Modus seine Firebase-Datenebene; der zuvor
referenzierte lokale Coach-Barrel existiert in diesem Repo nicht. Nur der
isolierte Test-Harness ersetzt Auth und Datenzugriff durch Testadapter.

## Rechte und Daten

Die Sichtbarkeit der Coach-Konsole folgt derselben Rollenprüfung wie Plan:
Custom Claim, eigenes `roles/{uid}`-Dokument oder bestehende Alpha-UID. Eine
E-Mail-Teilzeichenfolge erteilt keinen Coach-Zugang. Firestore Rules bleiben
SSOT in VitalOS. Alle Editorzugriffe binden die ausgewählte Klienten-UID.
Alte Ladeantworten dürfen nach einem Klientenwechsel keine neuen Daten ersetzen.

Plan-Einheiten sind Snapshots ihrer Workout-Vorlage. Vorlagenänderungen ändern
bereitgestellte Snapshots nicht automatisch. Laufende/abgeschlossene Einheiten
bleiben ebenfalls eigenständig. Noch keine Versionsverwaltung veröffentlichter
Planänderungen und keine Mehrgeräte-Konfliktauflösung.

## Prüfung

- `npm run build:firebase:coach` und vollständiges ESLint.
- `node --test src/views/Coach/coachRoute.test.mjs` für bestehende Deep-Links.
- `aos-kitty-launch npm run test:coach:browser` für den isolierten Browserablauf.

Browserprüfung: echter Coach-View, gemeinsamer Yuhonas-Editor, Satzvorgaben und
Hinweise, Wechsel zum Trainingsplan, Bereitstellen und anschließendes Lesen der
Testdaten. Die Daten liegen ausschließlich beim Testklienten; der Coach-Pfad
bleibt leer. Mobile Breite 390 px ohne horizontalen Seitenüberlauf; keine
unbehandelten Browser-Ausnahmen im geprüften Ablauf. Temporäre Backend-Dateien
und separates Browserprofil; keine echten Klientendaten oder Cloud-Schreibtests.
Ports 15903, 15915 und 19222 müssen für den Harness frei sein. Benötigt Node,
Python/FastAPI/uvicorn, curl und Chromium (`PLAN_TEST_BROWSER`).

Authentifizierter Cloud-Durchlauf steht separat aus. Der neue Coach-Stand wird
nicht automatisch mit dem bereits angeforderten Plan-/Fitness-Release veröffentlicht.
