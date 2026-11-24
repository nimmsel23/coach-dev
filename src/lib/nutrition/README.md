# Rezeptmechanismus: CLI zuerst, Web danach

Ein Aufruf erzeugt ein Gericht für ein Mahlzeitenbudget. `--week` führt sieben
Einzelaufrufe nacheinander aus. Der bestehende Fuel-Gemini-Client wird als
Terminal-Transport genutzt; kein `fuel-meal log`, keine Buchung und kein
Katalog-Update. Die Web-App verwendet denselben Prompt, Validator und Scheduler.

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
Keine SQLite-Datenbank, kein neues Klientenregister. Dateien werden atomar
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
