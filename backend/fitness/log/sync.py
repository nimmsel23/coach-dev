"""
fitness.log.sync — Synchronisations-Status und Klienten-Registry Health.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import typer

from ..data import load_client_registry, sync_info
from ..paths import AOS_USERS, KLIENTEN_DIR
from ..render import c, header


def cmd_sync_status(
    check_daemon: bool = typer.Option(True, "--daemon/--no-daemon", help="Daemon-Status prüfen"),
) -> None:
    """Firestore ↔ lokal Sync-Status + Klienten-Registry anzeigen."""
    header("Firestore ↔ Lokal Sync")
    info = sync_info()

    state_c = "green" if info["state"] == "active" else "red"
    print(f"\n  {c('muted', 'Service:')}  {c(state_c, info['state'] + ' (' + info['sub'] + ')')}")
    print(f"  {c('muted', 'Letzter Run:')} {c('white', info['last_run'])}")

    print(f"\n  {c('muted', 'Sessions-Pfad:')} {c('white', info['sdir'])}")
    print(f"  {c('muted', 'JSON-Dateien:')}  {c('accent', str(info['json_count']))}")
    print(
        f"  {c('muted', 'SQLite Sets:')}   {c('accent', str(info['sqlite_n']))}"
        f"  {c('dim', '(latest: ' + str(info['sqlite_latest']) + ')')}"
    )

    newest = info["newest"]
    age = info["newest_age"]
    if newest and newest != "?":
        age_c = "green" if isinstance(age, int) and age < 2 \
            else "yellow" if isinstance(age, int) and age < 7 else "red"
        print(
            f"  {c('muted', 'Neueste Session:')} {c(age_c, newest)}"
            f"  {c('dim', str(age) + ' Tage alt')}"
        )

    if check_daemon:
        if info["daemon_active"]:
            print(f"\n  {c('green', '● Mirror-Daemon läuft')}")
        else:
            print(f"\n  {c('yellow', '○ Mirror-Daemon nicht aktiv')}  {c('dim', '(boot-only one-shot)')}")

    print(f"\n  {c('dim', '→ fitness sync  zum manuellen Pull/Push')}")

    # ── Klienten-Registry ─────────────────────────────────────────────────────
    registry = load_client_registry()
    if registry:
        print(f"\n  {c('bold', 'Klienten-Registry')}  {c('muted', str(KLIENTEN_DIR))}")
        for uid, meta in registry.items():
            sdir = AOS_USERS / uid / "fitness" / "sessions"
            if sdir.exists():
                files = list(sdir.glob("*.json"))
                n = len({f.stem[:10] for f in files if len(f.stem) >= 10})
                dates = sorted((f.stem[:10] for f in files if len(f.stem) >= 10), reverse=True)
                newest = dates[0] if dates else "—"
                try:
                    age = (date.today() - date.fromisoformat(newest)).days
                    age_c = "green" if age < 3 else "yellow" if age < 7 else "red"
                    age_s = c(age_c, newest) + c("dim", f" ({age}d)")
                except Exception:
                    age_s = c("muted", newest)
                sync_s = c("green", f"✓ {n} Sessions") + "  " + age_s
            else:
                sync_s = c("yellow", "○ kein lokaler Sync")
            name_col = c("white", f"{meta['name']:<18}")
            print(
                f"  {name_col}"
                f" {c('muted', uid[:12] + '…')}  {sync_s}"
            )
    print()
