# NEXT (coach-dev)

- [ ] Den neuen `Pages Docs`-Actions-Workflow bis zu einem erfolgreichen öffentlichen Pages-Deploy verifizieren.


-   **Fuel-Upstream-Cutover** (optional): `/api/fuel` → VitalOS `:8000` bleibt
    bis Fuel/VitalOS-Freigabe; nicht per Directory-Migration „lösen“.
-   **Frontend-Serve Katalog-UI**: Coach-Dist statt Legacy-Fitness-SPA unter
    `/fitness/` (FIRE-Rest; Scope → `+ceo`). API lokal (`fitness_api: local`);
    Unit `fitness-preview` archiviert — offen bleibt nur der UI-Serve-Pfad.
-   **fitness-dev-KB-Kopie**: traegt weiter eine divergente KB-Kopie (nur noch
    Konsument). Beim naechsten Upstream-Merge Katalog-Drift beachten; Ausmisten der
    Kopie als separater Schnitt, sobald sicher keine Pipeline mehr dort liest.
-   **Deploy-Formalisierung**: ~/.aos/fitness/kb-Seed geschah manuell (rsync);
    deploy.sh-Seed-Pfad auf coach-dev umstellen waere der formale Schritt.
-   **Systemd-Quelle**: coach-sync.service wird noch aus
    fitness/coach/deploy/coach-sync.service installiert (jetzt Coach-Stand im
    Coach-Baum); Pfad in der Unit-DokuSnapshots aktuell.


## Gemini CI-Agent follow-up

- [ ] Observe one genuine code-related red Coach CI run through repair and a green rerun. Production remains a manual release decision.
- [ ] Coach-Pages-Deploy nach dem neuen Docs-Commit verifizieren und die neue Seite `/README.html` prüfen.
- [ ] Gemini-Reparaturpfad nach dem Feld-Fix anhand eines isolierten roten Checks verifizieren: Diagnose, Commit, Check-Neustart und nachgelagerter Deploy.
