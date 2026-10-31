# Coach Python dispatcher

`bin/coach` is the project-owned Python entrypoint. `coach_cli.py` dispatches
only the selected tool; top-level help needs no Fitness dependencies or server.
The shell already includes `~/dev/coach-dev/bin` via its repository PATH config.
No global wrapper or symlink is installed.

```sh
coach clients matthias --days 30
coach fitness-log clients matthias --journal
coach log week
coach console
coach drafts --client matthias
coach workout --help
coach catalog --help
coach inbox --help
coach catalog-tui
coach tui
coach sync status
coach data-sync --help
coach firestore --help
coach user-data --help
coach notifications --help
coach push --help
coach mail --help
coach activity --help
coach server health
coach status
coach open
coach fitness --help
```

`clients`, `console` and `drafts` are shortcuts into `fitness.log.cli`. `log` and
`fitness-log` select its full command tree. Catalog review is `coach inbox`;
`coach notifications` selects the separate legacy `fitness-inbox` notifier.
`coach sync` controls the Coach command worker, while `data-sync` selects Fitness
KB/user-data synchronization. These are distinct tools and ownership boundaries.
`coach release` delegates to the existing explicit release command.

Other legacy command names are accepted as aliases: `fitness-catalog`,
`fitness-tui`, `fitness-sync`, `firestore-sync`, `coach-sync`, `fitness-inbox`,
`fitness-push`, `fitness-mail`, `fitness-activity`. Existing standalone commands
remain compatible. `coach help <command>` and `coach <command> --help` show the
selected tool's help.

Implementations remain in the sibling `fitness-dev` checkout. Dispatch uses its
source path explicitly with the existing fitness-agent uv interpreter; if that
interpreter is absent, it tries the launcher's Python environment. That fallback
must provide the selected tool's dependencies. No dependencies are installed
implicitly. Relative file arguments retain the caller's working directory,
arguments are passed without shell parsing, and exec preserves exit codes/signals.
No service is started, sync drained or message sent merely by opening help.

Tests: `python3 -m unittest tests.test_coach_cli`. They cover legacy names,
shortcuts, option forwarding, no-shell argument preservation, missing owners,
side-effect-free help, and actual child-process exit/cwd behavior.

Legacy help adapters: the session TUI ignores its arguments, and the older
Firestore CLI does not implement --help. Their help is rendered by the dispatcher
without launching either tool. Bare `coach firestore` also shows its usage;
actual synchronization requires an explicit pull/push/sync/watch subcommand.
All 18 Python tool groups have been checked with --help. A real clients query
also passed through the configured PATH from outside the repository.
