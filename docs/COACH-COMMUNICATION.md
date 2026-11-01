# Coach ↔ Klient: Gesprächsbereich

Stand: 2026-11-01. Coach besitzt die Klientenauswahl und seine Oberfläche;
Fitness besitzt die Klienten-Mitteilungen. Beide sprechen ein gemeinsames
Firestore-Protokoll. Regeln gehören VitalOS. Kein zweiter Python-Dienst,
Cloud-Command-Worker oder zusätzlicher Port wird eingeführt.

## Bedienung

Coach: Klient auswählen → **Nachrichten**. Optional einen bereits veröffentlichten
Trainingsplan auswählen, Text eingeben und senden. Vor dem Versand wird dessen
veröffentlichte Version erneut geprüft; ein geänderter Versionsstand wird nicht
still als der zuvor ausgewählte Stand versendet.

Fitness-Klient: **Inbox/Nachrichten** öffnen. Coach-Nachrichten lesen und antworten.
**Zu diesem Plan antworten** übernimmt den Planbezug. **Bezug entfernen** wechselt
zu einer allgemeinen Nachricht. Die ehemalige Inbox-Roadmap ist ersetzt.

Beide Seiten zeigen die letzten 100 Nachrichten live. `Gespeichert` bedeutet
serverseitig bestätigt, `Wird gesendet…` einen ausstehenden Write. `Gesehen`
beruht auf dem Lesestand der Gegenseite beim sichtbaren Öffnen neuer Nachrichten.
Ein Push wird nicht behauptet und ist für den Gesprächsverlauf nicht erforderlich.
Ein Textentwurf wird nach bestätigtem Versand geleert; Fehler bleiben sichtbar.
Nach Klienten-/Kontowechsel werden Abos und UI-Zustand getrennt.

## Datenprotokoll

- `coachConversations/{clientUid}/messages/{messageId}`:
  `{body,senderUid,senderRole,createdAt,plan}`.
- `senderRole` ist `coach` oder `client`, `createdAt` ein Server-Timestamp.
- `body`: 1–4000 Zeichen; UI trimmt Rand-Leerzeichen.
- `plan`: null oder `{id,name,version}` mit einer veröffentlichten Version als
  Bezug. Das ist eine Referenz, keine Kopie des Plans und keine neue Freigabe.
- `coachConversations/{clientUid}/readStates/{readerUid}`: `{lastReadAt}`.

Coach-Adapter: `src/lib/db/firestore/communication.js`. Client-Adapter:
`fitness-dev/src/lib/coachConversation.js`. Die Adapter übernehmen verschiedene
Rollen-/Auth-Kontexte; der Client kann keinen fremden Zielklienten übergeben.
Keine alternativen Speicherpfade oder lokalen Kopien der Nachrichten anlegen.

## Zugriffsregeln und Release

Die neue Collection liegt außerhalb der alten breiten `fitness/{uid}`-Regeln.
Coach und der jeweilige Klient lesen. Nachrichten dürfen nur vom authentifizierten
Absender mit passender Rolle erstellt werden. Sie sind nicht nachträglich
veränderbar/löschbar. Jeder Teilnehmer schreibt ausschließlich seinen Lesestand.
Fremde Klienten und anonyme Nutzer haben keinen Zugriff.

Regel-Implementierung und Tests sind separat im VitalOS-Feature-Worktree
`~/dev/.worktrees/vitalos-coach-communication`, Branch `codex/coach-communication`,
vorbereitet. Der stabile `~/vitalos`-Checkout bleibt unberührt.

Freigabereihenfolge:

1. Rules-Änderung im VitalOS-Owner reviewen und über dessen autorisierten Weg
   veröffentlichen. Keine Rules aus Coach oder Fitness deployen.
2. Coach und Fitness über ihre jeweiligen PR-/Release-Wege veröffentlichen.
3. Mit echtem Coach- und Klientenkonto auf zwei Geräten abnehmen.

In dieser Implementierung gab es kein Hosting-/Rules-Deployment, keinen Push
und keinen Versand an echte Klienten. Alte Kommentare auf Sessions/Journale
bleiben eigenständige, kontextgebundene Rückmeldungen. Ihre Coach-Erfolgsmeldung
behauptet keinen Push-Versand mehr.

## Verifikation

Rules: fünf Tests im lokalen Firestore-Emulator (Demo-Projekt), einschließlich
Fremdzugriff, Rollenfälschung, Schema/Länge, unveränderlichen Nachrichten und
Leseständen. Testdatei und `test:coach-communication:rules` liegen im Rules-Worktree.

Mobiler Browsertest im Coach-Repo:

```sh
# Zuerst isolierten Firestore-Emulator auf 127.0.0.1:18080 mit den neuen Rules
# und Projekt demo-coach-communication starten; dann über Kitty:
aos-kitty-launch 'cd /home/alpha/dev/coach-dev && bash scripts/tests/run-communication-browser.sh'
```

Fixture bindet die echten neuen Datenadapter und Komponenten beider Repos an
zwei ausschließlich lokal gemockte Auth-Identitäten. `FITNESS_SOURCE` überschreibt
nur für diesen Test den Standard-Nachbarpfad. Ablauf: Coach sendet Planbezug →
Klient antwortet mit Bezug → Coach liest Antwort → beide Lesestände sichtbar.
Zusätzlich: Klient wechseln, kein fremder Verlauf oder Entwurf; kein horizontaler
Überlauf bei 390px. Rules und Browser-Fixture verwenden keine Produktivkonten.

Offen: ältere Nachrichten nachladen, globale Unread-Zähler, Anhänge und optionale
Push-Benachrichtigungen. Diese Punkte sind nicht Voraussetzung für Textaustausch.
