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
- [x] **Frontend-Serve Katalog-UI:** Coach-Dist (`dist-catalog` / `COACH_CATALOG_DIR`)
      statt Legacy-Fitness-SPA unter `/fitness/` — erledigt: Default Katalog-Dist;
      Legacy nur mit `COACH_FITNESS_FRONTEND_DIR` (2026-11-09 AL).
- [ ] **Deploy-Formalisierung:** `~/.aos/fitness/kb`-Seed geschah manuell (rsync);
      `deploy.sh`-Seed-Pfad auf coach-dev umstellen.
- [ ] **Systemd-Quelle:** `coach-sync.service` wird noch aus
      `fitness/coach/deploy/coach-sync.service` installiert (Coach-Stand im
      Coach-Baum); Pfad in der Unit-Doku aktuell halten / auf Coach-Pfad ziehen.

## Beobachten (kein Bau ohne klaren Drift)

- [ ] **fitness-dev-KB-Kopie:** fitness-dev trägt weiter eine divergente KB-Kopie
      (nur noch Konsument). Beim nächsten Upstream-Merge Katalog-Drift beachten;
      Ausmisten der Kopie als separater Schnitt, sobald sicher keine Pipeline mehr
      dort liest.
