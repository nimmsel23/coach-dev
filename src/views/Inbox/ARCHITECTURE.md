# View Architecture: Nachrichten

Die Fitness-Inbox unter dem bestehenden Tab `inbox` ist der persönliche
Coach/Klienten-Gesprächsbereich. Sie ersetzt die vorherige statische Roadmap.

- `Inbox.jsx` beobachtet Firebase Auth und bindet die Unterhaltung an die UID.
  Ein Kontowechsel remountet die Unterhaltung und verwirft deren UI-Zustand.
- `CoachConversation.jsx` zeigt die letzten 100 Nachrichten live, einen Composer,
  Planbezüge und Lesestände. Der Klient kann auf einen Planbezug antworten oder
  ihn vor dem Senden entfernen. Entwürfe werden erst nach bestätigtem Schreiben
  geleert; ausstehende Schreibvorgänge werden als solche angezeigt.
- `src/lib/coachConversation.js` ist der clientseitige Firestore-Adapter. Er leitet
  den Empfängerpfad ausschließlich aus der angemeldeten UID ab und setzt
  `senderRole=client`. Coach verwendet einen eigenen rollenbezogenen Adapter
  für dasselbe Datenprotokoll.

Datenpfade: `coachConversations/{uid}/messages/{id}` und
`coachConversations/{uid}/readStates/{readerUid}`. Nachrichten enthalten Text,
Absender/Role, Serverzeit und optional einen Planbezug `{id,name,version}`.
Lesestände werden beim sichtbaren Öffnen neuer fremder Nachrichten aktualisiert.
Cloud-Speicherung und Gesehen sind getrennte Zustände; Push wird nicht behauptet.

Die Zugriffsregeln gehören VitalOS und müssen vor einem App-Release veröffentlicht
sein. Die neue Collection liegt außerhalb der breiten alten Fitness-Owner-Regel.
Coach und der jeweilige Klient lesen; Absenderrollen sind durch Regeln geschützt.
Gesendete Nachrichten sind unveränderlich. Jeder Teilnehmer schreibt nur seinen
Lesestand. Kein Laptop-Worker oder lokaler HTTP-Server ist für Nachrichten nötig.

Legacy-`InboxCard`/`useInbox` behandeln weiterhin Übungsanfragen; die Katalogreview
ist davon getrennt. Neue Nachrichten werden nicht in die Enrichment-Pipeline
oder den Katalog-Worker eingereiht.

Ausführlicher Klientenvertrag und Fehlersuche:
[docs/COACH-COMMUNICATION.md](../../../docs/COACH-COMMUNICATION.md).
Gemeinsames Schema/Runbook liegen im Coach-Owner; Adapter bleiben rollenbezogen.
Der Textentwurf ist flüchtig, Lesestände sind zeitbasierte UI-Signale. Aktuelle
projektweite Coach-Berechtigung nicht als zugewiesenen-Trainer-Filter interpretieren.
