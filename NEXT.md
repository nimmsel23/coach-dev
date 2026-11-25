- [ ] Erweiterte CLI-Profile und globalen Rezeptkatalog in der Web-Oberfläche fertig integrieren; explizite Klienten-Zustellung separat umsetzen und abnehmen. CLI/SQLite sind abgeschlossen; Provider-Verfügbarkeit bleibt extern zu prüfen.
- [ ] Nach autorisiertem Coach-API-Reload FUEL.md-Regeln im echten Coach-Login prüfen. Vollständigen Paleo-Wochenlauf erst bei geklärtem HTTP 402 erneut testen; vier echte Gerichte liegen geprüft vor, drei Slots waren Providerfehler.
- [ ] Ernährungsentwurf mit echtem Coach-Login und Gemini abnehmen; Rezeptmengen/Nährwerte gegen bestehenden Fuel-Katalog berechnen und explizite Fuel-Zielbereitstellung mit passender Versionierung ergänzen. Browserentwürfe sind noch keine Cloud-Pläne.
- [ ] Lokal-/Cloud-Planübersicht mit echten Coach-Konten prüfen: Cloud-only, fehlendes Gegenstück, andere Herkunft und Abweichung der sourceLocalVersion. Inhalts-/Snapshot-Vergleich ist noch offen; gleiche Herkunftsversion bestätigt keine Inhaltsgleichheit.
- [ ] Nach autorisiertem Coach-API-Reload die neue Workspace-Übersicht aus Firebase über Tailscale mit echtem Coach-Login abnehmen; UID-Zuordnungen und Versandversion prüfen.
- [ ] 14-Tage-Aktivitätsstatus mit angemeldetem Coach und echten Fitness-Lebenszeichen prüfen; weitere Apps als Quellen anbinden.
# NEXT (coach-dev)

## Ausgelassen seit C-Suite-MVP (2026-11-24) — bewusst / noch offen

### Plan-UFO (diskutiert, nicht gebaut)
- [ ] Fusion Schmiede-PlanEditor + `modules/plan` PlanEditor → **ein** Desktop-Editor (UFO, kein Calzone).
- [ ] Slice 1: Converter `plan.json` → `training-plans/` + Desktop-Shell Speichern.
- [ ] Eine Cloud-SOT: Deliver → `macrocycles` only; Schmiede-Routinen-Push abschaffen.
- [ ] Auto-Push nach Schmiede-Save abschalten; nur explizites „An App übergeben“.
- [ ] Alte Editoren abhängen (Schmiede-PlanTab + Local-Studio-UI → UFO).
- [ ] Drift-UI Disk vs. Firestore; `canDeliver`/UID-Guard härten.
- [ ] vos-coach Desktop-Layout **nicht** „fixen“ als Ersatz — Coach-Werkstatt bleibt coach-dev.

### C-Suite / CEO-Portal (MVP da, Lücken)
- [x] Freigabe → **Kopieren** + mailto (kein Auto-WhatsApp); Approve schreibt Status + Clipboard.
- [x] Firebase-Adapter live (`_shared/runtime.js`, Fallback localStorage wenn Rules/Auth fehlen).
- [x] `firestore.rules.part` für `csuite/{role}/{approvals,threads,agent_logs}` (isCoach) — Deploy Rules = VitalOS/Owner.
- [x] iframe `postMessage` `csuite-auth` vom CEO-Portal (same-origin Auth teilt Persistenz).
- [x] Rolle **CSO** angelegt + CEO-Tab/Hub.
- [x] `/coach/coo` → Vanilla dashboard; React unter `/coach/coo/react`.
- [ ] CEO-Portal Live-Smoke mit Google-Login (manuell am Desktop).
- [ ] `git push origin dev` (beim Stopfen mit erledigen).
- [ ] Hosting-Deploy vos-coach mit `dist-coach/workspaces/` (explizites Deploy-OK nötig).
- [ ] Tailscale Serve `/workspaces` Root — Workaround `/coach/workspaces` bleibt (Operator/sudo).

