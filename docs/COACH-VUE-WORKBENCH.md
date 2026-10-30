# Coach-only Oberfläche mit der Vue-Workbench

Stand: 2026-10-30. Dieses Dokument hält die beabsichtigte UI-Richtung fest;
es beschreibt keinen bereits vollzogenen Framework-Wechsel.

## Ist-Zustand

- Die Oberfläche in `coach-dev` startet über `coach.html` und
  `src/coach-main.jsx`. `vite.config.js` verwendet `@vitejs/plugin-react`;
  die ausgelieferte Coach-Oberfläche ist daher aktuell React.
- `~/workspace/VitalOS/app` ist eine separate Vue-3-/Vite-Anwendung mit
  `@vitejs/plugin-vue`. Sie ist eine Workbench für VitalOS-Oberflächen und
  derzeit weder eine Laufzeit- noch Build-Abhängigkeit von Coach.
- Coach besitzt seine coach-spezifische Trainingsprogramm- und Zuweisungslogik.
  Die Klienten-App bleibt eine eigene Oberfläche und liest zugewiesene Pläne
  über den bestehenden Firebase-Datenvertrag.

## Ziel

Die Coach-only Oberfläche soll mit der Vue-Workbench gestaltet und als klar
Coach-eigene Vue-Oberfläche umgesetzt werden. Die Workbench dient dabei als
Gestaltungs- und Entwicklungsumgebung; Coach soll keine Oberfläche aus der
Workbench zur Laufzeit importieren. Coach-Ansichten und Coach-Bedienlogik
bleiben dem Coach-Produkt zugeordnet. Die Plan-/Klientenoberfläche bleibt
davon getrennt.

Coach bleibt fachlicher Besitzer von Coach-Funktionen, Zugriff und
Klientenzuweisungen. Die Vue-Oberfläche soll dafür vorhandene Coach-Funktionen
und den bestehenden Firebase-Vertrag verwenden. Der Firebase-Vertrag ist die
Integration zur Klienten-App; `plan-dev`-Quellcode ist keine UI- oder
Build-Abhängigkeit.

## Umsetzungsgrenze

Der Wechsel ist noch offen. Vor der Umstellung müssen Zielpfad und Build-/Hosting-
Einbindung der generierten Vue-Oberfläche in Coach festgelegt werden. Danach
werden die Coach-only Screens schrittweise in Vue umgesetzt und gegen den
Coach-eigenen Datenzugriff angebunden. Die bestehende Oberfläche wird erst
abgelöst, wenn Coach-Login und Rollenprüfung, Klientenwahl, Programm-/Workout-
Authoring, Zuweisung und Trainingsverlauf in der Vue-Oberfläche abgedeckt sind.

Nicht Teil dieser Zielrichtung sind ein Vue-Port der Klienten-App, eine
Laufzeitkopplung an `~/workspace` oder ein Import von Plan-Views in Coach.
