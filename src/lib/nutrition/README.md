# Rezeptmechanismus: CLI zuerst, Web danach

Ein Aufruf erzeugt ein Gericht für ein Mahlzeitenbudget. `--week` führt sieben
Einzelaufrufe nacheinander aus. Der bestehende Fuel-Gemini-Client wird als
Terminal-Transport genutzt; kein `fuel-meal log`, keine Buchung und kein
Intake-Update. Akzeptierte neue Gerichte werden zusätzlich im globalen SQLite-Rezeptkatalog gesichert. Die Web-App verwendet denselben Prompt, Validator und Scheduler.

```sh
node src/lib/nutrition/recipe-cli.mjs \
  --input src/lib/nutrition/examples/paleo-profile.json \
  --context src/lib/nutrition/examples/FUEL.example.md \
  --meal 3 --week --output /tmp/paleo-woche.json
```

Ohne `--week` genau ein Gericht. `--day 4` erstellt gezielt ein einzelnes
Donnerstagsgericht. `--input` akzeptiert auch einen JSON-Export der Coach-App
(mit `input`-Feld). Keine feste Zutatenliste nötig; `foods` ist optionaler
Vorrats-/Vorliebenkontext.

Für einen echten bestehenden Klienten: `--client <lokale-id>` liest dessen
`FUEL.md`, ersatzweise `NUTRITION.md`, aus der vorhandenen Klientenwurzel.
`--context <datei>` liest eine ausdrücklich gewählte Regeldatei. Beide sind
**nur Eingaben**. Keine dieser Dateien wird geschrieben. Unterstützt werden
u.a. `kein Tofu`, `ohne ...`, `Ausschlüsse: ...`, `Vorlieben: ...` und
`Ernährungsstil: ...`; das ist kein vollständiger Parser beliebiger Prosa.
Keine Klientennamen oder Kontaktdaten aus der Datei an die KI übertragen.

JSON ist der Plan-/Gerichtsstand einschließlich Teilresultaten und Fehlern.
`<output>.md` ist die lesbare Rezeptansicht mit Zutaten, Zubereitung und
Makro-Schätzungen; `<output>.raw.json` enthält die KI-Antworten zur Nachprüfung.
SQLite sichert ausschließlich die Gerichte, kein neues Klientenregister. Dateien werden atomar
ersetzt, Eingabe-/Kontextdateien dürfen nicht als Ausgabe gewählt werden.

```sh
# Vorhandene Antworten erneut prüfen, ohne einen weiteren KI-Aufruf:
node src/lib/nutrition/recipe-cli.mjs \
  --input src/lib/nutrition/examples/paleo-profile.json \
  --context src/lib/nutrition/examples/FUEL.example.md \
  --meal 3 --replay /tmp/paleo-woche.json.raw.json --output /tmp/paleo-pruefung.json
```

Qualitätsprüfung: genau eine Portion, Gramm/Roh-/Kochzustand, plausible
Zutatenwerte, berechnete Summen statt ungeprüfter Modellsumme, Energiebilanz,
Budget-Toleranzen (kcal 15%, Protein 25%, Fett/KH 30%), ausführbare Schritte,
keine identischen Namen und gezielte Geflügel-Hygieneprüfung. Nährwerte bleiben
KI-Schätzungen, keine belegten Fuel-Katalogwerte. Stil-/Ausschlussprüfung ist
eine zusätzliche Zutatenheuristik, keine vollständige Allergen-/Diätprüfung.
Paleo-Variante: ohne Getreide, Milchprodukte, Hülsenfrüchte und Erdäpfel;
Süßerdäpfel sind erlaubt. Tofu nur bei ausdrücklich veganem Stil und niemals
gegen eine zusätzliche `kein Tofu`-Regel. Österreichische Wortwahl in allen
sichtbaren Rezeptteilen.

Echter Terminaltest: sieben Aufrufe, vier akzeptierte Gerichte, ein Timeout,
zweimal HTTP 402; kein verstecktes Retry und keine vollständige Woche behauptet.
Alle vier erfolgreichen Rohantworten wurden anschließend offline mit der finalen
Prüflogik erneut validiert. Zusammenfassung: `examples/terminal-acceptance.json`.

Web: Klient → Ernährung. Ein Gericht, Woche mit sieben Läufen, Fortschritt,
Stoppen und einzelne Gerichte neu erstellen. Erfolge bleiben neben Fehlern
stehen. Browserentwurf/JSON-Export bleibt explizit; keine automatische Übergabe
an Fuel. `GET /api/clients/<uid>/nutrition-preferences` benötigt die neu geladene
Coach-API, Coach-Anmeldung und eindeutige Workspace-Zuordnung. Bei Lesefehlern
werden lokale Regeln nicht stillschweigend ignoriert. Kein Server-Neustart in
diesem Code-/Build-Schritt.

## Erweiterte Profile und Prüfung ohne KI

