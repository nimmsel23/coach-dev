# catalog/kb/registry/

Lookup-Tabellen für externe Datenquellen. Kein Trainingslogik, nur Referenzdaten.

| Datei | Inhalt | Regenerieren |
|-------|--------|-------------|
| `wger_exercises_id.yml` | wger_id → wger_name (824 Einträge, Rohdaten von wger API) | manuell / wger-Import |
| `wger_muscles.yml` | wger muscle_id → catalog muscle group | manuell |
| `wger_catalog_index.yml` | wger_id → catalog_id (Merge-Kontrakt, nur kuratierte Exercises) | `fitness-agent export-wger-index` |
| `yuhano_exercises_id.yml` | yuhonas exercise_id → name | manuell |

## wger_catalog_index.yml

Zeigt welche wger-Exercises bereits einen kuratieren Katalog-Eintrag haben.
`unreviewed_*` Bulk-Imports zählen nicht — nur Exercises mit echtem YAML in `kb/exercises/`.

Aktueller Stand: 3 enrichte Exercises, 821 unmapped (Enrichment-Kandidaten).
