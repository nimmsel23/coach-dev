# Audit: Nachrichten (2026-11-01)

## Update 2026-11-09 — Review-Karte (Übungsanfragen)

`InboxCard.jsx` (Coach-Subtab Übungsanfragen) ist Default-Entscheidungssurface:
Identität, 2-Satz-Was, Primärmuskeln, ≤3 Coaching-Highlights, Herkunft als ein
Text, Freigeben/Löschen/Verbessern/Details. Inline-`SourceEditor` entfernt —
Quellenkorrektur nur noch im Detail-Modal. Nachrichten-Pfad (`asMessage`) unverändert.

Die frühere Inbox war eine statische Roadmap mit einem unzutreffend pauschalen
"Keine neuen Mitteilungen". Sie ist durch echte Coach/Klienten-Unterhaltungen
ersetzt. Kein automatischer Versand an echte Konten während der Entwicklung.

| Komponente | Verantwortung |
| --- | --- |
| `Inbox.jsx` | Auth-Zustand und Isolation bei Kontowechsel |
| `CoachConversation.jsx` | Verlauf, Antwort, Planbezug und Lesestand |
| `lib/coachConversation.js` | Eigener UID-Pfad, Live-Abos und bestätigte Writes |

Abnahme über isolierten Firestore-Emulator und mobile Browser-Fixture in Coach:
Coach-Nachricht mit veröffentlichter Planversion → Klient liest/antwortet →
Coach sieht Antwort und Lesestand. Client-Switch darf weder Verlauf noch Entwurf
vom vorigen Klienten zeigen. Rules-Tests prüfen Fremdzugriff, Rollenfälschung,
Längen-/Schemaschutz, unveränderliche Nachrichten und eigene Lesestände.

Offene Ausbaustufen: ältere Nachrichten nachladen (aktuell letzte 100), Anhänge,
Push-Benachrichtigungen und globale Unread-Zähler. Bestehende Kommentare auf
Sessions/Journale bleiben kontextbezogene Felder; sie sind keine automatisch
in den neuen Verlauf übernommenen Nachrichten. Authentifizierte Cloud-Abnahme
und Rules-/App-Releases erfolgen separat.

Dokumentationsprüfung 2026-11-01: Auth-/Pfadisolation, Cache/Pending, flüchtige
Entwürfe, tatsächliche Lesestand-Semantik, globale Coach-Rolle und Abgrenzung zu
alten Kommentaren gegen Quellcode geprüft. Benutzerablauf, Release-Grenze und
Fehlerbilder in docs/COACH-COMMUNICATION.md; keine neue Geräteabnahme behauptet.
