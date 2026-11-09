# Project: anatomy-kb

## Overview

`anatomy-kb` serves as the Anatomy Knowledge Layer for the `fitness-dev` ecosystem. Its primary purpose is to populate a muscle catalog with detailed anatomical information (origin, insertion, innervation) and didactic content, distilled from Obsidian Vault notes and structured using the Gemini API. It acts as a crucial didactic layer, answering fundamental questions about movement, muscle function, and anatomical relationships.

This project integrates with `fitness-dev` for exercise definitions and teaching content, and ultimately feeds into the `fitness-aos` Progressive Web App (PWA).

**Key Technologies:**
- Python
- Gemini API (for content enrichment and structuring)
- `aiohttp` (for the HTTP API server)
- `Typer` (for the command-line interface)

## Architecture

The project's architecture revolves around the intelligent processing and structuring of anatomical knowledge.

**Data Flow:**
1.  **Source Data:** Obsidian Vault notes (Markdown files) containing raw anatomical and exercise-related information.
2.  **Ingestion & Enrichment:** The `anatomy-kb` CLI processes these notes, utilizing the Gemini API to extract and structure `muscle_anatomy` and `common_errors_explained`.
3.  **Muscle Data Storage:** Structured muscle anatomy is stored in individual YAML files under `muscles/{muscle_id}.yml`.
4.  **Teaching Layer Generation:** The muscle data is then pushed and embedded into a teaching layer, generating YAML files under `fitness-dev/catalog/kb/anatomy_teaching/{exercise_id}.yml`.
5.  **Synchronization:** All structured data is synchronized with Firestore, making it available to the `fitness-aos` PWA.

**Key Data Structures:**
-   `muscle-index.json`: A canonical registry of 16 muscles, mapping `wger_id`, Latin names, English names, and file paths.
    ```json
    {
      "latissimus_dorsi": {
        "muscle_id": "latissimus_dorsi",
        "wger_id": 12,
        "latin": "Latissimus dorsi",
        "name_en": "Lats",
        "file": "muscles/latissimus_dorsi.yml"
      }
    }
    ```
-   `muscles/{muscle_id}.yml`: Detailed anatomical data for each muscle, including `origin`, `insertion`, `innervation`, `function`, and specific `function_in_exercise` details.
    ```yaml
    muscle_id: latissimus_dorsi
    wger_id: 12
    latin: Latissimus dorsi
    origin: "Dornfortsätze Th7–Th12, Fascia thoracolumbalis, Crista iliaca..."
    insertion: "Crista tuberculi minoris humeri"
    innervation: "N. thoracodorsalis (C6–C8)"
    function: "Adduktion, Extension und Innenrotation des Humerus"
    exercises:
      pull_up:
        function_in_exercise: "Hauptmotor der Adduktion und Extension"
    ```
-   `fitness-dev/catalog/kb/anatomy_teaching/{exercise_id}.yml`: Seeded by `fitness-dev` and enriched by `anatomy-kb`, this file contains exercise lessons, joint actions, embedded `muscle_anatomy`, `common_errors_explained`, and `quiz_prompts`.

## Setup and Installation

1.  **Gemini API Key:** Ensure your Gemini API key is configured as an environment variable in `~/.env/gemini.env`:
    ```
    GEMINI_API_KEY=YOUR_API_KEY
    GEMINI_MODEL=gemini-2.5-flash
    ```
2.  **Python Environment:** This project requires a Python environment. While a `requirements.txt` was not explicitly found, standard Python dependencies will need to be managed. (TODO: Add explicit dependency installation instructions if found later).
3.  **Vault Integration:** If your Obsidian Vault is not in the default location, set the `ANATOMY_KB_VAULT` environment variable:
    ```bash
    export ANATOMY_KB_VAULT=/path/to/your/Obsidian/Vault
    ```

## Usage

The project offers both a CLI for managing knowledge and an HTTP API for programmatic access.

### Server Management (`kbctl`)

The `kbctl` script provides control over the `anatomy-kb` HTTP server:

-   `kbctl start`: Start the HTTP server on port `:9200` in the background.
-   `kbctl status`: Display the server's PID and uptime.
-   `kbctl health`: Check the server's `/health` endpoint.
-   `kbctl stop`: Stop the running server.
-   `kbctl logs`: View live server logs.

### Command-Line Interface (`anatomy-agent` / `anatomy` dispatcher)

The `anatomy` command acts as a top-level dispatcher for various `anatomy-agent` functionalities.

**Katalog Extension (Ingest & Enrich):**
-   `anatomy ingest <note_path>`: Reads Markdown notes (from Obsidian Vault or a specified file), extracts `muscle_anatomy` and `common_errors_explained` using Gemini, and updates `muscles/*.yml` and `anatomy_teaching/`.
    -   Example: `anatomy ingest Klimmzug --exercise pull_up`
    -   Supports `--dry-run` and specifying exercise IDs.
-   `anatomy enrich <exercise_id>`: Uses Gemini to enrich muscle data for a specific exercise and saves it to `muscles/*.yml`.
    -   Example: `anatomy enrich bench_press`
    -   Use `--force` to overwrite existing data or `--dry-run` for a preview.

