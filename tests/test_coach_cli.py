import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import coach_cli


class CoachDispatcherTest(unittest.TestCase):
    def test_legacy_name_and_clients_shortcut_dispatch_to_same_tool(self):
        one = coach_cli.command_argv(['clients', 'client with spaces', '--days', '7'])
        two = coach_cli.command_argv(['fitness-log', 'clients', 'client with spaces', '--days', '7'])
        self.assertEqual(one, two)
        self.assertEqual(one[-4:], ['clients', 'client with spaces', '--days', '7'])

    def test_domain_imports_are_lazy_and_tool_help_is_forwarded(self):
        for name in coach_cli.COMMANDS:
            argv = coach_cli.command_argv([name, '--help'])
            self.assertEqual(argv[-1], '--help')
        self.assertEqual(coach_cli.command_argv(['inbox', 'list'])[-2:], ['inbox', 'list'])
        self.assertIn('backend.notifier.cli', coach_cli.command_argv(['fitness-inbox', '--help']))

    def test_arguments_are_passed_verbatim_without_a_shell_or_cwd_change(self):
        with patch('coach_cli.os.execv') as execute:
            self.assertEqual(coach_cli.main(['log', 'show', 'relative file;$(literal).json']), 0)
        executable, argv = execute.call_args.args
        self.assertEqual(executable, argv[0])
        self.assertEqual(argv[-1], 'relative file;$(literal).json')

    def test_unknown_command_and_missing_owner_report_useful_errors(self):
        with contextlib.redirect_stderr(io.StringIO()) as output:
            self.assertEqual(coach_cli.main(['not-a-command']), 2)
        self.assertIn('coach --help', output.getvalue())
        with patch('coach_cli.FITNESS_ROOT', Path('/no/such/fitness-owner')), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(coach_cli.main(['clients']), 127)

    def test_help_needs_no_domain_environment_and_has_no_service_side_effects(self):
        with patch('coach_cli.os.execv') as execute, contextlib.redirect_stdout(io.StringIO()):
            for args in ([], ['--help'], ['help'], ['server', '--help'], ['tui', '--help'], ['fitness-tui', '-h'], ['firestore'], ['firestore-sync', '--help']):
                self.assertEqual(coach_cli.main(args), 0)
        execute.assert_not_called()

    def test_real_dispatch_preserves_child_exit_status_and_working_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / 'fitness'
            package.mkdir()
            (package / '__init__.py').write_text('')
            (package / 'fixture.py').write_text('import os,sys\ndef main():\n print(os.getcwd())\n print(repr(sys.argv[1:]))\n raise SystemExit(23)\n')
            argv = [sys.executable, '-c', coach_cli.RUN_TOOL, str(root), 'fitness.fixture', 'main', 'coach fixture', 'a b', '--flag']
            result = subprocess.run(argv, cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 23)
            self.assertIn(str(root), result.stdout)
            self.assertIn("['a b', '--flag']", result.stdout)
