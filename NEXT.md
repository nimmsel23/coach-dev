- ~~Vite-8 Vorbeuge~~: esbuild-Tests + build.target Browserliste (modules/plan folgt plan-Pin).
# NEXT (coach-dev)

- [ ] Submodul `fitness/catalog/kb` auf fitness-Commit mit Inbox-Rollen-Doku bumpen (GitHub/Agents ≠ Coach-UI).
- [ ] Vite/Rolldown Upstream: Preload-Marker `__VITE_PRELOAD__<hash>` vs. Vite-Ersetzung nur Prefix — Workaround lokal; bei Vite-Upgrade prüfen ob Plugin/Skript noch nötig.
- [ ] uv-Tool `fitness` (alte editable `fitness-cli`) bereinigen/neu — globale Bins laufen über `coach-dev/bin/{anatomy-agent,fitness-catalog}`.
- [ ] Den neuen `Pages Docs`-Actions-Workflow bis zu einem erfolgreichen öffentlichen Pages-Deploy verifizieren.
- [ ] VitalOS-Postgres allgemeine Backend-Schicht unter Coach — siehe `hot/vitalos-postgres-backend-schicht.md` / Task `fe34e959-…` (warten auf Urgency).
- [ ] `coach-api` neu laden, damit `attach_fuel_api` live greift (User-Restart); Shell ohne vergiftete `DATABASE_URL` aus fitness.env.


-   **Fuel in-process:** Coach attach ist Code-seitig da; Live-Cutover = Unit-Reload + fuelctl/Deploy-Texte ggf. anpassen (nicht VitalOS-:8000 als Extra-Host weiter ausbauen).
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
