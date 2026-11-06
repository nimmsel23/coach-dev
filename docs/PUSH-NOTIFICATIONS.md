# Push-Benachrichtigungen (FCM)

Stand 2026-10-19. Zwei Wege: **Erinnerungen** an alle Nutzer (zeitgesteuert) und **Klienten-Workout → Coach**
(ereignisgesteuert). Beide laufen als Firebase Cloud Functions (Projekt `fitness-aos`, Region `europe-west1`)
und kommen als FCM-*Data*-Message im Fitness-Service-Worker `public/fitness-messaging-sw.js` an, der die
Notification selbst anzeigt.

```
Klient speichert Session ──► Firestore fitness/{uid}/sessions/{sid}
                                  │ onWrite
                                  ▼
                     onClientWorkout (functions/index.js)
                       shouldNotify()      functions/clientWorkout.js
                       allowsClientWorkout() functions/pushPrefs.js   ← Schalter aus dem Panel
                       buildMessage()      Texte: functions/notifications.yaml
                                  │ FCM sendEachForMulticast
                                  ▼
          Coach-Geräte (fitness/{coachUid}/settings/push → tokens[])
                                  ▼
          firebase-messaging-sw.js ── Klick ──► https://vos-coach.web.app/#/clients/<uid>
```

## Functions (`functions/`)

| Datei | Aufgabe |
|---|---|
| `index.js` | Trigger/Callables: `scheduledFitnessPushReminders` (vorher `scheduledPushReminders`), `onCoachFeedback`, **`onClientWorkout`**, **`sendTestPush`** (+ Strava) |
| `clientWorkout.js` | Rein: wann wird gemeldet (`shouldNotify`), Nachricht bauen, tote Tokens erkennen |
| `pushPrefs.js` | Rein: Ruhezeiten, stumme Klienten, Modus „nur abgeschlossene", Test-Nachrichten, Cooldown |
| `texts.js` | Lädt `notifications.yaml`, setzt `{platzhalter}` ein |
| `notifications.yaml` | **Alle Meldungstexte** (Erinnerungen, `clientWorkout`, `testReminder`, `testClientWorkout`) |

Tests: `node --test functions/` (21 Tests, ohne Firebase). Textänderungen wirken erst nach
`firebase deploy --only functions:fitness:onClientWorkout,functions:fitness:sendTestPush` (bzw. der jeweiligen Function).
`firebase.json` führt die Functions seit `04f26a1` im Codebase `fitness` — Deploy-Ziele daher `functions:fitness:<name>`.

### Wann `onClientWorkout` meldet
- Erstes Mal, dass die Session Inhalt hat (Sätze/Dauer/Effort/`done`), und noch einmal beim Abschluss
  (`finishedAt`, `completed` oder `status: completed`). Autosave-Folgeschreibungen melden nicht.
- Nie bei Coach-eigenen Sessions (`COACH_UIDS`, Standard = UID aus `firestore.rules`), gelöschten Sessions
  oder Sessions, die mehr als 3 Tage alt sind (Nachträge/Importe).
- Datenschutz: nur Vorname, Trainingsart, Dauer — **nie** Notizen, Gewichte, Übungsnamen (steht auf dem Sperrbildschirm).
- Tote Tokens (`registration-token-not-registered`) werden aus `settings/push` entfernt.
- Env: `COACH_UIDS` (kommagetrennt), `COACH_URL` (Standard `https://vos-coach.web.app`).

### Einstellungen: `fitness/{uid}/settings/push`
Fitness liest und schreibt ausschließlich `apps.fitness` (VitalOS verwendet `apps.vitalos`). Die beiden
Apps behalten dadurch getrennte Geräte-Token, Schalter und Erinnerungszustände, obwohl sie dasselbe
Firestore-Dokument nutzen. Fitness-Payloads enthalten `app: "fitness"`; der Worker blendet andere Apps aus.
`enabled`, `tokens[]`, `token`, `devices[{token,label,addedAt}]`, `types{}`, `reminderTime`,
`quietHours{enabled,start,end}` (Berliner Zeit, über Mitternacht erlaubt), `mutedClients[]`,
`clientWorkoutMode` (`all` | `finished`), `lastTestAt` (Cooldown 10 s für `sendTestPush`).
Ruhezeiten gelten nur für Klienten-Meldungen, nicht für die zeitgesteuerten Erinnerungen.

Der Rest-Day-Check berechnet den persönlichen Trainingsabstand aus den Abständen zwischen
dokumentierten Trainingstagen (bis zu 120 Sessions). Er meldet erst bei 1,5× des Durchschnitts,
mindestens nach 3 Tagen; bei weniger als zwei bekannten Trainingstagen gilt ein 7-Tage-Startwert.
Pro letzter Session wird höchstens eine „Alles ok?“-Meldung gesendet. Ein neues Workout startet
diesen Zyklus erneut.

