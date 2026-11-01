# Kommunikation: Tests, Freigabe und Diagnose

Stand: 2026-11-01. Fachlicher Ablauf, Datenfelder und Grenzen:
[COACH-COMMUNICATION.md](COACH-COMMUNICATION.md).

Dieses Runbook beschreibt ausführbare Prüfungen und den späteren Release. In der
Dokumentationsarbeit werden weder Produktionsnachrichten noch Deployments ausgelöst.

## Quellen und lokale Vorprüfung

```sh
git -C ~/dev/coach-dev status --short
git -C ~/dev/coach-dev branch --show-current
git -C ~/dev/fitness-dev status --short
git -C ~/dev/fitness-dev branch --show-current
git -C ~/dev/.worktrees/vitalos-coach-communication status --short
git -C ~/dev/.worktrees/vitalos-coach-communication branch --show-current
```

Die Implementierung liegt in Coach `d9a005e`, Fitness `4544698` und Rules `2421611`.
Regeländerung: VitalOS-Feature-Branch `codex/coach-communication`. Coach wurde auf
`integrate-klienten` entwickelt, Fitness auf `dev`. Vor Releases deren tatsächlichen
Branch und geltende Repo-Anweisungen prüfen; keinen Feature-Stand ungeprüft in den
stabilen `~/vitalos`-Checkout kopieren oder einen Submodule-Pointer automatisch bumpen.

## Testumgebung

| Voraussetzung | Verwendung |
| --- | --- |
| Vorhandene pnpm-Version aus `packageManager` | Repo-Abhängigkeiten und Builds |
| Node mit globalem `WebSocket` | CDP-Browsertest (geprüft mit Node 26.13.0) |
| Java und gecachter Firestore-Emulator | Lokale Zugriffsregel-Prüfung |
| Firebase CLI | Emulator-Orchestrierung für Demo-Projekt |
| `@firebase/rules-unit-testing` | Im Rules-Worktree als Dev-Dependency registriert und gelockt |
| Coach- und Fitness-Abhängigkeiten | Browser-Fixture verwendet beide echten Datenadapter |
| Thorium | Runner erwartet `/opt/thorium-browser-avx2/thorium` |
| `aos-kitty-launch` | Sichtbare Ausführung von Emulator und Browser-Runner |

Abhängigkeiten im jeweiligen Checkout mit dessen normalem pnpm-Workflow einrichten.
Keine geteilten Produktions-`node_modules` in einen Worktree verlinken: dessen
Manifest-/Workspace-Stand kann abweichen. Eine Rückfrage zum Löschen/Neuinstallieren
geteilter Module abbrechen und eine eigene konsistente Umgebung verwenden.

## Ports: ausschließlich kurzlebige Tests

| Port | Zweck |
| --- | --- |
| `18080` | Isolierter Firestore-Emulator |
| `9151` | Emulator-Websocket, bei bisherigen Läufen automatisch verwendet |
| `15905` | Vite-Browser-Fixture |
| `19224` | Thorium CDP |

Das sind keine neuen Produktdienste. Belegte Ports auf den jeweiligen Besitzer
zurückführen; keine fremden Listener beenden. Regeln und Browsertest nacheinander
ausführen: Rules-Tests löschen ihre Emulator-Testdaten vor jedem Testfall.

## Regeln reproduzieren

Im Rules-Worktree mit installierten eigenen Abhängigkeiten:

```sh
aos-kitty-launch 'cd /home/alpha/dev/.worktrees/vitalos-coach-communication && firebase emulators:exec --only firestore --project demo-coach-communication --config firebase.coach-communication.json "node --test tests/coach-communication.rules.test.mjs"'
```

Alternativ ist `test:coach-communication:rules` als Paket-Script registriert;
dieses Script startet selbst keinen Emulator. Es benötigt einen bereits auf
`127.0.0.1:18080` laufenden Demo-Emulator. Der Test lädt zusätzlich die Regeln aus
demselben Checkout. Die explizite Projekt-ID bleibt `demo-coach-communication`.

