# Inbox — Architektur

Zwei getrennte Oberflächen teilen den Ordnernamen „Inbox":

1. **Nachrichten** (`Inbox.jsx` → `CoachConversation.jsx`) — Coach↔Klient-Chat.
2. **Übungs-Review** (`InboxCard.jsx` + `useInbox.js`) — Coach-Konsole Subtab
   `exercises` (`views/Coach/index.jsx`).

## Review-Karte (`InboxCard.jsx`)

Default-Form ist eine **Entscheidungssurface**, kein 40-Felder-Editor:

| Block | Inhalt |
| --- | --- |
| Identität | Name, Kategorie, Status-Chips, optional `userId` |
| Was | bis zu zwei Sätze aus description/original_description/instructions |
| Muskeln | nur `primary_muscles` |
| Coaching | bis zu drei `coaching_notes` |
| Herkunft | ein Text (wger/yuhonas/source); Korrektur im Detail-Modal |
| Aktionen | Freigeben / Löschen / Verbessern / Details |

`SourceEditor` bleibt im `ExerciseInsightModal` (Details) und im Katalog-Browser —
nicht mehr inline auf der Karte. Klienten-`asMessage`-Pfad unverändert.

## Datenfluss Review

`useInbox({ global: true })` → Firestore/Coach-Commands (`approve` / `delete` /
`reenrich`). Merge-Hinweise kommen parallel über `getInboxMergeCandidates`.
