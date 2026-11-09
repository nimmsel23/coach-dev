"""Pull Sessions: Firestore → lokal. Quelle ist austauschbar (Tests nutzen Fakes)."""
from __future__ import annotations

from collections import Counter
from contextlib import nullcontext
from dataclasses import dataclass, field
from typing import Any, Iterable

from loguru import logger

from backend.core import tombstones
from backend.core.conflict import Decision, decide, rev_of
from backend.core.store import InvalidDocId, SessionStore, check_doc_id, jsonable
from fitness.runtime.session_store import parse_session_doc_id


@dataclass
class RemoteDoc:
    id: str
    data: dict[str, Any]


@dataclass
class Change:
    """Ein angelegtes/aktualisiertes Dokument (bei --dry-run: ein geplantes)."""
    uid: str
    doc_id: str
    action: str            # "angelegt" | "aktualisiert"
    data: dict[str, Any]


@dataclass
class Report:
    uid: str
    dry_run: bool
    counts: Counter = field(default_factory=Counter)
    changes: list[Change] = field(default_factory=list)

    @property
    def errors(self) -> int:
        return self.counts["fehler"]

    def summary(self) -> str:
        c = self.counts
        parts = [
            f"{c['angelegt']} angelegt", f"{c['aktualisiert']} aktualisiert",
            f"{c['übersprungen']} übersprungen", f"{c['nur_lokal']} nur lokal",
            f"{c['fehler']} Fehler",
        ]
        return ("[dry-run] " if self.dry_run else "") + ", ".join(parts)


def _emit(level: str, uid: str, doc_id: str, action: str, msg: str, *, direction: str = "pull", **fields) -> None:
    arrow = "←" if direction != "push" else "→"
    logger.bind(event="session", direction=direction, uid=uid, doc_id=doc_id, action=action, **fields).log(
        level, f"session {arrow} {uid[:8]}/{doc_id}  {action}: {msg}"
    )


def _pull_one(uid: str, doc_id: str, doc: RemoteDoc, store: SessionStore, report: Report, dry_run: bool,
              direction: str = "pull") -> None:
    remote = jsonable(doc.data)

    owner = remote.get("owner_uid")
    if owner and owner != uid:
        report.counts["übersprungen"] += 1
        _emit("WARNING", uid, doc_id, "übersprungen",
              f"owner_uid {owner} passt nicht zu {uid} (Cross-User-Guard)",
              reason="owner_uid", dry_run=dry_run, direction=direction)
        return

    local, local_error = store.read(uid, doc_id)
    if local_error:
        quarantined = None if dry_run else store.quarantine(uid, doc_id)
        _emit("WARNING", uid, doc_id, "lokal_defekt",
              f"lokale Datei unlesbar ({local_error})"
              + (f", nach {quarantined.name} verschoben" if quarantined else ""),
              reason="lokal_defekt", dry_run=dry_run, direction=direction)
        local = None

    tomb = tombstones.load(store.root, uid).get(doc_id) if local is None else None
    if tomb and rev_of(remote) <= int(tomb.get("rev", 0)):
        report.counts["übersprungen"] += 1
        _emit("INFO", uid, doc_id, "übersprungen",
              f"lokal gelöscht (Tombstone rev {tomb.get('rev', 0)}), remote rev {rev_of(remote)} nicht neuer",
              reason="tombstone", rev_remote=rev_of(remote), dry_run=dry_run, direction=direction)
        return

    decision: Decision = decide(local, remote)
    facts = dict(reason=decision.reason, rev_remote=rev_of(remote),
                 rev_local=None if local is None else rev_of(local),
                 saved_at_remote=remote.get("saved_at"),
                 saved_at_local=None if local is None else local.get("saved_at"),
                 dry_run=dry_run)

    if not decision.write:
        report.counts["übersprungen"] += 1
        _emit("DEBUG", uid, doc_id, "übersprungen", decision.reason, direction=direction, **facts)
        return

    action = "angelegt" if local is None else "aktualisiert"
    if not dry_run:
        backup = store.write(uid, doc_id, remote)
        if tomb:
            tombstones.remove(store.root, uid, doc_id)   # neuere remote rev: Session ist wieder da
        facts["backup"] = None if backup is None else str(backup)
    report.counts[action] += 1
    report.changes.append(Change(uid, doc_id, action, remote))
    _emit("INFO", uid, doc_id, action, decision.reason, direction=direction, **facts)


def pull_one_checked(
    uid: str, doc: RemoteDoc, store: SessionStore, report: Report, *, dry_run: bool = False, direction: str = "pull"
) -> bool:
    """Ein Dokument prüfen, entscheiden, schreiben (unter Schreib-Lock) und loggen.

    Gemeinsamer Einstieg für Pull (Batch) und Daemon (live) — damit die Entscheidungs-
    und Schutzlogik nie in zwei Dateien auseinanderdriftet. Gibt False zurück, wenn die
    doc_id unbrauchbar war. Ein Fehler stoppt nie den Aufrufer."""
    try:
        check_doc_id(doc.id)
        parse_session_doc_id(doc.id)
    except InvalidDocId:
        report.counts["fehler"] += 1
        _emit("ERROR", uid, doc.id, "fehler", "ungültige doc_id, nicht als Dateiname verwendbar",
              dry_run=dry_run, direction=direction)
        return False
    except ValueError:
        report.counts["fehler"] += 1
        _emit("ERROR", uid, doc.id, "fehler", "ungültige Session-ID (erwartet YYYY-MM-DD oder YYYY-MM-DD__<id>)",
              dry_run=dry_run, direction=direction)
        return False
    try:
        with (nullcontext() if dry_run else store.write_lock()):
            _pull_one(uid, doc.id, doc, store, report, dry_run, direction)
    except Exception as exc:  # ein kaputtes Dokument stoppt den Lauf nicht
        report.counts["fehler"] += 1
        _emit("ERROR", uid, doc.id, "fehler", f"{type(exc).__name__}: {exc}", dry_run=dry_run, direction=direction)
    return True


def pull_sessions(
    uid: str, docs: Iterable[RemoteDoc], store: SessionStore, *, dry_run: bool = False
) -> Report:
    report = Report(uid=uid, dry_run=dry_run)
    seen: set[str] = set()

    for doc in docs:
        if pull_one_checked(uid, doc, store, report, dry_run=dry_run):
            seen.add(doc.id)

    for orphan in sorted(store.list_ids(uid) - seen):
        report.counts["nur_lokal"] += 1
        _emit("INFO", uid, orphan, "nur_lokal",
              "lokal vorhanden, in Firestore nicht (wird nicht gelöscht)", reason="nur_lokal", dry_run=dry_run)

    logger.bind(event="summary", direction="pull", uid=uid, dry_run=dry_run, **dict(report.counts)).info(
        f"pull sessions {uid[:8]}: {report.summary()}"
    )
    return report
