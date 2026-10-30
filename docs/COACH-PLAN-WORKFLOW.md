# Plan besitzt den Editor, Coach nutzt ihn

Stand: 2026-10-30. Diese Zuständigkeit ersetzt die vorherige Entkopplung des
Coach-Editors. Coach besitzt Zugriff, Klientenwahl, Navigation und Hosting.
Plan besitzt den Plan-/Programmeditor, Workout-Vorlagen, Versionen und Zuweisung.

## Einbindung

`modules/plan/` ist ein Git-Submodul von `nimmsel23/plan-dev`, auf einen konkreten Commit
gepinnt. Vite löst `@plan` ausschließlich dorthin auf, Tailwind scannt dessen
Quellen. Es gibt keinen stillen Fallback auf `../plan-dev`. Der Build generiert
die Katalogdaten aus der Plan-eigenen Quelle. CI initialisiert gezielt dieses
Submodul und folgt keinem beweglichen Branch-Head.

Coach öffnet `ProgramEditor` aus Plan für seine Programmbibliothek. Er bietet
Trainingstage, direkte Übungsbearbeitung, Duplizieren/Sortieren, Satzvorgaben,
lokale Entwürfe und Klientenvorschau. Alte Programme mit Workout-Vorlagen-IDs
werden beim Öffnen geladen; nach dem Sichern besitzen ihre Einheiten eigene
Übungssnapshots. Coach-eigene Views delegieren die Planlogik an Plan. Die großen
Editoren werden erst beim Öffnen geladen.

## Bedienung

1. Klient auswählen, **Programm auswählen → Neues Programm** öffnen.
2. Im Planeditor Tage und Übungen gestalten, Vorschau prüfen, Entwurf sichern.
3. In der Programmübersicht eine Version veröffentlichen.
4. Die feste Version dem gewählten Klienten zuweisen.
5. **Individuellen Plan gestalten** öffnet die Plan-eigene Verwaltung für
   direkte Klientenpläne einschließlich Entwurf, Versionen und Freigabe.

Coach-Programme bleiben unter `fitness/{coachUid}/coachTrainingPrograms`.
Zuweisungen landen als veröffentlichte Pläne unter
`fitness/{clientUid}/macrocycles`, Workout-Vorlagen unter `routines` mit
Übungs-Subcollections. Logs bleiben unter `workouts`. Änderungen am Programm
ändern bestehende Zuweisungen nicht. Regeln gehören weiterhin VitalOS.

## Initialisieren und Pointer aktualisieren

```sh
git submodule update --init modules/plan
# Änderungen ausschließlich in ~/plan-dev implementieren, prüfen und committen.
# Nach expliziter Push-Freigabe zuerst den Plan-Commit veröffentlichen.
git -C modules/plan fetch origin dev
git -C modules/plan checkout --detach <geprüfter-plan-commit>
pnpm run test:plan:contract
pnpm run build
# Danach nur den geprüften Pointer und zugehörige Änderungen committen.
git add modules/plan
```

`branch = dev` dokumentiert die Quelllinie; der Gitlink bestimmt den tatsächlichen
Build. Pointer niemals automatisch auf den neuesten Stand ziehen. Plan muss den
referenzierten Commit veröffentlicht haben, bevor Coach gepusht wird.

## Verifikation

`pnpm run test:plan:contract` prüft im isolierten Firestore-Testdouble Coach →
gepinnter Plan-Reader/Logger und die Gegenrichtung. `PLAN_SOURCE` ist nur ein
optionaler Test-Override, kein Build-Fallback. Der mobile Browsertest läuft mit
`aos-kitty-launch 'cd /home/alpha/coach-dev && bash scripts/tests/run-shared-editor-browser.sh'`.
Er verwendet eine Fixture, keine echten Konten oder Klientendaten.
Authentifizierte Cloud-Abnahme und Hosting-Deployment bleiben eigene Schritte.

## Zuständigkeit und Abgrenzung

| Änderung | Ort |
| --- | --- |
| Editor, Übungsvorgaben, Programm-/Planversionen und Zuweisungslogik | `~/plan-dev` |
| Klientenwahl, Rollen, Navigation und Coach-Hosting | `~/coach-dev` |
| Übernahme eines geprüften Plan-Stands | Coach-Gitlink `modules/plan` |
| Fitness-Integration / VitalOS-Shell / Standalone-Releases | jeweils eigener Übernahmepfad |

Erster gemeinsamer Code-Stand: Plan `4dbe020`, Coach `31dde02`. Die Entwicklerdoku
in Plan ist `docs/PLAN-COACH-INTEGRATION.md`. Reine Dokumentationsänderungen
benötigen keinen Pointer-Bump. Dieser Auftrag veröffentlicht keinen der Repos.
Ein Coach-Pointer-Update aktualisiert weder Fitness noch die VitalOS-Shell oder
die eigenständige Plan-Website automatisch.
