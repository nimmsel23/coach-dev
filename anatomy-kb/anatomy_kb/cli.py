import sys
from pathlib import Path
import typer

# Import commands from the subpackage
# Assuming we are inside the anatomy_kb package
from .commands import (
    serve, browse, teach, learn, enrich, ingest, audit, system, flashcard, db_cmd, firestore, index_cmd, approve, refine, service
)

app = typer.Typer(
    name="anatomy-agent",
    help="[bold]anatomy-kb[/bold] — Anatomy Intelligence Layer",
    add_completion=False,
    rich_markup_mode="rich",
)

app.command("serve")(serve.command)
app.command("list")(browse.list_command)
app.command("pick")(browse.pick_command)
app.command("show")(browse.show_command)
app.command("teach")(teach.command)
app.command("errors")(learn.errors_command)
app.command("quiz")(learn.quiz_command)
app.command("enrich")(enrich.command)
app.command("ingest")(ingest.command)
app.command("audit")(audit.command)
app.command("flashcard")(flashcard.command)
app.command("db")(db_cmd.command)
app.command("firestore")(firestore.command)
app.command("index")(index_cmd.command)
app.command("reload")(system.reload_command)
app.command("doctor")(system.doctor_command)
app.command("approve")(approve.command)
app.command("refine")(refine.command)

app.add_typer(service.server_app, name="server")
app.add_typer(service.daemon_app, name="daemon")

def main():
    app()

if __name__ == "__main__":
    main()
