"""Senden: Plan je Empfänger, Ausführung, Aufräumen toter Tokens, Verlauf."""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

from backend.pusher.message import Message, build_data
from backend.pusher.paths import history_path
from backend.pusher.recipients import Recipient
from backend.pusher.source import PushSource

DUPLICATE_WINDOW_SECONDS = 10 * 60


@dataclass
class Row:
    uid: str
    name: str
    devices: int = 0
    sent: int = 0
    failed: int = 0
    removed: int = 0
    skipped: str = ""      # Grund, warum nichts gesendet wurde

    @property
    def ok(self) -> bool:
        return not self.skipped and self.sent > 0


@dataclass
class Report:
    message: Message
    dry_run: bool
    rows: list[Row] = field(default_factory=list)

    @property
    def sent(self) -> int:
        return sum(r.sent for r in self.rows)

    @property
    def failed(self) -> int:
        return sum(r.failed for r in self.rows)

    @property
    def reached(self) -> int:
        return sum(1 for r in self.rows if r.ok)


def plan(recipients: list[Recipient]) -> tuple[list[Recipient], list[Recipient]]:
    """(sendbar, übersprungen) — übersprungen heißt: Push aus / keine Geräte / Nachrichten aus."""
    return [r for r in recipients if r.eligible], [r for r in recipients if not r.eligible]


def send(source: PushSource, recipients: list[Recipient], message: Message, dry_run: bool = True,
         history: Path | None = None, now: float | None = None) -> Report:
    """Eine Multicast-Sendung je Empfänger. Im Dry-Run wird nichts gesendet und nichts entfernt;
    die Zählung zeigt, was passiert wäre. Fehler eines Empfängers stoppen die anderen nicht."""
    message = message.validate()
    data = build_data(message, now)
    report = Report(message=message, dry_run=dry_run)
    sendable, skipped = plan(recipients)

    for r in skipped:
        report.rows.append(Row(r.uid, r.name, devices=len(r.tokens), skipped=r.status))

    for r in sendable:
        row = Row(r.uid, r.name, devices=len(r.tokens))
        if dry_run:
            row.sent = len(r.tokens)
        else:
            try:
                results = source.send(r.tokens, data)
            except Exception as exc:       # Netzwerk/Credentials — andere Empfänger weiter bedienen
                logger.error("Senden an {} fehlgeschlagen: {}", r.name, exc)
                row.failed = len(r.tokens)
                row.skipped = f"Fehler: {exc}"
                report.rows.append(row)
                continue
            dead = [t for t, res in zip(r.tokens, results) if res.dead]
            row.sent = sum(1 for res in results if res.ok)
            row.failed = len(results) - row.sent
            if dead:
                try:
                    source.remove_tokens(r.uid, dead)
                    row.removed = len(dead)
                except Exception as exc:
                    logger.warning("Tote Tokens von {} nicht entfernt: {}", r.name, exc)
        report.rows.append(row)

    record(report, history or history_path(), now)
    return report


def record(report: Report, path: Path, now: float | None = None) -> None:
    """Eine JSON-Zeile je Sendung. Enthält Nachrichtentext und Empfänger, nie Tokens."""
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.fromtimestamp(now if now is not None else time.time(), tz=timezone.utc).isoformat(timespec="seconds")
    entry = {
        "at": stamp, "dry_run": report.dry_run,
        "title": report.message.title, "body": report.message.body, "link": report.message.link,
        "rows": [asdict(r) for r in report.rows],
    }
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def read_history(path: Path | None = None, limit: int = 50) -> list[dict]:
    path = path or history_path()
    if not path.is_file():
        return []
    entries: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue          # halbe Zeile nach Absturz — überspringen
    return entries[-limit:][::-1]


def recent_duplicate(message: Message, path: Path | None = None, now: float | None = None) -> bool:
    """Wurde derselbe Text in den letzten 10 Minuten wirklich (nicht als Dry-Run) gesendet?"""
    current = now if now is not None else time.time()
    for entry in read_history(path, limit=20):
        if entry.get("dry_run"):
            continue
        if (entry.get("title"), entry.get("body")) != (message.title.strip(), message.body.strip()):
            continue
        try:
            at = datetime.fromisoformat(entry["at"]).timestamp()
        except (KeyError, ValueError):
            continue
        if 0 <= current - at <= DUPLICATE_WINDOW_SECONDS:
            return True
    return False
