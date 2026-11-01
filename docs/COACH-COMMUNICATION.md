# Coach ↔ Klient: Nachrichten

Fitness zeigt den Gesprächsbereich unter dem bisherigen Inbox-Tab. Coach öffnet
beim ausgewählten Klienten den Tab Nachrichten. Beide verwenden Firestore direkt,
ohne einen eingeschalteten Laptop-Worker. Das Protokoll steht im gleichnamigen
Coach-Dokument (`~/dev/coach-dev/docs/COACH-COMMUNICATION.md`).

Client-Adapter: `src/lib/coachConversation.js`. Teilnehmer-UID wird aus Firebase
Auth übernommen; kein frei übergebbarer Zielklient. UI: `views/Inbox`.
Vor einem Release müssen die neuen VitalOS-Regeln für `coachConversations`
veröffentlicht sein. Keine Fallback-Regel auf ungeschützte Fitness-Pfade.
