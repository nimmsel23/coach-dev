# catalog/kb

LLM-/GitHub-Zugang: öffentliches Repo `https://github.com/nimmsel23/fitness` (lesen ohne Auth; Schreiben per GitHub-Connector).
Maschinen-Index: `llms.txt`. Inventar: `MANIFEST.yml`.
Upstream-Bulk yuhonas: Submodul `vendor/free-exercise-db` (Pin `yuhonas.ref`) — nach Clone `git submodule update --init`.
Anatomy-Ontology: Submodul `vendor/fma` (Pin `fma.ref`, FMA 5.1.0). `muscles/` bleibt selfmade Expert-SSOT mit `fma_id`; Map `registry/fma_kb_map.yml`. Volles `fma.owl` nur bei Bedarf: `scripts/fetch_fma_owl.sh` (Git LFS).

Beim Frontend-Build werden alle ymls klientsetig importiert.
Dies soll app-geschwindigkeit erhöhen wie auch firestore-quota schonen & offline-verwendbarkeit vereinfachen.


# /muscles/*
sind immer nach deren physischer Größe geordnet von groß nach klein.
Muskel-Komplexe wie Quadrizeps steht Synonym für dessen Köpfe bzw Anteile die zusätzlich mit a/b/c/d nummeriert und nur der vollständigkeitshalber vorhanden.
ein Muskel mit mehreren Anteilen wie zB M. deltoideus ist mit 301_deltoideus findbar, seine Anteile zB als 301a_deltoideus_pars_acromialis bzw 301a_deltoideus_anterior.
Für die meisten App-Funktionen werden die Member nicht verwendet sondern deren Parent.

Jede grobe Körperregion hat einen von 7 ordnern welcher synomym für die jeweilige Region steht. 
Jeder ordner hat eine bucket.yml im muscles ordner selbst welche wiederum, zusätzlich zur muscles_index.yml, den jeweiligen ordner indexiert.


# /exercises
Sinn dahinter sollte sein pro exercise eine spezifische nummerische id xxx.yml zu haben anstatt dieser generischen Dateinamen.
beim Loggen einer exercise in einem Workout wird per default wenn es eine unreviewed-exercise (aus wger bzw yuhona db) ist ein draft in der inbox erstellt.
Diese Inbox soll dem Coach dienen die informationen zu den exercises zu approven bevor sie als expert-approved gelten.
021.yml usw, welche nun nur noch als .bak existieren, folgten einem bestimmten nummerischem system welches sehr logisch wäre.

Im weiteren solle ein push.js pull.js und legs.js anhand der approvten exercises beim Frontend-build erstellt werden damit es wieder clientseitig verbaut ist wie auch schon die unreviewed exercises es sind. 

Wenn ein inbox draft erstellt wird soll es mit den source-ids aus wger+yuhona verknüpft werden damit jene unreviewed exercises ab dann clientseitig verschwinden können.

## Org-Taskwarrior (global) — gilt fuer alle Agenten der VitalOS-Org

Verbindlich fuer alle Agenten (Vibe, Claude, Codex, Gemini) in Org-Kontexten
(Owner-Weisung 2026-11-07):

1. EINE globale Org-Task-DB — KEINE eigenen Rollen- oder Repo-DBs mehr:
   `TASKRC=~/.local/state/vitalos-org/taskrc` (DB liegt daneben in `task/`).
   Alte Repo-DBs sind archiviert unter `~/.local/state/vitalos-org/archive-repodb/`.
2. Daniels private Taskwarrior-DB (`~/.task`, u. a. Hotlist `+hot`) bleibt
   TABU fuer Schreibzugriffe — nur lesend (CEO-Runde: Task `status:pending +hot`).
3. Rolle = Tag: Jeder Agent taggt seine eigenen Aufgaben mit seiner Rolle:
   `+ceo`, `+cto`, `+al`, `+pm`, `+alpha`, `+betta` …
4. Abteilung/Repo = project: `project:fitness-dev`, `project:journal-dev`,
   `project:vitalos-prod`, `project:dotfiles`, `project:aos` …
5. Prio-Encoder (in der Org-taskrc verankert):
   - `+hit` und `+br` sind EIN Tier (Hits = Big Rocks, Koeffizient 8.0) —
     hoechste Dringlichkeit, `+hit` = `+br`.
   - `+lr` 2.0 (Little Rocks).
   - `+hot` 1.0 — NUR Potential/Sichtbarkeit, wird NIE automatisch ausgefuehrt;
     ob ein Potential jetzt anfaellt, entscheidet der Door War (Sonntagsrunde).
   - `+s` -1.0 (Sand, Zeitverschwendungsroutine).
   - `+go` ist KEINE Prioritaet und bewirkt nichts — Freigaben laufen ueber
     die Rollen (CTO-Freigabeprozess), nicht ueber Urgency.
6. Aufgaben IMMER per UUID anfassen (`task <uuid> modify|done|info`), NIE per
   ID — IDs renummerieren sich nach jedem `done` (Fehltreffer-Gefahr).
7. Guard: orgsh und die Runner verweigern den Lauf, wenn die Org-taskrc fehlt —
   kein stiller Rueckfall auf die Privat-DB.
8. Uebersicht/Rang: `TASKRC=~/.local/state/vitalos-org/taskrc \
   ~/.org/venv/bin/python ~/aos/bin/aos door plan quadrants --json`
   (Eisenhower-Sicht Q1–Q4).
