"""Coach's dependency-free Python dispatcher; domain implementations stay with Fitness."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FITNESS_ROOT = ROOT.parent / 'fitness-dev'


@dataclass(frozen=True)
class Command:
    module: str
    description: str
    prefix: tuple[str, ...] = ()
    entry: str = 'main'


COMMANDS = {
    'clients': Command('fitness.log.cli', 'Klienten-Logs ansehen und filtern', ('clients',)),
    'log': Command('fitness.log.cli', 'Sessions: ls, show, week, history, stats, add, wizard'),
    'console': Command('fitness.log.cli', 'Coach-Konsole mit Klienten-Logs und Analyse', ('console',)),
    'drafts': Command('fitness.log.cli', 'Gespeicherte Analyse-Entwürfe', ('drafts',)),
    'workout': Command('fitness.coach.cli', 'Workout für einen Klienten erfassen (--client)'),
    'catalog': Command('fitness.catalog.cli', 'Katalog, Quellen, Audit, Enrichment und Review'),
    'inbox': Command('fitness.catalog.cli', 'Katalog-Inbox prüfen und bearbeiten', ('inbox',)),
    'catalog-tui': Command('fitness.cli', 'Interaktiven Katalog öffnen', ('catalog',)),
    'tui': Command('fitness.tui.cli', 'Session-/Klienten-Dashboard'),
    'sync': Command('fitness.coach.sync', 'Coach-Worker: status, run, drain', entry='app'),
    'data-sync': Command('fitness.sync.cli', 'Fitness-Daten-/KB-Sync: pull, push, watch, kb'),
    'firestore': Command('fitness.firestore.sync_cli', 'Firestore-Sync-Werkzeuge'),
    'user-data': Command('fitness.runtime.cli', 'Runtime-Sessions und History prüfen/bearbeiten', entry='app'),
    'notifications': Command('backend.notifier.cli', 'Lokale Inbox-Benachrichtigungen (fitness-inbox)'),
    'push': Command('backend.pusher.cli', 'Push-Nachrichten-Werkzeuge'),
    'mail': Command('fitness.mail.cli', 'Fitbit-Mail-Pipeline'),
    'activity': Command('fitness.activity.cli', 'Aktivitäten erfassen und verwalten'),
    'fitness': Command('fitness.cli', 'Vollständige bestehende Fitness-CLI'),
}
ALIASES = {
    'fitness-log': 'log', 'fitness-catalog': 'catalog', 'agent': 'catalog',
    'coach-sync': 'sync', 'fitness-sync': 'data-sync', 'firestore-sync': 'firestore',
    'fitness-inbox': 'notifications', 'fitness-push': 'push', 'fitness-mail': 'mail',
    'fitness-activity': 'activity', 'fitness-tui': 'tui',
}
LOCAL = {'server': 'coach-server', 'release': 'coach-release'}
HELP_OVERRIDES = {
    'server': 'Usage: coach server install|start|stop|restart|status|logs|health|open',
    'tui': 'Usage: coach tui\nInteraktives Session-/Klienten-Dashboard. Keine weiteren Optionen.',
    'firestore': 'Usage: coach firestore pull|push|sync|watch [UID]\nBestehender Firestore-Sync für Fitness und Fuel; watch beobachtet lokale Fuel-Dateien.',
}
SHORTCUTS = {'status': ('server', 'status'), 'open': ('server', 'open')}

# Import only the selected tool, in its own Python environment. No shell parsing,
# cwd changes or unconditional domain imports; preserve relative file arguments.
RUN_TOOL = '''import http.client, importlib, sys
root, module, entry, label = sys.argv[1:5]
sys.path.insert(0, root)
sys.argv = [label, *sys.argv[5:]]
getattr(importlib.import_module(module), entry)()
'''


def help_text() -> str:
    lines = ['Usage: coach <command> [arguments ...]', '', 'Coach-Werkzeuge:']
    lines += [f'  {name:<16} {spec.description}' for name, spec in COMMANDS.items()]
    lines += ['  server           Coach-API: status, start, stop, restart, logs, health, open',
              '  status / open    Kurzformen für server status / server open',
              '  release          Bestehender Coach-Release-Befehl', '',
              'Beispiele:', '  coach clients matthias --days 30',
              '  coach fitness-log clients matthias --journal',
              '  coach catalog --help', '  coach sync status', '',
              'Hilfe pro Werkzeug: coach <command> --help',
              'Alte fitness-* Befehlsnamen werden ebenfalls als Unterbefehle akzeptiert.']
    return '\n'.join(lines)


def command_argv(args: list[str]) -> list[str]:
    name, *rest = args
    if name in SHORTCUTS:
        name, prefix = SHORTCUTS[name]
        rest = [prefix, *rest]
    name = ALIASES.get(name, name)
    if name in LOCAL:
        return [str(ROOT / 'bin' / LOCAL[name]), *rest]
    if name not in COMMANDS:
        raise ValueError(f'Unbekannter Coach-Befehl: {name}. Siehe coach --help.')
    if not (FITNESS_ROOT / 'fitness').is_dir():
        raise FileNotFoundError(f'Fitness-Quelle fehlt: {FITNESS_ROOT}')
    spec = COMMANDS[name]
    python = Path.home() / '.local/share/uv/tools/fitness-agent/bin/python3'
    executable = str(python) if python.is_file() else sys.executable
    return [executable, '-c', RUN_TOOL, str(FITNESS_ROOT), spec.module, spec.entry,
            'coach log' if spec.module == 'fitness.log.cli' else f'coach {name}', *spec.prefix, *rest]


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args in (['--help'], ['-h'], ['help']):
        print(help_text())
        return 0
    if args[0] == 'help':
        args = [*args[1:], '--help']
    name = ALIASES.get(args[0], args[0])
    if name in HELP_OVERRIDES and (args[1:] in (['--help'], ['-h']) or (name == 'firestore' and len(args) == 1)):
        print(HELP_OVERRIDES[name])
        return 0
    if name == 'tui' and len(args) > 1:
        print('coach tui akzeptiert keine weiteren Optionen. Siehe coach tui --help.', file=sys.stderr)
        return 2
    try:
        command = command_argv(args)
        os.execv(command[0], command)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except OSError as exc:
        print(f'Coach konnte das Werkzeug nicht starten: {exc}', file=sys.stderr)
        return 127
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
