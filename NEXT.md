# NEXT.md — fitness-dev (repo-lokal)

Aktive Arbeitsliste für dieses Repo. Wird vom `PreCompact`-Hook
(`.claude/hooks/pre-compact-fill-docs.sh`) automatisch mit offen
gebliebenen Punkten aus abgeschlossenen Sessions ergänzt.
Unterscheidung zu `TODO.md`: hier steht *was als Nächstes konkret dran
ist*, dort steht *was im Makro insgesamt noch zu tun ist*.

- ClientsPanel-Detail-Sub-Tabs (`ClientWorkoutsFeed`/`ClientHabitCycle`/
  `ClientPlan`/`ClientTrainingPlans`/`AssignPlan`) haben aus dem
  Coach-Redesign (2026-08-31) nur die automatische CSS-Kaskade geerbt,
  nicht die tiefere `cc-panel`/`cc-dossier`-Struktur wie CatalogBrowser/
  Klienten-Roster.
- Die Zod-Umstellung in `server.mjs` deckt jetzt praktisch alle API-
  Routen ab; offen ist eher Nachschärfung einzelner Response-Schemas
  (der breite Rollout nutzt bewusst oft `z.any()`/lockere Objekt-Schemas
  statt strikter Domain-Shapes).
- `/fitness/coach/habit-cycle/:clientUid` fehlt weiterhin im
  Python-Backend (Details: `docs/BACKEND.md`, Claude-Memory
  `project_server_mjs_frontend_only_migration`).
- 5 Inbox-Drafts ohne wger-/yuhonas-Quelle (`inbox_cable_row_close_grip`,
  `inbox_jefferson_curl`, `inbox_scapula_priming`, `inbox_skin_the_cat`,
  2× Yoga-Headstand) brauchen echten Gemini-Reenrich-Pass, da keine externe
  Quelle existiert.
- Zwei identische leere Yoga-Headstand-Inbox-Drafts (`inbox_20260831_161715_3b9447`,
  `inbox_20260831_161759_cc51fb`) sind ein Duplikat — einer sollte
  tombstoned/gelöscht werden, noch nicht entschieden welcher.
- Die vom `source-consistency`-Audit gefundenen 18 echten Muskel-Flags
  (u.a. `clean_snatch`, `dumbbell_lateral_raise`, `face_pull`) sind noch
  nicht einzeln manuell durchgegangen/korrigiert worden — der Audit-Check
  selbst ist fertig, die inhaltliche Review-Arbeit an den gefundenen Drafts
  steht noch aus.
- Der neue `PreCompact`-Hook (`.claude/hooks/pre-compact-fill-docs.sh`)
  wurde nur mit simuliertem Fake-Input getestet (JSON-/Bash-Syntax, Lock-
  Verhalten), noch nicht gegen einen echten Compact-Trigger — erster
  echter Lauf sollte kurz verifiziert werden (füllt er TODO/RESULTS/NEXT
  sinnvoll, committet der PostToolUse-Hook danach sauber).
- Session-Tab-Rebuild Phase 1–4 ist **komplett und deployed** (2026-09-05
  per `fitness-release --yes`: alle `dev`-Commits gepusht, nach `vitalos`
  gemergt, nach `fitness-aos.web.app` deployed — inkl. `e472849`
  Macrocycles-Proxy, `81122fc` server.mjs-TODO, `2893ede` SOT-Doku, Details
  in RESULTS.md). Die früher hier gelisteten "nur lokal auf dev / nicht
  gepusht"-Punkte sind damit erledigt, nicht erneut als offen behandeln.
  Aus der Rebuild-Arbeit offen geblieben:
  - **Browser-Durchklick-Verifikation** von Phase 3 Stück 4 + Phase 4
    Stück 1 wurde von Claude mehrfach angemahnt, aber nie durchgeführt:
    Übung hinzufügen, Slot anlegen, GPS-Start/Stop, Auto-Save beobachten
    (die `savingRef`-Guard-Race), Sidebar/Settings/Gate-Modal öffnen
    (neuer `activeModal`-State + `SessionModalsLayer.jsx`). Steht jetzt
    gegen den live-deployten Stand aus.
  - **Gate-Sub-Tab-Nav-Drift**: `src/constants/NavigationItems.js` vs.
    `SessionGateCard.jsx::SESSION_NAV_ITEMS` pflegen dieselben 5 Sub-Tab-IDs
    unabhängig (Label/Reihenfolge/`comingSoon`-Flag driften). Nur in
    `PHASE4_TODO.md` dokumentiert — braucht eine explizite User-Rückfrage,
    bevor vereinheitlicht wird (Grundsatz `never_unify_divergent`).
  - `getPlanSuggestion()` bleibt bewusst komplett divergent zwischen
    `local`/`firestore` — nicht als Aufräumaufgabe behandeln.
- CI-Blocker-Fix (`@vos/cross-app-aliases` als `optionalDependencies` in
  `fuel-dev`/`habits-dev`, `vitalos/package-lock.json` neu generiert) wurde
  gepusht, aber die dadurch neu getriggerten GitHub-Actions-Runs
  (`gh run rerun`) wurden nicht mehr bis zum Abschluss verifiziert — Status
  noch offen, ob sie tatsächlich grün durchlaufen.
- Der versehentliche Live-Redeploy von `fuel-os.web.app` (Nebenwirkung des
  CI-Fix-Pushs nach `fuel-dev`/`master`) sollte vom Nutzer selbst
  gegengeprüft werden (funktioniert die App noch wie erwartet) — wurde in
  dieser Session nicht mehr verifiziert.
