# Fitness-Klient: Austausch mit dem Coach

Stand: 2026-11-01. Die vorherige statische Inbox-Roadmap wurde in `4544698` durch
den Gesprächsbereich ersetzt. Coach-Implementierung: `d9a005e`; neue Regeln:
`2421611` im VitalOS-Feature-Worktree. Dieser Stand wurde lokal geprüft und
committet, nicht produktiv veröffentlicht.

Die vollständige gemeinsame Spezifikation liegt in
`~/dev/coach-dev/docs/COACH-COMMUNICATION.md`, der Ablauf für Tests, Freigabe und
Diagnose in `~/dev/coach-dev/docs/COACH-COMMUNICATION-RUNBOOK.md`.
Dieses Dokument beschreibt die Fitness-Seite und ihre Integrationsgrenzen.

## Klientenablauf

1. Mit dem eigenen Cloud-Konto in Fitness anmelden.
2. Bestehenden Tab **Inbox/Nachrichten** öffnen.
3. Allgemeine Nachricht schreiben oder **Zu diesem Plan antworten** bei einer
   Coach-Nachricht mit Bezug wählen.
4. Optional **Bezug entfernen**, Text prüfen und **Nachricht senden** betätigen.
5. Auf bestätigte Speicherung achten. Ein Fehler löscht den Text im aktuellen
   Composer nicht. Eine Nachricht mit Planbezug stellt den Plan nicht selbst bereit.

Kein Laptop-Worker oder lokaler HTTP-Server ist nötig. Ohne Firebase-Anmeldung
zeigt die Ansicht einen Anmeldehinweis. Der lokale Demo-Modus ist kein Ersatz für
die Cloud-Identität. Native Trainingsplan-Erstellung am Laptop bleibt ein eigener
Workflow; siehe `docs/PLAN-OWNERSHIP.md` und die lokale Plan-Dokumentation in Coach.

## Komponenten und Datenfluss

| Datei | Aufgabe |
| --- | --- |
| `src/views/Inbox/Inbox.jsx` | Firebase-Auth beobachten, Login-Hinweis, Remount bei Kontowechsel |
| `src/views/Inbox/CoachConversation.jsx` | Verlauf, Composer, Planantwort, Lesestand |
| `src/lib/coachConversation.js` | Eigene UID bestimmen, Firestore-Abos und Writes |
| `src/App.jsx` | Bestehenden `inbox`-Tab für angemeldete Nutzer öffnen |

Der Adapter importiert die vorhandene Firebase-Initialisierung direkt. Seine UID
kommt aus `auth.currentUser`; der Klient übergibt keinen fremden Empfängerpfad.
Gelesen/geschrieben wird ausschließlich:

```text
coachConversations/{eigeneAuthUid}/messages/{id}
coachConversations/{eigeneAuthUid}/readStates/{eigeneAuthUid}
```

Zusätzlich darf der Teilnehmer die Lesestände seines Gesprächs lesen. Die Query
liest `createdAt desc`, maximal 100 Nachrichten, und die UI zeigt sie
chronologisch an. Kein neuer Python-Endpunkt, kein `@db`-Local-Fallback und keine
Katalog-Inbox-Queue werden für diesen Kanal eingeführt.

Nachrichten enthalten genau `body`, `senderUid`, `senderRole`, `createdAt`, `plan`.
Fitness setzt `senderRole=client`; Regeln prüfen UID/Rolle und Serverzeit. Text
wird getrimmt und auf 1–4000 Zeichen geprüft. Ein Planbezug ist null oder
`{id,name,version}`. Die Antwort übernimmt den Bezug einer alten Nachricht;
sie prüft nicht selbst den aktuellen Plan-Head und veröffentlicht keinen Plan.
Das komplette Schema und serverseitige Grenzen stehen im gemeinsamen Vertrag.

## Status, Fehler und Grenzen

| Zustand | Bedeutung |
| --- | --- |
| `Wird gesendet…` | Write noch nicht bestätigt; keine Zustellgarantie |
| `Gespeichert` | Firestore hat bestätigt; kein Push-Versand nachgewiesen |
| `Vom Coach gesehen` | Ein anderer Teilnehmer hat einen ausreichend aktuellen Lesestand |
| Lokaler Stand | Cache-Snapshot; kein alleiniger Beweis für Offline-Zustand |
| Fehler | Text im selben Composer bleibt erhalten; Ursache prüfen |

