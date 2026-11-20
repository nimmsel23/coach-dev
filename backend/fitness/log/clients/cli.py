"""
fitness.log.clients.cli — Typer-CLI-Definitionen für Klienten-Logging.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

import typer

from ...render import c
from .models import ClientFilter
from .render import (
    render_client_stats,
    render_clients_table,
    render_json,
    render_timeline,
)
from .service import (
    build_client_timeline,
    compute_client_stats,
    get_clients_registry,
    load_client_journal,
    load_client_sessions,
)


def cmd_clients(
    client: Optional[str] = typer.Argument(
        None,
        help="Nur dieser Klient (Name oder Slug, z.B. matthias-mayer, daniel) — Teilstring-Suche",
    ),
    days: int = typer.Option(90, "--days", "-d", help="Zeitfenster in Tagen (Standard: 90)"),
    all_: bool = typer.Option(False, "--all", "-a", help="Gesamtes Archiv anzeigen (ignoriert --days)"),
    since: Optional[str] = typer.Option(None, "--since", help="Startdatum (YYYY-MM-DD)"),
    until: Optional[str] = typer.Option(None, "--until", help="Enddatum (YYYY-MM-DD)"),
    type_: Optional[str] = typer.Option(
        None,
        "--type",
        "-t",
        help="Filter nach Typ: all, strength (Kraft), cardio (Ausdauer)",
    ),
    block: Optional[str] = typer.Option(
        None,
        "--block",
        "-b",
        help="Nur Sessions mit diesem Block (z.B. Push, Pull, Legs, 6Pack)",
    ),
    min_rest: Optional[int] = typer.Option(
        None,
        "--min-rest",
        help="Nur Sessions mit mindestens N Rest-Tagen seit dem letzten Block gleicher Art",
    ),
    max_rest: Optional[int] = typer.Option(
        None,
        "--max-rest",
        help="Nur Sessions mit maximal N Rest-Tagen seit dem letzten Block gleicher Art",
    ),
    journal: bool = typer.Option(
        False,
        "--journal",
        "-j",
        help="Journal-Freitext passend zum Datum mit einsortieren",
    ),
    journal_only: bool = typer.Option(
        False,
        "--journal-only",
        help="Nur Journal-Einträge anzeigen (ohne Workouts)",
    ),
    detail: bool = typer.Option(
        False,
        "--detail",
        "-v",
        help="Detail-Ansicht mit einzelnen Übungen, Sätzen, Reps und Gewichten",
    ),
    list_clients: bool = typer.Option(
        False,
        "--list",
        "-l",
        help="Übersichtstabelle aller registrierten Klienten anzeigen",
    ),
    stats: bool = typer.Option(
        False,
        "--stats",
        "-s",
        help="Coaching-Statistiken und Split-Verteilung für Klienten ausgeben",
    ),
    json_output: bool = typer.Option(
        False,
        "--json",
        help="Ausgabe als strukturiertes JSON",
    ),
    no_live: bool = typer.Option(
        False,
        "--no-live",
        help="Keine Live-Abfrage an Firestore; nur lokale Dateien verwenden",
    ),
    # Abwärtskompatibilität für bestehende Aufrufe
    cardio_only: bool = typer.Option(False, "--cardio-only", hidden=True),
    strength_only: bool = typer.Option(False, "--strength-only", hidden=True),
) -> None:
    """
    Klienten-Sessions chronologisch auflisten, filtern und analysieren.
    """
    clients = get_clients_registry(needle=client)
    if not clients:
        if client:
            print(c("red", f"  Kein Klient gefunden für '{client}'."))
            raise typer.Exit(1)
        print(c("yellow", "  Keine Klienten in ~/Klienten/ gefunden."))
        raise typer.Exit()

    # --list: Übersichtstabelle
    if list_clients:
        if json_output:
            render_json([{"name": c.name, "slug": c.slug, "uids": c.uids, "status": c.status} for c in clients])
        else:
            render_clients_table(clients)
        return

    # Workout-Typ auflösen
    workout_type = type_
    if cardio_only:
        workout_type = "cardio"
    elif strength_only:
        workout_type = "strength"

    # Datumsfenster berechnen
    cutoff = "0000-00-00" if all_ else (date.today() - timedelta(days=days)).isoformat()
    if since:
        cutoff = since

    filters = ClientFilter(
        client_name=client,
        days=days,
        all_history=all_,
        since=cutoff,
        until=until,
        workout_type=workout_type,
        block=block,
        min_rest=min_rest,
        max_rest=max_rest,
        include_journal=journal,
        journal_only=journal_only,
        live_firestore=not no_live,
        detail=detail,
    )

    json_payload: list[dict[str, Any]] = []

    for meta in clients:
        raw_sessions = load_client_sessions(meta, start_date=cutoff, end_date=until or "9999-99-99")

        # --stats: Nur Statistiken anzeigen
        if stats:
            client_stat = compute_client_stats(meta, raw_sessions, days_window=days if not all_ else 365)
            if json_output:
                json_payload.append(client_stat.__dict__)
            else:
                render_client_stats(client_stat)
            continue

        # Journal laden falls gewünscht
        journal_by_date: dict[str, list[str]] = {}
        if filters.include_journal or filters.journal_only:
            journal_by_date = load_client_journal(meta, cutoff=cutoff, live_firestore=filters.live_firestore)

        timeline = build_client_timeline(meta, raw_sessions, journal_by_date, filters)

        if json_output:
            json_payload.append({
                "client": meta.name,
                "slug": meta.slug,
                "uids": meta.uids,
                "entries": [
                    {
                        "date": e.date,
                        "rest_days": e.rest_days,
                        "session": e.session.raw if e.session else None,
                        "journal_notes": e.journal_notes,
                    }
                    for e in timeline
                ],
            })
        else:
            window_desc = "gesamt" if all_ else (f"{since} bis {until}" if (since or until) else f"letzte {days}d")
            render_timeline(meta, timeline, detail=detail, window_desc=window_desc)

    if json_output:
        render_json(json_payload)
    elif not stats:
        print()


def cmd_clients_list(
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Übersicht aller registrierten Klienten mit Sync-Status und letzter Aktivität."""
    clients = get_clients_registry()
    if json_output:
        render_json([{"name": c.name, "slug": c.slug, "uids": c.uids, "status": c.status} for c in clients])
    else:
        render_clients_table(clients)


