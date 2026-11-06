from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from loguru import logger
from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.table import Table
from rich.theme import Theme

if TYPE_CHECKING:
    from fitness.catalog.core.audit import AuditBundle, AuditReport, ExerciseAuditResult, DemandAuditResult
    from fitness.catalog.bootstrap import BootstrapEvent
    from fitness.catalog.core.doctor import DoctorReport


def print_audit_bundle(
    exercises_status: str,
    aliases_status: str,
    coverage_status: str,
    anatomy_status: str,
    overall_status: str,
) -> None:
    print_header("Fitness Agent Audit Summary")

    table = Table(box=None, show_header=True)
    table.add_column("Layer", style="bold cyan")
    table.add_column("Status")

    def get_style(status: str) -> str:
        if status == "FAIL":
            return "fail"
        if status in {"USABLE", "OK"}:
            return "ok"
        return "warn"

    table.add_row("Exercises", f"[{get_style(exercises_status)}]{exercises_status}[/]")
    table.add_row("Aliases", f"[{get_style(aliases_status)}]{aliases_status}[/]")
    table.add_row("Coverage", f"[{get_style(coverage_status)}]{coverage_status}[/]")
    table.add_row("Anatomy", f"[{get_style(anatomy_status)}]{anatomy_status}[/]")

    console.print(table)

    if overall_status == "FAIL":
        console.print(Panel(f"[fail]Overall: {overall_status}[/fail]", expand=False))
    else:
        console.print(Panel(f"[ok]Overall: {overall_status}[/ok]", expand=False))

theme = Theme(
    {
        "ok": "green",
        "warn": "yellow",
        "fail": "bold red",
        "status": "bold blue",
    }
)
console = Console(theme=theme)


def print_header(title: str) -> None:
    console.print(Panel(f"[bold]{title}[/bold]", expand=False, border_style="status"))


def print_doctor_report(report: DoctorReport) -> None:
    print_header("Fitness Agent Doctor")
    table = Table(box=None, show_header=True)
    table.add_column("Level", width=8)
    table.add_column("Message")

    for line in report.lines:
        style = line.level.lower()
        table.add_row(f"[{style}]{line.level}[/{style}]", line.message)

    console.print(table)

    if report.has_failures:
        console.print(Panel("[fail]Status: FAIL[/fail]", expand=False))
    elif report.has_warnings:
        console.print(Panel("[warn]Status: WARN[/warn]", expand=False))
    else:
        console.print(Panel("[ok]Status: OK[/ok]", expand=False))


def print_bootstrap_report(events: list[BootstrapEvent]) -> None:
    print_header("Fitness Agent Bootstrap")
    table = Table(box=None, show_header=True)
    table.add_column("Level", width=8)
    table.add_column("Message")

    for event in events:
        style = event.level.lower()
        table.add_row(f"[{style}]{event.level}[/{style}]", event.message)

    console.print(table)
    console.print(Panel("[ok]Status: bootstrap complete[/ok]", expand=False))


def print_audit_report(title: str, report: AuditReport, success_status: str, failure_status: str) -> None:
    print_header(title)
    table = Table(box=None, show_header=True)
    table.add_column("Level", width=8)
    table.add_column("Message")

    for line in report.lines:
        style = line.level.lower()
        table.add_row(f"[{style}]{line.level}[/{style}]", line.message)

    console.print(table)

    summary = f"OK: {report.ok_count} | WARN: {report.warn_count} | FAIL: {report.fail_count}"
    console.print(summary)

    if report.has_failures:
        console.print(Panel(f"[fail]Status: {failure_status}[/fail]", expand=False))
    else:
        console.print(Panel(f"[ok]Status: {success_status}[/ok]", expand=False))


