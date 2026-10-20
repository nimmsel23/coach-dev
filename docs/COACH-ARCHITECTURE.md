# Coach and its client Shell

Coach is the coach-facing product, developed on `coach-dev/dev`. Its client Shell is the VitalOS repository at `vitalos/`, tracking the VitalOS `coach` branch. A gitlink pins the exact Shell commit. VitalOS no longer contains a direct Coach submodule, workspace package, or Coach deployment job.

```text
coach-dev/                  Coach product (dev)
  vitalos/                  VitalOS client Shell (coach)
    fitness-app/, plan-app/, ...
```

## Checkout and updates

```sh
git submodule update --init vitalos
# Initialize client apps only when working on/building that Shell:
git -C vitalos submodule update --init --recursive
```

General VitalOS changes start on its `master` branch. Merge them into `coach` deliberately; retain the exclusion of Coach. Do not re-add Coach beneath VitalOS. Existing historical Coach checkouts nested inside pinned Plan versions are separate legacy dependencies; do not update them to a Coach commit that contains VitalOS.

To update the Shell pin, commit changes on `vitalos/coach`, publish that branch when authorized, then commit the `vitalos` gitlink in Coach. `git submodule update --remote vitalos` follows remote `coach`; normal checkout uses the recorded commit.

The shared Plan editor resolves `.shared/plan` (pinned CI checkout), then `vitalos/plan-app`, then local sibling Plan checkouts. The Coach build does not require recursively installing the client Shell.

## Coach releases

- Pushes on `dev` build the Coach preview (24-hour `dev` channel).
- Manually run Coach's `Deploy Coach` workflow on `dev` with `production=true` to publish `https://vos-coach.web.app`.
- Locally, `bin/coach-release --yes` builds and deploys the committed, clean `dev` checkout. `--dry-run` prints the command. This command does not push or merge Git branches.
- `npm run firebase` also builds and deploys the current checkout directly.
- `~/vitalos/bin/coach-release` is a compatibility entrypoint to Coach's command. Coach is excluded from `vos-release --all`.
- Firestore rules remain owned by VitalOS. Coach only deploys `hosting:coach`.
- VitalOS Shell production remains on `master`; the `coach` branch has no automatic Shell production deploy.

Initial migration is committed locally; publish VitalOS `coach` before publishing the Coach parent pointer. No push or Hosting deployment is part of the structural migration. The old clean `~/vitalos/coach-app` checkout, including ignored local files, is retained at `~/coach-dev/.worktrees/legacy-vitalos-coach`.
