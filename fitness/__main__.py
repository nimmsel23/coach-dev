"""
fitness — python -m fitness [log|tui] ...

Kurzform-Dispatcher:
  python -m fitness log ls
  python -m fitness tui
"""
from __future__ import annotations

import sys


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Usage: python -m fitness [log|tui] [args...]")
        print("\nSubcommands:")
        print("  log   — Session-Log CLI (ls|show|week|history|stats|sync-status)")
        print("  tui   — Interaktives Textual Dashboard")
        sys.exit(0)

    cmd = sys.argv.pop(1)
    if cmd == "log":
        from fitness.log.cli import main as log_main
        log_main()
    elif cmd == "tui":
        from fitness.tui.cli import main as tui_main
        tui_main()
    else:
        print(f"Unbekannter Befehl: {cmd}  (log|tui)", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