- Zwei ungeklärte fachliche Detailfragen aus dem Session-Tab-Audit bleiben
  offen: ob `AssignPlan.jsx` (Coach) und `AssignedMacrocycles.jsx`
  (Plan-Tab) bewusst zwei Oberflächen für dieselben Makrozyklus-Daten sind
  oder Doppelarbeit, wurde nicht geprüft.
- Coach-Inbox Source-Merge (2026-09-06) ist als expliziter
  `Verbinden`-Flow umgesetzt: Firebase-Coach-Tab kann Kandidaten ueber den
  lokalen FastAPI-Prod-Server in Firestore/YAML-Drafts verlinken. Desktop nutzt
  `http://127.0.0.1:6100/fitness`; Firebase Hosting nutzt per Default den
  Tailscale-Funnel `https://ideapad.tail7a15d6.ts.net/fitness/fitness`.
  Offen bleibt ein separater Schritt:
  `approveInbox()` im
  Firebase-DB-Layer laeuft noch direkt gegen Firestore; falls Firebase-Approve
  auch lokale `kb/exercises/*.yml` erzeugen soll, muss Approve ebenfalls ueber
  den lokalen `:6100`-Pfad laufen und Firestore danach nur spiegeln.
- Direkte Fitness-Fuel-Crossovers sind nicht vorgesehen. Der alte
  `@fuel/store.js`-Headerimport und Fuel-Firestore-Re-Export wurden entfernt;
  bei neuen Nutrition-Anforderungen nicht in Fitness importieren, sondern als
  getrennten Fuel-Surface behandeln.
- Die 2026-09-06-Session-Tab-Änderungen (weiterer `useSession.js`-Hook-Split
  auf 357 Z., Tastaturnavigation ESC/Alt+Pfeil/Set-Grid, Activity-Typ-
  Einzelmodule, "+Workout"-Button-Ausblendung bei leerem Tag + Live-Pill-
  Labels via `classifySession()`, `moveSessionToDate()`-Duplizierungs-Fix,
  Verlaufs-Trash-Button in `SessionHistory.jsx`, scrollbare Datumsleiste
  `useDayStrip.js`) sind via `fitness-release --yes` deployed, aber **von
  Claude nie im Browser durchgeklickt**. Verhaltensrelevant und noch
  ungetestet: Session am falschen Datum löschen/verschieben (der eigentliche
  User-Painpoint), die Tastatur-Shortcuts, Slot-DnD-Reorder, Datums-Slider
  auf dem Handy.
