# coach-backends.json

Registry **only for proxied** domain workers. Local keepers are not listed.

| Key | Upstream | Status (2026-11-09) |
| --- | --- | --- |
| `fuel` | `http://127.0.0.1:8000/api/fuel` | Intentional — VitalOS Docker `vitalos_api`. Fuel source/data stay Fuel-owned. |

**Not listed (in-process on `:9150`):**

- Fitness / catalog / inbox → `attach_fitness_api()` (`fitness.api`)
- Relax → embedded via `src/relax_api.py` → `~/dev/relax-dev/server.py`

Do **not** re-add `"fitness": "http://127.0.0.1:8100"` (dead preview). Do not point
any backend at Coach’s own `:9150` (self-proxy rejected).

See [docs/COACH-SERVER.md](docs/COACH-SERVER.md).
