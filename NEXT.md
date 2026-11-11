- ~~Vite-8 Vorbeuge~~: esbuild-Tests + build.target Browserliste (modules/plan folgt plan-Pin).
# NEXT (coach-dev)

- [x] Katalog-Rechtsklick + `POST /fitness/inbox/draft` + Jefferson-Curl Pipeline-Smoke.
- [x] Shell: Klienten-SubTabs in Sidebar; Bottom-Nav Long-Press/Rechtsklick → SubTabs / Inbox / Mehr.
- [x] Inbox-SubTabs live in Sidebar + CF/SW-Push bei neuer `coachInbox`-Anfrage.
- [x] Chat-SubTabs für ungelesene Nachrichten + CF/SW-Push `onClientMessage`.
- [x] Inbox `github_pr`: Link „Auf GitHub öffnen“ statt Fake-Approve.
- [x] `firebase deploy` `functions:fitness:onCoachInbox` + `onClientMessage` (europe-west1, 2026-11-10).
- [ ] website-Submodule: nur Remote-erreichbare SHAs pinnen (Dependabot); lokal unpushed Landing `71f101a` ggf. im website-Repo pushen oder verwerfen.
- [ ] vos-coach Hosting (neuer SW für clientMessage/inboxRequest).
- [ ] Coach Sheet nach Do/Don't-Umbau live gegen Inbox-Records mit/ohne `source_snapshot` prüfen; ggf. deploy vos-coach.
- [ ] Vault-grounded Inbox-Enricher (Vitaltrainer-Corpus in Prompt/CI); Approve bleibt Coach.
- [ ] Submodul `fitness/catalog/kb` wieder als Gitlink + auf `c1419a7`+ (Inbox-Rollen-Doku) bumpen — blockiert bis Coach-only Inbox/Exercise-Deltas geklärt (TODO KB-Gitlink; Tree seit `710614d9`).
- [ ] Vite/Rolldown Upstream: Preload-Marker `__VITE_PRELOAD__<hash>` vs. Vite-Ersetzung nur Prefix — Workaround lokal; bei Vite-Upgrade prüfen ob Plugin/Skript noch nötig.
- [ ] uv-Tool `fitness` (alte editable `fitness-cli`) bereinigen/neu — globale Bins laufen über `coach-dev/bin/{anatomy-agent,fitness-catalog}`.
- [ ] Den neuen `Pages Docs`-Actions-Workflow bis zu einem erfolgreichen öffentlichen Pages-Deploy verifizieren.
- [ ] VitalOS-Postgres allgemeine Backend-Schicht unter Coach — siehe `hot/vitalos-postgres-backend-schicht.md` / Task `fe34e959-…` (warten auf Urgency).
- [x] `coach-api` Reload + `fuel_api: local`; fitness.env ohne vergiftete `DATABASE_URL`; fuelctl/deploy auf Coach `:9150`.
- [ ] Firestore-Mirror weiter entkoppeln falls Idle-RSS stört (Watchers nur in Sync-Daemon, nicht Coach-Request-Pfad).
- [ ] Eine Postgres-Instanz statt fuel/fitness/vitalos-Container — wenn Urgency (Task `fe34e959-…`).


-   **Fuel in-process:** live auf Coach `:9150`; VitalOS `:8000` nur Workspace-Fallback, kein Extra-Host ausbauen.
-   **Frontend-Serve Katalog-UI**: Coach-Dist statt Legacy-Fitness-SPA unter
    `/fitness/` (FIRE-Rest; Scope → `+ceo`). API lokal (`fitness_api: local`);
    Unit `fitness-preview` archiviert — offen bleibt nur der UI-Serve-Pfad.
-   **fitness-dev-KB-Kopie**: traegt weiter eine divergente KB-Kopie (nur noch
    Konsument). Beim naechsten Upstream-Merge Katalog-Drift beachten; Ausmisten der
    Kopie als separater Schnitt, sobald sicher keine Pipeline mehr dort liest.
-   ~~**Deploy-Formalisierung**~~: `./deploy.sh seed-kb` aus Coach-KB-Pin
    (2026-11-11 AL); manuelles rsync nicht mehr nötig.
-   ~~**Systemd-Quelle**~~: Repo-Unit `fitness/coach/deploy/coach-sync.service`
    = Coach-SOT (2026-11-10 AL); Live-Unit war schon angeglichen.


## Gemini CI-Agent follow-up

- [ ] Observe one genuine code-related red Coach CI run through repair and a green rerun. Production remains a manual release decision.
- [ ] Coach-Pages-Deploy nach dem neuen Docs-Commit verifizieren und die neue Seite `/README.html` prüfen.
- [ ] Gemini-Reparaturpfad nach dem Feld-Fix anhand eines isolierten roten Checks verifizieren: Diagnose, Commit, Check-Neustart und nachgelagerter Deploy.