def cmd_clients_stats(
    client: Optional[str] = typer.Argument(None, help="Name oder Slug des Klienten"),
    days: int = typer.Option(90, "--days", "-d", help="Zeitfenster in Tagen"),
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Coaching-Statistiken und Split-Verteilung für Klienten auswerten."""
    clients = get_clients_registry(needle=client)
    if not clients:
        print(c("red", f"  Kein Klient gefunden für '{client}'."))
        raise typer.Exit(1)

    payload = []
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    for meta in clients:
        sessions = load_client_sessions(meta, start_date=cutoff)
        stats = compute_client_stats(meta, sessions, days_window=days)
        if json_output:
            payload.append(stats.__dict__)
        else:
            render_client_stats(stats)

    if json_output:
        render_json(payload)


def cmd_clients_journal(
    client: Optional[str] = typer.Argument(None, help="Name oder Slug des Klienten"),
    days: int = typer.Option(90, "--days", "-d", help="Zeitfenster in Tagen"),
    all_: bool = typer.Option(False, "--all", "-a", help="Gesamtes Archiv anzeigen"),
    no_live: bool = typer.Option(False, "--no-live", help="Nur lokale Dateien"),
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Journal-Notizen und Freitext-Reflexionen von Klienten anzeigen."""
    cmd_clients(
        client=client,
        days=days,
        all_=all_,
        journal_only=True,
        no_live=no_live,
        json_output=json_output,
    )
