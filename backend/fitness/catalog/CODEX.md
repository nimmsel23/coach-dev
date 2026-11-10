Ja, genau. Wenn **Codex der lokale Coding-Agent** wird, dann würde ich `.fitness-agent` **nicht als lose Gedankenstruktur**, sondern als **konkretes lokales Daten-/Config-Verzeichnis** anlegen, während der eigentliche Code in einem Git-Repo liegt.

wger ist laut offizieller Doku eine lokale/self-hostbare Open-Source-Webapp mit REST API für Workouts, Gewicht und Ernährung, also gut als Backend/Bridge geeignet. ([wger.readthedocs.io][1]) Codex wiederum ist als Coding-Agent dafür gedacht, Codebases zu bearbeiten, Features zu bauen und Aufgaben im Repo auszuführen. ([OpenAI][2])

## Wichtig: zwei getrennte Orte

```text
~/code/fitness-agent/        # Git-Repo: Code, Templates, Default-Daten, Tests
~/.fitness-agent/            # Runtime/User-Daten: deine echten YAMLs, State, Exports
```

Also:

```text
fitness-agent repo
→ enthält installierbare App + Seed-Daten

~/.fitness-agent
→ enthält deine lokale Arbeitskopie / produktive Daten
```

## Repo-Struktur für Codex

So würde ich das Repo anlegen lassen:

```text
fitness-agent/
├── README.md
├── ROADMAP.md
├── pyproject.toml
├── .gitignore
├── catalog/
│   ├── __init__.py
│   ├── cli.py
│   ├── config.py
│   ├── doctor.py
│   ├── loader.py
│   ├── resolver.py
│   ├── coverage.py
│   ├── highlighter.py
│   ├── planner.py
│   ├── obsidian.py
│   ├── wger.py
│   └── models.py
├── data/
│   ├── exercises/
│   │   ├── chest.yml
│   │   ├── back.yml
│   │   ├── shoulders.yml
│   │   ├── arms.yml
│   │   ├── legs.yml
│   │   └── core.yml
│   ├── muscles/
│   │   ├── muscles.yml
│   │   ├── muscle_coverage_rules.yml
│   │   └── body_highlighter_bridge.yml
│   ├── rules/
│   │   ├── program_rules.yml
│   │   ├── progression_rules.yml
│   │   └── safety_rules.yml
│   ├── maps/
│   │   ├── aliases.yml
│   │   ├── wger_mapping.yml
│   │   └── external_db_mapping.yml
│   └── anatomy_teaching/
│       ├── chest_lessons.yml
│       ├── back_lessons.yml
│       ├── shoulder_lessons.yml
│       ├── arm_lessons.yml
│       ├── leg_lessons.yml
│       ├── core_lessons.yml
│       ├── joint_actions.yml
│       └── coaching_language.yml
├── scripts/
│   ├── bootstrap.sh
│   └── seed_data.py
└── tests/
    ├── test_doctor.py
    ├── test_loader.py
    ├── test_resolver.py
    └── test_coverage.py
```

## Runtime-Struktur unter `~/.fitness-agent`

Diese Struktur legt der Bootstrap an:

```text
~/.fitness-agent/
├── config.yml
├── exercises/
│   ├── chest.yml
│   ├── back.yml
│   ├── shoulders.yml
│   ├── arms.yml
│   ├── legs.yml
│   └── core.yml
├── muscles/
│   ├── muscles.yml
│   ├── muscle_coverage_rules.yml
│   └── body_highlighter_bridge.yml
├── rules/
│   ├── program_rules.yml
│   ├── progression_rules.yml
│   └── safety_rules.yml
├── maps/
│   ├── aliases.yml
│   ├── wger_mapping.yml
│   └── external_db_mapping.yml
├── anatomy_teaching/
│   ├── chest_lessons.yml
│   ├── back_lessons.yml
│   ├── shoulder_lessons.yml
│   ├── arm_lessons.yml
│   ├── leg_lessons.yml
│   ├── core_lessons.yml
│   ├── joint_actions.yml
│   └── coaching_language.yml
├── state/
│   ├── training_history.sqlite
│   ├── last_generated_plan.yml
│   ├── weekly_coverage.yml
│   └── learning_progress.yml
├── cache/
│   ├── wger_exercises.json
│   └── external_exercises.json
├── backups/
└── exports/
    ├── obsidian/
    ├── wger/
    ├── json/
    └── client_notes/
```