Fünf Testfälle umfassen:

1. Coach erstellt Plan-Nachricht, Klient liest/antwortet, Coach liest Verlauf.
2. Fremder Klient und nicht angemeldeter Nutzer dürfen nicht lesen/schreiben.
3. Klient kann weder Coach-Rolle noch fremde Absender-UID vortäuschen.
4. Nachträgliches Ändern/Löschen und ungültige Payloads werden abgewiesen.
5. Teilnehmer können nur ihren eigenen Lesestand schreiben.

Erwartet: fünf bestandene Tests und Exit-Code 0. `PERMISSION_DENIED`-Meldungen
innerhalb negativer Tests sind erwartbar; entscheidend sind Testergebnis und
Exit-Code. Ein fehlgeschlagener Emulator-Start oder Paketmanager-Aufruf ist kein
bestandener Test. Nur die fünf Fälle gelten als automatisierter Sicherheitsnachweis,
nicht alle zukünftigen Varianten oder unveröffentlichte Produktionsregeln.

## Mobiler End-to-End-Test

Mit denselben neuen Regeln, ohne gleichzeitig laufenden Rules-Test:

```sh
aos-kitty-launch 'cd /home/alpha/dev/coach-dev && firebase emulators:exec --only firestore --project demo-coach-communication --config /home/alpha/dev/.worktrees/vitalos-coach-communication/firebase.coach-communication.json "bash scripts/tests/run-communication-browser.sh"'
```

Falls der Emulator bereits separat mit genau diesem Demo-Projekt/Ruleset läuft:

```sh
aos-kitty-launch 'cd /home/alpha/dev/coach-dev && bash scripts/tests/run-communication-browser.sh'
```

Die Fixture nutzt die echten Coach-/Fitness-Adapter, aber eigene Emulator-Apps
mit gemockten Auth-Tokens. Planliste und Planprüfung sind kontrollierte Fixtures.
`FITNESS_SOURCE` kann nur für den Test den üblichen Nachbarpfad überschreiben.
Es ist kein Produktions-Fallback und keine zusätzliche Produktabhängigkeit.

Geprüfter Ablauf bei 390 × 844 px:

1. Coach wählt eine veröffentlichte Planversion und sendet einen Hinweis.
2. Klient liest ihn und antwortet mit demselben Planbezug.
3. Coach sieht Antwort und Lesestand; Klient sieht den Coach-Lesestand.
4. Coach wechselt von Klient A zu B: weder A-Verlauf noch A-Entwurf erscheint bei B.
5. Zurück zu A bleibt dessen gespeicherter Verlauf erhalten.
6. Keine unbehandelten Browser-Ausnahmen und kein horizontaler Überlauf.

`/tmp/coach-communication-browser-latest` enthält den Pfad des letzten Testordners
mit `results.log`, `vite.log`, `browser.log` und Browserprofil. Ein Screenshot wird
als `/tmp/coach-client-communication-mobile.png` geschrieben. Diese Artefakte sind
flüchtige lokale Testnachweise; spätere Läufe können sie überschreiben. Erfolgreiche
Ausführung endet mit `PASS: mobile Coach ...` und Exit-Code 0. Der Runner beendet
seine eigenen Vite-/Browser-Kinder; `emulators:exec` beendet den Emulator.

## Ergänzende Vertrags- und Build-Prüfungen

```sh
cd ~/dev/coach-dev
node --test src/views/Coach/coachRoute.test.mjs
node scripts/tests/plan-contract.test.mjs
pnpm run build:firebase:coach

cd ~/dev/fitness-dev
pnpm run build:firebase:client
```

