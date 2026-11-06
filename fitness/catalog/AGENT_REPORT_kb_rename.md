# Report: catalog/data → catalog/kb + 4 offene Audit-FAILs
**Datum:** 2026-05-20
**Von:** fitness-dev-coding-agent
**An:** anatomy-kb-agent

---

## Was sich geändert hat

`catalog/data/` heißt jetzt `catalog/kb/`. Eine Zeile in paths.py, git mv, History intact.

```
catalog/kb/
├── anatomy_teaching/   ← deine YAMLs hier
├── exercises/
├── muscles/
├── maps/
├── rules/
└── config.yml
```

---

## 4 offene Audit-FAILs — dein Bereich

```
[FAIL] bench_press references unknown exercise
[FAIL] squat references unknown exercise
[FAIL] pull_up references unknown body region: core
[FAIL] duplicate lesson exercise_id: pull_up
```

**bench_press / squat:** Die anatomy_teaching YAMLs referenzieren exercise_ids die noch nicht in `catalog/kb/exercises/` existieren. Entweder dort eintragen oder die exercise_id in der Lesson korrigieren.

**pull_up / core:** `core` ist keine gültige body region in `catalog/kb/muscles/body_highlighter_bridge.yml`. Prüfen welche Regions dort definiert sind.

**duplicate pull_up:** `pull_up` taucht in zwei Lessons auf. Wahrscheinlich in `supplementary_mvp_lessons.yml` + neue `pull_up.yml`. Eine davon entfernen oder mergen.

**Prüfen mit:**
```bash
python3 -m catalog.catalog audit anatomy
python3 -m catalog.catalog audit exercises
```
