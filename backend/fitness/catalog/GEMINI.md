# Fitness Agent — Subdirectory Instructions

This directory contains the Python-based expert system for the AlphaOS Fitness ecosystem. It handles catalog management, biomechanical audits, and synchronization between local YAML files and Firestore.

## Core Mandates

### 1. CLI Usage
- **Primary Entry Point**: Use the `fitness-agent` command (installed via the package) or `python3 -m catalog`.
- **Key Commands**:
    - `kb-sync`: Synchronizes local YAML data to Firestore.
    - `audit all`: Runs biomechanical, anatomy, and alias checks.
    - `doctor`: Validates the local runtime environment.

### 2. Biomechanical Integrity
- All new exercises or modifications MUST pass the `audit` check.
- **Normalization**: Muscle IDs must align with `muscles.yml` (wger-mapped).
- **Rules**: Biomechanical logic is defined in `catalog/kb/rules/biomechanics.yml`.

### 3. Data Flow
- **Local Expert**: The `watcher.py` process monitors user input and performs AI enrichment via Gemini.
- **Watcher boundaries**: Inbox enrichment can run live, but session ingestion and proactive refinement must not run unless explicitly enabled with `FITNESS_WATCHER_INGEST_SESSIONS=1` / `FITNESS_WATCHER_PROACTIVE_REFINER=1`. Optional analytics checks run at most every 10h by default (`FITNESS_WATCHER_ANALYTICS_INTERVAL_SECONDS=36000`).
- **Expert-Wins**: Local "Expert Tier" data always takes precedence over "Bulk Layer" data during sync.
- **Runtime User-Data CRUD Hammer**: Use `fitness user-data ...` for runtime user/session/history work. It is dry-run by default; any SQLite write requires `--apply`. `fitness-catalog user-data ...` exists only as a compatibility alias.
  - `fitness user-data users`: list runtime users and counts.
  - `fitness user-data session-signals --uid <uid> [-e <exercise_id>]`: inspect parsed session JSON signals.
  - `fitness user-data backfill-history --uid <uid> [-e <exercise_id>] [--apply]`: repair empty history rows from session JSON notes/setsArray.
  - `fitness user-data history-update <row_id> ... --apply`: patch one training_history row.
  - `fitness user-data history-delete <row_id> --apply`: delete one training_history row.
  - Do not patch non-empty rows unless explicitly asked; default backfill only touches all-zero rows.

## Architecture

- `audit.py`: Deterministic biomechanical auditing engine.
- `kb_sync.py`: Hash-based synchronization logic for Firestore.
- `resolver.py`: Semantic search and exercise resolution.
- `watcher.py`: Real-time monitoring for AI enrichment.

## Extension Rules

- When adding new modules, follow the existing pattern of using `typer` for CLI commands and `loguru` for logging.
- Maintain compatibility with the `Cloud Chamber` architecture (Firestore as a bridge).
- Ensure all YAML parsing uses the utility functions in `yaml_utils.py` to maintain consistency.