- `1fc2758` (Scrollbar im Date-Picker-Strip via `.no-scrollbar` ausblenden)
  und `c6a3a65` (Session Gate poppt nicht mehr bei explizitem Datum auf) sind
  am 2026-09-07 via `fitness-release --yes` deployed (Submodule-Bump
  `ba3a0ae`) — beide live auf `fitness-aos.web.app`. Offen bleibt nur die
  visuelle/funktionale Kontrolle im Browser:
  - Date-Picker-Leiste auf Desktop **und** iOS-PWA wirklich weg, ohne dass
    das horizontale Wischen leidet.
  - Gate-Fix durchklicken: bei per Day-Strip/Kalender-Icon gewähltem
    nicht-heutigem Datum darf das Session-Gate-Sheet nicht aufpoppen; bei
    echtem Wechsel auf heute weiterhin schon. Nur Build-verifiziert, von
    Claude nie im Browser getestet.
  - CI-Run dieses Release-Pushs (`vitalos` GitHub Actions, "Deploy Fitness
    PWA" + "Deploy VitalOS Shell") wurde nach `fitness-release` nicht mehr
    per `gh` gegengeprüft.
- `useSession.js` (jetzt 357 Z.) ließe sich weiter entschlacken (Day-Sessions-
  /Plan-Hint-Effekt, ggf. `buildSessionPayload`/`save` als Parameter-Bag) —
  vom Nutzer als optionales Housekeeping eingestuft, nicht beauftragt.
- `boxing` in `ACTIVITY_MUSCLE_GROUPS` (`src/constants/ActivityConstants.js`)
  ist ein Ausreißer — nicht in der 10-Typen-Liste, hardcodiert. Bewusst
  stehen gelassen; bei Bedarf klären, ob es ein echter 11. Activity-Typ
  werden soll.
- Parallele Subagenten am selben Repo künftig in isolierten Worktrees laufen
  lassen — in dieser Session haben zwei nicht-isolierte Agenten sich beim
  Committen (`git commit --amend`) gegenseitig Dateien zurückgesetzt (in
  `17a283c` repariert, nichts verloren).
- `85781f7` (Kraft/Ausdauer-Wechsel bei befüllter Session legt neue Session an,
  `switchSessionMode` via `sessionHasLoggedWorkout()`) ist am 2026-09-07 via
  `fitness-release --yes` nach Staging/`fitness-aos.web.app` (Submodule-Bump
  `dcbf15d`) **und** via `pkexec fitnessctl prod deploy` nach Prod `:6100`
  deployed. Nur Build-verifiziert, von Claude nie im Browser durchgeklickt.
  Offen:
  - Kraft-Session mit Übungen anlegen → auf Ausdauer switchen → etwas loggen:
    verifizieren, dass eine **neue** Session entsteht und die ursprüngliche
    Kraft-Session erhalten bleibt (nicht überschrieben). Gegenrichtung
    (Ausdauer → Kraft) genauso. Leere Session muss weiterhin in-place wechseln.
  - CI-Run dieses Release-Pushs (`vitalos` GitHub Actions, "Deploy Fitness PWA" +
    "Deploy VitalOS Shell") wurde nach `fitness-release` nicht mehr per `gh`
    gegengeprüft.

## Claude Handoff - Firebase Coach-Inbox / Fuel-Grenze (2026-09-06)

Kontext: Der Coach-Tab ist die offene Baustelle. Inbox-Items kommen aus Firestore, lokale Source-/KB-Arbeit muss aber ueber den lokalen Fitness-Prod-Server auf Port 6100 laufen. Der Tailscale Funnel routet nun `/fitness/` auf `http://127.0.0.1:6100/`.

Aktueller Arbeitsstand in diesem Tree:
- Firebase-Coach-API-Base ist nicht mehr nur hart `127.0.0.1`: `src/lib/db/firestore/core.js` nutzt `localStorage["fitness-local-api-base"]`, dann `VITE_LOCAL_FITNESS_API_BASE`, dann auf Firebase Hosting den Funnel `https://ideapad.tail7a15d6.ts.net/fitness/fitness`, sonst Desktop-Fallback `http://127.0.0.1:6100/fitness`.
- `BRIDGE_API_BASE` nicht wieder einfuehren. Der Coach-Inbox-Vertrag ist der Fitness-Prod-Server auf 6100.
- Direkte Fitness-Fuel-Crossovers sind nicht gewollt. `src/components/common/UserProfile.jsx` nutzt jetzt Fitness-`UserContext` statt `@fuel/store.js`; `src/lib/db/index.firestore.app.js` exportiert keine Fuel-Firestore-History mehr, sondern Fitness-Stubs fuer alte Nutrition/Supplement-History-Namen.
- `vite.config.js` entfernt `@fuel` aus den Cross-App-Aliases, auch wenn `@vos/cross-app-aliases` den Alias liefern sollte. Neue Fitness-Imports aus `@fuel/*` sollen dadurch nicht still funktionieren.
- Firebase-`approveInbox()` in `src/lib/db/firestore/inbox.js` versucht jetzt zuerst `POST ${LOCAL_FITNESS_API_BASE}/inbox/{id}/approve` mit `uid`, `doc_id` und `current_data`. Nur wenn der lokale Coach-Server nicht erreichbar ist, faellt es auf den direkten Firestore-Batch zurueck.
- FastAPI `fitness/api/routers/exercises_inbox.py` akzeptiert beim Approve jetzt JSON-Body, kann aus `current_data` notfalls eine lokale Inbox-YAML erzeugen, ruft `approve_inbox_entry()` auf und spiegelt `status: approved` plus Expert-Datensatz nach Firestore zurueck.
- `server.mjs` Proxy fuer `/fitness/inbox/{id}/approve` reicht JSON-Body weiter; live auf 6100 ist aber FastAPI/uvicorn direkt, nicht `server.mjs` als Edge.
- `docs/FIREBASE.md`, `RESULTS.md`, `TODO.md` dokumentieren Web SDK vs Admin SDK vs lokales Backend, Funnel, Fuel-Grenze und Coach-Approve-Stand.

Bisherige Verifikation:
- `npm run build -- --mode firebase` lief nach Entfernen der Fuel-Imports gruen und ohne Fuel-Import-Warnings; transformierte Module gingen von 4515 auf 4184 zurueck. Uebrig war nur die bekannte Chunkgroessen-Warnung.
- `curl https://ideapad.tail7a15d6.ts.net/fitness/health` antwortete mit FastAPI-Prod (`ok: true`, `port: 6100`).
- CORS-Preflight gegen `https://ideapad.tail7a15d6.ts.net/fitness/fitness/inbox/example/link-source` antwortete 200 mit `access-control-allow-origin: *`.

Noch vor finalem Deploy/Vertrauen pruefen:
- Nach dem Approve-Umbau erneut `npm run build -- --mode firebase`, `node --check server.mjs` und `python -m py_compile fitness/api/routers/exercises_inbox.py` laufen lassen.
- Browser-Durchklick gegen Firebase Hosting mit laufendem 6100: Source verbinden -> Reenrich -> Approve.
- Danach lokal pruefen, ob `fitness/catalog/kb/exercises/*.yml` erzeugt wurde, und in Firestore pruefen: `fitness/{uid}/inbox/{doc_id}.status == approved` sowie `fitness/kb/exercises/{exercise_id}` existiert.
- Wenn der lokale Server nicht erreichbar ist, greift bewusst der Firestore-Fallback; der erzeugt keine lokale YAML. Das ist akzeptabler Fallback, aber nicht der Coach-Workbench-Idealpfad.


## Claude Handoff - Coach-Inbox Local-First Cache-Regel (2026-09-06)

Neue Architekturentscheidung: Fuer die Coach-Inbox ist der lokale Fitness-Prod-
Server auf `6100` jetzt der Owner. Firestore ist nur Cache/Fallback/Offline-
Warteschlange. Nicht wieder Firestore-primary machen.

Konkrete Stellen:
- `src/lib/db/firestore/inbox.js::getInbox()` und `getGlobalInbox()` lesen zuerst
  `${LOCAL_FITNESS_API_BASE}/inbox`; Firestore-Items werden nur bei local fail als
  `cache_source: "firestore_cache"` und `offline_cache: true` angezeigt.
- `sendToInbox()` queued zuerst lokal via `/fitness/inbox/queue`; Firestore ist
  nur Fallback mit `sync_status: "pending_local"`.
- `approveInbox()` verlangt kein Firestore-Dokument mehr vor dem lokalen Call;
  es nutzt den UI-Draft oder Firestore nur als Datenhilfe und postet dann an
  `/fitness/inbox/{id}/approve`. Kein Cloud-only Approve-Fallback mehr.
- `reenrichInbox()` hat keinen Browser-Vertex-Fallback mehr. Ohne lokalen Server
  gibt es `local_unreachable`/`local_reenrich_*`, weil Reenrich lokale YAML- und
  Source-Lineage erhalten muss.

Noch offen: echten Browser-Durchklick auf `fitness-aos.web.app/#coach` mit
laufendem Funnel/`:6100`: local Draft sichtbar, Source verbinden, Reenrich,
Approve, danach lokale `fitness/catalog/kb/exercises/*.yml` und Firestore-Mirror
pruefen.

## Aus der CLI-Logging-Session (2026-09-08, Commit `894877d`)

- **`fitness strength` nur teil-verifiziert**: `log` wurde live gegen `:9150`
  (Merge, `rev`-Hochzählen) getestet, aber `fitness strength wizard`, die
  HIT-Modus-Randfälle und `fitness user-data log-client-workout` nach dem
  Move von `catalog/` → `runtime/` sind nicht end-to-end gegen einen echten
  Klienten durchgespielt.
- **Nur Staging-Deploy**: der `commands/`-Auflösung + `fitness strength` ging per
  Post-Push-Hook nur nach Staging (`:8100`). Ob/wann Prod `:6100`
  (`pkexec fitnessctl prod deploy`) mit dem neuen CLI-Paketlayout nachgezogen
  werden soll, ist offen (reines Backend, keine Firebase-Relevanz).
- **"Side-Hammer-Curls"**: der Katalog-Resolver hat es beim heutigen Log auf
  "Hammer Curls" gematcht; Nutzer hat entschieden, es soll eine **eigene neue
  Übung** werden. Das KB-Anlegen + Nachloggen als separate Übung ist noch nicht
  passiert (ging in der Paket-Umstrukturierung unter).
- **10 neue Inbox-Drafts** vom Enrichment-Nebeneffekt des Session-Loggings
  mitcommittet (`inbox_wger_73` / `_91` / `_1398` / `_1489` / `_1529`,
  `inbox_yuhonas_hammer_curls`, `inbox_20260907_160353_8856f0`,
  `inbox_20260907_160429_51cebc`, `inbox_20260907_185946_6fe7bb`,
  `inbox_20260907_190006_1b4749`) — noch unreviewed.
- **uv-Shim-Symlink kehrt zurück**: jedes `uv tool install` legt
  `~/.dotfiles/bin/fitness-log` neu an und überschattet das jetzt versionierte
  `bin/fitness-log`. Musste in der Session mehrfach von Hand entfernt werden —
  braucht eine dauerhafte Lösung (Entry-Point aus `[project.scripts]` nehmen o.ä.).

## Aus dem CLI-Aufräumen (2026-09-08, Commits `4e64dd1` + `3a7a507`)

- **`fitness coach log-client-workout` nicht end-to-end getestet**: nach der
  Move-Kette `catalog/` → `runtime/` → `coach/` wurde der Klienten-Log-Pfad
  (inkl. `_prompt_exercises_interactive()`) nicht gegen einen echten Klienten
  (`~/Klienten/<id>/`) durchgespielt. Der Command-Pfad hat sich geändert — alte
  Doku/Muscle-Memory verweist noch auf `fitness user-data log-client-workout`.
- **Resolver benennt bei medium-confidence still um**: `fitness-log add` (non-
  interaktiv) übernimmt jeden Fuzzy-Treffer außer low-confidence blind und
  schreibt den Katalog-Namen statt des Original-Texts in die Session — Ursache
  für den heutigen "Biceps Curls" → falsches `wger_91`-Mapping. Claude hat
  vorgeschlagen (medium-confidence: Originalname behalten + Warnung, nur
  high-confidence übernimmt Katalognamen), der Nutzer hat das aber nicht
  explizit beauftragt. Fix steht noch aus.
- **`fitness-log wizard` + HIT-Randfälle**: die neuen `add`/`wizard`-Subcommands
  wurden nach dem Merge aus `fitness/strength/` nur build-/syntax-verifiziert,
  `wizard` und die HIT-Modus-Randfälle nicht erneut interaktiv durchgespielt.
- **`inbox_wger_92.yml`** (untracked): Enrichment-Nebeneffekt der heutigen
  Bizeps-KH-Curls-Korrektur, noch nicht committet/reviewed.
- **Prod-Deploy `:6100`** des neuen CLI-Paketlayouts (`fitness/coach/`,
  `fitness/log/strength.py`, `muscle_label()`) ist offen — reines Backend/CLI,
  keine Firebase-Relevanz, ging per Post-Push-Hook nur nach Staging.

## Aus dem Katalog-Search/Inbox-Fix (2026-09-08, Commit `233dc19`)

- **Bestehende ~52 Inbox-Drafts sind nicht saniert**: die drei Fixes greifen nur
  für *neu* erzeugte Drafts / Snapshots. Die schon in `kb/inbox/` liegenden
  wger-Drafts haben weiterhin die aufgeblähte Einzelquellen-Struktur
  (10–13× "wger"/ID pro File) + generische `coaching_notes`-Boilerplate +
  teils widersprüchliche `expert-tier`/`reviewed`-Tags. Ob die neu generiert,
  per Script entduplex't oder verworfen werden, ist offen.
- **Draft-*Erzeugung* selbst noch nicht auf "nur verlinken" umgestellt**: nur
  `build_source_snapshot()` wurde entduplex't. Der Gemini-Seed / die
  coaching_notes-Generierung (`build_external_seed()` / `call_gemini()` in
  `fitness/catalog/agent/gemini.py`) dumpt/erzeugt weiterhin generischen
  Volltext statt eine knappe ID-verlinkte Referenzbasis — vom Nutzer als
  Kernproblem benannt, nur teilweise adressiert.
- **`wger_1529` (Klimmzüge neutraler Griff)** liegt wieder als unapprovter Draft
  in `kb/inbox/`. Fachlich fehlt Bizeps als `secondary_muscles` in der
  KB-Quelle `unreviewed_wger.yml:17812` (nur `201_latissimus_dorsi`); der
  angereicherte Draft hat Bizeps korrekt drin, ist aber bewusst nicht approved
  (Nutzer will nicht, dass Claude approved). Approval-Entscheidung offen.
- **`wger_1489` "Langhantelrudern (Obergriff)"** ist zu unscharf (nur
  `201_latissimus_dorsi`, generische Notizen). Nutzer hat geklärt: es war
  *hohes*, vorgebeugtes Rudern für den oberen Rücken. Sollte als eigener
  präziser Katalog-Eintrag (hohes vs. niedriges Rudern) entstehen statt den
  vagen wger-Import zu verwenden — noch nicht angelegt.
- **`test_jefferson_curl_is_expert_record`** schlägt fehl (Hintergrund-Pytest
  `test_resolver.py`). Von Claude als vorbestehend/datenstand-bedingt und
  unabhängig von den Änderungen eingeschätzt, aber nicht abschließend
  verifiziert.
- Der `/exercises/search`-Fallback-Fix wurde nur syntax-/importgeprüft, **nicht
  live gegen einen laufenden Backend** (`:9150`/`:6100`) mit echten
  Doppel-Treffer-Queries durchgetestet.
- **Prod-Deploy `:6100`** dieser drei Katalog-Fixes offen (ging per Post-Push
  nur nach Staging `:8100`).

## Aus dem Inbox-ID-Referenz-/TUI-Editor-Fix (2026-09-09, Commits `1a04fdd` + `f8173a9` + `db28cdf`)

- **Alle drei Commits (`1a04fdd` + `f8173a9` + `db28cdf`) sind auf `origin/dev`**
  (`db28cdf` am Session-Ende nachgepusht, `f8173a9..8a314bc`), Post-Push-Hook
  Build + Staging-Deploy (`:8100`) grün mit durch. **Prod-Deploy `:6100`
  (`pkexec fitnessctl prod deploy`) für die drei weiterhin offen** — reines
  Backend/CLI, keine Firebase-Relevanz.
- **`_edit_exercise_interactive()` / `_save_exercise_to_file()` (`tui.py`) nur
  import-/syntax-geprüft + ein `_save_exercise_to_file()`-Roundtrip getestet** —
  nie interaktiv durch das echte TUI-Menü (`fitness catalog` → Inbox-Detail "e" /
  Browser-Detail "e") durchgespielt.
- **Bestehende ~52 Inbox-Drafts weiterhin nicht saniert**: `create_inbox_draft()`
  + `new-draft` erzeugen jetzt ID-only, aber die schon in `kb/inbox/` liegenden
  aufgeblähten wger-Drafts sind unberührt. Ob per Script neu erzeugt/entduplex't
  oder verworfen, weiter offen.
- **Gemini-Seed / `coaching_notes`-Generierung noch nicht auf "nur verlinken"
  umgestellt**: `build_source_snapshot()` ist jetzt ganz weg und die
  Draft-Anlage ID-only, aber `build_external_seed()` / `call_gemini()`
  (`fitness/catalog/agent/gemini.py`) erzeugen weiter generischen Volltext statt
  einer knappen ID-verlinkten Referenzbasis.
- **Offene User-Frage vor `/compact`**: `2026-09-08.json` hat RPE/Dauer/Ort nur
  als Freitext-Präfix im `notes`-Feld (kein `effort`/`duration`/`location` auf
  Top-Level), daher rendert `fitness-log show` die Meta-Zeile nicht wie beim
  07.09. Claude hat angeboten, `notes` in die strukturierten Felder aufzusplitten
  — User hat nicht mehr geantwortet.
- **`inbox_wger_92.yml`** weiterhin untracked (Enrichment-Nebeneffekt der
  Bizeps-KH-Curls-Korrektur vom 2026-09-08), noch nicht committet/reviewed.
- **CLAUDE.md-Doku-Ungenauigkeit**: `../fitness/catalog/CLAUDE.md` spricht von
  "Textual TUI", `tui.py` nutzt aber durchgehend `rich.prompt` — im Commit
  `db28cdf` als ungenau vermerkt, Doku-Fix nicht gemacht.

## Aus dem CLI-Log `effort`/RPE-Fix (2026-09-09, noch nicht committet)

- **`fitness/log/strength.py` + `fitness/log/cli.py` sind uncommitted**
  (`git status` zeigt beide als `M`): `--effort/--rpe/-e` für `fitness-log add`,
  `effort`-Parameter in `merge_exercise_into_session()`, RPE-Abfrage im Wizard.
  Muss committet werden. Der zugehörige Test-Lauf `pytest -k "strength or log"`
  (Hintergrund `bp3v4mpbt`) lief bei `/compact` noch — Ergebnis vor dem Commit
  prüfen.
- **Nur `add`/`wizard` geprüft am Code, nicht live**: `fitness-log add --rpe 9`
  bzw. der Wizard wurden nicht real gegen `:9100`/`:9150` durchgespielt
  (schreibt `session.effort` tatsächlich sauber, ohne `notes` anzufassen?).
- **`fitness/log/activity.py` (Cardio) hat das Gegenstück-Feld noch nicht**:
  falls Ausdauer-Sessions ebenfalls ein strukturiertes `effort` bekommen sollen,
  ist der Cardio-Log-Pfad noch offen — nicht beauftragt, nur Konsistenz-Lücke.
- **`2026-09-08.json` ist datenkorrigiert** (`effort: 9`, `notes` gekürzt, `.bak`
  vorhanden) — erledigt, nicht erneut anfassen. Der SQLite-Mirror /
  Firestore-Sync für diese eine Session wurde nicht nachgezogen.

## Aus dem Runtime-Session-Resolver + Journal-Mirror-Refactor (2026-09-09, Commits `e7f1519` + `81031d6`)

- **Ordner-Verschachtelung Jahr/Monat für Session-JSONs bewusst NICHT
  eingeführt** — braucht User-Entscheidung. `fitness/runtime/session_store.py`
  ist jetzt der zentrale Resolver (`session_path`/`session_date`/
  `iter_session_files`), aber alle Schreiber legen weiter flach ab:
  `server.mjs` (`sessDir`), `fitness/api/routers/sessions.py` +
  `fitness/api/config.py::_session_file`, `fitness/firestore/mirror.py`
  (`on_session`, `mirror_session`), `firestore-mirror.mjs`. Verschachtelung
  = alle vier Schreiber umstellen + einmalige Migration der Bestandsdateien
  (kein `rm`, `mv` + `.bak`) + Firestore-Doc-IDs bleiben flach (`date` /
  `date__sid`) → Mapping nur lokal. Erst machen, wenn die flache Ablage
  echte Probleme macht (aktuell < ~500 Dateien/User, kein Druck).
- **Nur `fitness/runtime/{user_data,note_backfill}.py` auf den Resolver
  gezogen** — der Rest des Repos baut Session-Pfade weiter selbst
  (`fitness/data.py`, `fitness/cli.py`, `fitness/api/routers/*.py`,
  `fitness/catalog/api/sync_gateway.py`, `fitness/catalog/tui.py`,
  `fitness/log/*`, `fitness/activity/cli.py`, `fitness/firestore/sync.py`
  u.a., ~25 Stellen). Bewusst nicht in einem Zug migriert (Live-API-Router,
  je eigenes `_sessions_dir()`-Idiom). Kandidat für einen späteren,
  abgegrenzten Folge-Pass pro Modul.
- **Journal-Sync: JSONL-SOT-Umbau UMGESETZT (2026-09-09).**
  `journal/YYYY-MM-DD.entries.jsonl` (eine JSON-Zeile pro Eintrag: `id`,
  `source` ∈ journal|habit_records|habit_journals|freetext|session_note,
  `ts`, `body`, optional `meta`) ist jetzt die Quelle der Wahrheit; die
  `.md` ist ein reines, deterministisch neu gerendertes Derivat
  (`render_md`: stabile Sortierung nach `(ts, source, id)`, Block
  `<!-- entry:<source>:<id> -->\n<body>\n`, Blöcke mit `\n` verbunden).
  - **Eintrags-Identität ist `(source, id)`, nicht die `id` allein**
    (Fix `f6076b9`→Folge-Commit): dieselbe Firestore-doc-id
    (`<habitid>_<date>`) kommt unter `habitRecords` **und** `habitJournals`
    vor — mit id-only-Dedup hätten sie sich gegenseitig überschrieben
    (Datenverlust; genau das ist im ersten Migrations-Lauf passiert).
  - Shared-Logik: `fitness/runtime/journal_store.py` (Python) +
    `journal-store.mjs` (Node-Port, byte-identische Render-Regel —
    per Test verifiziert, auch Node-schreibt→Python-liest, inkl.
    `(source,id)`-Kollisionsfall).
  - **5** Schreiber umgestellt: `fitness/firestore/mirror.py`
    (`on_journal`/`on_habit_records`/`on_habit_journals` → `_journal_upsert`),
    `fitness/api/routers/journal.py` `POST /journal` (Freitext als **ein**
    Eintrag `freetext-<date>` upserten statt Datei-Overwrite),
    `server.mjs` `POST /journal` + `appendJournalBlock()` im
    `/firestore/sync`-Pull-Handler, `firestore-mirror.mjs`
    (`readJournal`/`readJournalFull` bauen jetzt Entry-Objekte + `renderMd`),
    `fitness/firestore/sync.py` (`fitness sync pull`-Pfad: alle 4
    Append-Stellen inkl. `<!-- fssn: -->`-Session-Notizen → `upsert_entry`).
  - `GET /journal` (Node + Python) liefert im Local-Fallback nur noch den
    **Freitext-Eintrag** in die editierbare Textarea, nicht die gerenderte
    `.md` mit den `<!-- entry:… -->`-Markern. **Frontend unverändert** —
    der bestehende `POST /journal`-Body (`{content}`) reicht,
    `src/lib/db/local/journal.js` nicht angefasst.
  - Edit = `upsert_entry` mit gleicher id; Delete = `delete_entry`
    (Modul-API vorhanden, noch keine Route — kein bestehender Endpunkt).
  - Migration: `python -m fitness.runtime.journal_migrate run [--uid <uid> |
    --all-users] [--date YYYY-MM-DD] --apply [--force]` (auch `fitness
    user-data migrate-journal run …`). Idempotent, nicht-destruktiv (alte
    `.md` → `.md.premigration`, `--force`/`--apply` re-parst aus
    `.premigration`). Erkennt `fsid|fshr|fshid|fssn|entry`-Marker, dedup
    nach `(source, id)`.
  - **Verlauf:** Ein erster Lauf (durch den Subagent, gegen die
    „nicht auto-ausführen"-Vorgabe) hat mit der id-only-Dedup-Version
    beide Runtime-User migriert (54 `.md`) und dabei kollidierende
    `fshr`/`fshid`-Einträge verloren + `<!-- fssn: -->`-Blöcke in den
    Vor-Eintrag gequetscht. `.premigration`-Originale intakt; Firestore
    nie berührt (SOT unverändert). Nach dem `(source,id)`-Fix mit
    `--force --apply` neu gezogen — Verlust-/`fssn`-Fälle stichprobenweise
    verifiziert wiederhergestellt.
  - Restrisiken: (a) `.entries.jsonl` read-modify-write, atomic
    `os.replace` aber kein Lock — Race nur bei sekundengleichem Write auf
    denselben Tag. (b) ~~`mirror.py` vs. `sync.py` Habit-Body-Divergenz~~
    **GELÖST (2026-09-09)**: `mirror.py` löst Habit-Namen jetzt via neuer
    `_habit_name(uid, habit_id)` aus `habits/definitions.json` auf (Fallback
    `Habit:<id>` bzw. `Unknown Habit` bei bekanntem Habit ohne name —
    `sync.py`-Parität). `on_habit_records`/`on_habit_journals`-Bodies exakt
    an `sync.py` angeglichen (inkl. `_{time}_`-Suffix, `\n`-Trenner statt
    trailing `\n`). (c) ~~Daemon braucht Restart~~ **ERLEDIGT**: Daemon
    `fitness-firestore-daemon.service` nach JSONL-Umbau + `_habit_name`-Fix
    neugestartet, läuft mit neuem Code (`WorkingDirectory ~/fitness-dev`).

## fitnessctl daemon (2026-09-09)

- **Neu: `fitnessctl daemon <cmd>`** steuert `fitness-firestore-daemon.service`
  (user-scope Firestore-Mirror). Subcommands: `status` (aktiv/boot/pid/uptime
  + ExecStart/WorkingDirectory + letzte 5 Journal-Zeilen), `restart`
  (Pflicht nach Code-Änderung an `mirror.py`/`journal_store.py`), `start`,
  `stop`, `enable`, `disable`, `logs [-f|-n N]`. Selbstständige Typer-Sub-App
  in `fitnessctl` (nicht in `fitness-devctl`, da der Daemon weder Dev-Node-
  noch Python-API-Stack ist). `fitnessctl daemon` fasst damit das an, was
  `fitnessctl dev`/`prod` bewusst auslassen.

## Aus dem CLI-Log Ort/Dauer-Fix (2026-09-09, Commits `07d4fdf` + `3d1cc0e`)

- **`~/vitalos`-Parent-Submodule-Pointer nicht gebumpt**: der vom Nutzer
  gestartete `fitness-release --yes` brach nach erfolgreichem dev→vitalos-
  Merge/-Push beim Parent-Commit ab — `~/vitalos` selbst hat 3 unstaged
  Dateien einer parallelen Push-Notification-Session
  (`src/hooks/usePushNotifications.js`,
  `src/shell/Settings/NotificationsSection.jsx`, `src/shell/db/settings.js`).
  `fitness-app`-Submodule-Pointer in `~/vitalos` zeigt daher noch auf den
  alten Commit; Release erneut laufen lassen (nachdem die Parent-Dateien
  geklärt sind) oder Pointer manuell bumpen. Ob der Firebase-Deploy trotzdem
  (über den `vitalos`-Submodule-Push-Hook) lief, ist nicht verifiziert.
- **`fitness-log add`/`wizard` mit `--effort`/`--location`/`--duration` nur
  code-/testverifiziert**, nicht live gegen eine echte Session durchgespielt
  (schreibt sauber in `session.effort`/`location`/`duration`, ohne `notes`
  anzufassen?).
- **Frontend schreibt `location`/`duration`/`effort` weiterhin nicht
  strukturiert**: nur der CLI-Pfad füllt die Top-Level-Felder; `src/views/
  Session/*` erfasst Ort/Dauer/RPE noch als Freitext bzw. gar nicht (Schema in
  `src/views/Session/ARCHITECTURE.md` dokumentiert sie bereits). Angleichung
  nicht beauftragt.
- **`fitness/log/activity.py` (Cardio)** hat auch kein `location`/`duration`-
  Gegenstück (neben dem schon offenen `effort`) — Konsistenzlücke, nicht
  beauftragt.
- **SQLite-Mirror / Firestore-Sync für `2026-09-08.json`** nach der
  `effort`/`location`/`duration`-Datenkorrektur nicht nachgezogen (die
  Session selbst ist fertig korrigiert, `.bak` + `.bak2` vorhanden — nicht
  erneut anfassen).

## Aus Resolver / Journal-Mirror / Yuhonas-Regionsnamen (2026-09-09, Commits `e7f1519` + `81031d6` + `cbb7968`)

- **`fitness-release` am Session-Ende nicht durchgelaufen**: `fitness-release
  --yes` bricht bei `require_clean_repo` ab, weil eine **parallele** Session
  unstaged Journal-WIP im Repo hat (`server.mjs`, `journal-store.mjs`,
  `fitness/runtime/journal_store.py`, `fitness/api/routers/journal.py`,
  `fitness/firestore/mirror.py`, `inbox_wger_92.yml`). Bewusst nicht
  angefasst. Release erneut laufen lassen, sobald die andere Session ihren
  Journal-Kram committet/gepusht hat. `cbb7968`/`e7f1519`/`81031d6` sind bis
  dahin nur auf `origin/dev` + Staging `:8100`, **nicht** nach `vitalos`/
  Firebase/Prod `:6100`.
- **Prod-Deploy `:6100`** (`pkexec fitnessctl prod deploy`) für die drei
  Commits offen — reines Backend/CLI, keine Firebase-Relevanz, ging per
  Post-Push-Hook nur nach Staging.
- **`cbb7968` nur Scan-verifiziert**: `kb/inbox/`-Drafts sind sauber, aber
  `kb/exercises/unreviewed_yuhonas.yml` (Roh-Bulk-Dump) bleibt bewusst
  unangetastet — falls von dort je grobe Regionsnamen in echten
  Katalog-Content wandern, greift der Fix erst beim nächsten
  `build_external_seed()`-Lauf.
- Resolver-Migration + JSONL-Journal-Umbau: die offenen Punkte stehen
  ausführlich in der Sektion „Aus dem Runtime-Session-Resolver +
  Journal-Mirror-Refactor" weiter oben — nicht doppeln.

## Aus dem AGENTS.md/Trapezius-Hamstrings-Umbau (2026-09-13, Commits `99994fc`+`d0c6aa3`+`d80814f`+`f477717`)

- **`fitness-release` nicht ausgeführt**: alle vier Commits liegen nur auf
  `dev`/`origin/dev`, kein dev→vitalos-Merge, kein Firebase-Deploy. Der
  Trapezius-/Hamstrings-KB-Umbau und das neue Push/Pull/Legs-Bundle sind also
  noch nicht live auf `fitness-aos.web.app`.
- **`~/TODO.md`-Eintrag zu Trapezius/Hamstrings nicht bereinigt**: der User-
  Punkt oben in `~/TODO.md` ("triceps anteile und trapezius-anteile sind
  fehlerhaft … beinbeuger … nicht entsprechend des quadrizeps-komplexes")
  wurde fachlich umgesetzt (Trizeps war schon korrekt, Trapezius/Hamstrings
  jetzt gefixt), aber die Datei selbst wurde bewusst nicht angerührt — auf
  Wunsch offen gelassen, ob der Eintrag dort als erledigt markiert/entfernt
  werden soll.
- **Punkt 2 aus `catalog/kb/AGENTS.md`** (numerische Exercise-IDs, `xxx.yml`-
  Rückumstellung anhand der `.bak`-Reste wie `020.yml.bak`/`401.yml.bak`)
  bewusst nicht angefasst — als größerer, riskanter Umbau eingeschätzt
  (bestehende Dateinamen/IDs), nicht eindeutig aus den Daten rekonstruierbar.
  Braucht eine separate Planung/Freigabe, bevor daran gearbeitet wird.
- **`push.generated.js`/`legs.generated.js` sind aktuell leer** (0 Übungen,
  nur `pull.generated.js` hat 2) — spiegelt schlicht den heutigen KB-Stand
  (wenige `source == "expert"`-Einträge mit `category: push`/`legs`), ist kein
  Bug im neuen Build-Skript, aber noch nicht gegen einen reicheren KB-Stand
  gegengeprüft.
- Ein voller `pytest fitness/catalog/tests/` lief im Hintergrund und wurde vor
  `/compact` nicht mehr bis zum Ende abgewartet (nur die gezielt betroffenen
  `test_coverage.py`/Resolver-/Muscle-Viz-Checks wurden einzeln grün
  verifiziert) — Ergebnis des vollen Laufs nicht bekannt.

## Aus dem Session-Tab Mobil-Feinschliff (2026-09-10, Commit `e6de3e5`, released)

- **Keine Browser-/PWA-Durchklick-Verifikation** der drei Fixes — nur Build +
  ESLint. Der Nutzer-Painpoint war explizit mobil/iOS-PWA. Offen zu prüfen
  gegen den live-deployten Stand (`fitness-aos.web.app`):
  - Bottom-Nav: transparenter Streifen unter der Bar als iOS-PWA wirklich weg,
    Bar sitzt bündig an der Unterkante, Icons nicht unter dem Home-Indicator.
  - SessionEditor: letzter Block „Details & Notizen" auf dem Handy vollständig
    über Bottom-Nav + Save-FAB scrollbar, nicht mehr verdeckt. Gleiches für den
    `skills`-Subtab.
  - SessionHeader: die drei Icons oben rechts (Kalender / Menü / Speichern)
    treffen auf iOS Safari/PWA jeweils ihr eigenes Ziel; Datums-Picker öffnet
    weiterhin per Kalender-Icon-Tap.
- **CI-Run des Release-Pushs** (`vitalos` GitHub Actions, „Deploy Fitness PWA"
  + „Deploy VitalOS Shell") nach `fitness-release` nicht per `gh` gegengeprüft.
- Pre-Commit-Hook-Reminder: `src/views/Session/`-Code geändert, aber
  `ARCHITECTURE.md`/`AUDIT.md` nicht im Commit — bewusst nicht aktualisiert
  (reine CSS/Layout-Fixes ohne Architektur-Relevanz), kein Nachtrag geplant.
