# AGENTS.md-Punkte umgesetzt: Push/Pull/Legs-Build, Trapezius/Hamstrings als Muskel-Komplexe, Federation-Aufräumen (2026-09-13)

Zwei fachliche Aufträge abgearbeitet (`catalog/kb/AGENTS.md` durchgehen; danach
das offene `~/TODO.md`-Item zu Trapezius/Hamstrings), plus ein Aufräum-
Nebeneffekt beim anschließenden `fitness-release`-Versuch. Vier Commits auf
`dev` (`99994fc`, `d0c6aa3`, `d80814f`, `f477717`), Build/Lint/Pytest jeweils
grün, kein Deploy in dieser Session.

* **`scripts/build-ppl-data.mjs`** (neu): generiert `push.generated.js` /
  `pull.generated.js` / `legs.generated.js` aus den expert-approved Exercises
  (`kb/exercises/**/*.yml`, `source == "expert"`), gruppiert nach `category`
  via `fitness.catalog.core.resolver.build_exercise_index()`-Äquivalent in JS
  (Musterwahl: `.mjs` statt Python, um konsistent mit den Sibling-Build-
  Skripten zu bleiben — eine erste Python-Fassung wurde verworfen).
* **`scripts/exercise-data.mjs`** (neu): dünner Wrapper, der
  `build-exercise-bulk-data.mjs` + `build-ppl-data.mjs` bündelt (beide lesen
  dieselbe KB); `package.json`s `build:kb-data` ruft jetzt diesen Wrapper statt
  die Einzelskripte direkt.
* **`src/lib/db/firestore/kb.js`**: neuer Konsum-Helper für die generierten
  Push/Pull/Legs-Bundles, analog zu `getAllExercises()`/`_getCuratedExercises()`
  — damit bleiben die generierten Dateien kein toter Code.
* **`.gitignore`**: `push.generated.js`/`pull.generated.js`/`legs.generated.js`
  ergänzt (analog zu `exerciseBulkData.generated.js`).
* **`fitness/catalog/kb/muscles/back/`, `.../legs/`**: Trapezius (`202`) und
  Hamstrings (`604`) waren als drei bzw. drei eigenständige Top-Level-IDs
  nebeneinander angelegt statt als Parent+Kinder (anders als Trizeps/
  Quadrizeps/Gastrocnemius). Umbenannt zu `202a/b/c_trapezius_*` bzw.
  `604a/b/c_*` (Kinder, `git mv`, `parent:`-Feld ergänzt) plus zwei neue
  Parent-Dateien `202_trapezius.yml` und `604_hamstrings.yml`. Schließt die in
  `muscle_index.yml` selbst dokumentierte "Taxonomie-Lücke" für wger-IDs 9/11
  und den offenen `~/TODO.md`-Punkt zu fehlerhaften Trapezius-/Hamstrings-
  Anteilen (Trizeps war laut Prüfung bereits korrekt angelegt).
* **`fitness/catalog/kb/muscle_index.yml`, `muscle_groups.json`,
  `back.yml`/`legs.yml`/`upper_back.yml`/`hamstrings.yml`,
  `src/lib/kb/muscleLabels.js`, `src/lib/kb/muscleTranslations.js`**: alle
  Referenzen auf die alten Flach-IDs auf die neue Parent+Kinder-Struktur
  nachgezogen, per Grep verifiziert dass keine alten IDs mehr referenziert
  werden.
* **`fitness/catalog/kb/exercises/080.yml`, `jefferson_curl.yml`,
  `unreviewed_wger.yml`, diverse `inbox/*.yml`**: Muskel-ID-Referenzen auf die
  neuen Trapezius-/Hamstrings-IDs mitgezogen.
* **`dist-federation/`**: komplett aus Git-Tracking entfernt (war trotz
  bestehendem `.gitignore`-Eintrag bereits eingecheckt, sodass jeder lokale
  Build das Repo als "dirty" markierte — Ursache für einen `fitness-release
  --yes`-Abbruch mit `require_clean_repo`) und vom Dateisystem gelöscht.
* **`package.json`/`package-lock.json`**: ungenutztes
  `@originjs/vite-plugin-federation` deinstalliert (kein aktiver Nutzer im
  `vite.config.js`, `npm run build` blieb danach grün).
* Alle vier Commits nur auf `dev`/`origin/dev` — kein `fitness-release` in
  dieser Session ausgeführt (der eine Versuch des Nutzers scheiterte initial
  am `dist-federation`-Dirty-State, danach nicht erneut gestartet).

---

# Session-Tab Mobil-Feinschliff: Bottom-Nav bündig, Bottom-Spacing, Header-Icon-Hitbox (2026-09-10)

