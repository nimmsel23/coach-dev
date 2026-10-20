# Coach Git hooks

Activate with `git config core.hooksPath .githooks`.

- `pre-commit`: view documentation reminder, plus a blocking build for frontend changes.
- `pre-push`: retains GAS summary deployment for changes to `gas-coach-summary/` on `dev`.
- Hosting builds and deploys belong to Coach CI or `bin/coach-release`.
- `post-checkout`, `post-merge`, `post-commit`: no-op; Coach has no VitalOS parent dependency installation.

See [Coach architecture and releases](../docs/COACH-ARCHITECTURE.md).
