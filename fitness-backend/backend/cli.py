"""Fitness-Backend CLI: `python3 -m backend serve | sync ...` (cwd: ~/dev/coach-dev/fitness-backend-backend)."""
from __future__ import annotations

from typing import Optional

import typer
from loguru import logger

from backend.core.settings import load_settings
from backend.sync import logsetup
from backend.sync.cli import sync_app

app = typer.Typer(no_args_is_help=True, help="Fitness-Backend")
app.add_typer(sync_app, name="sync")


@app.command()
def serve(
    host: Optional[str] = typer.Option(None, help="Standard: FITNESS_HOST oder 127.0.0.1"),
    port: Optional[int] = typer.Option(None, help="Standard: FITNESS_PYTHON_PORT oder 9150"),
    verbose: bool = typer.Option(False, "-v", "--verbose"),
):
    """API starten (JSON unter /api, Doku unter /docs)."""
    import uvicorn

    s = load_settings()
    host, port = host or s.host, port or s.port
    logsetup.setup(s.log_dir, verbose)
    if host not in {"127.0.0.1", "localhost", "::1"}:
        logger.warning(f"bindet auf {host}: die API hat KEINE Authentifizierung und liefert Klientendaten aus!")
    uvicorn.run("backend.api.app:create_app", factory=True, host=host, port=port, log_level="info")
