# Disconnected Features

Features die durch Refactoring ihren Anschluss verloren haben.
Jeder Eintrag hat einen klaren Reconnect-Pfad.

---

## 1. Inbox-View — Konzeptionell falsch implementiert ❌

**Datei:** `src/views/Inbox/`, `src/views/Coach/`
**Geplanter Scope:** Coach-Klient-System — Coach verwaltet Übungskatalog, Klient trainiert. Exercise-Freigabe ist Aufgabe des Coaches, nicht des Klienten.
**Ist-Zustand:** Implementierung dreht das um — ein Klient soll Exercises "approven". Das ist falsch. Außerdem existiert keine pro-User-Firestore-Collection (`fitness/{uid}/inbox`) — die Datenstruktur für ein echtes Coach-Klient-System fehlt komplett.
**Was fehlt für eine korrekte Implementierung:**
- Firestore: `fitness/{uid}/` pro Klient-Account
- Coach sieht alle Klienten-Daten via collectionGroup
- Klient sieht nur eigene Daten
- Exercise-Enrichment-Freigabe liegt beim Coach, nicht beim Klient
**Reconnect:** Komplette Neukonzeption der Inbox im Coach-Klient-Kontext bevor irgendwas daran gebaut wird.

---

## 2. Muscles-View — Tab entfernt, Code bleibt

**Datei:** `src/views/Muscles/`
**Problem:** War früher ein aktiver Tab (`muscles`). Tab wurde aus der Navigation entfernt, View-Ordner mit 6 Komponenten blieb. `App.jsx` rendert ihn nicht mehr.
**Reconnect:** Entweder als Tab reaktivieren (in `NAV_ITEMS` + `App.jsx`-Switch) oder bewusst archivieren.

---

## 3. getFavourites / toggleFavourite — fehlen in db.js

**Datei:** `src/components/ExerciseSearchOverlay.jsx:3`
**Problem:** `getFavourites` und `toggleFavourite` werden importiert und aktiv genutzt (State-Initialisierung Z.30, Toggle Z.37–38). In `src/lib/db/kb.js` sind diese Funktionen nicht exportiert → bricht den normalen Build (`npm run build`), nur Firebase-Build läuft durch weil `db.firestore.js` sie möglicherweise hat.
**Reconnect:** Funktionen in `src/lib/db/kb.js` implementieren (localStorage-basiert reicht: `GET /fitness/favourites` oder einfach localStorage) und exportieren.

---

## 4. showDetails + ExerciseItem-Detailbereich

**Datei:** `src/views/Session/ExerciseItem.jsx:10,95`
**Problem:** `showDetails`-State existiert, `prev`-Bar ist klickbar (`onClick={() => setShowDetails(!showDetails)}`), aber kein Panel wird geöffnet — nur CSS-Shadow ändert sich. `ChevronDown/ChevronUp/Minus/Target/Activity` waren ursprünglich importiert für diesen Bereich.
**Reconnect:** Entweder aufklappbaren Detail-Block unter der prev-Bar implementieren (Satz-History, Trend-Chart), oder `showDetails` + den onClick entfernen wenn das Feature nicht mehr gewünscht ist.

---

## 6. taxonomy — App.jsx lädt, WeeklyReview ignoriert

**Datei:** `src/views/WeeklyReview/index.jsx:66,74`
**Problem:** `taxonomy` wird in `App.jsx` via `/fitness/muscles` geladen und an `WeeklyReview` übergeben. `WeeklyReview` nimmt `taxonomy` als Prop entgegen, gibt es aber **nicht** an `ReviewInsights` und `ReviewMuscleImpact` weiter — obwohl beide `taxonomy = null` in ihrer Prop-Signatur haben.
**Reconnect:** In `WeeklyReview/index.jsx` `taxonomy={taxonomy}` an `ReviewInsights` und `ReviewMuscleImpact` übergeben.

---

## 7. navigate-Prop an Dashboard — empfangen, nie genutzt

**Datei:** `src/views/Dashboard/index.jsx:34`
**Problem:** `navigate` kommt als Prop rein, wird aber nie aufgerufen. Dashboard nutzt stattdessen `onNavigate` (lokales Callback-Wrapping). `navigate` ist toter Prop-Slot.
**Reconnect:** Entweder `navigate` direkt verwenden und `onNavigate` entfernen, oder `navigate` aus der Prop-Signatur streichen.

---

## 8. HOME_NAV + Hub-Mode NavCards — deklariert, nie gerendert

**Datei:** `src/views/Dashboard/index.jsx:32`
**Problem:** `const HOME_NAV = NAV_ITEMS.filter(...)` ist deklariert aber wird im JSX nie verwendet. `ARCHITECTURE.md` beschreibt ein Hub-Mode-NavCards-Grid als Feature — das ist nicht implementiert.
**Reconnect:** Entweder NavCards-Grid implementieren (wenn `navMode === 'home'` zeige Kacheln), oder `HOME_NAV` entfernen und `ARCHITECTURE.md` aktualisieren.

