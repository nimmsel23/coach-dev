# Coach repository

Coach is the coach-facing product on `dev`. VitalOS is its client Shell, pinned as the `vitalos/` submodule tracking the VitalOS `coach` branch. See `docs/COACH-ARCHITECTURE.md` for checkout and release instructions. Do not add Coach beneath VitalOS or restore the former `vitalos/coach-app` release path.

Use pnpm. Commit scoped completed changes; do not push unless explicitly requested. Publish the VitalOS `coach` commit before pushing a changed parent gitlink. Preserve unrelated changes.

Coach owns Hosting preview/production via `.github/workflows/deploy-coach.yml` and `bin/coach-release`. Rules are owned by VitalOS. Do not deploy Firestore rules from Coach.

Coach owns the shared backend on port 9150 (`server.py`, `coach-api.service`). Domain APIs dispatch through `coach-backends.json`; preserve existing domain data ownership and legacy Fitness routes. Never configure a domain upstream to loop back to Coach. Local `klienten-dev` and `workspace` symlinks are context only, not public static roots.
