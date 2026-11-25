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

Details öffnet `ExerciseInsightModal` mit Übersicht, Quellen zusammenführen,
Coaching, Bearbeiten und Rohdaten. Der Dialog übernimmt das aktive Theme,
verwendet einen gemeinsamen Scrollbereich und hält mobile Review-Aktionen sichtbar.
Im Quellenbereich steht `SourceEditor` zuerst; Originalquellen sind aufklappbar.
wger und yuhonas werden demselben Übungseintrag zugeordnet. Eine frühere leere
`source_selection` blendet vorhandene Fusionsvorschläge nicht aus; gespeichert
wird weiterhin explizit über die vorhandene Quellen-API. Im Katalog-Browser bleibt
der Quelleneditor ebenfalls verfügbar, auf der Inbox-Karte ist er nicht inline. Klienten-`asMessage`-Pfad unverändert.

## Datenfluss Review

`useInbox({ global: true })` → Firestore/Coach-Commands (`approve` / `delete` /
`reenrich`). Merge-Hinweise kommen parallel über `getInboxMergeCandidates`.

## GitHub-Anfragen

`githubInbox.js` übernimmt den veröffentlichten Issue-Inhalt (Kategorie, Geräte,
Muskeln, Coaching-Notizen, Fehlerbilder und explizite Quellenlinks). Dateipfad und
Bot-Befehle werden nicht als Übungsinhalt erzeugt; der Issue-Ersteller ist keine
Klienten-UID. Fehlende Abschnitte bleiben leer. Die Karte benennt den Prüfstatus
und offene Quellenzuordnungen. GitHub-Entwürfe werden über „Entwurf auf GitHub
prüfen“ bearbeitet; der Inspektor bietet für sie keine lokalen Inbox-Mutationen an.
