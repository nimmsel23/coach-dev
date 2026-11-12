# Coach-only Oberfläche mit der Vue-Workbench

Stand: 2026-10-30. Die Vue-Workbench liefert die äußere Coach-Shell; die
Coach-Anwendung darin bleibt zunächst React.

## Ist-Zustand

- Die React-Anwendung startet über `coach.html` und `src/coach-main.jsx`.
- `coach-shell.html` / `src/vue-shell/main.js` bilden den Vue-Einstieg.
  Die Vue-Seite wird in Produktion zur Hosting-Startseite `index.html` und
  bettet die unveränderte React-Anwendung same-origin über `/coach.html` ein.
- Der Coach-Build enthält beide Vite-Entrypoints. Das PWA-Manifest und der
  Root-Service-Worker gehören der Vue-Shell; der Service-Worker precacht auch
  `coach.html` und die gemeinsamen gebauten Assets. Der direkte React-Einstieg
  bleibt für lokale Entwicklung und gezieltes Öffnen erhalten.
- `~/workspace/VitalOS/app` ist eine separate Vue-3-/Vite-Anwendung mit
  `@vitejs/plugin-vue` und Gestaltungsreferenz; ihr Code wird nicht aus der
  Workbench importiert. CI und Hosting bauen Coach ohne lokalen Symlink dorthin.
- Plan besitzt den Trainingsplan-/Programmeditor und die Zuweisungslogik; Coach bindet ihn als gepinntes `modules/plan`-Submodul ein.
  Die Klienten-App bleibt eine eigene Oberfläche und liest zugewiesene Pläne
  über den bestehenden Firebase-Datenvertrag.

## Grenzen und Betrieb

Coach bleibt fachlicher Besitzer von Coach-Funktionen und Authentifizierung.
Die Vue-Shell ist ein dünner Präsentationsrahmen; Login, Rollenprüfung,
Klientenwahl, Planeditor und Trainingsverlauf laufen in der eingebetteten
React-App. Beide Einstiege teilen durch same-origin Hosting Firebase-Auth und
Browser-Speicher. Die Klienten-App bleibt eigenständig und liest Pläne über den
bestehenden Firebase-Datenvertrag.

Lokale Entwicklung kann direkt `/coach.html` öffnen. Der Firebase-Hosting-
Einstieg `/` zeigt die Vue-Shell; **Direkt öffnen** führt zu `/coach.html`.
Shell und React-App werden gemeinsam mit `build:firebase:coach` gebaut und
unter demselben Hosting-Target veröffentlicht. Die Shell enthält keine zweite
Kopie von Coach-Daten oder Geschäftslogik.

## Hosting-Deep-Links (2026-11-12)

Auf Hosting übernimmt das iframe beim Einstieg den Hash der äußeren Shell,
inklusive Klienten-ID, Detail-Tab, Plan-ID und Datum. `src/vue-shell/frameRoute.js`
verknüpft anschließend Hash-Navigation in beiden Fenstern. Änderungen im
Coach-Fenster ersetzen den äußeren URL-Hash, damit Teilen, Neuladen und
„Direkt öffnen“ den sichtbaren Kontext behalten. Äußere Hash-Navigation wird
per `location.replace` in das iframe übertragen, ohne zusätzliche innere
History-Einträge anzulegen. Listener werden beim Unmount entfernt; fremde
Origins sind keine Quelle für Coach-Routing. Lokale Arbeitsplätze behalten
ihren bisherigen Einstieg in `local.html`.

Der isolierte Browser-Test `src/views/Coach/insights.browser-test.mjs` öffnet
die echte Vue-Shell über `coach.localhost` (Hosting-Modus) und verwendet eine
minimale same-origin Zielseite statt echter Firebase-Konten. Er prüft den
vollständigen Einstiegslink, Navigation im iframe, äußere Navigation, den
Direkt-Link und Reload. Authentifizierung und reale Plan-Daten sind dadurch
nicht abgenommen.
