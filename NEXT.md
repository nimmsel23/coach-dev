# NEXT (coach-dev)

- [ ] Den neuen `Pages Docs`-Actions-Workflow bis zu einem erfolgreichen öffentlichen Pages-Deploy verifizieren.


-   **Frontend-Serve Katalog-UI**: Coach-Dist statt totem `:8100`-Preview
    (FIRE-Rest; Scope → `+ceo`). Inbox/Catalog-API läuft seit 2026-11-09 wieder
    lokal in coach-api (`fitness_api: local`) — Serve-Pfad der Catalog-UI ist offen.
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
