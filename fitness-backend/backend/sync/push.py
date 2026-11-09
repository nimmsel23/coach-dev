"""Push Sessions: lokal → Firestore (Gegenstück zum Pull, symmetrische Konfliktlogik).

* Entscheidung mit derselben `decide()`-Funktion, nur mit vertauschten Rollen:
  der lokale Stand ist der *eingehende*, der Firestore-Stand der *aktuelle*.
  Gleicher Stand → übersprungen; dadurch ist auch ein Zurückschreiben frisch gepullter
  Dateien wirkungslos (kein Echo).
* Vor dem Überschreiben eines Firestore-Dokuments wird dessen Vorversion lokal gesichert
  (`<root>/.fitsync/prev-remote/<uid>/<doc_id>.json`).
* Default ist der Dry-Run (siehe CLI): geschrieben wird nur mit `--apply`.
"""
from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from loguru import logger

from backend.core.conflict import decide, rev_of
from backend.core.store import InvalidDocId, SessionStore, check_doc_id, jsonable
from backend.sync.pull import _emit


class Target(Protocol):
    def fetch_all(self, uid: str) -> dict[str, dict[str, Any]]: ...
    def write(self, uid: str, doc_id: str, data: dict[str, Any]) -> None: ...


@dataclass
class PushReport:
    uid: str
    dry_run: bool
    counts: Counter = field(default_factory=Counter)

    @property
    def errors(self) -> int:
        return self.counts["fehler"]

    def summary(self) -> str:
        c = self.counts
        return ("[dry-run] " if self.dry_run else "") + ", ".join([
            f"{c['angelegt']} neu", f"{c['aktualisiert']} aktualisiert", f"{c['übersprungen']} übersprungen",
            f"{c['nur_remote']} nur remote", f"{c['fehler']} Fehler"])


def _backup_remote(root: Path, uid: str, doc_id: str, remote: dict[str, Any]) -> Path:
    dst = root / ".fitsync" / "prev-remote" / uid / f"{doc_id}.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(jsonable(remote), indent=2, ensure_ascii=False))
    return dst


def push_sessions(
    uid: str, store: SessionStore, target: Target, *, dry_run: bool = True,
    only: set[str] | None = None,
) -> PushReport:
    report = PushReport(uid=uid, dry_run=dry_run)
    remote_docs = {k: jsonable(v) for k, v in target.fetch_all(uid).items()}
    local_ids = store.list_ids(uid)

    for doc_id in sorted(local_ids):
        if only and doc_id not in only:
            continue
        try:
            check_doc_id(doc_id)
            local, err = store.read(uid, doc_id)
            if err or local is None:
                report.counts["fehler"] += 1
                _emit("ERROR", uid, doc_id, "fehler", f"lokale Datei unlesbar ({err})",
                      reason="lokal_defekt", dry_run=dry_run, direction="push")
                continue
            owner = local.get("owner_uid")
            if owner and owner != uid:
                report.counts["übersprungen"] += 1
                _emit("WARNING", uid, doc_id, "übersprungen",
                      f"owner_uid {owner} passt nicht zu {uid} (Cross-User-Guard)",
                      reason="owner_uid", dry_run=dry_run, direction="push")
                continue

            remote = remote_docs.get(doc_id)
            decision = decide(remote, local, current="remote", incoming="lokal")
            facts = dict(reason=decision.reason, rev_local=rev_of(local),
                         rev_remote=None if remote is None else rev_of(remote),
                         saved_at_local=local.get("saved_at"),
                         saved_at_remote=None if remote is None else remote.get("saved_at"),
                         dry_run=dry_run)
            if not decision.write:
                report.counts["übersprungen"] += 1
                _emit("DEBUG", uid, doc_id, "übersprungen", decision.reason, direction="push", **facts)
                continue

            action = "angelegt" if remote is None else "aktualisiert"
            out = {**local, "date": local.get("date") or doc_id.split("__")[0]}
            if not dry_run:
                if remote is not None:
                    facts["backup_remote"] = str(_backup_remote(store.root, uid, doc_id, remote))
                target.write(uid, doc_id, out)
            report.counts[action] += 1
            _emit("INFO", uid, doc_id, action, decision.reason, direction="push", **facts)
        except InvalidDocId:
            report.counts["fehler"] += 1
            _emit("ERROR", uid, doc_id, "fehler", "ungültige doc_id", dry_run=dry_run, direction="push")
        except Exception as exc:  # ein Dokument stoppt den Lauf nicht
            report.counts["fehler"] += 1
            _emit("ERROR", uid, doc_id, "fehler", f"{type(exc).__name__}: {exc}", dry_run=dry_run, direction="push")

    if not only:
        for doc_id in sorted(set(remote_docs) - local_ids):
            report.counts["nur_remote"] += 1
            _emit("INFO", uid, doc_id, "nur_remote", "in Firestore vorhanden, lokal nicht (wird nicht angefasst)",
                  reason="nur_remote", dry_run=dry_run, direction="push")

    logger.bind(event="summary", direction="push", uid=uid, dry_run=dry_run, **dict(report.counts)).info(
        f"push sessions {uid[:8]}: {report.summary()}")
    return report
