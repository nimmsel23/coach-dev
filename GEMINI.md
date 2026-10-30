# Coach project instructions

Follow [AGENTS.md](AGENTS.md) and [Coach architecture](docs/COACH-ARCHITECTURE.md).

Coach is a Fitness fork providing the coach-facing interface. Its entrypoint is `coach.html` / `src/coach-main.jsx`; client-facing VitalOS lives in the `vitalos/` submodule on branch `coach`. Coach owns its training-program authoring and Firestore adapters. The Plan app remains the client-facing reader of the shared macrocycle data contract; Coach does not import source code from `plan-dev`.

Use `npm run dev` for the Coach Vite UI, `npm run build` for lint and build, and `npm start` for the local Python server (Catalog UI at `/`, Firebase Coach at `/coach/`). Hosting uses target `coach` in Firebase project `fitness-aos`. `npm run firebase` builds and deploys Coach; rules and shared Functions are not deployed here. The former `pwa/` parity workflow and Fitness systemd deployment do not apply.

Keep exercise IDs and shared Firestore contracts compatible with Fitness. Do not rename shared data keys, collections, or Firebase project IDs merely because they contain `fitness`.

The local Coach backend owns port 9150 and unifies `/api/fitness`, `/api/fuel` and `/api/relax`. Domain worker origins live in `coach-backends.json`; see `docs/COACH-SERVER.md` for service ownership and controls.