### Explizit verworfen / nicht gewollt im MVP
- ~~Firestore als Brain-SOT / `sync-agents.yml` Git→Firestore~~ — Git bleibt Brain-SOT (`fetch` der MD/JSON).
- ~~vos-coach Mobile-App-Layout als Coach-Authoring~~ — coach-dev = Desktop-only, kein Klient sieht es.
- ~~Halbe Pizza / Calzone (Simple-Mode vs. Power-Mode)~~ — UFO-Zielbild festgehalten, Bau ausstehend.

### Frühere NEXT-Punkte (C-Suite-bezogen)
- [x] C-Suite Bridge `POST /api/csuite/run` (CLI + Gemini + gh-Issue).
- [x] CMO/CPO/CTO/CFO (+ COO dashboard.html) Workspaces + Hub-Links + CEO-Portal.
- [ ] Freigabe-Klick → echter Outbound (Mail/WhatsApp) oder Copy-only CTA; Firestore-Rules für `csuite/**`.
- [ ] C-Suite: Tailnet-Smoke + Firebase-Adapter live (siehe oben).

- ~~Vite-8 Vorbeuge~~: esbuild-Tests + build.target Browserliste (modules/plan folgt plan-Pin).
- [ ] Nach dem Coach-API-Reload die neue Taskwarrior-Statusanzeige live prüfen; danach einen explizit ausgewählten Klient/Plan als Pilot synchronisieren. Code und Browser-Build sind fertig, der laufende Prozess wurde nicht neu gestartet.
- [ ] Mit einer angemeldeten UID aus einem sichtbaren Klientenworkspace einen echten Fitness-App-Aufruf prüfen und den resultierenden `tractionDaily`-Event in der lokalen Coach-Konsole nachweisen. Live-Bundle und Regeln enthalten die Implementierung; die aktuelle Abfrage hat noch 0 Events.
- [x] Katalog-Rechtsklick + `POST /fitness/inbox/draft` + Jefferson-Curl Pipeline-Smoke.
- [x] Shell: Klienten-SubTabs in Sidebar; Bottom-Nav Long-Press/Rechtsklick → SubTabs / Inbox / Mehr.
- [x] Inbox-SubTabs live in Sidebar + CF/SW-Push bei neuer `coachInbox`-Anfrage.
- [x] Chat-SubTabs für ungelesene Nachrichten + CF/SW-Push `onClientMessage`.
- [x] Inbox `github_pr`: Link „Auf GitHub öffnen“ statt Fake-Approve.
- [x] Übungs-Inbox als GitHub-Issues in `nimmsel23/fitness` (Inbox-Bot: /approve, /reenrich, /unlink …); App listet die Issues (`githubInbox.js`), 2026-11-20.
- [ ] Coach Sheet (neu: Sheet/Bearbeiten/Rohdaten) live prüfen; Live-Deploy (Deploy Coach, production=true) steht noch aus.
- [ ] Ausbaustufen-Issues (Label `ausbaustufe`, aus der Dashboard-Tiefenanalyse) sichten: schließen = erledigt/verworfen.
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
- [ ] Org-Dashboard-GAS (vos `2dbfe1e`): Der Owner muss im Script-Editor einmal `setup` ausführen und den Zugriff auf Tabellen erlauben. Danach einen Test-POST schicken; bis dahin liefert die Web-App eine Google-Seite statt JSON. Außerdem das Ergebnis des CI-Laufs „Publish dashboards“ prüfen.
- [ ] Antworten aus dem Sheet „Org-Dashboard Antworten“ kommen noch nicht nach `~/workspace/team/owner/ANTWORTEN.md`, dorthin schreibt bisher nur coach-api.
- [ ] Offen und vom Owner nicht entschieden: Laut Owner hat jeder Bereich ein eigenes Repo, und `dashboards` dient nur zum Veröffentlichen. Trotzdem überschreibt der vos-Generator die Ordner `coach/`, `business/`, `creator/`, `workspace/`, `vitalos/` und `coaching/` mit eigener Rollenprosa. Ein Coach-Dashboard sollte aus `nimmsel23/coach` kommen (eventuell über Firebase). Nichts entfernen, ohne den Owner ausdrücklich zu fragen.

