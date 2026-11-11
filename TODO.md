# TODO (coach-dev)

**Priorität:** `FIRE.md` (Hits) → diese Liste → `HOT.md` ist nur Potential
(Ideen, keine Auto-Ausführung). Der AL arbeitet zuerst `FIRE.md` leer (oder bis
Blocker), erst danach diese Liste.

Arbeitsqueue zweiter Stufe. Steht hier etwas und `FIRE.md` ist leer/blockiert →
nächster AL-Lauf arbeitet es ab (Owner-Klarstellung 2026-11-09: kein
CEO-`+hit`-Gate). Erledigt abhaken/streichen; Folgen hier oder in `NEXT.md`
nachziehen. `FOCUS.md` / `FREEDOM.md` aktiv; `FRAME.md` optional später.

## Offen

- [ ] **Fuel-Upstream-Cutover (optional):** `/api/fuel` noch Proxy → VitalOS
      `:8000`; in-process erst nach Fuel/VitalOS-Freigabe — nicht per Tree-Move.
- [ ] **KB-Gitlink wiederherstellen:** Seit `710614d9` ist `backend/fitness/catalog/kb`
      ein vendored Tree (040000), obwohl `.gitmodules` weiter Submodul
      `nimmsel23/fitness` deklariert. Vor Restore: Coach-only Inbox
      `inbox_jefferson_curl_pipeline.yml` nach `~/dev/fitness` übernehmen oder
      bewusst verwerfen; dann Gitlink auf `origin/main` (mind. `c1419a7`
      Inbox-Rollen-Doku) setzen. Kein Blind-rsync — Exercises `020.yml` /
      `approved_from_firebase.yml` + Inbox divergieren bidirektional.
- [x] **Frontend-Serve Katalog-UI:** Coach-Dist (`dist-catalog` / `COACH_CATALOG_DIR`)
      statt Legacy-Fitness-SPA unter `/fitness/` — erledigt: Default Katalog-Dist;
      Legacy nur mit `COACH_FITNESS_FRONTEND_DIR` (2026-11-09 AL).
- [x] **Deploy-Formalisierung:** `./deploy.sh seed-kb [--dry-run]` seedet
      `~/.aos/fitness/kb` aus `fitness/catalog/kb` (`--ignore-existing`);
      `paths.py`-Fallback → coach-dev. (2026-11-11 AL)
- [x] **Systemd-Quelle:** `coach-sync.service` — Repo-Unit = Coach-SOT
      (`WorkingDirectory`/`KB`/`PYTHONPATH`/`ExecStart` → `coach-dev` + uv-Tool
      `fitness`; Install-Kommentar + `docs/COACH_APP.md` nachgezogen). (2026-11-10 AL)

## Beobachten (kein Bau ohne klaren Drift)

- [ ] **website-Gitlink:** Submodule-SHA muss auf Remote existieren (Dependabot/CI clonen rekursiv). Lokal unpushed `71f101a` nicht pinnen.

- [x] **fitness-dev-KB-Kopie:** Beobachtet 2026-11-11 AL — fitness-dev hat keine
      Dateikopie mehr (`fitness/catalog/kb` → Symlink `~/dev/fitness`). Drift-Ort
      ist Coach: vendored Tree statt Gitlink (siehe TODO KB-Gitlink).