---

## 9. HealthWidget — vollständig gebaut, nie registriert

**Datei:** `src/components/dashboard/HealthWidget.jsx`
**Problem:** Vollständige Fitbit-Vitals-Komponente (Gewicht, Schlaf, Schritte, Ruhepuls + Mini-Chart). Nicht in `WIDGET_META` in `Dashboard/index.jsx` registriert → für den User unsichtbar.
**Reconnect:** In `WIDGET_META` als Widget eintragen und Datenpfad (`/fitness/body/latest` o.ä.) anschließen.

---

## 10. MuscleStatus.jsx — toter Wrapper

**Datei:** `src/components/dashboard/MuscleStatus.jsx`
**Problem:** Alter Wrapper der `MuscleBody` + Coverage-Panel kombiniert. Wird nicht mehr in `Dashboard/index.jsx` verwendet — `body` und `coverage` sind jetzt getrennte Widgets. Coverage-Label ist hardkodiert auf "7 Tage".
**Reconnect:** Entweder löschen oder als kombiniertes Widget in `WIDGET_META` reaktivieren.

---

---

## 11. Push-Notifications — App-eigene Erinnerungen

**Konzept:** PWA-Push-Notifications direkt aus der App, keine externe Infrastruktur nötig.

### 11a. Automatische App-Erinnerungen (Prio 1)

Geplante Benachrichtigungen die der User selbst konfiguriert:

| Typ | Trigger | Beispiel |
|-----|---------|---------|
| Workout-Reminder | täglich zur konfigurierbaren Uhrzeit | "Hey, Zeit für dein Push-Training" |
| Habit-Reminder | pro Habit konfigurierbar (Uhrzeit + Tage) | "Hey, Zeit für Habit: Meditation" |
| Coverage-Alert | wenn Muskelgruppe X Tage nicht trainiert | "Beine seit 5 Tagen nicht trainiert" |
| Rest-Day-Check | nach N Tagen ohne Session | "Alles ok? Letzte Session war vor 4 Tagen" |

**Settings-Anbindung:** Neues Section in `Settings/` — Notification-Zeit (Timepicker), welche Typen aktiv, pro-Habit-Toggle in Habits-View.

**Technischer Pfad:**
```
1. SW registriert sich mit VAPID: pushManager.subscribe()
   → Endpoint wird in Firestore fitness/{uid}/profile/push_token gespeichert

2. Firebase Scheduled Function (täglich, cron):
   → liest user push_token + notification_settings
   → prüft heutige Session / offene Habits / Coverage-Gaps
   → sendet Web Push via pywebpush / firebase-admin messaging

3. SW empfängt push-Event → showNotification()
   → Klick öffnet jeweiligen Tab (#session / #habits / etc.)
```

**Fallback für lokal (kein Firebase):** SW-eigener `setTimeout` nach Seitenaufruf (nur solange Tab offen, kein echter Background-Push).

### 11b. Coach2Klient Push (Prio 2)

Coach schreibt Nachricht in `fitness/{uid}/inbox` → Firestore `onSnapshot` triggert Cloud Function → sendet Push an Klient.

**Datenpfad:** Coach-Inbox-Approve → schreibt gleichzeitig in `fitness/{uid}/inbox` eine System-Nachricht → Push.

---

## Sofort-Fixes (Build-Blocker)

| # | Problem | Datei | Fix |
|---|---------|-------|-----|
| 3 | `getFavourites`/`toggleFavourite` fehlen in `db.js` | `kb.js` | Funktionen implementieren + exportieren |

## Mittelfristig

| # | Problem | Aufwand |
|---|---------|---------|
| 6 | `taxonomy` nicht weitergegeben in WeeklyReview | 2 Zeilen |
| 7 | `navigate`-Prop toter Slot in Dashboard | 1 Zeile |
| 11a | Push-Notifications: App-Erinnerungen (Workout, Habits, Coverage) | Mittel — SW + Firebase Function + Settings-UI |
| 11b | Coach2Klient Push | Klein wenn 11a fertig |

## Niedrige Priorität / Klärungsbedarf

| # | Problem | Frage |
|---|---------|-------|
| 4 | `showDetails` ohne Panel | Feature gewünscht oder raus? |
| 8 | `HOME_NAV` / Hub-Mode | Noch geplant? |
| 2 | Muscles-View | Reaktivieren oder archivieren? |
| 9 | HealthWidget | Fitbit-Pipeline aktiv? |
| 10 | MuscleStatus.jsx | Löschen oder reaktivieren? |