Bei mehreren Coaches bedeutet Gesehen mindestens ein Coach. Es gibt keine
separate Anzeige eines bestimmten Trainers. Der Lesestand wird beim sichtbaren
Dokument und sichtbarer neuester fremder Nachricht aktualisiert. Er beweist
weder vollständiges Lesen noch Push-Zustellung.

Entwürfe existieren nur im Komponenten-State. Reload, Abmelden, Kontowechsel oder
Unmount verlieren sie. Auth-Wechsel beendet Abos und bindet den Verlauf neu;
keine Entwürfe zwischen Konten übertragen. Eine garantierte Offline-Warteschlange
über App-Neustarts oder exakt-einmaliger Versand ist nicht zugesichert.

Nachrichten sind für Browser-Clients nicht bearbeitbar/löschbar. Ältere Nachrichten
nachladen, Suche, Anhänge, persistente Entwürfe, globale Unread-Zähler und neue
Push-Benachrichtigungen sind offen. Alte Session-/Journal-Kommentare bleiben
kontextbezogene Felder und erscheinen nicht automatisch als Direktnachrichten.

## Regeln und Veröffentlichung

Regeln gehören VitalOS. Vor dem App-Release muss dessen neues Ruleset für
`coachConversations` veröffentlicht sein. Keine offenen Fallback-Regeln und kein
Rules-Deploy aus Fitness anlegen. Projektweite Coach-Rollen können aktuell alle
Klientengespräche lesen; eine Mehrtrainer-Zuordnungs-ACL ist nicht implementiert.

Die Regeländerung liegt auf `codex/coach-communication` im Worktree
`~/dev/.worktrees/vitalos-coach-communication`. Nach Review und autorisiertem
Rules-Release folgen Coach- und Fitness-Veröffentlichung sowie die echte
Zwei-Konten-/Zwei-Geräte-Abnahme. Der normale Fitness-Release folgt den aktuellen
Repo-Anweisungen und [DEPLOY.md](DEPLOY.md); App- und Shell-Pointer sind getrennt.
Das Entwicklungsfeature allein aktiviert die Funktion auf keiner Hosting-Site.

## Testnachweise und Diagnose

Bestanden: mobiler Emulator-Browserablauf mit den echten Adaptern beider Apps,
Client-/Klientenwechsel ohne fremden Verlauf/Entwurf, Lesestände, fünf Rules-Fälle,
Plan-/Routing-Verträge und beide Firebase-App-Builds. Emulator-Identitäten ersetzen
keinen echten Cloud-Login, keine Rollen-Provisionierung und keinen iPhone-Push-Test.

Test-Runner: `~/dev/coach-dev/scripts/tests/run-communication-browser.sh`; nutzt
Vite 15905, CDP 19224 und Demo-Firestore 18080. Der Test ist ausschließlich gegen
`demo-coach-communication` auszuführen und über `aos-kitty-launch` zu starten.
Vollständiger Start-/Cleanup-Ablauf steht im gemeinsamen Runbook.

- Roadmap statt Nachrichten: aktiven Fitness-Build/Hostingziel/Service Worker prüfen.
- Anmeldehinweis trotz lokalem Profil: echte Firebase-Auth-UID prüfen.
- Berechtigungsfehler: veröffentlichten Regelstand, Projekt und Konten prüfen.
- Gespeichert ohne Gesehen: sichtbaren Verlauf/Lesestand des Gegenkontos prüfen.
- Kein Push: aktuell kein neuer Nachrichten-Trigger vorgesehen.
- Neue Nachrichten erzeugen Katalog-Commits: falschen Speicher-/Queue-Pfad suchen;
  Gespräche gehören nicht in Enrichment oder lokale Übungs-YAMLs.

Weiterführend: [Inbox-Architektur](../src/views/Inbox/ARCHITECTURE.md),
[Inbox-Audit](../src/views/Inbox/AUDIT.md).