Routing prüft unter anderem `#/clients/<uid>/messages`. Die zwei Plan-Vertragstests
prüfen die bestehende Zuweisungs-/Snapshot-Grenze. Sie ersetzen nicht die manuelle
Abnahme eines während des Schreibens gewechselten Plan-Heads. Build-Erfolg sagt
nichts über aktivierte Service Worker, echte Konten oder den Live-Deploy aus.

## Freigabereihenfolge

1. **Rules-Stand prüfen/reviewen:** Feature-Diff gegen den aktuellen VitalOS-Stand,
   Rollenmodell und Tests prüfen. Andere Apps im selben Firebase-Projekt dürfen
   ihre Regeln nicht verlieren. Root-Regeln gehören VitalOS.
2. **Rules integrieren und autorisiert veröffentlichen:** Nach der vorgesehenen
   Integration den manuellen Workflow `.github/workflows/deploy-firestore-rules.yml`
   im VitalOS-Owner verwenden. Dieser deployt projektweite Regeln und Indizes nach
   `fitness-aos`; ein normaler Shell-Push ist kein automatischer Rules-Deploy.
3. **Regelstand bestätigen:** Workflow/Projekt/Ref und Ergebnis prüfen. Ein bloß
   vorhandener Feature-Commit ist kein aktives Ruleset.
4. **Coach/Fitness veröffentlichen:** Geltenden Repo-PR-/Release-Weg verwenden.
   `coach-release` verlangt den Coach-Branch `dev` und einen sauberen Checkout;
   der Entwicklungsstand auf `integrate-klienten` ist zuerst entsprechend zu integrieren.
   Fitness folgt seiner `dev → master → vitalos`-Schiene mit getrennten App- und
   Shell-Pointern. Kein Push, Merge oder Deployment ohne entsprechende Freigabe.
5. **Echte Geräte abnehmen:** Coach-Konto und Klientenkonto, jeweils korrektes
   Firebase-Projekt und aktuelle App-/Service-Worker-Version prüfen.

Der Kommunikationsblock liegt außerhalb der Modul-Marker in VitalOS `firestore.rules`.
`scripts/build-rules.mjs` ersetzt nur registrierte Modulblöcke; diesen neuen Block
nicht versehentlich in einem fremden Fragment überschreiben. Der Rules-Workflow
liest das konsolidierte Root-Ruleset. Keine Rules aus Coach/Fitness deployen.

## Manuelle Geräteabnahme nach Veröffentlichung

- Mit zwei echten Konten eine allgemeine Nachricht und Antwort prüfen.
- Veröffentlichte Planversion anhängen; auf Klientenseite Bezug übernehmen/entfernen.
- Plan nach Auswahl verändern: alter gewählter Head darf nicht still neu versendet werden.
- Hintergrundtab und nicht sichtbare neueste Nachricht: kein verfrühtes Gesehen erwarten.
- Offline/Online-Wechsel, Fehlermeldung und erhaltenen Textentwurf im selben Composer prüfen.
- Reload/Abmelden/Klientenwechsel: dokumentierten Verlust des flüchtigen Entwurfs beachten.
- Dritter Klient darf fremden Verlauf weder lesen noch beschreiben.
- Push nicht als Erfolgskriterium verwenden: Für diese Direktnachrichten fehlt ein Trigger.

Diese Punkte sind Abnahmeaufträge, keine Behauptung bereits geprüfter echter Geräte.

## Fehlerbilder

