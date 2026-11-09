"""Coach's dependency-free Python dispatcher; domain implementations stay with owners."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FITNESS_ROOT = ROOT.parent / 'fitness-dev'
KLIENTEN_ROOT = Path(os.getenv('KLIENTEN_PYTHON_ROOT', str(ROOT / 'klienten-python')))
PRAXIS_DEV_ROOT = Path(os.getenv('PRAXIS_DEV_ROOT', str(ROOT.parent / 'praxis-dev')))


@dataclass(frozen=True)
class Command:
    module: str
    description: str
    prefix: tuple[str, ...] = ()
    entry: str = 'main'
    owner: str = 'fitness'  # fitness | klienten


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
    # klienten-python / Praxis (venv unter KLIENTEN_PYTHON_ROOT)
    'praxis': Command(
        'klienten_manager.praxis_cli',
        'Praxis-Dashboard: Klienten, Rechnungen, Termine, Aufgaben',
        entry='app', owner='klienten',
    ),
    'klientenctl': Command(
        'klienten_manager.klientenctl',
        'Klienten-Registry: anlegen, listen, Status, TUI',
        entry='app', owner='klienten',
    ),
    'konsolectl': Command(
        'klienten_manager.konsolectl',
        'Konsole: Praxis-DB, Billing, hledger, CRM, Coaching-Notes',
        entry='app', owner='klienten',
    ),
}
ALIASES = {
    'fitness-log': 'log', 'fitness-catalog': 'catalog', 'agent': 'catalog',
    'coach-sync': 'sync', 'fitness-sync': 'data-sync', 'firestore-sync': 'firestore',
    'fitness-inbox': 'notifications', 'fitness-push': 'push', 'fitness-mail': 'mail',
    'fitness-activity': 'activity', 'fitness-tui': 'tui',
    'klienten': 'klientenctl', 'konsole': 'konsolectl', 'praxisctl': 'praxis',
}
LOCAL = {'server': 'coach-server', 'api': 'coach-server', 'release': 'coach-release'}
HELP_OVERRIDES = {
    'server': 'Usage: coach server install|start|stop|restart|status|logs|health|open',
    'api': 'Usage: coach api install|start|stop|restart|status|logs|health|open',
    'tui': 'Usage: coach tui\nInteraktives Session-/Klienten-Dashboard. Keine weiteren Optionen.',
    'firestore': 'Usage: coach firestore pull|push|sync|watch [UID]\nBestehender Firestore-Sync für Fitness und Fuel; watch beobachtet lokale Fuel-Dateien.',
}
SHORTCUTS = {'status': ('server', 'status'), 'open': ('server', 'open'),
             'restart': ('server', 'restart')}

# Import only the selected tool, in its own Python environment. No shell parsing,
# cwd changes or unconditional domain imports; preserve relative file arguments.
RUN_TOOL = '''import http.client, importlib, sys
root, module, entry, label = sys.argv[1:5]
sys.path.insert(0, root)
sys.argv = [label, *sys.argv[5:]]
getattr(importlib.import_module(module), entry)()
'''

# klienten-python needs its package root plus praxis-dev (lib.db / models).
RUN_KLIENTEN = '''import importlib, sys
kp, praxis, module, entry, label = sys.argv[1:6]
for path in (kp, praxis):
    if path and path not in sys.path:
        sys.path.insert(0, path)
sys.argv = [label, *sys.argv[6:]]
getattr(importlib.import_module(module), entry)()
'''


def help_text() -> str:
    fitness = [(n, s) for n, s in COMMANDS.items() if s.owner == 'fitness']
    klienten = [(n, s) for n, s in COMMANDS.items() if s.owner == 'klienten']
    lines = ['Usage: coach <command> [arguments ...]', '', 'Coach-Werkzeuge:']
    lines += [f'  {name:<16} {spec.description}' for name, spec in fitness]
    lines += ['', 'Praxis / Klienten (klienten-python):']
    lines += [f'  {name:<16} {spec.description}' for name, spec in klienten]
    lines += [
        '  server / api     Coach-API: status, start, stop, restart, logs, health, open',
        '  restart          Kurzform für server restart',
        '  status / open    Kurzformen für server status / server open',
        '  release          Bestehender Coach-Release-Befehl', '',
        'Beispiele:', '  coach clients matthias --days 30',
        '  coach praxis', '  coach klientenctl list', '  coach konsolectl --help',
        '  coach catalog --help', '  coach sync status', '  coach restart',
        '  coach api restart', '',
        'Hilfe pro Werkzeug: coach <command> --help',
        'Aliase: klienten→klientenctl, konsole→konsolectl, praxisctl→praxis;',
        'alte fitness-* Befehlsnamen bleiben als Unterbefehle gültig.',
    ]
    return '\n'.join(lines)


def _fitness_python() -> str:
    python = Path.home() / '.local/share/uv/tools/fitness-agent/bin/python3'
    return str(python) if python.is_file() else sys.executable


def _klienten_python() -> str:
    candidate = KLIENTEN_ROOT / '.venv' / 'bin' / 'python3'
    return str(candidate) if candidate.is_file() else sys.executable


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
    spec = COMMANDS[name]
    if spec.owner == 'klienten':
        if not (KLIENTEN_ROOT / 'klienten_manager').is_dir():
            raise FileNotFoundError(f'klienten-python fehlt: {KLIENTEN_ROOT}')
        if not (PRAXIS_DEV_ROOT / 'lib' / 'db.py').is_file():
            raise FileNotFoundError(f'praxis-dev fehlt: {PRAXIS_DEV_ROOT}')
        return [
            _klienten_python(), '-c', RUN_KLIENTEN,
            str(KLIENTEN_ROOT), str(PRAXIS_DEV_ROOT),
            spec.module, spec.entry, f'coach {name}', *spec.prefix, *rest,
        ]
    if not (FITNESS_ROOT / 'fitness').is_dir():
        raise FileNotFoundError(f'Fitness-Quelle fehlt: {FITNESS_ROOT}')
    return [
        _fitness_python(), '-c', RUN_TOOL, str(FITNESS_ROOT), spec.module, spec.entry,
        'coach log' if spec.module == 'fitness.log.cli' else f'coach {name}', *spec.prefix, *rest,
    ]


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