def print_exercise_audit(result: ExerciseAuditResult, status: str) -> None:
    print_header("Fitness Agent Exercises Audit")
    
    info_table = Table(box=None, show_header=False)
    info_table.add_column("Key", style="bold cyan")
    info_table.add_column("Value")
    
    info_table.add_row("Total Exercises", str(result.total_exercises))
    
    for cat, count in result.exercises_by_category.items():
        info_table.add_row(f"Category: {cat}", str(count))
        
    console.print(info_table)
    
    if result.missing_required_fields:
        console.print(f"[warn]Missing Required Fields:[/warn] {', '.join(result.missing_required_fields)}")
    if result.duplicate_ids:
        console.print(f"[fail]Duplicate IDs:[/fail] {', '.join(result.duplicate_ids)}")
    if result.unknown_categories:
        console.print(f"[warn]Unknown Categories:[/warn] {', '.join(result.unknown_categories)}")
    if result.empty_primary_muscles:
        console.print(f"[warn]Empty Primary Muscles:[/warn] {len(result.empty_primary_muscles)} exercises")
    
    table = Table(box=None, show_header=True)
    table.add_column("Level", width=8)
    table.add_column("Message")

    for line in result.lines:
        style = line.level.lower()
        table.add_row(f"[{style}]{line.level}[/{style}]", line.message)
    
    console.print(table)
    
    if status == "FAIL":
        console.print(Panel(f"[fail]Status: {status}[/fail]", expand=False))
    else:
        console.print(Panel(f"[ok]Status: {status}[/ok]", expand=False))


def print_demand_audit(result: "DemandAuditResult") -> None:
    print_header("Fitness Agent Demand Audit")

    if result.error:
        console.print(f"[fail]Firestore-Zugriff fehlgeschlagen:[/fail] {result.error}")
        console.print(Panel("[fail]Status: DEMAND_AUDIT_FAILED[/fail]", expand=False))
        return

    console.print(f"Unreviewte Exercises im Katalog: {result.total_unreviewed}")
    console.print(f"Geloggte Sets ueber alle User (gesamt): {result.total_logged_users_sessions}")
    console.print()

    table = Table(box=None, show_header=True)
    table.add_column("Logs", justify="right", width=6)
    table.add_column("Exercise ID")
    table.add_column("Name")
    table.add_column("Source", width=10)

    for entry in result.entries:
        table.add_row(str(entry.log_count), entry.exercise_id, entry.display_name, entry.source)

    console.print(table)

    if not result.entries:
        console.print(Panel("[ok]Status: NO_DEMAND_FOUND[/ok]", expand=False))
    else:
        console.print(Panel(f"[ok]Status: {len(result.entries)} Kandidaten fuer Review[/ok]", expand=False))


def print_source_consistency_audit(result: "SourceConsistencyResult") -> None:
    print_header("Fitness Agent Source-Consistency Audit")

    console.print(f"Geprueft (wger/yuhonas verlinkt): {result.total_checked}")
    console.print(f"Ohne verlinkte Quelle (nicht pruefbar): {result.total_without_source}")
    console.print()

    if not result.flags:
        console.print(Panel("[ok]Status: NO_UNCORROBORATED_MUSCLES[/ok]", expand=False))
        return

    table = Table(box=None, show_header=True)
    table.add_column("Exercise ID")
    table.add_column("Name")
    table.add_column("Rolle", width=16)
    table.add_column("Muskel (unbelegt)")
    table.add_column("Geprueft gegen", width=16)

    for flag in result.flags:
        table.add_row(
            flag.exercise_id,
            flag.display_name,
            flag.role.replace("_muscles", ""),
            flag.muscle_id,
            "+".join(flag.sources_checked),
        )

    console.print(table)
    console.print(Panel(f"[warn]Status: {len(result.flags)} unbelegte Muskel-Zuordnungen — manuell pruefen[/warn]", expand=False))


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=logging.getLevelName(level),
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(console=console, rich_tracebacks=True)],
    )
    logger.remove()
    logger.add(
        RichHandler(console=console, rich_tracebacks=True),
        format="{message}",
        level=level,
    )
