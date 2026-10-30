# Coach → Trainingsprogramm → Klient

Stand: 2026-10-30. Coach-Authoring und Klientenzuweisung liegen in `coach-dev`;
Hosting-Release bleibt ein eigener, ausdrücklicher Schritt.

## Arbeitsablauf

1. Unter **Klienten → Trainingspläne** einen Klienten wählen.
2. **Programm auswählen** öffnet die Coach-eigene Programmbibliothek.
3. Ein Programm mit Ziel, Dauer und Hinweisen erstellen. Workout-Einheiten
   werden einmal in der Coach-Bibliothek vorbereitet und können in mehreren
   Programmen verwendet werden.
4. Einheiten samt Zielhäufigkeit und Zeitraum bündeln, Entwurf speichern und
   eine Version veröffentlichen.
5. Die veröffentlichte Version gezielt dem ausgewählten Klienten zuweisen.
   Dabei werden Einheiten und Plan als Klienten-Snapshots in dessen bestehenden
   `fitness/{uid}`-Planbereich kopiert. Neue Versionen der Coach-Vorlage ändern
   bestehende Klientenzuweisungen nicht.
6. Der Klient startet die Einheit in der bestehenden Plan-/Training-Oberfläche.
   Tatsächliche Trainingsdaten bleiben in dessen normalen Workout-Logs; Coach
   liest diese für Ergebnisse und Verlauf.

## Datenmodell

- Coach-Vorlagen: `fitness/{coachUid}/routines` samt Übungs-Subcollections.
- Coach-Programme: `fitness/{coachUid}/coachTrainingPrograms/{programId}`.
- Unveränderliche veröffentlichte Programm-Snapshots:
  `.../coachTrainingPrograms/{programId}/versions/vN` (inklusive kopierter
  Übungsdaten, nicht nur veränderlicher Vorlagen-IDs).
- Zuweisung: neue Klienten-Routinen und veröffentlichter Makrozyklus unter
  `fitness/{clientUid}/routines` und `fitness/{clientUid}/macrocycles`. Dieses
  Format wird von der bestehenden Plan-App gelesen.
- Workout-Historie bleibt in `fitness/{clientUid}/workouts` und wird nicht in
  den Programm-Snapshot geschrieben.

Coach enthält seine eigenen Firestore-Adapter für Routinen und Makrozyklen,
den Coach-Routine-Editor und die Rollenprüfung. Beim Schreiben des Klientenplans
formt Coach den bestehenden Firestore-Datenvertrag direkt; Build und Laufzeit
importieren keinen Code aus `plan-dev`.

Die Firestore-Regeln bleiben in VitalOS die Source of Truth. Die bestehenden
Coach-Regeln erlauben Coach-Operationen in `fitness/{uid}`; Coach-Secrets oder
eine neue Backend-Datenbank werden nicht eingeführt.

## Grenze und nächste sinnvolle Ausbaustufen

Der erste Workflow deckt wiederverwendbare Programme, Workout-Vorlagen,
Veröffentlichung, client-spezifische Zuweisung und unveränderliche Snapshots ab.
Er bietet noch keine visuelle Kalenderplanung, automatische Plan-Updates,
Mehrgeräte-Konfliktauflösung oder Ernährung. Der bestehende Workout-Logger und
die Fitness-Datenhoheit bleiben bestehen. wger ist keine Laufzeitabhängigkeit.

## Prüfung

Der lokale Coach-Build und ESLint liefen nach der Entkopplung erneut. Eine
isolierte Browser-Abnahme für den neuen Ablauf und eine echte Cloud-Schreib-/
Lesekette mit Coach- und Klientenkonten sind offen. Es wurden keine echten
Klientendaten verwendet.

## Kompatibilität mit dem mobilen Planeditor (2026-10-30)

Coach bleibt unabhängig vom Plan-Quellcode. Der neue Editor in `plan-dev`
schreibt denselben Vertrag: `fitness/{clientUid}/macrocycles`, Arbeitsstand unter
`routines`, freigegebener Snapshot unter `published`, Version unter `versions/vN`.
Coach kann solche Pläne lesen. Der Plan-Reader und Logger können umgekehrt die
von Coach zugewiesenen Pläne mit Satzvorgaben, Hinweisen und Quellverweisen starten.
Das bindet den neuen Editor noch nicht als Oberfläche in Coach ein; dort bleibt
vorerst der eigene Programm-/Workout-Editor bestehen.

`pnpm run test:plan:contract` prüft Coach-Veröffentlichung, Klientenzuweisung,
Übungs-Subcollections, Null-Pausen, Snapshot-Trennung und Fehlerbereinigung mit
isoliertem Firestore-Testdouble. Mit `PLAN_SOURCE=/home/alpha/plan-dev` prüft
 derselbe Befehl zusätzlich die tatsächlichen Plan-Reader-/Logger-Module sowie
Coach-Lesen eines durch Plan erstellten Plans. Diese optionale Testverbindung
ist keine Build- oder Laufzeitabhängigkeit. Es werden keine echten Daten gelesen
oder geschrieben. Ohne `PLAN_SOURCE` wird nur der externe Verbrauchertest übersprungen.

Bei der Zuweisung muss `updateWorkoutRoutine({ exercises })` die Übungen als
Dokumente in der Untercollection schreiben. Ein Array am Routine-Metadokument
reicht nicht: der Plan-Reader lädt die Übungs-Subcollection. Der Coach-Adapter
ersetzt diese nun atomar und setzt `exerciseCount`; explizite Null-Pausen bleiben erhalten.