-   **Fuel in-process:** live auf Coach `:9150`; VitalOS `:8000` nur Workspace-Fallback, kein Extra-Host ausbauen.
-   **Frontend-Serve Katalog-UI**: Coach-Dist statt Legacy-Fitness-SPA unter
    `/fitness/` (FIRE-Rest; Scope → `+ceo`). API lokal (`fitness_api: local`);
    Unit `fitness-preview` archiviert — offen bleibt nur der UI-Serve-Pfad.
-   ~~**fitness-dev-KB-Kopie**~~: Symlink → `~/dev/fitness` (2026-11-11 AL);
    Restore-Gitlink bleibt unter TODO KB-Gitlink.
-   ~~**Deploy-Formalisierung**~~: `./deploy.sh seed-kb` aus Coach-KB-Pin
    (2026-11-11 AL); manuelles rsync nicht mehr nötig.
-   ~~**Systemd-Quelle**~~: Repo-Unit `fitness/coach/deploy/coach-sync.service`
    = Coach-SOT (2026-11-10 AL); Live-Unit war schon angeglichen.


## Gemini CI-Agent follow-up

- [ ] Observe one genuine code-related red Coach CI run through repair and a green rerun. Production remains a manual release decision.
- [ ] Coach-Pages-Deploy nach dem neuen Docs-Commit verifizieren und die neue Seite `/README.html` prüfen.
- [ ] Gemini-Reparaturpfad nach dem Feld-Fix anhand eines isolierten roten Checks verifizieren: Diagnose, Commit, Check-Neustart und nachgelagerter Deploy.

**Gemini-Review (potenzielle blinde Flecken, 2026-11-13):**
*   **Ungeprüfte Automatisierung:** Die Behauptung, dass nach jedem geloggten Workout für Klient Jakob automatisch eine WhatsApp-Zusammenfassung verschickt wird, wurde nicht durch einen tatsächlichen Test (z.B. das Loggen eines Workouts und Überprüfung des WhatsApp-Versands) verifiziert.
*   **Teilweise verifizierte `coach clients`-Optionen:** Claude hat selbst berichtet, dass nur die Optionen `-l` und `-s` mit echten Daten getestet wurden, während andere Filteroptionen lediglich über die `--help`-Ausgabe geprüft wurden.
*   **Ungeprüfte Annahme zur KB-Synchronisation:** Der Ersatz des kaputten `coach data-sync kb` durch `coach catalog push-changed` erfolgte ohne vollständige Verifikation, ob `push-changed` *alle* Datenbereiche abdeckt, die `data-sync kb` potenziell synchronisiert hätte, insbesondere da die `data-sync --help`-Ausgabe fehlerhaft war.

**Gemini-Review (potenzielle blinde Flecken, 2026-11-21):**
*   **Ratenbegrenzung:** Die Implementierung der Ratenbegrenzung (`CacheService.getScriptCache()`) ist pro Nutzer, nicht global für die gesamte Web-App, was die Annahme einer „max. 30 Einträge pro Minute“ für das Formular insgesamt untergräbt.
*   **Irreführender Kommentar:** Der Kommentar `/* offline: bleibt lokal gespeichert */` in `src/lib/desk.tsx` ist nicht zutreffend, da keine clientseitige Persistenz für fehlgeschlagene Anfragen implementiert wurde.
*   **`setup()`-Berechtigungen:** Die `setup()`-Funktion zum Erstellen des Sheets könnte über die angegebene `spreadsheets`-Berechtigung hinaus zusätzliche oder explizitere Nutzerzustimmungen für `SpreadsheetApp.create` erfordern, was nicht vollständig verifiziert wurde.

**Gemini-Review (potenzielle blinde Flecken, 2026-11-24):**
*   **Ungeprüfte Annahme zur `local_only`-Guard-Abdeckung:** Die Anpassung der `local_only`-Guard-Logik für Tailnet-Zugriff erfolgte explizit in `coach_local_plans.py`. Es wurde nicht explizit verifiziert, ob andere lokale UIs wie die Konsole (die von `coach_legacy_clients.py` bedient wird) dieselbe aktualisierte Guard-Funktion verwenden oder eine eigene, potenziell noch blockierende Logik besitzen.
*   **Mangel an konkreten Details im Konflikt-Audit:** Der Audit zu Widersprüchen zwischen `coach-dev/src` und `klienten-ui/schmiede-src` identifiz
