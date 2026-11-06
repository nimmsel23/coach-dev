"""serve command — starts aiohttp API server."""
import subprocess
import sys

import typer
from rich.panel import Panel

from anatomy_kb.commands._helpers import ROOT, SERVER_PORT, console


def command(
    port: int = typer.Option(SERVER_PORT, "--port", "-p", help="Port (default: 9200)"),
):
    """
    [bold]API-Server starten[/bold]

    Startet den aiohttp-Server mit allen REST-Endpoints.

    \b
    Endpoints:
      GET  /health
      GET  /api/exercises
      GET  /api/exercise/{id}
      GET  /api/exercise/{id}/teaching
      GET  /api/exercise/{id}/errors
      GET  /api/exercise/{id}/quiz
      POST /api/reload
    """
    console.print(Panel.fit(
        f"[bold green]anatomy-kb[/bold green] startet auf [cyan]:{port}[/cyan]\n"
        f"[dim]Root: {ROOT}[/dim]",
        title="serve",
        border_style="green",
    ))
    subprocess.run([sys.executable, str(ROOT / "server.py"), "--port", str(port)])
