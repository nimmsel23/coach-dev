# Consolidation Diff — catalog/data/ Merge

**Datum:** 2026-05-20  
**Status:** ABGESCHLOSSEN — 77/77 Tests passed

---

## Was gemergt wurde

### exercises/ — 6 Dateien (alle)

Inhalt identisch, aber `catalog/exercises/` hatte:
- Kompakteres YAML-Format (flat list statt indented)
- **`wger_muscle_ids`-Felder** für alle Übungen (primary + secondary)

Diese fehlten in `catalog/data/exercises/` teilweise oder komplett.

| Datei | wger_muscle_ids-Einträge gemergt |
|-------|----------------------------------|
| exercises/arms.yml | 8 |
| exercises/back.yml | 6 |
| exercises/chest.yml | 4 |
| exercises/core.yml | 6 |
| exercises/legs.yml | 11 |
| exercises/shoulders.yml | 5 |

### maps/wger_mapping.yml

`catalog/data/` hatte nur Placeholder:
```yaml
enabled: false
notes: "Seed mapping placeholder for later wger sync."
mappings: {}
```

`catalog/` hatte vollständige Mapping-Tabelle (16 wger muscle IDs → interne IDs).
Diese wurde nach `catalog/data/maps/wger_mapping.yml` gemergt.

### anatomy_teaching/ — kein Merge nötig

Alle 20 YAMLs identisch in beiden Verzeichnissen.

### muscles/, rules/, maps/aliases, maps/external_db — kein Merge nötig

Alle identisch.

---

## Backup-Dateien (noch vorhanden, nicht gelöscht)

```
catalog/data/exercises/arms.yml.pre-merge
catalog/data/exercises/back.yml.pre-merge
catalog/data/exercises/chest.yml.pre-merge
catalog/data/exercises/core.yml.pre-merge
catalog/data/exercises/legs.yml.pre-merge
catalog/data/exercises/shoulders.yml.pre-merge
catalog/data/maps/wger_mapping.yml.pre-merge
```

---

## Test-Ergebnis

```
77 passed in 35.40s
```

---

## Nächster Schritt (noch ausstehend)

Sobald Runtime und App verifiziert sind:

1. Backup-Dateien (`*.pre-merge`) löschen
2. Doppelte `catalog/exercises/`, `catalog/muscles/` etc. löschen  
   (oder via Symlink `catalog/data/exercises → ../exercises` auflösen)
3. Root-Level Legacy-YAMLs bereinigen:
   - `catalog/muscles.yaml`
   - `catalog/program_rules.yaml`
   - `catalog/body_highlighter_bridge.yml`
   - `catalog/muscle_coverage_rules.yml`

**Noch nichts löschen bis Runtime/App geprüft.**
