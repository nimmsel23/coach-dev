# Coach repository

Coach is the coach-facing product on `dev`. VitalOS is its client Shell, pinned as the `vitalos/` submodule tracking the VitalOS `coach` branch. See `docs/COACH-ARCHITECTURE.md` for checkout and release instructions. Do not add Coach beneath VitalOS or restore the former `vitalos/coach-app` release path.

Use pnpm. Commit scoped completed changes; do not push unless explicitly requested. Publish the VitalOS `coach` commit before pushing a changed parent gitlink. Preserve unrelated changes.

Coach owns Hosting preview/production via `.github/workflows/deploy-coach.yml` and `bin/coach-release`. Rules are owned by VitalOS. Do not deploy Firestore rules from Coach.
