# Coach agent rules

The repository instructions are in `../AGENTS.md`; architecture and release commands are in `../docs/COACH-ARCHITECTURE.md`.

- Work in this Coach checkout or an explicitly created Coach worktree. Never switch to a Fitness worktree to edit Coach.
- Coach uses `dev`; its VitalOS client submodule follows `coach`. There is no Coach release checkout inside VitalOS.
- Use pnpm and the root Coach dependency versions. Do not restore obsolete `pwa/` sync or Fitness service deployment workflows.
- Commit completed scoped changes. Push only when the user requests it.
- Deploy only Coach Hosting from this repo. Firestore rules are owned by VitalOS.
