#!/usr/bin/env bash
set -euo pipefail

# Package root = this directory (import name: fuel). Parent on PYTHONPATH.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$ROOT/.." && pwd)"
cd "$ROOT"
export PYTHONPATH="${BACKEND_ROOT}${PYTHONPATH:+:$PYTHONPATH}"
export POETRY_VIRTUALENVS_IN_PROJECT="${POETRY_VIRTUALENVS_IN_PROJECT:-true}"

poetry run python -m fuel.migrate
exec poetry run uvicorn fuel.api.main:app --reload --host 127.0.0.1 --port "${FUEL_BACKEND_PORT:-4000}"
