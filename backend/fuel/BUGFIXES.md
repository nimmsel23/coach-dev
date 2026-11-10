# Fuel Python Fehlerbehebung und Audit

Stand: 2026-10-23. Dieses Dokument beschreibt die Fehler, die im Backend und
im Root-Paket `fuel/` behoben wurden.

## Backend

- **Katalogdaten blieben kanonisch.** Ein Meal-Log überschreibt keine
  Katalogwerte mehr. `POST /nutrition/log` legt nur mit `save_catalog: true`
  einen neuen Eintrag an und lässt vorhandene Katalogeinträge unverändert.
  `POST /nutrition/catalog` aktualisiert Einträge über ID oder einen
  normalisierten Namen und ändert nur übermittelte Felder.
- **Keine Fake-Schätzungen.** Fehlendes Gemini führt bei Meal- und
  Supplement-Schätzungen zu HTTP 503; Fehler des Gemini-Dienstes führen zu
  HTTP 502. Ohne echte Schätzung wird kein Log gespeichert.
- **Mikros je Eintrag.** Gemini- und Katalogprofile werden am Meal gespeichert.
  Tagesaggregate werden beim Hinzufügen, Ändern, Verschieben und Löschen mit
  dem Profil des Eintrags angepasst. Katalogprofile und Metadaten werden aus
  den Fuel-YAMLs importiert und bleiben per API abrufbar.
- **Supplement-Mikros.** Der Katalog enthält Nährstoffwerte je Standarddosis.
  Ein Intake skaliert diese Werte proportional zur geloggten Dosis und speichert
  das verwendete Profil; Bearbeiten und Löschen passen die Tagessumme an.
  Katalog-Upserts aktualisieren nur gesendete Felder; Notizen werden nun
  gespeichert und importiert.
- **Supplement-Statistik.** `days_taken` zählt Kalendertage und nicht einzelne
  Einnahmen. Freitext-Einträge ohne Katalog-ID werden anhand ihres normalisierten
  Namens gruppiert. Die Journale des Zeitfensters werden einmal geladen.
- **Verschobene Meals.** Beim Wechsel des Tages werden Datum und Uhrzeit in
  `logged_at` und `time` gemeinsam angepasst; die Uhrzeit und Zeitzone bleiben
  erhalten.
- **Ein gemeinsamer Journal-Pfad.** `backend/main.py` schreibt in
  `DailyJournal.food_logs` und `micros_sum`, die dieselben Datenstrukturen wie
  die API verwenden.
- **Katalogimport für beide Datenbanken.** Das Importskript verwendet
  dialektgerechtes `ON CONFLICT DO NOTHING` für SQLite und PostgreSQL und
  bleibt bei wiederholtem Import idempotent.
- **Alembic beim Start.** Ein vollständiges unversioniertes v4-Schema wird
  sicher auf `add_journal_text_frames_001` gestempelt. Teil-Schemas werden
  abgelehnt und mit fehlenden Tabellen/Spalten gemeldet. Migrationen korrigieren
  außerdem `water_ml`, setzen einen sicheren JSON-Default für `micros_sum` und
  ergänzen `meal_catalog.micros` sowie `micros_meta` und
  `supplement_catalog.notes`. API, Dev-Start und Prod-Deployment verwenden den
  Migrator.

## Root-Paket `fuel/`

- Beschädigte Meal- und Supplement-Tageslogs werden mit einem klaren Fehler
  abgelehnt, statt als leere Logs zurückzukommen und beim Speichern ersetzt zu
  werden.
- Beschädigte Meal- und Supplement-Kataloge werden beim Schreiben nicht als
  leere Kataloge behandelt.
- Beschädigte lokale Kataloge werden auch beim Lookup nicht mehr still durch
  den Repo-Fallback ersetzt. Berichte, Datenbank-Resync und Tombstone-Lesen
  melden kaputte Tagesdateien, statt sie als leere Daten zu behandeln.
- `.env`-Dateien überschreiben keine bereits gesetzten Prozessvariablen; der
  Root-`.env`-Loader nutzt dieselbe sichere Parserlogik wie die Home-Konfig.
- Meal- und Intake-IDs verwenden UUIDs statt Zeitstempel mit möglicher
  Millisekunden-Kollision. Supplement-Logs und Meals verwenden dieselbe
  `AOS_FUEL_DATA_DIR`-Konfiguration (`AOS_FUEL_DIR` bleibt als Alias erhalten).
- Meal-Verschieben prüft das Ziel-Log und beide Tombstone-Dateien, bevor es den
  Quelltag ändert. `time` und `logged_at` werden beim Verschieben und
  Wiederholen gemeinsam auf den Zieltageszeitstempel gesetzt.
- `fuel` delegiert Meal-, Supplement-, Ingredient-, Wochen- und Mikro-CLI-Aufrufe
  über Python-Module, nicht über absolute `bin/`-Pfade. `fuel-ingredient`,
  `fuel-week` und `fuel-micro` sind jetzt installierbare Entry-Points.
- Die Supplement-Recherche importiert keine Textual-TUI mehr. Textual und
  Firebase Admin sind optionale Extras (`fuel[tui]`, `fuel[cloud]`); die
  Nährstoff-Referenzdatei wird in Wheels mitgeliefert. `FUEL_REPO_DIR` lässt
  installierte Pakete auf einen getrennten Checkout mit den YAML-Katalogen zeigen.
- `fuel sync push|pull` nutzt den Sync-Code im Root-Paket. Der separate
  `fuelctl sync <uid>`-Befehl bleibt der vorhandene Katalog-Sync; `fuel catalog`
  öffnet den Python-Katalogeditor.

## Grenzen älterer Daten

Ältere Gemini-Meals haben teilweise nur einen Tageswert in `micros_sum`, aber
kein Mikronährstoffprofil am einzelnen Meal. Dieser Wert kann nicht zuverlässig
auf einzelne Meals verteilt werden. Die Delta-Logik lässt solche Beiträge beim
Editieren oder Löschen deshalb bestehen, statt andere Einträge fälschlich zu
reduzieren. Auch ältere Supplement-Einnahmen ohne gespeichertes Profil lassen
sich nicht exakt aus dem früheren, nach Produktnamen aggregierten Wert
herausrechnen. Neue Einträge sind rückrechenbar.

Die Migration wurde in diesem Arbeitsgang nicht auf der Live-Datenbank
ausgeführt; das geschieht erst beim nächsten autorisierten Start oder Deploy.
