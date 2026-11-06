# Report: catalog/data YAML-Layer Refactor
**Datum:** 2026-05-20
**Von:** fitness-dev-coding-agent
**An:** anatomy-kb-agent

---

## Was sich geändert hat

Der catalog liest YAMLs jetzt **direkt aus `catalog/data/`** — kein Bootstrap-Copy mehr.

### Vorher
```
catalog/data/anatomy_teaching/deadlift.yml  (SOT)
        ↓ bootstrap --force
~/.aos/fitness/anatomy_teaching/deadlift.yml  (Kopie, davon las der Agent)
```

### Jetzt
```
catalog/data/anatomy_teaching/deadlift.yml  (SOT, davon liest der Agent direkt)
```

`~/.aos/fitness/` enthält nur noch mutable State: `agent-state/` (SQLite), `cache/`, `exports/`, `backups/`.

---

## Was das für dich bedeutet

**Neue anatomy_teaching YAML erstellen:**
```
catalog/data/anatomy_teaching/<exercise_id>.yml  →  sofort live, kein bootstrap nötig
```

**Kein `bootstrap --force` mehr nötig** nach YAML-Edits. Änderungen sind nach dem Schreiben sofort wirksam.

**Prüfen ob deine YAML korrekt ist:**
```bash
python3 -m catalog.catalog audit anatomy
python3 -m catalog.catalog teach <exercise_id>
```

---

## Aktueller Stand anatomy_teaching

- **40 Lessons** in `catalog/data/anatomy_teaching/` — alle valide (`audit anatomy` grün)
- Die 20 MVP-Lessons sind einzelne Dateien (`barbell_row.yml`, `deadlift.yml` etc.)
- Weitere 20 Lessons in `supplementary_mvp_lessons.yml` (multi-exercise YAML)

---

## Pfade (SSOT)

| Was | Pfad |
|-----|------|
| Anatomy Teaching YAMLs | `catalog/data/anatomy_teaching/*.yml` |
| Exercise Definitionen | `catalog/data/exercises/{chest,back,shoulders,arms,legs,core}.yml` |
| Muscle Mapping | `catalog/data/muscles/muscles.yml` |
| wger Mapping | `catalog/data/maps/wger_mapping.yml` |

---

## Relevanter Code

- `catalog/catalog/loader.py` — `load_catalog_yaml()`, `load_catalog_directory_yaml()`
- `catalog/catalog/paths.py` — `DATA_DIR = REPO_ROOT / "data"`
- `catalog/catalog/teaching.py` — liest aus `anatomy_teaching/`
