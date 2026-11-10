"""Konfliktentscheidung Remote ↔ Lokal für Sessions (reine Funktion, ohne I/O).

Übernommen aus fitness-dev (`firestore/_db.py::remote_wins`), inkl. der
Lehren daraus:

* `rev` entscheidet, nicht `saved_at` allein — robust gegen Client-Uhr-Drift.
* Bei gleichem rev (auch 0 == 0, der Normalfall bei Legacy-Sessions ohne
  rev-Feld) gewinnt remote NUR, wenn sein saved_at nachweislich neuer ist.
  Die alte Fassung ließ bei 0 == 0 "remote gewinnt" durchfallen und
  überschrieb dadurch lokal korrigierte Sessions mit dem älteren
  Firestore-Stand (Datenverlust Matthias, 2026-08-23).
* Ohne verwertbare Zeitstempel bleibt lokal der sichere Default.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class Decision:
    write: bool    # True = lokale Datei wird durch Remote ersetzt
    reason: str    # menschenlesbar, landet 1:1 im Log


def rev_of(data: dict[str, Any]) -> int:
    try:
        return int(data.get("rev") or 0)
    except (TypeError, ValueError):
        return 0


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def decide(local: dict[str, Any] | None, remote: dict[str, Any], *,
           current: str = "lokal", incoming: str = "remote") -> Decision:
    """True = `remote` (der eingehende Stand) ersetzt `local` (den aktuellen).

    Für den Push wird symmetrisch aufgerufen: decide(remote_doc, local_doc,
    current="remote", incoming="lokal") — die Beschriftungen halten die Log-Gründe lesbar."""
    if local is None:
        return Decision(True, f"neu ({current} nicht vorhanden)")

    local_rev, remote_rev = rev_of(local), rev_of(remote)
    if remote_rev != local_rev:
        if remote_rev > local_rev:
            return Decision(True, f"{incoming} rev {remote_rev} > {current} rev {local_rev}")
        return Decision(False, f"{incoming} rev {remote_rev} < {current} rev {local_rev} ({current} neuer)")

    local_ts, remote_ts = local.get("saved_at"), remote.get("saved_at")
    if not remote_ts:
        return Decision(False, f"gleiches rev {local_rev}, {incoming} ohne saved_at ({current} bleibt)")
    if not local_ts:
        return Decision(True, f"gleiches rev {local_rev}, {current} ohne saved_at ({incoming} übernommen)")

    l_dt, r_dt = _as_datetime(local_ts), _as_datetime(remote_ts)
    if l_dt is not None and r_dt is not None:
        newer, same = r_dt > l_dt, r_dt == l_dt
    else:  # nicht parsebar: Stringvergleich wie bisher
        newer, same = str(remote_ts) > str(local_ts), str(remote_ts) == str(local_ts)

    if newer:
        return Decision(True, f"gleiches rev {local_rev}, {incoming} saved_at neuer")
    if same:
        return Decision(False, "unverändert (rev und saved_at gleich)")
    return Decision(False, f"gleiches rev {local_rev}, {current} saved_at neuer ({current} bleibt)")