## Service Worker (`public/fitness-messaging-sw.js`, Kopie in `frontend/public/`)
- `data.type === "clientWorkout"`: ein Tag pro Klient (`client-workout-<uid>`); ein weiteres Workout vor dem
  Wegwischen wird zur Sammelmeldung „N neue Workouts" (der Text steht im SW, nicht in der YAML). Gleiche `sid`
  = Update ohne erneutes Klingeln. Buttons „Öffnen" / „Gesehen" („Gesehen" schließt nur).
- Links auf eine andere Origin (Coach-Site) öffnen ein vorhandenes Coach-Fenster oder ein neues.
- Alle übrigen Meldungen: wie bisher (Tag `fitness-reminder`, kein Renotify).
- Eigener Scope `/fitness-push/`; VitalOS registriert `/vitalos-push/` mit eigenem Worker.
- Test ohne Browser: `node scripts/test-push-sw.mjs public/fitness-messaging-sw.js frontend/public/fitness-messaging-sw.js`.

## Notification-Panel (Setup-Tab)
`src/views/Settings/NotificationsSection.jsx` + `src/hooks/usePushNotifications.js` (reine Logik in
`src/hooks/pushSettings.js`, Test `node --test src/hooks/pushSettings.test.mjs`). Kopien in `frontend/src/`.
Geräteliste (Dieses Gerät, entfernen, Test je Gerät), Erinnerungstypen, Ruhezeiten, Coach-Bereich
(Klienten-Workouts, nur abgeschlossene, Klienten einzeln stumm, Demo-Meldung), Test an alle Geräte.
Der Coach-Bereich erscheint nur für die Coach-UID.

## Coach-Konsole (eigenes Repo `~/coach-dev`, Site `vos-coach.web.app`)
Hash-Router `#/exercises`, `#/catalog`, `#/clients/<uid>/<tab>?date=` (Details: `src/views/Coach/ARCHITECTURE.md`
in coach-dev). Die Coach-Konsole wird **standalone aus coach-dev** deployed, nicht aus `src/views/Coach` hier.

## Erinnerung „Workout noch offen“ (`scheduledFitnessPushReminders`)
- Läuft alle 5 Minuten (`europe-west1`) und schickt per FCM eine Erinnerung, wenn ein Gate
  (`sessionGate.startedAt`, kein `endedAt`) länger als 1 Stunde läuft — auch bei geschlossener PWA.
  Voraussetzungen: Session liegt in Firestore, Gerät ist für Push registriert, Schalter `activeWorkout` an.
- Merker „schon erinnert“: `fitness/{uid}/settings/push` → `apps.fitness.activeWorkoutRemindedFor` (= `gate.startedAt`
  des erinnerten Workouts). Früher stand er in `sessionGate.reminderSentAt` im Session-Dokument; der Client
  speichert Sessions per `setDoc()` ohne `merge` und löschte ihn bei jedem Autosave → Erinnerung alle 5 Minuten.
- Der lokale Browser-Reminder (`src/views/Session/useSessionGateLifecycle.js`, Tag `fitness-workout-hour-reminder`)
  läuft zusätzlich, solange die App offen ist; Server-Push nutzt den Tag `fitness-active-workout`. Ob beide über die
  zwei Service Worker hinweg einander ersetzen, ist nicht geprüft.
- Deploy: `firebase deploy --only functions:fitness:scheduledFitnessPushReminders`. Wegen der Umbenennung bleibt die
  alte `scheduledPushReminders` bestehen, bis sie gelöscht wird (`firebase functions:list` prüfen, dann
  `firebase functions:delete scheduledPushReminders --region europe-west1`), sonst doppelte Erinnerungen.

## Deploy-Stand
- Functions `onClientWorkout` und `sendTestPush` sind deployed (2026-10-15).
- Der Merker-Fix für `scheduledFitnessPushReminders` (siehe oben) ist deployed (2026-10-22, `functions:fitness:scheduledFitnessPushReminders`). Ob der Push danach wirklich nur einmal pro Workout kommt, ist noch nicht an einem echten Workout geprüft.
- Panel + neuer Service Worker erst mit dem Haupt-App-Release (`fitness-release`), der Router erst mit dem
  Coach-Deploy (Push von `vitalos` in `coach-app`).

## Offen
- `?date=` im Coach-Link wird gelesen, der Eintrag aber noch nicht hervorgehoben.
- Kein Ende-zu-Ende-Test mit einem echten Klienten-Workout; Test-Push per Admin-SDK ging an 2 von 3 Geräten
  (das dritte Token war tot).
- Lint-Config kennt `functions/` nicht (Node-Globals).
