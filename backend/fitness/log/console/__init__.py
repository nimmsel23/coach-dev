"""fitness.log.console — Live-Coach-TUI Subpackage.

Beobachtet Klienten-Sessions/Journal-Eintraege in Echtzeit (watchdog) und
laesst Zwei-KI-Analyse (fitness/catalog/agent/coach_ai.py) darueberlaufen:
Trainingsluecken-Check + Auto-Feedback-Entwuerfe.

Module:
  events.py       — Event-Queue-Eintrag-Formatierung, Klienten-Name-Lookup
  watcher.py       — watchdog FileSystemEventHandler (Session/Journal-Aenderungen)
  gap_check.py     — periodischer Trainingsluecken-Check, ein Fehler pro Klient
                      darf den Loop nie mehr komplett stoppen (siehe Docstring dort)
  drafts.py        — Persistenz der KI-Ausgaben (~/.aos/fitness/console/drafts/),
                      Schritt 1 im Ausbau; `fitness-log drafts` liest sie
  keys.py          — nicht-blockierendes Einzeltasten-Lesen (cbreak-Mode, stdlib)
  approval.py      — interaktive Freigabe von Feedback-Entwuerfen (a/d/s),
                      Schritt 2 im Ausbau, schreibt Status in drafts.py zurueck
  core.py          — verdrahtet Watcher + Gap-Loop + Freigabe + Rich-Live, run()

`fitness/commands/log.py::cmd_console` ruft nur noch `run()` auf.
"""
from .core import run  # klassische Rich-Console (`fitness-log console --classic`)

__all__ = ["run"]  # Textual-Dashboard: console.tui.run_tui (Default von `fitness-log console`)