**Learning Tools (Nebentools):**
-   `anatomy teach <exercise_id>`: Provides explanations, joint actions, muscles, and cues for an exercise.
-   `anatomy errors <exercise_id>`: Displays common error patterns with anatomical justifications.
-   `anatomy quiz <exercise_id>`: Initiates a quiz for a specific exercise.
-   `anatomy flashcard`: Starts a flashcard session for muscle origin and insertion.
    -   Options: `--weak` (focus on muscles with <60% hit rate), `--limit <count>`.

**Exercise & System Utilities:**
-   `anatomy list`: Lists all exercises in a table format.
-   `anatomy pick`: Uses `fzf` to interactively select an exercise to `teach`.
-   `anatomy show <exercise_id>`: Displays raw YAML data for an exercise.
-   `anatomy audit`: Performs an audit of anatomy and exercises for consistency and completeness. Can be scoped to `anatomy` or `exercises`.
-   `anatomy serve`: An alternative way to start the API server (similar to `kbctl start`).
- `anatomy doctor`: Performs a health check of all components.
- `anatomy reload`: Clears the YAML cache without restarting the server.
- `anatomy firestore sync`: Pushes local YAML data (muscles, exercises, anatomy) to Firestore.
    - Options: `--scope <muscles|exercises|anatomy|all>`, `--dry-run`.
- `anatomy index`: Builds a comprehensive `catalog-index.json` bridging muscles, regions, and exercises.


### API Endpoints (`:9200`)

The `anatomy-kb` server exposes a REST API for interacting with exercises, muscles, and Firestore synchronization.

**Exercises:**
-   `GET /health`: Server status.
-   `GET /api/exercises`: Get all exercises.
-   `GET /api/exercise/{id}`: Get a single exercise.
-   `GET /api/exercise/{id}/teaching`: Get anatomy teaching content for an exercise.
-   `GET /api/exercise/{id}/coverage`: Get muscle coverage for an exercise.
-   `GET /api/exercise/{id}/bodymap`: Get body map regions.
-   `GET /api/resolve?q=...`: Alias/fuzzy resolver.
-   `POST /api/plan/generate`: Generate a training plan.

**Muscles:**
-   `GET /api/muscles`: Get all 16 muscles with their status.
-   `GET /api/muscles/{muscle_id}`: Get details for a single muscle.
-   `POST /api/muscles/enrich`: Fill empty muscles via Gemini.
-   `POST /api/muscles/enrich?muscle_id=X`: Enrich a specific muscle.
-   `POST /api/muscles/enrich?force=1`: Overwrite all existing muscle data.
-   `POST /api/muscles/push`: Embed `muscles/` data into `anatomy_teaching/`.

**Firestore Sync:**
-   `POST /api/firestore/sync`: Synchronize all data (exercises, muscles, anatomy) to Firestore.
-   `POST /api/firestore/sync/exercises`: Sync `fitness-dev` catalog exercises.
-   `POST /api/firestore/sync/muscles`: Sync `muscles/` data.
-   `POST /api/firestore/sync/anatomy`: Sync `anatomy_teaching/` data.
-   `GET /api/firestore/status`: Get the last sync status.
-   All sync endpoints support `?dry=1` for dry-run.

## Workflow

A typical workflow for managing anatomical knowledge within `anatomy-kb` might involve:

1.  **Ingest Notes:** Use `anatomy ingest <note_path>` to process notes from your Obsidian Vault, extracting initial anatomical data.
2.  **Review and Enrich:** Manually review the generated `muscles/*.yml` files. If needed, use `anatomy enrich <exercise_id>` or `scripts/enrich_muscles.py` to further enrich muscle data via Gemini.
3.  **Push to Teaching Layer:** After editing `muscles/` data, use `http POST :9200/api/muscles/push` to embed these changes into the `anatomy_teaching/` YAMLs.
4.  **Learning & Practice:** Utilize `anatomy flashcard` or `anatomy quiz` for self-assessment. Focus on `anatomy flashcard --weak` for spaced repetition.
5.  **Quality Assurance:** Run `anatomy audit` to check for consistency and completeness across your knowledge base.
6.  **Synchronize to Firestore:** Finally, `http POST :9200/api/firestore/sync` to update the `fitness-aos` PWA with the latest knowledge.

## Development Notes

-   **Gemini Integration:** The project incorporates a robust Gemini model fallback chain: `gemini-2.5-flash` -> `gemini-2.0-flash` -> `gemini-2.0-flash-001` -> `gemini-flash-lite-latest` to ensure resilience against API issues. Offline bulk enrichment is also available via `scripts/enrich_muscles.py`.
-   **Git Hooks:**
    -   `pre-commit`: Prevents commits if YAML validation fails during an anatomy audit of staged `*.yml` files.
    -   `post-commit`: Automatically commits changes to `fitness-dev/catalog/kb/` with a specific message (`auto: kb sync von anatomy-kb — <last commit>`).
-   **Structure:**
    -   `anatomy`: Top-Level Bash Dispatcher for CLI commands.
    -   `anatomy-agent`: The core Python Typer CLI application.
    -   `kbctl`: Server control utility.
    -   `server.py`: The `aiohttp` HTTP API server.
    -   `muscle-index.json`: Canonical muscle registry.
    -   `muscles/`: Directory containing individual muscle YAML files.
    -   `exercises/`: Directory for exercise stub files.
    -   `scripts/`: Contains utility scripts like `enrich_muscles.py`.
    -   `anatomy_kb/`: The main Python package containing loaders, handlers, Gemini integration, Vault integration, display logic, models, and command implementations.
