"""
fitness.log.drafts — Persistierte KI-Entwürfe aus der Coach-Konsole anzeigen.
"""
from __future__ import annotations

from typing import Optional

import typer

from ..render import c


def cmd_drafts(
    client: Optional[str] = typer.Option(None, "--client", help="Nur Entwürfe für diesen Klienten (Name-Substring)"),
    limit: int = typer.Option(20, "--limit", help="Max. Anzahl Entwürfe"),
) -> None:
    """Persistierte KI-Entwürfe aus der Live-Console anzeigen (Gap-Erklärungen, Feedback)."""
    from .console.drafts import list_drafts

    entries = list_drafts()
    if client:
        needle = client.lower()
        entries = [e for e in entries if needle in e.get("name", "").lower()]
    entries = entries[:limit]

    if not entries:
        print(c("yellow", "  Keine Entwürfe gefunden."))
        return

    for e in entries:
        kind_label = "Gap" if e.get("kind") == "gap" else "Feedback"
        kind_color = "red" if e.get("kind") == "gap" else "green"
        print(f"{c('dim', e.get('created_at', '?'))}  {c('accent', e.get('name', '?'))}  {c(kind_color, kind_label)}  {e.get('text', '')}")