Drei zusammenhängende Mobil-Layout-Fixes am Session-Tab (Nutzer-Befund: „oben
rum schon ok, aber unten rum + die Mobil-Nav-Bar brauchen noch Anpassungen"),
alle rein CSS/Layout ohne Verhaltensänderung. Als ein Commit `e6de3e5` auf
`dev`, danach vom Nutzer per `fitness-release --yes` voll durchgereleased
(dev→vitalos→Firebase). Build- und ESLint-verifiziert; **keine** Browser-/PWA-
Durchklick-Verifikation (siehe `NEXT.md`).

* **`src/components/layout/MobileNav.jsx`**: `bg-fit-card/90` + `backdrop-blur`
  + `border-t` wandern vom inneren `<div>` aufs `<nav>` selbst (füllt bis zur
  echten Unterkante); der `env(safe-area-inset-bottom)`-Inset steckt jetzt im
  `padding-bottom` des Content-`div` (`calc(0.75rem + env(...))`). Behebt den
  transparenten Streifen unter der Bar als iOS-PWA (`viewport-fit=cover` +
  `black-translucent` → Inset ≠ 0).
* **`src/views/Session/SessionEditor.jsx`**: fixes `pb-36` (144px) →
  `paddingBottom: calc(10rem + env(safe-area-inset-bottom))` (inline-style, da
  `env()` nötig). Vorher lag der letzte Block „Details & Notizen" unter
  Bottom-Nav (~76px + Safe-Area) **und** dem darüber schwebenden Save-FAB
  (`bottom: 6rem + safe`, 56px).
* **`src/views/Session/index.jsx`**: `skills`-Subtab-Container `pb-32` →
  `calc(8rem + env(safe-area-inset-bottom))`, gleicher Grund.
* **`src/views/Session/SessionHeader.jsx`**: das `<input type="date">` im
  Kalender-Button war ein volles `absolute inset-0 opacity-0`-Overlay — auf
  iOS Safari hat ein transparentes Date-Input einen intrinsisch größeren, nach
  links verschobenen Touch-Bereich, sodass Taps auf „Menü"/„Speichern"
  unsichtbar das Datumsfeld trafen. Jetzt `pointer-events-none` + `h-0 w-0` +
  `tabIndex={-1}` + `aria-hidden` (Picker wird ohnehin nur programmatisch via
  `showPicker()`/`.click()` geöffnet); `aria-label="Datum wählen"` auf den
  Button gewandert.
* **Release** (`fitness-release --yes`): `dev` → `origin/dev`, in den
  `vitalos`-Worktree gemergt (`e68b9d2..f6e3b0f`), Firebase-Build + Deploy nach
  **fitness-aos.web.app** (`release complete`), SW/Manifest gestampt
  (`fitness-vmtvvfx3k`), Submodule-Pointer im `vitalos`-Parent gebumpt
  (`eb3a2ea`, `master` gepusht).

---

# Runtime-Session-Resolver + Journal-Mirror-Konsolidierung + Yuhonas-Regionsnamen-Fix (2026-09-09)

Drei kleinere Refactor-/Fix-Commits nach dem Ort/Dauer-Release (Eintrag unten),
alle auf `origin/dev`, Post-Push-Hook (Build + Staging-Deploy `:8100`) jeweils
grün. Parallel dazu wurde der JSONL-Journal-Umbau angefangen und nach einem
Scope-Befund bewusst gestoppt (Details in `NEXT.md`). Der am Session-Ende vom
Nutzer gestartete `fitness-release --yes` blieb an unstaged Journal-WIP einer
**parallelen** Session hängen (`server.mjs`, `journal-store.mjs`,
`fitness/runtime/journal_store.py`, `fitness/api/routers/journal.py`,
`fitness/firestore/mirror.py`, `inbox_wger_92.yml`) — bewusst nicht angefasst,
Release wartet bis die andere Session ihren Kram committet.

* **`fitness/runtime/session_store.py`** (neu, `e7f1519`): zentraler
  Session-JSON-Resolver — `session_path(uid, date, session_id=None)`,
  `session_date(path)`, `iter_session_files(uid=None, date_from=, date_to=)`,
  `user_dirs()` / `user_sessions_dir()` / `runtime_users_dir()`. Löst das je
  ~5× eigenständig (teils divergent) nachgebaute `runtime_root()/users/<uid>/
  sessions` + `glob("*.json")` + Datумsparsing ab.
* **`fitness/runtime/user_data.py` + `fitness/runtime/note_backfill.py`**
  (`e7f1519`): auf den Resolver umgezogen (`list_runtime_users`,
  `iter_session_signals`, `merge_day_activities`,
  `find_sessions_needing_fix`, `find_suspect_default_effort`). Verhalten
  unverändert bis auf: Session-Dateien ohne parsebares ISO-Datum im Namen
  werden jetzt konsistent übersprungen (vorher nur in `merge_day_activities`).
  Keine Jahr/Monat-Ordnerverschachtelung eingeführt — die Schreiber legen
  weiter flach ab (bewusst, siehe `NEXT.md`).
* **`fitness/firestore/mirror.py`** (`81031d6`): `on_journal` /
  `on_habit_records` / `on_habit_journals` hängten den marker-getaggten Block
  (`<!-- fsid|fshr|fshid:… -->`) je 3× leicht abweichend an `journal/
  YYYY-MM-DD.md` an — jetzt eine einzige idempotente `_append_journal_block(
  md_file, marker, body)` mit konsistentem `encoding="utf-8"`. Append-only,
  Marker bleibt Dedup-Schlüssel; echtes Einzel-Edit/-Delete bleibt bewusst
  offen (User-Design-Entscheidung, `NEXT.md`).
* **`fitness/catalog/core/source_merge.py` + `.../muscle_normalization.py`**
  (`cbb7968`): User-Fund — `inbox_20260907_185946_6fe7bb.yml`
  (Schrägbankdrücken KH) hatte `chest`/`shoulders`/`triceps` roh **neben**
  den kanonischen wger-IDs. Root Cause: `build_external_seed()` mergte die
  drei Muskel-Felder per `_merge_list_fields()` direkt aus den Rohdaten ohne
  `normalize_exercise_muscle_list()`. Fix: alle drei Felder laufen jetzt durch
  die Normalisierung; `refine_generic_region_labels()` verwirft grobe
  Regionen (`shoulders`) beim Nicht-Match, statt sie durchzureichen.
* **`fitness/catalog/kb/inbox/inbox_20260907_185946_6fe7bb.yml`** (`cbb7968`):
  Draft manuell korrigiert (rohe Regionsnamen raus, kanonische IDs blieben),
  `.bak` angelegt. Kompletter `kb/inbox/`-Scan: keine weiteren Drafts mit dem
  Muster. Katalog-Tests: 2 shoulder-Normalisierungstests grün, nur die 2
  bekannten vorbestehenden `.fitness-agent/config.yml`-Tmp-Dir-Fehler.
* **JSONL-Journal-Umbau (`journal/YYYY-MM-DD.entries.jsonl` als SOT, `.md`
  deterministisch daraus gerendert): begonnen, dann GESTOPPT.** Scope-Befund:
  die `journal/*.md` hat **vier** Schreiber in **drei** Sprachen
  (`mirror.py`, `api/routers/journal.py` Ganzdatei-Overwrite, `server.mjs`
  Ganzdatei-Overwrite + `appendJournalBlock()`, `firestore-mirror.mjs`), und
  das Frontend (`src/lib/db/local/journal.js`) POSTet im Local-Modus den
  ganzen Tagestext als Freitext-`content` → Ganzdatei-Overwrite. Ein
  `mirror.py`-only-Umbau würde den Frontend-Freitext überschreiben. Vollständig
  in `NEXT.md` dokumentiert (`6cbd4d1` / `fd3ff10`).

---

# CLI-Log: Ort/Dauer strukturiert (`session.location`/`duration`) + `effort`/RPE-Fix committet & released (2026-09-09)

Direkte Fortsetzung des `effort`/RPE-Eintrags unten. Der dort noch als „uncommitted,
Test läuft noch" beschriebene Stand wurde abgeschlossen (Commit `07d4fdf`), danach auf
Nutzerwunsch („bau das skript endlich fertig") analog um strukturierte `location`/
`duration`-Felder erweitert (Commit `3d1cc0e`). Beide Commits liegen auf `origin/dev`
und wurden in den `vitalos`-Branch/Worktree gemergt+gepusht (Post-Push-Hook: Build +
Staging-Deploy `:8100` grün). Der anschließend **vom Nutzer selbst** gestartete
`fitness-release --yes` lief für den Fitness-Teil sauber durch, brach aber beim
Submodule-Pointer-Bump im `~/vitalos`-Parent-Repo ab (3 unrelated unstaged Dateien
einer parallelen Push-Notification-Session).

* **`fitness/log/strength.py`**: `merge_exercise_into_session()` / `add_exercise()` /
  `run_wizard()` bekommen `effort`-Parameter → `session["effort"]` statt Freitext-
  `notes` (`07d4fdf`); dieselben drei Funktionen zusätzlich um `location` / `duration`
  erweitert → `session["location"]` / `session["duration"]` (`3d1cc0e`). Der Wizard
  fragt RPE, Ort und Dauer jeweils als eigene Eingabe ab; das `add`-Konsolen-Echo
  zeigt 📍/⏱.
* **`fitness/log/cli.py`**: `cmd_add` bekommt `--effort` / `--rpe` / `-e` (`07d4fdf`)
  sowie `--location` / `-l` und `--duration` (`3d1cc0e`) — Hilfetexte betonen
  „strukturiertes Session-Feld, NICHT in notes packen".
* **Runtime-Session `~/.aos/fitness/users/59ole…/sessions/2026-09-08.json`** (kein
  Repo-File): `effort: 9` (aus „RPE 9"), `location: "Fitness First Schnirchgasse"`,
  `duration: 60` per Regex aus `notes` extrahiert; `notes` auf `"Klimmzug im
  Obergriff"` reduziert. Backups `.bak` + `.bak2` vorher angelegt.
* **Commits `07d4fdf` + `3d1cc0e`** nach `origin/dev` gepusht und in den `vitalos`-
  Branch/Worktree gemergt+gepusht (`git branch --contains` bestätigt beide auf `dev`
  und `vitalos`). Katalog-Tests: 48 Fehler, alle vorbestehend (`config.yml`-Fixture-
  Bug lt. `catalog/CLAUDE.md`), keine der geänderten Dateien betroffen.
* **`fitness-release --yes`** (vom Nutzer gestartet): Fitness-Push/Merge/Firestore-
  Sync (`jefferson_curl.yml`) ok; Abbruch erst beim Parent-Repo-Commit, weil
  `~/vitalos` selbst `M src/hooks/usePushNotifications.js`,
  `M src/shell/Settings/NotificationsSection.jsx`, `M src/shell/db/settings.js`
  unstaged hat (parallele Session). Submodule-Pointer `fitness-app` im `~/vitalos`-
  Parent daher **nicht gebumpt**.

---

# CLI-Log: strukturiertes `effort`/RPE-Feld statt Freitext in `notes` + Korrektur der 2026-09-08-Session (2026-09-09)

Nachlauf zur Inbox-ID-Referenz-Session (Eintrag unten). Der Nutzer konfrontierte,
dass die Session `2026-09-08.json` **rein per CLI von Claude angelegt** wurde
(nicht in der App geloggt) und deshalb kein strukturiertes RPE-Feld hat: Claude
hatte alle Angaben (Ort, Dauer, "RPE 9") beim Anlegen nur als Freitext-Präfix ins
`notes`-Feld geschrieben statt in eigene Felder — App-geloggte Sessions haben
dafür ein Top-Level-`effort`. Auftrag: "korrigiere das skript zum anlegen!
wahrscheinlich warst du faul!". Zwei Teile umgesetzt (Skript-Fix + Datenkorrektur),
plus vorab die vom Vorgänger-Turn offene Standing-Push-Aufgabe abgeschlossen.
**Skript-Änderungen sind noch nicht committet** (`M fitness/log/cli.py`,
`M fitness/log/strength.py`) — die Session endete mit `/compact`, bevor ein
Commit lief; der relevante Test-Lauf (`pytest -k "strength or log"`, Hintergrund
`bp3v4mpbt`) lief bei Session-Ende noch.

* **`fitness/log/strength.py`**: `merge_exercise_into_session()` bekommt neuen
  optionalen Parameter `effort: int | None`, schreibt ihn als `session["effort"]`
  (nicht in `notes`). `add_exercise()` reicht `effort` durch. `run_wizard()` fragt
  RPE/Effort jetzt als eigene Eingabe ab, nicht mehr über das Notiz-Feld.
* **`fitness/log/cli.py`**: `cmd_add` bekommt Option `--effort` / `--rpe` / `-e`
  (Hilfetext: "strukturiertes Session-Feld, NICHT in notes packen"), wird an
  `add_exercise()` weitergegeben.
* **Runtime-Sessiondatei `~/.aos/fitness/users/59ole…/sessions/2026-09-08.json`**
  (kein Repo-File): "RPE 9" per Regex aus `notes` entfernt und als Top-Level
  `effort: 9` gesetzt; `notes` bleibt `"Klimmzug im Obergriff: Fitness First
  Schnirchgasse, 60min"`. Backup `.bak` vorher angelegt.
* **`git push origin dev`** (`8a314bc..9c59bbb`): der lokal noch nicht gepushte
  Auto-Doc-Commit `9c59bbb` (`docs: auto-update NEXT.md`) nach `origin/dev`
  gebracht (Standing-Freigabe), nachdem der Hintergrund-Pytest `bq1zn2j7y` grün
  (`exit 0`) war. Push löste Build-Verifikation + Staging-Deploy (`:8100`) grün
  mit aus. Kein `fitness-release`/Prod-Deploy.

---

# Katalog: Inbox-Drafts nur noch ID-Referenz, wger↔yuhonas-Fuzzy-Match-Regression gefixt, strukturierter Feld-Editor in der TUI (2026-09-09)

Direkte Fortsetzung des Katalog-Search/Inbox-Fixes (`233dc19`, Eintrag unten).
Nach erneutem, scharfem User-Feedback ("die basis eines inbox drafts ist die id
zum wger UND zum yuhona äquivalent … nicht content dumpen sondern VERLINKEN per
ID", "die id kommt so oft vor") wurde die Draft-*Erzeugung* selbst auf reine
ID-Referenz umgestellt — nicht mehr nur der `source_snapshot`. Im selben Zug fiel
eine Regression der in `233dc19` eingeführten Equipment-Normalisierung auf
(False-Positive-Match "Jefferson Curl" → "Cable Curls"/"Kurzhantel-Curl" mit
Score 100) und wurde gefixt. Zuletzt auf Anfrage ("baue ein generelles skript
zum bearbeiten von bestehender drafts bzw zum editen von bestehender expert
exercises - inkl. tui") ein strukturierter Feld-Editor in die Katalog-TUI
eingebaut. Drei Commits: `1a04fdd` + `f8173a9` nach `origin/dev` gepusht,
`db28cdf` committet aber **noch nicht gepusht**. Kein Staging-/Prod-Deploy.
Betroffene Katalog-Tests grün (`test_exercise_schema`, `test_inbox_pipeline`,
`test_source_merge`); der vorbestehende `test_resolver`-Fail (jefferson_curl) ist
durch den Move (s.u.) mit aufgelöst.

* **`fitness/catalog/agent/inbox_actions.py`** (`1a04fdd`): `attach_source_snapshot()`
  dumpt keinen Rohtreffer mehr unter `origin.wger`/`origin.yuhonas`, verlinkt nur
  IDs. Neu `create_inbox_draft()` — legt Drafts ausschließlich mit ID-Referenz an
  (explizite `--wger-id`/`--yuhonas-id` oder Auto-Match), nie mit kopiertem Content.
* **`fitness/catalog/core/exercise_schema.py`** (`1a04fdd`): `build_source_snapshot()`
  komplett entfernt (war nach dem `233dc19`-Trim nur noch ID-Duplikat ohne
  Zusatznutzen). `test_exercise_schema.py` erwartet keinen `source_snapshot` mehr.
* **`fitness/catalog/coach_sheet.py`** (`1a04fdd`): "## Quellen"-Block wird live
  per ID über `find_source_entries()` nachgelesen statt aus gespeicherter Kopie.
* **`fitness/catalog/cli.py`** (`1a04fdd`): neue Commands `fitness-catalog new-draft`
  (ID-only-Draft) und `fitness-catalog find-source <name>` (durchsucht wger UND
  yuhonas zusammen — Ursache eines Recherche-Fehlers in dieser Session:
  wger-only-grep übersah "Bent Over Barbell Row", das nur in yuhonas existiert).
* **`fitness/catalog/core/source_merge.py`** (`f8173a9`): `_best_match_scored()`
  nutzt jetzt zusätzlich `fuzzy_candidate_allowed()` + `GENERIC_FUZZY_TOKENS` aus
  `resolver.py` als Gate — mind. ein nicht-generisches Wort muss zwischen Query
  und Kandidat übereinstimmen. Behebt den durch die Equipment-Normalisierung neu
  entstandenen False-Positive ("curl" als einziges Restwort nach dem Strippen
  reichte `token_set_ratio` für Score 100). "Walking Lunges" ↔ "Barbell Walking
  Lunge" bleibt korrekt bei 100.
* **`fitness/catalog/kb/exercises/jefferson_curl.yml`** (`f8173a9`, `git mv` aus
  `kb/inbox/`): lag fälschlich als Draft trotz `review_state.status: approved`;
  von redundanten Duplikatfeldern bereinigt (`id`/`name`/`wger_id: null` neben
  `exercise_id`/`display_name`, `source: unreviewed` → `expert`). Damit ist der
  `test_resolver`-Fail (jefferson_curl real in inbox statt exercises) mit erledigt.
* **`fitness/catalog/tui.py`** (`db28cdf`): neue `_edit_exercise_interactive()`
  (Rich-Prompt-Menü für Scalar- + Listen-Felder, Listen über `_edit_list_field()`)
  + `_save_exercise_to_file()` (schreibt nur den per `exercise_id` passenden
  Eintrag zurück, `.bak` vorher). Verdrahtet in `_inbox_detail` (neue Option "e"
  strukturiert neben "x" rohem `$EDITOR`) und `_browser_detail` (Expert-Exercises
  hatten vorher gar keine Edit-Option). Kein neues Framework, bleibt bei Rich.
* **Neue Inbox-Drafts (ID-Referenz-Format)**: `inbox_bent_over_barbell_row.yml`
  (`f8173a9`, umbenannt aus `inbox_vorgebeugtes_langhantelrudern_stehend.yml`;
  `wger_1489` + yuhonas `Bent_Over_Barbell_Row`) und `inbox_wide_grip_chin_up.yml`
  (`db28cdf`; User-Korrektur "mein untergriff klimmzug war einer im WEITEN GRIFF"
  ≠ regulärer/enger 021-Eintrag; `wger_152`/yuhonas `Chin-Up` als Basis).
* **Runtime-Sessiondatei `~/.aos/fitness/users/59ole…/sessions/2026-09-08.json`**
  (kein Repo-File): `wger_1489`-Eintrag → `bent_over_barbell_row` mit korrekten
  Muskeln inkl. Bizeps; zweiter Eintrag → `wide_grip_chin_up` mit korrigierten
  primary/secondary-Muskeln.

---

# Katalog: unreviewed-Duplikate aus `exercises/search` raus, wger↔yuhonas-Matching, `source_snapshot` entduplex (2026-09-08)

Ausgelöst durch konkrete schlechte Katalog-Einträge beim `fitness-log show` der
heutigen Session: "Klimmzüge (neutraler Griff)" (`wger_1529`) zeigte keinen Bizeps,
"Langhantelrudern (Obergriff)" (`wger_1489`) war zu unscharf, und der Nutzer
kritisierte scharf, dass jeder Inbox-Draft "derselbe Scheißdreck" sei: eine einzige
Quelle (wger), strukturell 10–13× redundant reingeschrieben, generische
Klimmzug-Boilerplate als `coaching_notes`, mit `expert-tier`/`reviewed`-Tags obwohl
reiner Gemini-Output. Claude hatte zwischenzeitlich `wger_1529` eigenmächtig per
`fitness-catalog inbox approve` freigegeben (Commit `d5f3abf`) — auf Ansage des
Nutzers ("wage es nicht etwas zu approven") per `git revert` rückgängig gemacht
(`4a4711d`), Draft zurück in `kb/inbox/` als `status: draft`. Kernauftrag danach
("die basis eines inbox drafts ist die id zum wger UND zum yuhona äquivalent …
nicht einfach den inhalt reindumpen sondern VERLINKEN per ID … und die unrevieweds
zugunsten der expert files auszuschalten in der exercisesearch"): drei
zusammenhängende Pipeline-Fixes, committet `233dc19`, nach `origin/dev` gepusht,
Staging-Deploy (`fitness-preview.service` :8100) per Post-Push-Hook grün. Betroffene
Katalog-Tests grün (`test_exercise_schema.py`, `test_inbox_pipeline.py`), ein
vorbestehender unabhängiger Fail (`test_jefferson_curl_is_expert_record`) blieb.

* **`fitness/api/routers/exercises_catalog.py`** (`233dc19`): `GET /exercises/search`
  zeigt unreviewed/bulk-Treffer nur noch als Fallback, wenn für denselben Query
  kein Expert-/Inbox-Treffer existiert. Vorher standen rohe wger-Duplikate
  gleichberechtigt neben kuratierten Einträgen.
* **`fitness/catalog/core/source_merge.py`** (`233dc19`): neue
  `_match_norm()`-Normalisierung (Geräte-Präfix `barbell`/`dumbbell`/`bodyweight`/…
  + Singular/Plural) speziell vorm wger↔yuhonas-Fuzzy-Vergleich in `_best_match`,
  bewusst **nicht** im generellen `normalize_text()`-/`resolve_query()`-Pfad.
  "Walking Lunges" vs. "Barbell Walking Lunge" springt damit von fuzz-Score 74 auf
  100 — Drafts referenzieren künftig öfter wirklich beide Quellen statt nur wger.
  Nutzer-Entscheidung: "Gezielte Normalisierung (sicherer)" statt globaler
  Schwellensenkung (`AUTO_MATCH_MIN_SCORE` 86 bleibt unverändert).
* **`fitness/catalog/core/exercise_schema.py`** (`233dc19`): `build_source_snapshot()`
  schreibt keine Text-Duplikate mehr (`original_description`/`instructions`/`images`
  raus), nur noch reine ID-Referenzen (`wger_id`, `wger_muscle_ids`, `yuhonas_id`).
  Das Coach-Sheet-Side-by-Side bleibt unberührt (nutzt separates
  `origin.wger`/`origin.yuhonas`-Feld, nicht `source_snapshot`).
* **`fitness/catalog/kb/inbox/inbox_wger_1529.yml`**: durch den Revert `4a4711d`
  aus `kb/exercises/wger_1529.yml` zurück in die Inbox verschoben, `status: draft` —
  weiterhin unreviewed/nicht approved.

---

# CLI-Aufräumen: `fitness coach/`-Subpackage, `fitness-strength` in `fitness-log` gemerged, echte Muskelnamen (2026-09-08)

Nachlauf zur CLI-Logging-Session (Commit `894877d`). Der Nutzer bemängelte zuerst,
dass `client_session.py` auch in `fitness/runtime/` fehl am Platz ist ("runtime ist
ja auch nicht richtig für das client_session.py"), dann dass `fitness-strength` als
drittes Binary neben `fitness-log` unnötige Fragmentierung ist ("werde ich nie im
Leben eintippen"), und zuletzt dass `fitness-log show` grobe Bucket-Regionen statt
echter Muskelnamen anzeigt ("warum stehen da die Buckets statt den echten Muskeln").
Alle drei umgesetzt, `npm run build` grün, Python-Syntax geprüft, `fitness-log show`
live verifiziert. Committed `4e64dd1` + `3a7a507`, beide nach `origin/dev` gepusht
(`3a7a507` force-pushed, weil Backticks in der ersten Commit-Message durch
Shell-Command-Substitution zerschossen wurden). Kein `fitness-release`/Prod-Deploy
in diesem Abschnitt.

* **`fitness/coach/`** (neu, `4e64dd1`): `client_session.py` via `git mv` aus
  `fitness/runtime/` hierher, plus `cli.py` (`log-client-workout` +
  `_prompt_exercises_interactive()`) aus `runtime/cli.py` verschoben. Begründung:
  `runtime/` ist Reparatur der Operator-eigenen Runtime-Daten
  (`~/.aos/fitness/users/*`, SQLite-History), Klienten-Workout-Logging
  (`~/Klienten/<id>/`) ist fachlich eine andere Domain und passt zu den
  bestehenden Coach-API-Routern. Command jetzt **`fitness coach log-client-workout`**
  (Move-Kette: `catalog/` → `runtime/` → `coach/`). Tote Imports in
  `runtime/cli.py` entfernt, `fitness coach` in `fitness/cli.py` gemountet.
* **`fitness/log/strength.py`** (neu, `3a7a507`): `fitness/strength/` komplett
  entfernt, Inhalt hierher als Funktionen (`add_exercise()`/`run_wizard()`) statt
  eigener Typer-App. `fitness-log` bekommt die neuen Subcommands **`add`** (vormals
  `fitness strength log`) und **`wizard`** (vormals `fitness strength wizard`).
  `fitness-strength`-Entry-Point aus `pyproject.toml` raus, `fitness strength`-
  Passthrough aus `fitness/cli.py` raus.
* **`fitness/muscles.py`** (`3a7a507`): neue `muscle_label()`-Funktion — löst eine
  einzelne Muskel-ID (`"201_latissimus_dorsi"`) auf den echten KB-Namen
  (`"Breiter Rückenmuskel Latissimus Dorsi"`) auf, statt sie via
  `muscle_to_group()`/`muscle_group_label()` auf grobe Regionen
  (`"Mittlerer Rücken"`) zusammenzufassen (wobei einzelne Muskel-Identität +
  Duplikate wie `"Mittlerer Rücken, Mittlerer Rücken"` verloren gingen).
* **`fitness/render.py`** (`3a7a507`): `render_detail` nutzt `muscle_label()` +
  dedupliziert die Muskelliste; alte `muscle_to_group`/`muscle_group_label`-Importe
  raus.
* **Runtime-Daten**: heutige Session (2026-09-08) korrigiert — "Biceps Curls" war
  tatsächlich einseitige Bizeps-KH-Curls, der Fuzzy-Resolver hatte sie bei
  medium-confidence stillschweigend auf Bizeps-LH-Curls (`wger_91`) umbenannt. Im
  Session-JSON auf `wger_92` (Bizeps KH-Curls, `primaryMuscles` `402`, `secondary`
  `403`) korrigiert, `exercise_id_at_log` nachgezogen, Notiz "(einseitig)" ergänzt,
  per `POST /session` gegen `:9150` neu synct (SQLite-Mirror mit). Backup unter
  scratchpad. `fitness/catalog/kb/inbox/inbox_wger_92.yml` als Enrichment-Nebeneffekt
  neu erzeugt (untracked, noch nicht committet/reviewed).

---

# CLI-Workout-Logging fortgesetzt + `fitness/commands/` aufgelöst (2026-09-08)

Nutzer-Anliegen: "kann ich per CLI auch schon ordentlich meine Workouts loggen?
das wurde anfangs schon gebaut, weiß nicht wo der Stand ist — bitte fortsetzen".
Bestandsaufnahme: `fitness activity log` (seit `278ec71`) loggt nur Cardio, `fitness
log` ist rein lesend, und `fitness/catalog/client_session.py` (`log-client-workout`)
macht zwar den richtigen JSON-SOT-POST, ist aber an einen Klienten-Slug gebunden
und lag ausserdem am falschen Ort. Daraus wurde ein neues Kraft-CLI + eine
Paket-Umstrukturierung. Committed `894877d`, gepusht, Post-Push-Hook hat den
Staging-Deploy (`:8100`) grün durchgeführt. `npm run build` grün, alle 152
Python-Dateien kompilieren, uv-Tool neu installiert, alle Binaries manuell getestet.

* **`fitness/strength/cli.py`** (neu, `fitness strength log|wizard`): Kraft-Session
  per CLI loggen — liest die bestehende Session per `GET /session` und **merged**
  Übung/Sätze hinein statt zu überschreiben (`rev` zählt korrekt hoch, live gegen
  `:9150` verifiziert). Fuzzy-Resolver gegen den Katalog (`resolve_query`), HIT-Modus
  (1 Satz bis Muskelversagen, `isHIT: true`, Reps/Gewicht optional — Nutzer trackt
  nur Gewicht). Sätze/Reps/Gewicht bleiben im CLI voll erhalten.
* **`fitness/commands/` komplett aufgelöst**: jedes Modul ist jetzt ein eigenes
  Subpackage (`fitness/log/cli.py`, `fitness/tui/cli.py`, `fitness/activity/cli.py`,
  `fitness/mail/cli.py`, `fitness/sync/cli.py`, `fitness/strength/cli.py` + je
  `__init__.py`), `fitness/log/console/` mitgezogen — Muster wie `catalog/`/`runtime/`.
  Ordnername `commands` war ausdrücklicher Nutzer-Wunsch weg.
* **`fitness/muscles.py`** (neu): geteilter `muscle_to_group()`/`muscle_group_label()`-
  Helper (lag vorher in `commands/__init__.py`) rausgezogen; Importe in `render.py`,
  `tui/cli.py`, `activity/cli.py` u.a. nachgezogen.
* **`fitness/runtime/client_session.py`** (verschoben aus `fitness/catalog/`):
  `client_session.py` + `log-client-workout` + `_prompt_exercises_interactive()`
  gehörten laut `catalog/CLAUDE.md` nie in den Katalog (Runtime-User-Daten-Reparatur
  lebt seit 2026-08-07 in `fitness/runtime/`). Command jetzt `fitness user-data
  log-client-workout`, aus `catalog/cli.py` entfernt.
* **`bin/fitness-log`** (neu, im Repo versioniert): löst den `uv`-Tool-Shim-Symlink
  in `~/.dotfiles/bin/` ab (uv legt den Symlink bei jedem `uv tool install` neu an
  und musste wiederholt entfernt werden).
* **`pyproject.toml`**: `[project.scripts]` auf die neuen Modulpfade umgestellt.
* **`fitness/catalog/kb/inbox/*.yml`** (10 neue Drafts): als Nebeneffekt des
  Session-Loggings automatisch vom proaktiven Enrichment erzeugt, mitcommittet.
* **Runtime-Daten**: heutiges Pull-Workout des Nutzers (2026-09-08) über das neue
  CLI sauber geloggt — 7 Übungen, je 1 Satz HIT, Gewicht wo bekannt (45 kg
  Langhantelrudern), RPE 9, Ort/Dauer in den Notizen; Core-HIIT-Finisher separat als
  Activity. Test-Sessions vom Live-Test vorher wieder gelöscht.

---

# Session-Tab: Kraft/Ausdauer-Wechsel überschreibt befüllte Session nicht mehr (2026-09-07)

Nutzer-Meldung: Wenn bei einer bereits angefangenen Session zwischen Kraft und
Ausdauer umgeschaltet wird, muss beim Loggen im jeweils anderen Modus eine **neue**
Session entstehen — die vorherige (aus der geswitcht wurde) darf nicht überschrieben
werden. Bisher bog der Umschalter den Modus immer direkt in der offenen Session um,
sodass der nächste Save unter derselben `sessionId` die zuvor geloggten Daten
überschrieb. Fix umgesetzt, Build zweifach grün (manuell + Pre-Commit-Hook),
committed `85781f7`, danach auf Nutzer-Ansage komplett deployed.

* **`src/views/Session/useSession.js`** (`85781f7`): `switchSessionMode` prüft jetzt
  via `sessionHasLoggedWorkout()`, ob in der offenen Session bereits Übungen/Aktivität
  eingetragen sind. Wenn ja, wird automatisch eine neue Session angelegt (gleiche
  Mechanik wie der "+"-Button) und der Modus dort gesetzt — die ursprüngliche Session
  bleibt unangetastet. Nur eine noch leere Session wechselt den Modus weiterhin
  in-place.
* **Deploy** (`fitness-release --yes`, vom Nutzer ausgelöst): `dev` gepusht
  (`c6a3a65..85781f7`), Staging (`:8100`) deployed, nach `vitalos` gemergt + gepusht,
  Firebase-Build grün, deployed nach `https://fitness-aos.web.app`, Submodule-Pointer
  im `vitalos`-Parent-Repo gebumpt (`dcbf15d`).
* **Prod-Deploy** (`pkexec fitnessctl prod deploy`, vom Nutzer im eigenen Terminal
  ausgeführt): `fitness.service` auf `:6100` ist jetzt ebenfalls auf dem aktuellen
  Stand mit dem Kraft/Ausdauer-Fix.

---

# Session-Tab: Gate poppt nicht mehr bei explizitem Datum auf + Scrollbar-Fix live (2026-09-07)

Nachlauf zur Session-Tab-Arbeit: Der Nutzer meldete, dass das Session-Gate-Sheet
weiterhin aufpoppte, obwohl ein spezifisches (nicht-heutiges) Datum gewählt war
("Session Gate darf nicht aufpoppen wenn ein spezifisches datum ausgewählt ist").
Ursache + Fix umgesetzt, Build zweifach grün (manuell + Pre-Commit-Hook), danach
auf Nutzer-Ansage ("Release") via `fitness-release --yes` deployed — womit auch der
im Vorlauf nur auf `dev` liegende Scrollbar-Fix (`1fc2758`) jetzt live auf
`fitness-aos.web.app` ist.

* **`src/App.jsx`** (`c6a3a65`): `gateAutoOpenFlag` wird nur noch gesetzt, wenn
  `sessionDate` tatsächlich `localToday()` ist. Vorher löste jeder `subTab`-Wechsel
  auf `'today'` das Gate aus, ohne zu prüfen, welches Datum gerade angezeigt wird —
  blieb `subTab` auf `'today'`, während per Day-Strip/Kalender-Icon ein anderes
  Datum gewählt wurde, poppte das Gate erneut auf.
* **`src/views/Session/SessionEditor.jsx`** (`c6a3a65`): zusätzliche Absicherung im
  Mount-Effect — Gate wird nur geöffnet, wenn `date === localToday()` (gegen eine
  mögliche Race zwischen Flag-Konsum und Editor-Remount bei `key={sessionDate}`).
  Neuer Import `localToday` aus `@utils`.
* **Deploy** (`fitness-release --yes`): `dev` gepusht, nach `vitalos` gemergt +
  gepusht, Firebase-Build grün, deployed nach `https://fitness-aos.web.app`;
  Submodule-Pointer im `vitalos`-Parent-Repo gebumpt (`ba3a0ae`). Live sind damit
  sowohl `c6a3a65` (Gate-Fix) als auch `1fc2758` (Scrollbar im Date-Picker-Strip
  via `.no-scrollbar` ausgeblendet).

---

# Session-Tab: Scrollbar im Date-Picker-Strip ausgeblendet (2026-09-06)

Kleiner Nachzügler nach dem Deploy der scrollbaren Datumsleiste (Eintrag
weiter unten, gleicher Tag): Der neue `overflow-x-auto`-Container machte die
native Scrollbar als sichtbaren Balken unter dem Day-Strip auf. Nutzer-Ansage
"die scrollleiste darf nicht visible werden im datepicker". Auf `dev`
committed (`1fc2758`), Build grün — liegt aber **hinter** dem letzten Release
(`ca43a9c` / Submodule-Bump `fdccec2`), ist also noch **nicht auf
`fitness-aos.web.app`**.

* **`src/views/Session/SessionHeader.jsx`** (`1fc2758`): dem Day-Strip-
  `overflow-x-auto`-Container die bereits vorhandene Utility-Klasse
  `.no-scrollbar` gegeben (`src/styles.css:143` — `scrollbar-width: none` +
  `::-webkit-scrollbar { display: none }`, Firefox + WebKit). Keine neue
  CSS-Regel nötig, Scroll-/Wisch-Funktion unverändert.

---

# Session-Tab: Keyboard-Nav, Activity-Typ-Module, "+Workout"-Lifecycle-Fix, scrollbare Datumsleiste (2026-09-06)

Fortsetzung der Session-Tab-Arbeit nach der Phase-1–4-Runde (Einträge vom
2026-09-05). Der Nutzer hat drei parallele Subagenten freigegeben (weiterer
`useSession.js`-Split, App-weite Tastaturnavigation, Activity-Typen als
Einzelmodule), danach eine 5-Punkte-Liste zum "+Workout anlegen"-Verhalten
abgearbeitet und am Ende selbst `fitness-release --yes` ausgelöst — alles ist
live auf `fitness-aos.web.app`, die `vitalos`-CI-Runs (Deploy Fitness PWA +
VitalOS Shell) sind grün.

* **`src/views/Session/useSession.js`** (`a5032c2`): weiter von 551 auf 357
  Zeilen gesplittet — neue Mini-Hooks `useSessionHistory.js` (89 Z.),
  `useSessionRuntimeSync.js` (84 Z.), `useSessionCrud.js` (130 Z.),
  `useSessionExport.js` (61 Z.). Haupthook koordiniert jetzt 8 Mini-Hooks,
  behält nur Basis-Session-Felder + `buildSessionPayload()`/`save()`. Externer
  Rückgabe-Vertrag unverändert (`index.jsx`/`SessionEditor.jsx` nicht
  angefasst). Bestehende Divergenz — `moveSessionToDate()` ruft
  `deleteSession(oldDate)` ohne `sessionId`, `handleDeleteSession()` mit —
  1:1 übernommen, im JSDoc vermerkt, nicht angeglichen.
* **Tastaturnavigation** (`3d501d2`, Lücke nachgezogen in `0e481ad`): neuer
  Hook **`src/hooks/useEscapeKey.js`**. ESC schließt jetzt das oberste offene
  Modal in `SessionModalsLayer.jsx`, `ExerciseInsightModal.jsx`,
  `AnatomyDetailModal.jsx`, `MuscleMapModal.jsx`,
  `views/Muscles/SessionDetailModal.jsx`, `common/UserProfile.jsx`,
  `SessionHeaderMenu.jsx` (verschachtelte Modals berücksichtigt, damit nicht
  zwei Ebenen gleichzeitig schließen). **`src/App.jsx`**: `Alt + ←/→`
  wechselt zyklisch durch `NAV_ITEMS` (nicht bei fokussiertem
  Input/offenem Modal); Set-Grid: `Enter` Reps→Weight→nächste Zeile, `↑/↓`
  gleiche Spalte. `activeModal` aus `useSession.js` wird via
  `SessionModalsLayer.jsx` nach `App.jsx` gemeldet, damit Alt+Pfeil bei
  offenem Session-Modal nicht mehr den Haupt-Tab wechselt.
* **`src/constants/activities/*.js`** (`17a283c`): je ein Modul pro
  Ausdauer-/Cardio-Typ (`Laufen`, `Radfahren`, `Rudern`, `Spazieren`,
  `Schwimmen`, `Wandern`, `Klettern`, `Yoga`, `Stretching`, `HIIT`) +
  `index.js`-Barrel mit `ACTIVITY_TYPES`. **`src/constants/ActivityConstants.js`**
  zu Barrel umgebaut, generiert `BLOCK_COLORS`/`ACTIVITY_LABELS`/
  `ACTIVITY_EMOJI`/`ACTIVITY_ICONS`/`ACTIVITY_MUSCLE_DEFAULTS`/
  `ACTIVITY_MUSCLE_GROUPS` via `Object.fromEntries()`. **`ActivityAddon.jsx`**:
  `ADDON_TYPES` aus `ACTIVITY_TYPES` generiert. `boxing`-Eintrag in
  `ACTIVITY_MUSCLE_GROUPS` (nicht in der 10er-Liste) bewusst hardcodiert
  belassen.
* **Session-Lifecycle / "+Workout anlegen"** (`37d5948`): Button bei leerem
  Tag entfernt (`SessionModeAndPills.jsx`) — die Übungsliste ist ohne Klick
  nutzbar, der Button erzeugte nur eine überflüssige zweite `sessionId`.
  Session-Pill-Label live aus `classifySession()` (SSOT statt bisher zwei
  abweichender Inline-Varianten): Split-Wahl (Push/Pull/Legs/Upper/Lower/Full)
  benennt sofort, Ausdauer zeigt die gewählte Sportart, Kraft ohne Split
  heißt "Kraft" (nie "Neues Workout"). Echter Bug behoben:
  **`useSessionExport.js::moveSessionToDate()`** reichte `sessionId` nicht an
  `saveSession()`/`deleteSession()` weiter → benannte Zusatz-Sessions wurden
  beim Datums-Verschieben **dupliziert statt verschoben**. Neuer
  `deleteSessionAtDate()` in `useSessionCrud.js` + Trash-Button je Karte in
  **`SessionHistory.jsx`** (Löschen direkt aus dem Verlauf, ohne Umweg über
  den Editor).
* **`src/views/Session/useDayStrip.js`** (`5fd9e50`): Datumsleiste komplett
  neu — alle `rollingDays` (bis 365) in einem `overflow-x-auto`-Container
  statt festem 7-Tage-Fenster mit Chevron-Sprüngen; ausgewähltes Datum wird
  automatisch ins Bild gescrollt, Chevrons bleiben als Zusatz.
  `SessionHeader.jsx`-Markup entsprechend angepasst.
* **Deploy**: `fitness-release --yes` (vom Nutzer ausgelöst) — `dev` →
  `origin/dev` (`ca43a9c`), Staging-Deploy `:8100`, Merge nach `vitalos`
  (57 Dateien, konfliktfrei), Firestore-KB-Sync, Firebase-Build + Deploy nach
  `fitness-aos.web.app`, Submodule-Pointer in `~/vitalos` gebumpt (`fdccec2`).
  `vitalos`-CI beide Runs grün.
* **Subagent-Kollision**: die zwei parallelen Subagenten (Tastaturnav +
  Activity-Split) liefen im **selben** Arbeitsverzeichnis statt in Worktrees;
  der Keyboard-Agent hat per `git commit --amend` versehentlich
  `ActivityConstants.js`/`ActivityAddon.jsx` auf den alten Stand
  zurückgesetzt, die neuen `activities/*.js` blieben unstaged. Beim
  Gegenlesen gefunden und in `17a283c` sauber nachgeholt — nichts verloren.

---

# Firebase Coach-API-Base auf Funnel/6100 konfigurierbar gemacht (2026-09-06)

Ausgangspunkt: Der lokale Fitness-Prod-Server laeuft auf `:6100`, und der
Tailscale Funnel routet nun `/fitness/` auf `http://127.0.0.1:6100/`.

* **Runtime-Aufloesung statt Hardcode**:
  `src/lib/db/firestore/core.js` bestimmt `LOCAL_FITNESS_API_BASE` jetzt in
  dieser Reihenfolge: `localStorage["fitness-local-api-base"]`,
  `VITE_LOCAL_FITNESS_API_BASE`, Firebase-Hosting-Default
  `https://ideapad.tail7a15d6.ts.net/fitness/fitness`, sonst Desktop-Fallback
  `http://127.0.0.1:6100/fitness`.
* **Handy/Firebase-Pfad**: Auf `fitness-aos.web.app` gehen Coach-Inbox-Aktionen
  damit automatisch ueber den Funnel auf den lokalen Prod-Server. Der doppelte
  Pfadteil `/fitness/fitness` ist durch Funnel-Prefix plus Backend-Route
  bedingt.
* **Doku**: `docs/FIREBASE.md` erklaert jetzt Web SDK, Admin SDK, lokalen
  FastAPI-Prod-Server, `0.0.0.0` vs Browser-URL, Tailscale/Funnel und die
  aktuelle harte Coach-Tab-Grenze bei `approveInbox()`.

Offen bleibt: `approveInbox()` laeuft im Firebase-DB-Layer noch direkt gegen
Firestore. Wenn Approve lokale Expert-YAMLs erzeugen soll, muss auch diese
Aktion ueber den lokalen `:6100`-Pfad laufen.

---

# Fuel-Imports aus Fitness-Firebase-Build entfernt (2026-09-06)

Der Firebase-Build zeigte Vite-Warnings zu `/home/alpha/fuel-dev`, weil Fitness
zwei Fuel-Couplings hatte:

* `src/components/common/UserProfile.jsx` importierte `@fuel/store.js`.
* `src/lib/db/index.firestore.app.js` re-exportierte Fuel-History-Funktionen aus
  `@fuel/lib/db/firestore/index.js`.

Beides ist entfernt. `UserProfile` nutzt jetzt den Fitness-`UserContext`, und
die alten Nutrition/Supplement-History-Exports bleiben als leere Fitness-Stubs
erhalten. Fitness braucht damit auch im Coach-Tab keine Fuel-Schicht.

---

# Coach-Inbox: Firebase nutzt lokalen Prod-Server fuer Source-Merge (2026-09-06)

Ausgangspunkt: Inbox-Drafts hatten teils nur eine Quelle verlinkt (`wger` oder
`yuhonas`), und ein Reenrich wirkte nicht nachvollziehbar. Gewuenschter
Produkt-Schnitt: im Coach-Tab soll die Inbox wie Kontakte am Handy Kandidaten
zum Zusammenfuehren zeigen; der Coach bestaetigt die Quelle explizit, damit der
spaetere Expert-Draft beide externen IDs referenziert.

* **Firebase-Inbox-Backendpfad**: `src/lib/db/firestore/core.js` nutzt fuer
  lokale Coach-Aktionen jetzt `http://127.0.0.1:6100/fitness` statt des alten
  `BRIDGE_API_BASE`/Tailscale-Bridge-Pfads. `src/lib/db/firestore/inbox.js`
  ruft darueber `reenrich`, `merge-candidates`, `duplicates`,
  `merge-duplicates` und den neuen Source-Link-Endpunkt auf.
* **Lokaler Prod-Backendpfad :6100**: Live-Check
  `curl -sS http://127.0.0.1:6100/health` antwortet als FastAPI-Prod
  (`env: "prod"`). Die Firebase-App trifft fuer Coach-Inbox-Aktionen also
  direkt den Python-Prod-Server auf `:6100`.
* **Node-Kompatibilitaetsproxy**: `server.mjs` hat neue Proxy-Routen fuer
  `POST /fitness/inbox/{id}/reenrich`,
  `POST /fitness/inbox/{id}/link-source`,
  `GET /fitness/inbox/{id}/duplicates` und
  `POST /fitness/inbox/{id}/merge-duplicates`, falls die Node-Oberflaeche
  denselben lokalen Pfad proxyt. Die CORS-Antwort setzt jetzt auch
  Methods/Headers, damit JSON-POSTs aus einer Browser-Origin nicht am
  Preflight scheitern.
* **Expliziter Source-Merge**: `fitness/api/routers/exercises_inbox.py` hat
  `POST /fitness/inbox/{id}/link-source`. Der Endpunkt nimmt
  `{source: "wger"|"yuhonas", source_id, uid, doc_id, current_data}` entgegen,
  sucht den Rohdatensatz in `unreviewed_wger.yml` oder `unreviewed_yuhonas.yml`,
  schreibt `wger_id`/`yuhonas_id`, `external_ids.*` und `origin.wger` bzw.
  `origin.yuhonas` in den Draft und aktualisiert bei Firestore-Kontext das
  originale `fitness/{uid}/inbox/{doc_id}`-Dokument (`status: source_linked`,
  `enriched: ...`).
* **Coach-UI**: `src/views/Inbox/InboxCard.jsx` zeigt bestehende
  Merge-Kandidaten nicht mehr nur passiv an, sondern bietet pro Kandidat einen
  `Verbinden`-Button. `src/views/Inbox/useInbox.js` reicht den aktuellen
  Draft-Payload mit, damit Firestore-Doc-ID und lokale Draft-ID auseinanderfallen
  duerfen. `src/views/Coach/index.jsx` verdrahtet die Aktion im Coach-Tab.
* **Coach-Sheet Reenrich-Vertrag nachgeschaerft**: Der Reenrich-Button im
  Coach-Sheet war bisher praktisch "AI-Text neu" und konnte bestaetigte
  Source-Verknuepfungen verlieren, wenn das Modell sie nicht erneut ausgab.
  `ExerciseInsightModal.jsx` kann Source-Kandidaten jetzt ebenfalls direkt im
  Sheet verbinden, und `fitness/catalog/core/inbox_pipeline.py` erhaelt beim
  Rebuild bestaetigte Provenance-Felder (`wger_id`, `yuhonas_id`,
  `external_ids`, `origin`, `source_snapshot`, Rohbeschreibung/Instructions).
  Genutzt wird das im API/Watcher-Reenrich und im CLI/TUI-Reenrich; der
  Firestore-Vertex-Fallback spiegelt dieselbe Regel in JS.
* **Test/Build**: `python -m unittest fitness.catalog.tests.test_inbox_actions
  fitness.catalog.tests.test_inbox_pipeline fitness.catalog.tests.test_source_merge`
  laeuft gruen (14 Tests). `node --check server.mjs` und
  `npm run build -- --mode firebase` laufen gruen; Vite meldet nur bestehende
  Chunk-/Fuel-Dynamic-Import-Warnings. `git diff --check` ist sauber.

Offen: `approveInbox()` im Firebase-DB-Layer schreibt weiterhin direkt nach
Firestore `fitness/kb/exercises`. Durch den Source-Link enthaelt dieses
Firestore-Expert-Dokument die bestaetigten IDs. Ein vollstaendiger
Firebase-Approve ueber den lokalen `:6100`-Prod-Pfad, der zusaetzlich lokale
YAML-Expert-Dateien erzeugt, ist ein separater naechster Schritt.

---

# Vier-SOT-Konfliktmodell dokumentiert + Phase 1–4 nach vitalos deployed (2026-09-05)

Abschluss der Session-Tab-Rebuild-Arbeit (siehe Einträge darunter). Nach einem
weiteren Context-Compact hat der Nutzer die letzte offene Doku-Aufgabe aus
`PHASE4_TODO.md` freigegeben ("ja schreib die docs noch") und danach
`fitness-release --yes` ausgelöst — womit alle bis dahin nur lokal auf `dev`
liegenden Commits (Phase 1–4, Macrocycles-Proxy, server.mjs-Modularisierungs-
TODO, SOT-Doku) gepusht, in `vitalos` gemergt und nach `fitness-aos.web.app`
deployed wurden. Die Kette lief fehlerfrei durch.

* **`docs/ARCHITECTURE.md`** (`2893ede`): Session-Storage-Konfliktmodell um
  die bisher fehlende vierte Schicht ergänzt — den Frontend-Runtime-Draft
  (`localStorage`, `sessionRuntimeStore.js`) — inkl. eigener Konfliktregel:
  der Draft gewinnt immer (reiner Zeit-Vorrang für den Client, bewusst kein
  rev-Vergleich wie bei Firestore), bis ein Save bestätigt ist, damit
  Reload/Offline nie wie Datenverlust aussieht.
* **`src/views/Session/AUDIT.md`**: neuer "Auffälligkeiten (2026-09-05)"-
  Eintrag mit dem vollständigen Dual-DB-Layer-Befund (`ROLE_W`-Gewichte waren
  bereits identisch / Audit-Punkt stale, der Firestore-KB-Fallback-Fix war
  real, `getPlanSuggestion()` bleibt bewusst divergent) als Querverweis.
* **`src/views/Session/PHASE4_TODO.md`**: Definition-of-Done Punkt 3 auf
  `[x]`. Kein Dual-DB-"eine Seite führt"-Beschluss getroffen (bewusst der
  Zielzustand), aber die Konfliktlage ist jetzt an einer Stelle nachlesbar.
* **Deploy via `fitness-release --yes`**: `dev` → `origin/dev` gepusht, in
  den `vitalos`-Worktree gemergt + gepusht (Post-Push-Hook: KB-Data-Rebuild →
  `vite build --mode firebase` → Firebase-Deploy nach `fitness-aos.web.app`),
  Submodule-Pointer im `vitalos`-Parent-Repo gebumpt. Damit sind live: der
  Mini-Hook-Split von `useSession.js` (`useExerciseList`/`useSessionActivity`/
  `useSessionSlots`/`useSessionGateController`), der zentrale `activeModal`-
  State (`SessionModalsLayer.jsx`), der Firestore-KB-Fallback-Fix in
  `src/lib/db/firestore/analysis.js`, der `/fitness/coach/macrocycles/*`-Node-
  Proxy (`e472849`) und das `server.mjs`-Modularisierungs-TODO (`81122fc`).

---

# Session-Tab Rebuild Phase 3 Stück 4 + Phase 4 abgeschlossen (2026-09-05)

Direkte Fortsetzung nach mehreren Context-Compacts. Nutzer wies "weiter mit
stück 4 dann phase 4" an, danach die Nachfrage "was ist mit dem dual-db-layer
los?". Damit sind Phase 3 (alle 4 Stücke) und Phase 4 (Stück 1 umgesetzt,
2+3 geklärt/dokumentiert, 4 mit expliziter Freigabe gefixt) aus
`PHASE3_TODO.md`/`PHASE4_TODO.md` abgehakt. Alle Commits liegen lokal auf
`dev`, **nichts gepusht/gemergt**.

* **`src/views/Session/useSession.js`** (Phase 3 Stück 4, `dff5d3d`): von
  771 auf 548 Zeilen geschrumpft, in vier Mini-Hooks aufgespalten —
  `useExerciseList.js` (181 Z., neu), `useSessionActivity.js` (47 Z., neu),
  `useSessionSlots.js` (61 Z., neu), `useSessionGateController.js` (113 Z.,
  neu). Externer Rückgabe-Vertrag des Haupthooks unverändert.
  Interdependenzen vorab dokumentiert: `moveExercise()` braucht nur
  `exercises[]` (keinen Slot-Zugriff), `removeSlot()` ist die einzige
  Kopplungsstelle zu `setExercises`, der Gate-Controller nutzt `save()` per
  Hoisting.
* **GPS-Fehlerpfad** — als "Bug" im Audit gelistet, tatsächlich nur ein
  Enum; `resolveGeoLocation()` degradiert intern still. Reine
  Doku-Korrektur, kein Code-Fix.
* **Auto-Save-Race** — echter Fix: `savingRef`-Guard verhindert, dass der
  localStorage-Draft-Effect `syncState:'saving'/'queued'` auf `'local'`
  zurücksetzt, während ein Save läuft.
* **`src/views/Session/SessionEditor.jsx`** auf reinen Orchestrator
  zurückgestutzt: Cardio-Block → **`CardioSection.jsx`** (neu), Gate-Sheet-
  Portal → **`SessionGateSheet.jsx`** (neu).
* **`src/views/Session/SessionModalsLayer.jsx`** (neu, Phase 4 Stück 1,
  `81401ca`): `showSidebar`/`showTabSettings` (aus `useSession.js`) + lokales
  `gateSheetOpen` (aus `SessionEditor.jsx`) zu einem `activeModal`-State
  zusammengeführt (`null|sidebar|settings|gate`). Neue Komponente bündelt
  alle drei Portal-Calls; die einzelnen Modal-Komponenten selbst unverändert.
* **Phase 4 Stück 2** (`SessionSidebar` inline + Modal): vom Nutzer als
  absichtlich bestätigt — nichts geändert. **Stück 3** (Gate-Sub-Tab-
  Router): untersucht, es gibt **keinen** zweiten State-Router (`subTab`/
  `onSubNav` kommt überall aus `App.jsx`). Gefundener echter Drift: zwei
  unabhängig gepflegte Label/Reihenfolge/`comingSoon`-Listen derselben 5
  Sub-Tab-IDs (`src/constants/NavigationItems.js` vs.
  `SessionGateCard.jsx::SESSION_NAV_ITEMS`) — nur in **`PHASE4_TODO.md`**
  dokumentiert, nicht vereinheitlicht (Commit `52555db`, doc-only).
* **`src/lib/db/firestore/analysis.js`** (Phase 4 Stück 4, `c21bf15`):
  Dual-DB-Layer geprüft statt zusammengelegt. `ROLE_W`-Gewichte in
  `local`/`firestore` sind bereits identisch (Audit-Punkt stale). Realer
  Unterschied: `firestore/analysis.js::normalizedSessionHits()` hatte keinen
  KB-Fallback wie `local/analysis.js::sessionHits()` — Übungen ohne eigene
  Muskeldaten (z.B. Quick-Add vor Enrichment) zählten auf der Firebase-PWA
  nicht zur Coverage. Mit Freigabe gefixt: optionaler `kbMap`-Parameter +
  gleicher Fallback; `getMuscleCoverage()` baut `kbMap` jetzt aus
  `getAllExercises()` (vorher nicht geladen), `getMonthlyReport()` reicht
  sein bereits vorhandenes `kbMap` durch. Beide Dateien bleiben eigenständig.
  `getPlanSuggestion()` bewusst komplett divergent gelassen.
* **`src/views/Session/PHASE3_TODO.md`** / **`PHASE4_TODO.md`** durchgängig
  aktualisiert. `npm run build` (inkl. Pre-Commit-Hook) bei jedem Schritt
  grün. Commits: `dff5d3d`, `81401ca`, `52555db`, `c21bf15` — alle nur
  lokal auf `dev`.

---

# Session-Tab Rebuild Phase 3, Stück 2+3 (ExerciseList.jsx, SessionSlots.jsx) (2026-09-05)

Fortsetzung von Phase 3 nach Context-Compact — Nutzer wies "mach weiter mit
Stück 3" an, danach "weiter mit Stück 4 dann aus Phase 3" (noch nicht
begonnen). Stück 2 (`ExerciseList.jsx`) und Stück 3 (`SessionSlots.jsx`)
aus `PHASE3_TODO.md` sind jetzt beide abgehakt.

* **`src/views/Session/useSession.js`**: neues gebündeltes `exerciseOps`-
  Objekt (`updateEx, addSet, removeSet, removeEx, replaceSets, moveEx,
  addEx, quickInput, setQuickInput, addQuick, onToast`) ersetzt 11 einzelne
  Props, die bisher separat durch `SessionEditor.jsx` an
  `ExerciseList`/`SessionSlots` durchgereicht wurden. Reine
  Anzeige-/Kontext-Props (`exercises`, `restHours`, `muscleRecovery`,
  `date`, `prevMap`, `onInspectExercise`) bleiben bewusst einzeln, da Basis-
  Abschnitt und Slots hier unterschiedliche Werte brauchen.
  Zusätzlich `reorderSlots(activeId, overId)` ergänzt (`arrayMove()` aus
  `@dnd-kit/sortable`, vergibt `order` für alle Slots neu — das Feld
  existierte vorher schon, wurde aber nie tatsächlich geändert).
* **`src/views/Session/ExerciseList.jsx`**: auf den neuen `exerciseOps`-
  Contract umgestellt, `type: 'exercise'` in die Sortable-Daten ergänzt
  (für die Unterscheidung der beiden Reorder-Pfade in `handleDragEnd()`),
  JSDoc-Kommentar zur `DndContext`-Abhängigkeit ergänzt (kein lokaler
  Fallback, `SessionEditor.jsx` muss den gemeinsamen Context bereitstellen).
* **`src/views/Session/SessionSlots.jsx`**: Nested-DnD-Problem gelöst
  (User-Entscheidung: volles verschachteltes dnd-kit-Sortable statt
  Pfeil-Buttons) — Slots sind jetzt per eigenem Griff-Icon
  (`SortableSlotRow`) untereinander sortierbar, in derselben `DndContext`
  wie die Exercise-Listen (ein zweiter, echt verschachtelter `DndContext`
  wäre von dnd-kit nicht erkannt worden). An zwei Stellen musste
  `addEx`-Konsum auf `exerciseListProps.exerciseOps.addEx` umgestellt
  werden (Slot-Override beim Anhängen der `slotId`, Template-Anwendung in
  `handleUseTemplate()`). `SlotCard.jsx` (neu) rein mechanisch aus
  `SessionSlots.jsx` herausgelöst, keine Logik verändert —
  `SessionSlots.jsx` kümmert sich jetzt nur noch um Slot-Liste, Reorder,
  Templates und Add-Button. Props-Rest-Spread auf 6 Keys reduziert
  (vorher 16), profitiert direkt vom `exerciseOps`-Bündel.
* Template-Persistenz (`getSlotTemplates`/`saveSlotTemplate` über `@db`)
  gegengeprüft — läuft sauber über beide Barrels (lokal/Firestore), kein
  Fix nötig.
* **`src/views/Session/PHASE3_TODO.md`** — Stück 2 und 3 vollständig
  abgehakt. Build verifiziert (Pre-Commit-Hook), committed (`f8020b5`
  für Stück 2, `540dfc7` für Stück 3), **keiner der beiden Commits
  gepusht**.

---

# Session-Tab Rebuild Phase 3 (ExerciseCard-Restpunkte) abgeschlossen (2026-09-05)

Fortsetzung der Session-Tab-Rebuild-Arbeit vom selben Tag (siehe Eintrag
direkt darunter). Nach einem Context-Compact hat der Nutzer explizit "Phase 3"
angewiesen — die vier noch offenen Checkbox-Punkte zu `ExerciseCard.jsx` aus
`PHASE3_TODO.md` (Stück 1) wurden einzeln durchgegangen und abgeschlossen.

* **`stepReps()`/`stepWeight()`** gegengelesen (Punkt aus dem Audit, der
  ursprünglich als "Copy-Paste-Duplikat zusammenführen" markiert war):
  tatsächlich **nicht identisch** — `stepReps` parst Integer und blockt bei
  aktivem NxM-Pattern, `stepWeight` parst Float mit Komma→Punkt-Konvertierung
  und rundet auf 2 Nachkommastellen. Bewusst getrennt gelassen (passend zur
  neuen Memory-Regel, divergentes Verhalten nicht zu vereinheitlichen).
* **`src/views/Session/ExerciseCard.jsx`**: Async-Trend-Fetch jetzt mit
  Cleanup (kein Race-Condition-Risiko mehr bei schnellem Übungswechsel);
  Toast-Feedback bei fehlgeschlagenem NxM-Set-Parse ergänzt; `formatMuscle`/
  `muscleTags`-Berechnung per `useMemo` memoisiert (lief vorher bei jedem
  Render neu, auch bei reinen Set-/Toast-Updates) — dafür `showToast`
  durchgereicht von `useSession.js` → `SessionEditor.jsx` →
  `ExerciseList.jsx`/`SessionSlots.jsx` → `ExerciseCard.jsx`.
* **`src/views/Session/PHASE3_TODO.md`** — Stück 1 (`ExerciseCard.jsx`)
  vollständig abgehakt. Build verifiziert (Pre-Commit-Hook), committed
  (`9ff7d78`), **nicht gepusht**.

---

# Session-Tab Rebuild Phase 1+2, TodayPlan-Datumsbug gefunden+gefixt, Multi-Repo-CI-Blocker behoben (2026-09-05)

Ausgangspunkt war ein Klienten-Bug-Report (Matthias: "Session-Tab hängt in
Oktober 2025 fest, kommt nicht mehr zum aktuellen Datum zurück"). Auf dem
Weg dorthin wurde ein Haiku-Doppel-Audit des gesamten Session-Tabs
angestoßen (DB-Layer + UI-Reihenfolge von oben nach unten), daraus vier
Rebuild-Phasen abgeleitet und in mehreren Worktree-Subagenten Phase 1+2
umgesetzt. Ein Nutzer-Grundsatz wurde dabei erneut geschärft: divergentes
Verhalten zwischen ähnlichen Komponenten wird nicht vereinheitlicht — ein
bereits gemergter Merge (`ActivityAddon`+`ActivitySection` → `ActivityPicker`)
wurde deshalb explizit zurückgerollt. Die Fehlersuche selbst eskalierte am
Ende versehentlich zu einem repo-übergreifenden CI-Fix mit einem
ungewollten Live-Redeploy von `fuel-os.web.app` als Nebenwirkung — im
Transcript vom User gestoppt und offen als Fehleinschätzung benannt.

* **`src/views/Session/index.jsx`** — **Root-Cause-Fix des eigentlichen
  Bugs**: `isTodayTab` prüfte bisher nur `subTab === 'today' || !subTab`,
  nicht das tatsächliche Session-Datum. `parseHashRoute()` lässt `subTab`
  bei explizitem Datums-Deep-Link leer, wodurch `!subTab` fälschlich
  `true` wurde — kombiniert mit dem Key-basierten Remount des
  `<Session>`-Baums (killt den lokalen `logFreely`-Flag bei jedem
  Datumswechsel) blieb der Coach-Habit-Screen (`TodayPlan.jsx`) hartnäckig
  über jedem anderen Datum liegen. Fix: `isTodayTab` prüft jetzt zusätzlich
  `date === localToday()`. Committed (`e4e9493`), gepusht, per
  `fitness-release` nach `vitalos` gemergt und live deployed.
* **Session-Tab Rebuild Phase 1** (`SplitPicker.jsx`, `EffortPicker.jsx`,
  neu extrahiert: `SessionToast.jsx`, `SessionSaveFab.jsx`,
  `ActivityAddonHistory.jsx`) — kleine, risikoarme Extraktionen aus dem
  `SessionEditor.jsx`-Monolithen, per zwei parallelen Worktree-Agenten
  umgesetzt und kontrolliert gemergt. Committed (`677c5c3`).
* **Session-Tab Rebuild Phase 2** — `SessionHeader.jsx` entwirrt in
  `SessionHeaderMenu.jsx` (Portal-Overflow-Menü) + `SessionModeAndPills.jsx`
  (Session-Pills/Kraft-Ausdauer-Switch) + `parseLocalDate()`-Helper in
  `utils.js` (`b23bb2a`). `ActivityAddon.jsx`/`ActivitySection.jsx` wurden
  zunächst zu einer gemeinsamen `ActivityPicker.jsx` zusammengeführt,
  danach auf Nutzer-Grundsatzentscheidung wieder **zurückgerollt** — beide
  Komponenten bleiben bewusst getrennt (divergente Defaults: 9 vs. 10
  Activity-Types, unterschiedliche Muscle-Target-Sichtbarkeit sind
  Absicht, kein Duplikat).
* **`src/views/Session/ExerciseCard.jsx`** — in Phase 3 (erstes Teilstück)
  reine Auseinanderziehung in `ExerciseCardHeader.jsx`,
  `ExerciseHistoryCollapse.jsx` und den Set-Grid-Teil, ohne
  Verhaltensänderung. Committed (`5e713b6`).
* **Neue stehende Memory-Regel** (`feedback_never_unify_divergent_implementations.md`,
  global): divergentes Verhalten zwischen ähnlichen Komponenten ist fast
  immer Absicht/Verlust-Signal, wird nicht durch Merge/Vereinheitlichung
  "bereinigt" — Phase-3/4-TODOs entsprechend nachgeschärft (`stepReps`/
  `stepWeight`, Dual-DB-Layer, Details/Sidebar-"Duplikat" jetzt als "erst
  hinterfragen" statt "zusammenführen" formuliert).
* **`src/views/Session/PHASE1_TODO.md` … `PHASE4_TODO.md`** (neu) — Vier
  Rebuild-Phasen aus dem Haiku-Doppel-Audit dokumentiert, dienen als
  Fortsetzungs-Basis für Phase 3 (`ExerciseList.jsx`, `SessionSlots.jsx`,
  `useSession.js`-Split) und Phase 4 (Modals, Details/Sidebar, Dual-DB-Layer).
* **`server.mjs`** — fehlende Proxy-Routen für `/fitness/coach/macrocycles/*`
  ergänzt (Python-Backend-Router `fitness/api/routers/macrocycles.py` war
  bereits vollständig implementiert, nur der Node-Proxy fehlte). Macht
  den Coach-Makrozyklus/TodayPlan-Screen jetzt auch im lokalen Dev-Server
  nutzbar, nicht mehr nur in der Firebase-PWA. Committed (`e472849`),
  **nicht gepusht**.
* **CI-Fix, repo-übergreifend** (`fitness-dev`, `vitalos`, `fuel-dev`,
  `habits-dev`): `npm ci` scheiterte in allen Deploy-Workflows dauerhaft
  (`EUSAGE`, mind. seit 2026-09-02), weil `@vos/cross-app-aliases` in
  `fuel-app`/`habit-app` als fragiler `file:../vitalos/...`-Pfad deklariert
  war, der nur im Standalone-Checkout auflöst, sowie durch eine intern
  inkonsistente `vitalos/package-lock.json`. Fix: `@vos/cross-app-aliases`
  in `fuel-dev`/`habits-dev` als `optionalDependencies` mit fixierter
  `"1.0.0"`-Version (beide `vite.config.js` hatten bereits Try/Catch-
  Fallbacks) statt `file:`-Pfad; `vitalos/package-lock.json` neu generiert
  und gegen `npm ci` verifiziert. **Nebenwirkung**: Push nach
  `fuel-dev`/`master` löste automatisch ein Live-Redeploy von
  `fuel-os.web.app` aus (unangekündigter Seiteneffekt, im Transcript vom
  User gestoppt).
* Nebenbei durch eigene `rm -rf node_modules`/`npm ci`-Tests versehentlich
  `fitness-dev`s lokalen `node_modules` geleert (Dev-Server dadurch kurz
  down) — durch `npm install` wiederhergestellt, User musste den
  `nodemon`-Prozess manuell neu starten.

---

# Session-Tab: Vite-Crash-Ursache + Sprach-Filter-Bug behoben, dev→vitalos deployed (2026-09-02)

Auftrag war unspezifisch ("sieh zu dass im Session-Tab alles glatt läuft"),
daher zuerst durchgetestet statt aus TODO/NEXT zu raten. Zwei getrennte
Ursachen gefunden und live gefixt: ein wiederkehrender Dev-Server-Crash
sowie ein handfester Suche-Bug, der Übungen in der Firebase-PWA unsichtbar
machte.

* **`vite.config.js`**: `watch.ignored` schloss bisher nur `dist*`,
  `.firebase`, `node_modules` aus — `.venv` (93 MB/3336 Dateien),
  `.worktrees`, `catalog-ui`, `functions`, `__pycache__` u.a. wurden von
  chokidar mitüberwacht und haben den Dev-Server (nodemon/vite) wiederholt
  zum Absturz gebracht. Jetzt zusätzlich ausgeschlossen.
* **`src/lib/exerciseLanguage.js`**: Die Sprach-Erkennungs-Regex
  (`ES_TOKENS`/`ES_SUFFIX` u.a.) nutzte Zeichenklassen wie `[ée]`/`[ií]`/
  `[oó]` für "mit oder ohne Akzent" — die Klasse matcht dabei aber auch das
  reine ASCII-Zeichen. Dadurch wurden ~130 normale englische Übungsnamen
  (`Incline Bench Press`, `Triceps Pushdown`, `Leg Extension`, ...)
  fälschlich als FR/PT/ES erkannt und da diese Sprachen standardmäßig aus
  der Suche ausgeblendet sind, verschwanden diese Übungen einfach aus den
  Ergebnissen. Fix verlangt jetzt den echten Akzent; echte ES/FR/PT-Namen
  (`Sentadilla`, `Extensión de piernas`) werden weiterhin korrekt erkannt.
  Verifiziert per Node-Skript: Verteilung vorher `{es:56, fr:38, pt:18}`
  fälschlich, nachher `{es:4, pt:2}` (nur noch echte Treffer).
* Die auffällig leere `fitness/catalog/kb/exercises/approved_from_firebase.yml`
  war ein roter Hering — bereits bekanntes/beabsichtigtes Verhalten des
  Firestore-Approve-Rückbuchungs-Bugs, keine neue Ursache.
* Committet als `7b472a8` auf `dev`, gepusht (Post-Push-Hook: Lint + Build
  grün). Danach per `fitness-release --yes` nach `vitalos` gemergt und live
  nach **fitness-aos.web.app** deployed — beide Fixes sind jetzt in Prod.

---

# Merge-Kandidaten-Hinweise in Coach-Inbox-UI (Task #3 abgeschlossen) (2026-09-02)

Fortsetzung der Vortags-Session: Task #3 ("Audit-Flags/Merge-Hinweise auch
in der Coach-Inbox-UI zeigen, nicht nur im CLI-Coach-Sheet") war offen
geblieben. Zusätzlich wurde in dieser Session live präzisiert, worum es dem
User eigentlich ging (nicht Feld-Verschmelzung, sondern unsichere
wger-/yuhonas-Fuzzy-Treffer sichtbar machen, damit der Coach manuell
entscheiden kann) — die vorherige `origin.wger`/`origin.yuhonas`-Struktur
aus 161bfd0 blieb dabei unverändert korrekt.

* **`fitness/catalog/core/merge_candidates.py`** (neu): `list_inbox_merge_candidates()`
  liefert für jeden Inbox-Draft ohne bereits verlinkten wger-/yuhonas-Treffer
  einen Fuzzy-Kandidaten mit Score, ohne etwas zu schreiben (reine Anzeige).
* **`fitness/api/routers/exercises_inbox.py`**: neuer Endpoint
  `GET /fitness/inbox/merge-candidates`.
* **`server.mjs`**: Node-Proxy für den neuen Endpoint.
* **`src/lib/db/local/inbox.js`** + **`src/lib/db/firestore/inbox.js`**:
  `getInboxMergeCandidates()` in beiden DB-Layern ergänzt (Firestore-Variante
  liefert bei Nichterreichbarkeit des lokalen Rechners einfach leer, statt
  zu werfen — Kandidaten sind optionaler Hinweis, kein Pflichtfeld).
* **`src/views/Inbox/useInbox.js`**, **`src/views/Coach/index.jsx`**: laden
  und reichen `mergeCandidates` durch.
* **`src/views/Inbox/InboxCard.jsx`**: neuer oranger Hinweis-Block
  ("Möglicher Merge-Kandidat (wger/yuhonas): Name — Score X") pro Draft mit
  unsicherem Treffer; ersetzt/verlinkt nichts automatisch. Dabei nebenbei
  einen Bug gefixt: die Komponente las noch das alte, umbenannte Feld
  `source_snapshot` statt `origin.wger`/`origin.yuhonas`.
* Volle Pytest-Suite (`test_source_merge.py`, `test_inbox_actions.py`) für
  die `origin.wger`/`origin.yuhonas`-Struktur aus der Vortags-Session
  nachträglich bestätigt (10/10 grün) — war nach dem letzten Rename dort
  noch offen. `npm run build` grün.
* Committet als `ef3c247`, gepusht nach `origin/dev` (Staging-Deploy `:8100`
  automatisch via Post-Push-Hook). **Noch nicht nach `vitalos` gemergt.**

---

# Inbox-Drafts zeigen rohe wger-/yuhonas-Quellen getrennt, neuer Source-Consistency-Audit (2026-09-01)

Ausgangspunkt war die Beobachtung, dass Gemini-generierte Inbox-Drafts
(z.B. `inbox_081`, `inbox_wger_206`) teils unbelegte/falsche Muskel-
Zuordnungen fälschlich als "expert" durchgewunken hatten. Ziel laut User:
kein automatisches Verschmelzen von wger- und yuhonas-Daten ("nicht zu
yuwogerhona zusammenkleben"), sondern beide Rohquellen sichtbar getrennt
im Coach-Sheet ("wger sagt X, yuhonas sagt Y") plus ein Check, der KI-
Behauptungen gegen echte Rohdaten prüft.

* **`fitness/catalog/core/source_merge.py`**: neue Funktion
  `find_source_entries()` (Refactoring aus `build_external_seed()`) findet
  rohe wger-/yuhonas-Einzeltreffer getrennt, ohne sie zu mergen. Gestaffeltes
  Fuzzy-Matching ergänzt: sichere Treffer (Score ≥86) wie bisher, unsichere
  Kandidaten darunter (z.B. "Walking Lunges" vs. "Barbell Walking Lunge",
  Score 74) werden jetzt als Kandidat mit Score sichtbar statt komplett zu
  verschwinden. Optionale `record`/`wger_entries`/`yuhonas_entries`-Parameter
  vermeiden teuren `build_exercise_index()`-Rebuild bei Batch-Aufrufen.
* **`fitness/catalog/agent/inbox_actions.py`**: neue Funktion
  `attach_source_snapshot()` + CLI-Befehl `fitness-catalog inbox
  attach-sources [file_id] [--apply]` (dry-run per Default) — verlinkt bei
  sicherem Treffer `wger_id`/`yuhonas_id`/`external_ids` auf oberster Ebene
  und hängt den jeweils rohen, unveränderten Treffer unter `origin.wger`/
  `origin.yuhonas` an (nach zwei Namensrunden mit dem User: erst
  `source_snapshot.*`, dann `origin.snapshots.*`, am Ende direkt
  `origin.wger`/`origin.yuhonas` ohne Zwischenebene).
* **Bulk-Lauf über alle ~44 Inbox-Drafts** (`--apply`, zwei Durchgänge):
  29 Drafts erhielten neu geschriebene Rohdaten-Verweise, 6 hatten sie
  schon, 5 bleiben ohne externe Quelle (u.a. `inbox_jefferson_curl`,
  `inbox_scapula_priming`, `inbox_skin_the_cat`, 2× Yoga-Headstand-Duplikat).
* **`fitness/catalog/coach_sheet.py`**: neuer Abschnitt "## Quellen
  (unverändert, getrennt)" — zeigt `origin.wger`/`origin.yuhonas` als
  eigene, unvermischte Blöcke im Coach-Sheet.
* **`fitness/catalog/core/audit/source_consistency.py`** (neu): Audit-Topic
  `fitness-catalog audit source-consistency` — prüft primary_muscles/
  secondary_muscles unreviewter Inbox-Drafts gegen die rohen wger-/yuhonas-
  Quellen (Source-of-Truth) auf Körperregion-Ebene, meldet unbelegte
  Muskel-Zuordnungen als Verdacht auf KI-Fehlklassifizierung. Performance-
  Fix: `find_source_entries()` bekam einen `record`-Parameter statt eines
  ursprünglich geplanten globalen `lru_cache` (der hätte in `fitness-api.service`
  veraltete Daten geliefert und die Test-Isolation gebrochen) — Laufzeit von
  timeout(>120s) auf ~8-10s für 36 geprüfte Records gesenkt.
* **`fitness/catalog/kb/muscle_index.yml`**: `string_aliases` um fehlende
  yuhonas-Vokabeln ergänzt (`forearms`, `glutes`, `hamstrings`, `lower_back`,
  `middle_back`, `traps`) — reduzierte Audit-Rauschen von 133 auf 18 echte
  Flags. Ein testbrechender Alias (`shoulders → 302_lateral_deltoid`) wurde
  wieder entfernt, da er die bestehende kontextsensitive Zuordnung
  (`refine_generic_region_labels`) kurzgeschlossen hatte.
* **`fitness/catalog/core/resolver.py`**: `ExerciseRecord` um `origin`-Feld
  erweitert, damit `coach_sheet.py` die Rohdaten-Snapshots konsumieren kann.
* **`fitness/catalog/CLAUDE.md`**: Sektion zum neuen `attach-sources`-
  Befehl, der Fuzzy-Match-Falle und der bewussten Nicht-Verschmelzung
  ergänzt.
* Committet als `4157fe3` (erster Teil) und `161bfd0` (46 Dateien,
  Feinschliff + Audit + Coach-Sheet), gepusht nach `origin/dev` — Post-Push-
  Hook baute Frontend + Staging-Deploy erfolgreich.
* Offen geblieben: Task #3 aus der User-Taskliste ("Audit-Flags in
  Coach-Inbox-UI anzeigen") wurde nicht begonnen.

---

# Session-Handoff-Hooks nach fuel-dev portiert (2026-09-01)

Auf Wunsch ("fuel-dev brauch auch noch so ein system") wurde das in
fitness-dev gebaute Handoff-System (PreCompact füllt TODO/RESULTS/NEXT.md,
PostToolUse committet sie automatisch) 1:1 nach `~/fuel-dev` portiert.
Betrifft nur `~/fuel-dev`, keine Datei in diesem Repo.

* **`~/fuel-dev/.claude/hooks/pre-compact-fill-docs.sh`** (neu): identischer
  Mechanismus wie in fitness-dev — `claude -p --dangerously-skip-permissions`
  (nach expliziter User-Freigabe), `flock`-gesichert, überspringt Sessions
  ohne Git-Änderungen. Pfade auf `~/fuel-dev` umgeschrieben; dort gibt es
  kein `docs/`-Unterverzeichnis, `CLAUDE.md` liegt direkt im Root (kein
  Symlink wie in fitness-dev).
* **`~/fuel-dev/.claude/hooks/post-edit-commit-docs.sh`** (neu): committet
  automatisch `TODO.md`/`RESULTS.md`/`NEXT.md`/`CLAUDE.md` bei Edit/Write,
  `flock`-gesichert, kein `git add -A`, kein Push.
* **`~/fuel-dev/.claude/settings.json`**: beide Hooks registriert
  (PreCompact + PostToolUse Edit|Write), JSON-Validität geprüft.
* Beide Hooks funktional getestet (irrelevante Datei → No-op, relevante
  Datei ohne Diff → No-op, gehaltener Lock → kein Commit) — eigene
  Testzeile in `~/fuel-dev/NEXT.md` danach wieder entfernt.
* Committet in `~/fuel-dev` als `eaed175`. Zusätzlich als Nebeneffekt
  fremde, bereits vorhandene unstaged Änderungen einer anderen Session
  (`ARCHITECTURE.md`, `bin/fuelctl` — Status-Refactor auf Prod-Runtime-
  Health, Catalog-Server-Anzeige entfernt) mitcommittet (`188ac51`), da sie
  inhaltlich konsistent und vollständig waren.

---

# Session-Handoff-Automatisierung: PreCompact-Hook + Doku-Learnings + Auto-Commit (2026-08-31)

Nach der Swagger/Zod-Arbeit wurde die Handoff-Kette zwischen Claude-Code-
Sessions in diesem Repo automatisiert: TODO.md (Makro) → Arbeit →
RESULTS.md (was tatsächlich gemacht wurde) → NEXT.md (was offen blieb),
plus die konkreten Learnings dieser Session dauerhaft in `docs/CLAUDE.md`
verankert.

* **`docs/BACKEND.md`** (neu): eigenständiges Backend-Doku-Dokument für
  `server.mjs` (Swagger/Zod-Autodoc, Node↔Python-Routen-Parität) — bewusst
  offen als allgemeines Dokument angelegt, nicht exklusiv auf ein Thema
  beschränkt formuliert.
* **`NEXT.md`** (neu, repo-lokal): aktive Arbeitsliste für fitness-dev
  (Gegenstück zur globalen `~/NEXT.md`) — hält fest, was konkret als
  Nächstes ansteht, im Unterschied zu `TODO.md` (Makro-Backlog ohne Limit).
* **`.claude/hooks/pre-compact-fill-docs.sh`** (neu) + **`.claude/settings.json`**:
  PreCompact-Hook, der bei jedem Compact via `claude -p
  --dangerously-skip-permissions` (nach expliziter User-Freigabe,
  eingeschränkt auf `Read,Edit`) automatisch `TODO.md`/`RESULTS.md`/
  `NEXT.md` aus dem Transkript nachpflegt — hinter `flock`
  (`.claude/hooks/.fill-docs.lock`) gegen die in diesem Repo üblichen
  parallelen Sessions abgesichert, überspringt reine Recherche-Sessions
  ohne Git-Änderungen.
* **`.claude/hooks/post-edit-commit-docs.sh`** (neu): PostToolUse-Hook
  (Edit|Write), committet automatisch und einzeln (kein `git add -A`, kein
  Push), sobald `TODO.md`, `RESULTS.md`, `NEXT.md`, `docs/CLAUDE.md` oder
  `docs/BACKEND.md` geändert werden — ebenfalls `flock`-gesichert, leere
  Diffs erzeugen keinen Commit.
* **`docs/CLAUDE.md`**: vier Learnings aus dieser Session ergänzt —
  `fitness-dev.service` läuft im Normalfall nicht (nicht annehmen, dass ein
  laufender Node-Prozess automatisch der fitness-Server ist), Prozessname
  `server.mjs` ist über Sibling-Repos mehrdeutig (`readlink -f
  /proc/<pid>/cwd` statt Namen prüfen), `git stash push -- <datei>` als
  Symlink-sicherer Spezialfall von `git stash`, sowie die neue Session-
  Handoff-Konvention (`NEXT.md` bei unklarem Sessionstart zuerst lesen).

---

# Inbox: Rohdaten-Snapshots von wger/yuhonas getrennt anfügen (2026-08-31)

Ausgangspunkt war der Wunsch, Inbox-Drafts live zu verbessern (Fallbeispiel:
`inbox_wger_206`, Walking Lunges). Ursprünglicher Ansatz war ein Feld-Merge
(`merge_inbox_sources`), der aber Muskel-Rollen verfälschte
(`gluteus_maximus` landete gleichzeitig in `primary_` und
`secondary_muscles`) und vom User explizit gestoppt wurde ("keine Automatik
ohne Anstoß", "mit mergen meine ich nicht wger und yuhona zu yuwogerhona
zusammenzukleben"). Die tatsächlich gebaute Lösung zeigt beide Quellen
stattdessen unverändert nebeneinander.

* **`fitness/catalog/core/source_merge.py`**: neue Funktion
  `find_source_entries(display_name, exercise_id)` — findet rohen wger- und
  yuhonas-Eintrag getrennt (kein Feld-Merge); `build_external_seed()` nutzt
  sie jetzt intern, Verhalten dort unverändert.
* **`fitness/catalog/agent/inbox_actions.py`**: neue Funktion
  `attach_source_snapshot(f, ex, apply=False)` — legt gefundene Rohdaten
  unverändert unter `source_snapshot.wger`/`source_snapshot.yuhonas` ab,
  überschreibt nie einen bereits vorhandenen Snapshot, **Dry-run per
  Default** (Repo-Konvention, analog `fitness user-data`).
* **`fitness/catalog/cli.py`**: neuer Befehl
  `fitness-catalog inbox attach-sources [file_id] [--apply]`.
* Bulk-`--apply`-Lauf über alle 44 Inbox-Drafts ausgeführt: 29 Dateien neu
  mit `source_snapshot` versehen (u.a. `inbox_020`, `inbox_061`,
  `inbox_081`, `inbox_cable_*`, `inbox_dips_chest`, `inbox_face_pull`,
  `inbox_french_press`, `inbox_leg_press`, `inbox_plank`,
  `inbox_pullover_machine`, `inbox_wger_129/659/926`, u.a.), 6 hatten
  Snapshots schon vorher (unverändert), 5 ohne Treffer in keiner
  Fremdquelle (`inbox_cable_row_close_grip`, `inbox_jefferson_curl`,
  `inbox_scapula_priming`, `inbox_skin_the_cat`, 2× Yoga-Headstand-Skelette).
* Root-Cause dafür geklärt, warum praktisch keine Inbox-Übung vorher beide
  Quellen trug: `_best_match()`s `min_score=86`-Schwelle in
  `source_merge.py` ist zu streng für wger-generische vs.
  yuhonas-equipment-präfigierte Namen (z.B. "Walking Lunges" vs. "Barbell
  Walking Lunge" scort nur 68–74) — kein Bugfix daran vorgenommen, nur
  diagnostiziert.
* Root-Cause für die beiden leeren Yoga-Headstand-Inbox-Drafts geklärt:
  `POST /fitness/inbox/queue` (GUI-Queue-Endpoint) baut nur das nackte
  Skelett (`build_inbox_draft_seed`) und ruft nie Gemini auf — anders als
  `process_inbox_file_virtual()` (CLI/Session-Save-Pfad). Keine Code-
  Änderung, nur Befund.

---

# Coach-Tab Redesign "Hidden Chamber" (2026-08-31)

Kompletter Layout-/CSS-Umbau des Coach-Tabs nach einem zuvor als Artifact
durchgespielten Prototyp (dunkles, taktisches "Command-Center"-Thema).

* **`src/styles/coach-console.css`** (neu): scoped CSS-Variablen-Kaskade
  (`.coach-console`) mit den 1:1 aus dem Prototyp übernommenen Farb-/Radius-
  /Spacing-Werten — überschreibt dieselben Custom Properties, die alle
  bestehenden `fit-*`-Tailwind-Utilities schon nutzen, kein Rewrite jeder
  einzelnen Komponente nötig.
* **`src/App.jsx`**: Theme-Klasse auf den `app-shell`-Container gehoben
  (nur wenn `tab === 'coach'`), nicht nur den Content-Bereich — sonst blieb
  die Sidebar im alten Theme hängen und sah wie eine zweite, fremde App aus.
* **`src/views/Coach/index.jsx`**, **`InboxCard.jsx`**, **`ClientsPanel.jsx`**,
  **`CatalogBrowser.jsx`**: Exercise-Requests laufen jetzt als kompaktes
  Karten-Grid (`cc-card-grid`) mit farbcodierten Ghost-Action-Buttons statt
  voller Listenzeilen mit kaum sichtbaren Icon-Quadraten. Katalog-Browser +
  Klienten-Panel haben Eckklammer-Rahmen (`cc-panel`/`cc-dossier`),
  Terminal-Prompt-Suchfeld und eine Avatar-Initialen-Box bekommen.
* Gemerged `dev` → `vitalos` (`~/vitalos/bin/fitness-release`), Firebase-
  Deploy nach `fitness-aos.web.app` verifiziert.

---

# Swagger/OpenAPI-Autodoc + Zod-Validierung in server.mjs (2026-08-31)

`GET /docs` (Swagger UI) + `GET /openapi.json` laufen jetzt mit — Details
+ Muster für weitere Routen: `docs/BACKEND.md`.

* **Basis-Ebene (alle ~60 Routen):** `buildOpenApiSpec()` introspektiert
  zur Laufzeit Honos eigene Routing-Tabelle (`app.routes`) — kein
  Handschrift-Dokument, das hinter dem Code zurückfallen kann.
* **Zod-Ebene (praktisch kompletter API-Surface):** Fast alle JSON-
  Endpoints in `server.mjs` laufen jetzt über `OpenAPIHono` +
  `createRoute()`. Zusätzlich zu den drei zuerst gebauten Kernrouten
  (`GET /exercises/search`, `GET /fitness/plan`, `POST /session`) wurden
  die restlichen lokalen und Proxy-API-Routen auf `app.openapi(...)`
  gehoben. Plain-Hono geblieben sind nur `GET /openapi.json`, `GET /docs`
  und der SPA-Fallback `GET *`. Für die breite Umstellung gibt es jetzt
  den Helfer `defineJsonRoute()` plus `looseObjectSchema`, damit Query-,
  Path- und Body-Validierung einheitlich bleiben, ohne gewachsene
  Payloads künstlich zu verhärten.
* **Backend-Paritäts-Audit** (Node-Routen gegen `fitness/api/routers/*.py`
  abgeglichen): von ~60 Routen hat genau eine kein Python-Gegenstück —
  `GET/POST /fitness/coach/habit-cycle/:clientUid`. Alle anderen
  `proxyToPython`- und nativen Node-Routen hatten ein verifiziertes
  1:1-Pendant. Festgehalten in Claude-Memory
  `project_server_mjs_frontend_only_migration`, noch nicht gefixt.
* Nebenbei zwei `~/vitalos/bin/vos-release`-Nervereien behoben: `node_modules`
  im `fitness-app`-Worktree war ein echtes Verzeichnis statt Symlink (einmalig
  gefixt), und `require_clean_repo` blockierte auf reinem Katalog-Inbox-/
  Python-Code-Churn paralleler Sessions (Noise-Pattern erweitert).

---

# Session-Tab: Hauptsession löschbar (Klienten-Request Matthias-Mayer, 2026-07-13)

Klient WM4bg (Matthias-Mayer) fragte, ob man eine Session löschen kann — im UI war der
Papierkorb-Button auf Suffix-Sessions beschränkt (`sessionId !== null`), die Hauptsession
des Tages (der Normalfall bei Klienten) war nicht löschbar.

* **`SessionSwitcher.jsx`**: Lösch-Button erscheint jetzt für jede Session der Tagesliste
  (`daySessions.some(s => s.id === sessionId)`) — auch die Hauptsession. Backend/DB-Layer
  konnten das immer schon (`deleteSession(date, null)`).
* **`useSession.js` `handleDeleteSession`**: `setDirty(false)` nach dem Löschen — sonst hätte
  der neue Dirty-Flush (Tab-/Datumswechsel) die gelöschte Session als leere Datei wieder
  angelegt. Plus `recentSessions`-Refresh, damit der ✓-Haken im DateStrip verschwindet.
* Beide Builds verifiziert (dist_2026-07-13T00-04-53, dist-firebase_2026-07-13T00-05-02).
  Firebase-Deploy für Matthias steht aus (`npm run firebase` bzw. deploy:firebase).

---

# Session-Tab: Datenverlust-Bug gefixt (2026-07-12)

**Root Cause:** `GET /sessions` lieferte seit der Multi-Session-Einführung (7e08bed, 2026-06-20) nur Metadaten (`id, date, block, saved_at`) — `useSession` lädt daraus aber den kompletten Editor-State. Im lokalen Build (dev + /opt-Prod) wurden gespeicherte Sessions dadurch **leer geladen** und beim nächsten Save/Auto-Flush **leer überschrieben** (Beleg: `2026-06-12.json` Strength-Session mit 0 Exercises). Nur der Firebase-Build war korrekt, weil dessen `listSessionsForDate` volle Firestore-Dokumente liefert.

* **`server.mjs` `/sessions`**: Gibt jetzt volle Session-Objekte zurück (`{...data, id, date, exercises: []-normalisiert}`) — Contract angeglichen an `src/lib/db/firestore/sessions.js`. Live verifiziert (Wegwerf-Instanz :9177): `sessionMode`, `activity`, `effort`, `exercises` sind dabei.
* **`fitness/catalog/api/api.py` `/sessions`**: Identischer Fix im Python-Backend.
* **`useSession.js` Dirty-Flush**: `flushDirty()` sichert ungespeicherte Änderungen jetzt VOR Datumswechsel (`changeDate` ersetzt `setDate` im Hook-Return), Session-Pill-Wechsel (`selectSession`), neuem Workout (`handleNewSession`) und beim Unmount (Haupt-Tab-Wechsel). Vorher gingen dirty Edits dabei kommentarlos verloren. Zusätzlich Race-Guard: der `listSessionsForDate`-Nachlauf in `save()` schreibt `daySessions` nur noch, wenn das Datum noch aktuell ist (`dateRef`).
* **`src/lib/db/local/habits.js`**: Cross-Repo-Import `@habits/lib/db/habits.js` war tot (habits-dev hat den DB-Layer nach `src/.archive/` verschoben → fitness-dev-Build komplett kaputt). Inhalt der archivierten Datei direkt übernommen — fitness-dev besitzt seinen lokalen Habits-DB-Layer jetzt selbst, keine Cross-Repo-DB-Abhängigkeit mehr.

**Offen:** `moveSessionToDate` (Verlauf-Drag&Drop) kann weiterhin die Hauptsession des Zieldatums überschreiben und lässt bei Multi-Session-Tagen Suffix-Sessions als Waisen zurück. Doku (`AUDIT.md`/`ARCHITECTURE.md`) beschreibt noch DateHeader/ExerciseSection/2500ms-Debounce — veraltet. Prod-Deploy nach /opt noch nicht gemacht (User-Bestätigung nötig).

---

# AlphaOS Fitness Ecosystem — Multi-Session Schema (2026-06-20)

We have successfully migrated the training session storage and UI to support multiple workouts per day (using unique session suffixes, e.g., `sessions/{date}__{id}`).

* **SQLite Schema Migration**: Added the `session_id TEXT` column to the local SQLite database in `server.mjs` with an automated `ALTER TABLE` try-catch block for clean backward compatibility.
* **Local Node API Updates**: Adjusted `syncSessionToDb` to clear and write entries using the specific `session_id`, preventing workouts on the same day from overwriting each other.
* **Firestore Dual-Write Updates**: Updated `mirrorSession` inside `firestore-mirror.mjs` to target suffixed document paths (`date__id`).
* **Python Sync Logic**: Refactored `firestore/sync.py` to correctly parse suffixes in `pull()` and `push()` to isolate JSON log files, while keeping daily markdown notes grouped under the main date log (e.g. `2026-06-20.md`).
* **Frontend UI Switcher**: Integrated `sessionId` and `daySessions` states in `src/views/Session/index.jsx`. Added a sleek session switcher card under the calendar bar, letting users toggle between workouts, start a new workout (`+ Neues Workout`), or delete additional workouts.

---

# AlphaOS Fitness Ecosystem — Theme & Settings Restructuring

We have successfully completed the modular refactoring of the Settings Tab and the cleanup/expansion of the theme system.

## 1. Theme Updates (in `src/constants/Themes.js` and `src/styles/themes/`)
* **Removed (11 obsolete/generic themes):** `sweet`, `sweet-purple`, `sweet-mars`, `sweet-amber-blue`, `slate`, `zinc`, `snow`, `mint`, `rose`, `gold`, `cyan`
* **Added (4 premium, custom themes):**
  * **Kanagawa:** Warm Japanese dark theme with sakura pink accent (`#e46876`)
  * **Everforest:** Moss green accented hard dark theme (`#a7c080`)
  * **Oxocarbon:** Precision IBM carbon dark with technical blue accent (`#78a9ff`)
  * **Paper:** Warm, readable cream writing light theme with warm brown accent (`#7c5c3a`)
* **Adjusted / Fixed Themes:**
  * **Gruvbox:** Corrected background hierarchy and true cream/yellow text colors.
  * **Solarized & Solarized Dark:** Precise Ethan Schoonover bases applied to optimize contrast and element layers.
  * **Homunculus:** Shifted to deep earthy tones and blood red accent.
  * **Nothing:** Reines Monochrom-Void (pure black background and clean white text/accents).
  * **Midnight:** Deep midnight blue with personalized indicator shades.

## 2. Modular Settings View (`src/views/Settings/`)
The settings panel has been split into dedicated, self-contained sub-sections:
* **AppearanceSection:** Handles themes (dark/light lists), Circadian settings, layout scaling, and gender selection.
* **TrainingSection:** Allows setting split preferences, cycle lengths, location defaults, and dashboard highlighter mode (`body` vs. `react-muscle-highlighter`).
* **LocalDevSection:** Exposes local server endpoints and sync configurations for advanced debugging.

---

# AlphaOS Fitness Ecosystem — Bugfix: Touch-Stepper Weight Precedence (2026-07-11)

Fixed a precedence bug in `ExerciseCard.jsx` where clicking on step buttons (`+2.5` / `-2.5`) for weights did not register when the weight field already had a value. Added parentheses around `parseFloat(raw) || 0` so `delta` is correctly added.

---

# Coach-Inbox Local-First / Firestore nur Cache (2026-09-06)

Die Firebase-Coach-Inbox wurde von Firestore-primary auf Local-first gedreht.
`src/lib/db/firestore/inbox.js` versucht fuer `getInbox()`/`getGlobalInbox()`
zuerst `${LOCAL_FITNESS_API_BASE}/inbox`; auf `fitness-aos.web.app` ist das der
Tailscale-Funnel zum lokalen Fitness-Prod-Server auf `6100`. Firestore wird nur
noch als `firestore_cache`/`offline_cache` gelesen, wenn der lokale Server nicht
erreichbar ist.

Finale Coach-Aktionen sind jetzt ebenfalls local-only: `approveInbox()` und
`reenrichInbox()` fallen nicht mehr auf Cloud-only Firestore/Vertex zurueck.
Damit wird kein Expert-Exercise mehr ohne lokale YAML-Lineage erzeugt, nur weil
der lokale Server fehlt. `sendToInbox()` queued neue Items zuerst lokal ueber
`/fitness/inbox/queue`; Firestore wird nur noch als Offline-Warteschlange mit
`sync_status: pending_local` genutzt, falls local nicht erreichbar ist.