```sh
node src/lib/nutrition/recipe-cli.mjs --input src/lib/nutrition/examples/ratio-profile.json --check
node src/lib/nutrition/recipe-cli.mjs --input src/lib/nutrition/examples/hfhp-omad-profile.json --check
node src/lib/nutrition/recipe-cli.mjs --input src/lib/nutrition/examples/mixed-week-profile.json --check --output /tmp/wochenpruefung.json
```

`macroMode` ist `bodyweight` (Protein g/kg und Fettanteil), `ratio`
(Energieprozente: `proteinPercent`, `fatPercent`, `carbsPercent`, Summe 100)
oder `grams` (`proteinGrams`, `fatGrams`, `carbsGrams`, passend zum Energieziel).
30/30/40 meint Protein/Fett/Kohlenhydrate. Bei 2400 kcal sind das 180/80/240 g.
High Fat High Protein ist eine Absicht (`macroIntent`); erst konkrete Zahlen
legen die Makros fest. Das ist unabhängig von frei kombinierbaren Ernährungsstilen.
Paleo ist ein Beispiel, keine Pflicht und keine abschließende Stilauswahl.

`rhythm`: `meals`, `omad` oder `nomad`; `mealTimes` als HH:MM-Liste,
`mealShares` als Prozentliste, `windowStart`/`windowEnd` als Essfenster.
`weekOverrides` enthält Tagesausnahmen mit `day` 0–6 (Mo–So), z.B.
`[{"day":0,"rhythm":"nomad"},{"day":2,"rhythm":"omad","times":["19:00"]}]`.
NOMAD bedeutet hier kein Rezept-Slot, null KI-Aufrufe und keine automatische
Kalorienkompensation. `--week` erzeugt bis zu sieben Gerichte für die gewählte
Mahlzeit, keinen vollständigen Sieben-Tage-Speiseplan. Nicht vorhandene Slots
werden ausdrücklich als übersprungen ausgegeben.

Alltag: `cookingMinutes`, `budgetPerMeal`, `equipment`, `location`,
`workSchedule`, `trainingSchedule`, `conditions`; freie Angaben ergänzen den
Prompt. Kochzeit wird geprüft, ein Euro-Budget ist keine verifizierte Preiskalkulation.
`--check` zeigt Ziele, Rhythmus, Bedingungen und Konflikte bei null KI-Aufrufen.
Ein gewählter Provider (`--provider fitness.env`) stammt aus der vorhandenen
Fuel-Konfiguration; keine automatische Schlüsselrotation oder Wiederholung.

## Globaler SQLite-Rezeptkatalog

Python-Modul: `src/fuel_recipe_catalog.py`. Standardpfad:
`FUEL_DATA_DIR/catalog/recipes.sqlite3` aus dem bestehenden Fuel-Backend;
optional `FUEL_RECIPE_CATALOG` oder CLI `--catalog-db`.

```sh
node src/lib/nutrition/recipe-cli.mjs --catalog-list --query Hendl
node src/lib/nutrition/recipe-cli.mjs --catalog-list --json --catalog-db /tmp/rezepttest.sqlite3
# Vorhandene erfolgreiche Antworten offline prüfen UND im Testkatalog sichern:
node src/lib/nutrition/recipe-cli.mjs --input profil.json --replay antworten.raw.json --catalog-db /tmp/rezepttest.sqlite3 --output /tmp/geprueft.json
```

Neue akzeptierte KI-Gerichte werden standardmäßig gesichert; `--no-catalog`
schaltet das aus. Replay schreibt nur mit ausdrücklich gesetztem `--catalog-db`
oder `--catalog-backup`. Ein Katalogfehler ist sichtbar und erhält den JSON-Entwurf.
Die Tabelle `recipes` enthält SHA-256-ID des Rezeptinhalts, Rezept-JSON, Modell,
`model-estimate`, erste/letzte Sicherung und Sichtungszähler. Identische Gerichte
werden dedupliziert, veränderte Mengen ergeben eine eigene Variante. SQLite-WAL
und Transaktionen schützen parallele Schreibvorgänge. Keine Klienten-IDs,
FUEL-Regeldateien, Körperprofile, Zielwerte oder Essensbuchungen im Katalog.
Das ist eine zusätzliche lokale Rezeptsicherung, kein externes/offsite Backup.

Abnahme dieses Schritts: 134 Coach-Funktionstests (16 gezielte Ernährungsfälle), ESLint, Coach-Firebase-Build und zwei SQLite-Tests einschließlich
paralleler Writer; drei echte CLI-Profilprüfungen ohne KI. Vier frühere echte
Gemini-Gerichte offline erneut geprüft und im Testkatalog gesichert. Ein neuer
Provider-Aufruf endete mit HTTP 503; ein neuer erfolgreicher KI-Wochenlauf wird
nicht behauptet. Die erweiterte Web-Oberfläche und Klienten-Zustellung sind
separate, noch nicht abgeschlossene Arbeit.