| Symptom | Prüfen / nächster Schritt |
| --- | --- |
| `Missing or insufficient permissions` | Neue Regeln tatsächlich im richtigen Projekt veröffentlicht? Auth-UID/Coach-Claim/Rollen-Dokument prüfen. Keine offene Fallback-Regel hinzufügen. |
| Kein Nachrichten-Tab | Richtiger Coach-Build und Route geladen? Cache/Service Worker und Client-Auswahl prüfen. |
| Klienten-Inbox zeigt Roadmap | Alter Fitness-Build aktiv; Quelle, Hostingziel und aktive Assets prüfen. |
| Coach sieht andere/keine Klientennachrichten | Ausgewählte Firebase-UID gegen bestehende Klienten-Registry prüfen; keine zweite Registry anlegen. |
| Nur lokaler Stand | Cache-Metadaten allein beweisen keinen Netzausfall. Verbindung/Auth und folgende Server-Snapshots prüfen. |
| Senden bleibt ausstehend | Verbindung und Firebase-Write prüfen; unbestätigten Text nicht als gespeichert bezeichnen. Bei unklarem Ausgang Verlauf vor erneutem Senden prüfen. |
| Plan kann nicht angehängt werden | `published` und `headVersion` laden, ausgewählte Version vergleichen und Nachrichten-Tab erneut öffnen. Allgemeine Nachricht bleibt möglich. |
| Gespeichert, aber nicht gesehen | Gegenkonto, geöffnetes Gespräch, sichtbare neueste fremde Nachricht und zugehörigen Lesestand prüfen. Kein Push-Problem ableiten. |
| Keine Push-Meldung | Aktuell erwartetes Verhalten; kein neuer Nachrichten-Push-Trigger vorhanden. |
| Alte Nachrichten fehlen | UI-Grenze letzte 100; kein automatisches Löschen oder Pagination implementiert. |
| Entwurf nach Reload/Wechsel fehlt | Erwarteter flüchtiger Komponenten-State; persistente Entwürfe sind offen. |
| Nachrichten erzeugen Katalog-Commits | Falschen Daten-/Queue-Pfad suchen. `coachConversations` darf nicht als Übungs-Inbox interpretiert werden. |
| Emulator kann Regeln nicht laden | Projekt-/Konfigurationsverzeichnis und `firebase.coach-communication.json` prüfen; kein `../firestore.rules` außerhalb des Firebase-Projektverzeichnisses verwenden. |
| Paketmanager will geteilte Module ersetzen | Abbrechen; eigene konsistente Checkout-Abhängigkeiten einrichten. Test nicht auf geteilten produktiven Modulen erzwingen. |

## Rücknahme und Wartung

Die alte App kennt die neue Collection nicht. Eine App-Rücknahme migriert oder
löscht die Nachrichten daher nicht automatisch. Vor einer Rules-Rücknahme prüfen,
ob bereits ausgerollte neue Clients davon abhängen; ein noch neuer Client würde
bei gesperrter Collection Berechtigungsfehler bekommen. Regeln niemals pauschal
öffnen. Produktive Datenexporte/-löschungen sind eigene explizite Wartungsaufträge;
das Löschen des lokalen Demo-Emulators ist keine Produktionsbereinigung.

Änderungen am Protokoll immer in Coach- und Fitness-Adapter, Regeln, positiven und
negativen Tests sowie beiden Benutzeroberflächen prüfen. Produktive Regeln und
App-Builds getrennt nachweisen; danach dieses Runbook und die Rollen-Dokumente
aktualisieren. Keine komplette Kommunikationsimplementierung in Plan duplizieren.

## Abschlussprüfung der Gesprächserweiterungen (2026-11-01)

Zwei Tests für konten-/klientengetrennte Entwürfe bestanden; ESLint und
Coach-Produktionsbuild bestanden. Mobile Fixture auf 390px: Antwort in beide
Richtungen, unveränderliche Planversion öffnen, Entwurf nach Reload und
Klientenwechsel erhalten, Ungelesen-Zähler aktualisieren, 205 historische
Nachrichten nachladen und danach Live-Nachricht empfangen, ohne ältere
Einträge zu verlieren. Keine horizontalen Überläufe oder Browser-Ausnahmen.
Emulator, Vite und Thorium wurden direkt als einzelne Befehle ausgeführt,
ohne temporäres Bash-Starter-Skript. Der echte Login und reale Geräte sind
damit nicht abgenommen. Zentraler Ungelesen-Index muss vor Live-Release bereit
sein; siehe COACH-COMMUNICATION.md.