## `config.yml`

Die zentrale User-Konfiguration:

```yaml
app:
  name: "fitness-agent"
  version: "0.1.0"
  language: "de"

paths:
  root: "~/.fitness-agent"
  exercises: "~/.fitness-agent/exercises"
  muscles: "~/.fitness-agent/muscles"
  rules: "~/.fitness-agent/rules"
  maps: "~/.fitness-agent/maps"
  anatomy_teaching: "~/.fitness-agent/anatomy_teaching"
  state: "~/.fitness-agent/state"
  cache: "~/.fitness-agent/cache"
  exports: "~/.fitness-agent/exports"

obsidian:
  enabled: true
  vault_path: "~/Obsidian/Vitaltrainer"
  export_path: "~/Obsidian/Vitaltrainer/Fitness-Agent"

wger:
  enabled: true
  base_url: "http://localhost:8000"
  api_token_env: "WGER_API_TOKEN"
  timeout_seconds: 10

external_dbs:
  yuhonas_free_exercise_db:
    enabled: false
    local_path: "~/code/free-exercise-db"
    cache_file: "~/.fitness-agent/cache/external_exercises.json"

behavior:
  source_of_truth: "custom_yaml"
  uncertain_mappings_require_review: true
  backup_before_write: true
  default_output_format: "markdown_obsidian"
```

## Was Codex konkret als erstes bauen soll

Nicht sofort wger, nicht sofort Anatomy-Layer. Erst Bootstrap + Doctor.

### Task 1 für Codex

```text
Create a Python CLI project named fitness-agent.

Implement:
1. pyproject.toml with a console command `fitness-agent`
2. `fitness-agent bootstrap`
3. `fitness-agent doctor`

`bootstrap` must create the runtime directory `~/.fitness-agent` with subfolders:
exercises, muscles, rules, maps, anatomy_teaching, state, cache, backups, exports/obsidian, exports/wger, exports/json, exports/client_notes.

It must copy seed YAML files from repo `data/` into `~/.fitness-agent/` only if the target file does not exist.

It must create `~/.fitness-agent/config.yml` if missing.

It must never overwrite existing user YAMLs unless `--force` is explicitly passed.
If `--force` is passed, create a timestamped backup first.

`doctor` must check:
- root folder exists
- config.yml exists and parses
- all required folders exist
- required seed YAML files exist
- YAML files parse
- aliases.yml exists
- program_rules.yml exists
- muscles.yml exists
- body_highlighter_bridge.yml exists
- wger_mapping.yml exists
- state folder is writable
- exports folder is writable
- optional: wger API reachable if enabled

Output should be a clear terminal report with OK/WARN/FAIL.
```

## Minimaler Python-Core

Für Codex wäre das die erste technische Richtung:

```text
catalog/config.py
→ Pfade, Config laden, Defaults

catalog/bootstrap.py
→ ~/.fitness-agent anlegen, Seed-Daten kopieren

catalog/doctor.py
→ Checks

catalog/loader.py
→ YAML sicher laden

catalog/cli.py
→ Typer CLI oder argparse
```

Ich würde **Typer** nehmen, weil es für CLI angenehm ist. Falls du dependency-arm bleiben willst, geht auch `argparse`.

## `.gitignore`

Wichtig:

```gitignore
__pycache__/
*.pyc
.venv/
dist/
build/
*.egg-info/

# local runtime data must never be committed
.fitness-agent/
*.sqlite
.env
```

## Warum Seed-Daten im Repo und Runtime-Daten in `~/.fitness-agent`?

Weil Codex dann sauber entwickeln kann:

```text
Repo data/ = Default Templates
~/.fitness-agent = deine echte lokale Arbeitskopie
```

Wenn Codex Mist baut, sind deine echten Daten geschützt.

## Bootstrap-Verhalten

```bash
fitness-agent bootstrap
```

macht:

```text
[OK] created ~/.fitness-agent
[OK] created ~/.fitness-agent/exercises
[OK] copied data/exercises/chest.yml → ~/.fitness-agent/exercises/chest.yml
[SKIP] ~/.fitness-agent/maps/aliases.yml already exists
[OK] created config.yml
```

Mit `--force`:

```bash
fitness-agent bootstrap --force
```

macht vorher:

```text
~/.fitness-agent/backups/backup-2026-05-09-1430/
```

## Doctor-Verhalten

```bash
fitness-agent doctor
```

sollte z. B. sagen:

```text
Fitness Agent Doctor

[OK] root exists: ~/.fitness-agent
[OK] config parses
[OK] exercises/chest.yml
[OK] exercises/back.yml
[OK] rules/program_rules.yml
[OK] maps/aliases.yml
[OK] muscles/muscles.yml
[OK] muscles/body_highlighter_bridge.yml
[WARN] wger enabled but WGER_API_TOKEN not set
[WARN] external DB yuhonas disabled
[OK] state writable
[OK] exports writable

Status: USABLE_LOCAL_YAML_MODE
```

## Mein Vorschlag für den Codex-Startprompt

```text
You are working on a local Python CLI project called fitness-agent.

Goal:
Build the foundation for a local Vitaltrainer learning system.

Important architecture:
- The Git repo contains code and default seed YAMLs under data/
- The runtime user directory is ~/.fitness-agent/
- Never overwrite user-owned YAMLs without backup
- wger is an optional local backend, not the semantic source of truth
- Custom YAML files are the coach brain

Runtime user-data operations:
- Use `fitness user-data users` to identify local runtime users.
- Use `fitness user-data session-signals --uid <uid>` to inspect parsed session JSON signals.
- Use `fitness user-data backfill-history --uid <uid> -e <exercise_id>` for dry-run history repair.
- Add `--apply` only after the dry-run patch list is reviewed.
- `history-update` and `history-delete` operate by SQLite row id and are also dry-run unless `--apply` is present.
- Backfill defaults to all-zero history rows only; do not use `--allow-nonzero` without explicit user instruction.
- `fitness-enricher.service` is an inbox enrichment watcher. It must not write history rows or proactive drafts by default; enable those paths only via `FITNESS_WATCHER_INGEST_SESSIONS=1` / `FITNESS_WATCHER_PROACTIVE_REFINER=1`. Optional analytics interval defaults to 10h (`FITNESS_WATCHER_ANALYTICS_INTERVAL_SECONDS=36000`).

First implementation task:
Create a minimal Python CLI with:
1. `fitness-agent bootstrap`
2. `fitness-agent doctor`

Use Typer if available, otherwise argparse.

bootstrap:
- creates ~/.fitness-agent and required subfolders
- copies seed YAMLs from repo data/ to ~/.fitness-agent only if missing
- creates config.yml if missing
- supports --force but creates timestamped backup before overwriting

doctor:
- checks directory structure
- checks config.yml parsing
- checks required YAML files exist and parse
- checks state/export folders are writable
- checks wger only if enabled in config
- prints OK/WARN/FAIL report
- exits nonzero only on FAIL

Do not implement workout generation yet.
Do not implement wger sync yet.
Do not implement AI behavior yet.
Focus on safe local file foundation.
```

Das ist der saubere Einstieg. Erst wenn `bootstrap` und `doctor` stabil sind, kommt `resolve`, dann `coverage`, dann `plan`, dann `teach`, dann `wger`.

[1]: https://wger.readthedocs.io/?utm_source=chatgpt.com "Welcome to the wger 2.6 documentation — wger project 2.6 ..."
[2]: https://openai.com/codex/?utm_source=chatgpt.com "Codex | AI Coding Partner from OpenAI"
