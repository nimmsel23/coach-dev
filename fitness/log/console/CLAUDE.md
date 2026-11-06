# CLAUDE.md — fitness/commands/console/ (Live-Coach-TUI)

Sub-Package von `fitness/commands/log.py` (Typer-App `fitness-log`). Übergeordneter
Kontext: `../../../CLAUDE.md` (Repo-Root), `../../CLAUDE.md` (Python-Backend).

Startet über `fitness-log console` (bzw. `python -m fitness.commands.log console`).
Beobachtet alle Klienten-Sessions/Journal-Einträge in Echtzeit und lässt eine
Zwei-KI-Analyse (`fitness/catalog/agent/coach_ai.py`) darüberlaufen:
Trainingslücken-Kontext-Check + Auto-Feedback-Entwürfe zu geloggten Workouts.

---

## Module

```
console/
├── __init__.py    — public run(), Modul-Übersicht
├── core.py         — verdrahtet Watcher + Gap-Loop + Freigabe + Rich-Live-Rendering
├── watcher.py       — watchdog FileSystemEventHandler (Session-/Journal-Änderungen)
├── gap_check.py      — periodischer Trainingslücken-Check über alle (aktiven) Klienten
├── drafts.py          — Persistenz der KI-Ausgaben (~/.aos/fitness/console/drafts/)
├── approval.py         — interaktive Freigabe von Feedback-Entwürfen (a/d/s)
├── keys.py              — nicht-blockierendes Einzeltasten-Lesen (cbreak-Mode, stdlib)
└── events.py             — Shared-Helfer: Klienten-Name-Lookup, Event-Zeilen-Formatierung
```

Im Ordner liegen parallel `.py.bak`-Dateien zu `__init__.py`/`core.py`/
`drafts.py`/`gap_check.py` — vor dem nächsten Commit aufräumen (analog zum
`.bak`-Hinweis für `kb/` in `docs/CLAUDE.md`).

`fitness/commands/log.py::cmd_console` ruft nur `console.run(gap_check_interval)`
auf. `fitness-log drafts [--client NAME]` (separater Befehl in `log.py`, nicht Teil
dieses Sub-Packages) liest die von `drafts.py` persistierten Entwürfe.

---

## Datenflüsse

**Zwei Quellen speisen dieselbe `events`-Queue** (angezeigt im Rich-`Live`-Panel):

1. **Watcher** (`watcher.py`): watchdog beobachtet `runtime_root()/users` rekursiv.
   Neue/geänderte `sessions/*.json` → Event-Zeile + Trigger für `_analyze_session()`
   (Feedback-Entwurf). Neue/geänderte `journal/*.md` → Event-Zeile.
2. **Gap-Loop** (`gap_check.py`): eigener Daemon-Thread, prüft alle
   `gap_check_interval` Sekunden (Default 1800s/30min) jeden aktiven Klienten auf
   unerklärte Trainingslücken (`GAP_THRESHOLD_DAYS = 6`, siehe `coach_ai.py`).

**Feedback-Entwürfe** durchlaufen zusätzlich eine **Freigabe** (`approval.py` +
`keys.py`): landen in einer `review_queue`, werden im Panel prominent mit
Tasten-Hinweis angezeigt, Coach drückt `a`/`d`/`s`. Nur bei echtem TTY aktiv —
bei Pipe/Redirect (Tests, Cron) wird die Freigabe übersprungen, Drafts bleiben
`pending`.

**Persistenz** (`drafts.py`): sowohl Gap-Erklärungen als auch Feedback-Entwürfe
werden nach `~/.aos/fitness/console/drafts/<uid>/<timestamp>_<kind>_<id>.json`
geschrieben — überleben Neustarts, einsehbar via `fitness-log drafts`.
Freigabe-Status wird ins selbe JSON zurückgeschrieben (`mark_status()`), kein
zweiter State-Speicher.

---

## Ausbaustufen (in dieser Reihenfolge gebaut, bauen aufeinander auf)

1. ✅ **Persistenz** (`drafts.py`) — ohne Datensatz pro Entwurf gibt es nichts,
   das man später freigeben oder senden könnte.
2. ✅ **Interaktive Freigabe** (`approval.py`, `keys.py`) — Coach akzeptiert/
   verwirft direkt im Panel statt nur zuzusehen.
3. ⏳ **Senden an Klient** (Telegram/Firestore) — noch nicht gebaut. Braucht 1+2
   als Voraussetzung: nur *freigegebene* (`status: approved`) Entwürfe sollten
   automatisiert rausgehen, sonst verschickt man ungeprüfte KI-Texte direkt.
4. ✅ **Web-UI-Zugang für den Coach-Tab** (entstanden 2026-10-06 in `coach-dev`,
   Backend-Teil am 2026-10-15 nach fitness-dev portiert): `fitness-log console`
   bleibt der Endlos-Loop-Weg (Watcher + 30min-Gap-Zyklus + interaktive a/d/s-
   Freigabe per TTY). Daneben gibt es einen UI-seitigen Zugang auf **dieselbe
   Persistenz** — Einmal-Check statt Loop, Freigabe per Klick statt Tastendruck:
   - `fitness/api/routers/coaching.py`: `GET /fitness/coach/gaps[?uid=]` (führt
     `check_training_gap()` einmalig aus, persistiert Treffer über `save_draft()`
     — identischer Pfad wie `gap_check.py`), `GET /fitness/coach/drafts[?uid=&status=]`
     (wrapt `list_drafts()`), `POST /fitness/coach/drafts/{id}/review` (wrapt
     `mark_status()`, Body `{uid, status: approved|dismissed}`).
   - **uid-Validierung (nur hier, nicht im coach-dev-Original):** `uid` aus
     Query/Body muss `[\w-]{1,128}` entsprechen, sonst `400 invalid_uid` —
     `drafts_dir(uid)` macht `mkdir(parents=True)`, ohne Prüfung wäre `uid=../../x`
     ein Path-Traversal (das Backend hängt hinter dem Funnel).
   - `drafts.py::list_drafts()` liefert zusätzlich `id` (Dateiname ohne Endung)
     pro Eintrag, `find_draft_path(uid, draft_id)` ist das Gegenstück für die
     Review-Route (keine Pfade von außen, nur dieses ID-Format).
   - **Frontend liegt nur in coach-dev:** `src/views/Coach/ClientInsights.jsx`,
     Sub-Tab "KI-Insights" in `ClientsPanel.jsx`, Zugriff über
     `lib/db/local|firestore/coach.js` (`LOCAL_FITNESS_API_BASE`). Der reine
     Remote-Coach-Build (`MODE==="coach"`, `LOCAL_FITNESS_API_BASE=""`) liefert
     bewusst leer statt Fehler — die KI-Calls + Datei-Persistenz brauchen den
     lokalen Python-Prozess und sind nicht Firestore-portierbar (gleiche
     Einschränkung wie `getInboxMergeCandidates()`).
   - **Offen:** fitness-dev hat selbst keine Node-Proxy-Routen (`server.mjs`)
     und keine UI dafür; coach-dev hatte `server.mjs`-Proxy-Routen (Node→Python,
     Muster wie `/fitness/coach/macrocycles/*`).

---

## Bekannte Fixes (2026-08-24, chronologisch)

Alle drei Symptome sahen von außen gleich aus ("Console hängt bei Schöffy"),
hatten aber **drei unabhängige Ursachen** — Reihenfolge zeigt, wie sich die
Diagnose schrittweise verschärft hat:

1. **Crash-Verdacht (unbestätigt geblieben):** ursprüngliche Annahme war, dass
   eine Exception in `_gap_check_loop` (kein try/except pro Klient) den ganzen
   Daemon-Thread lautlos sterben lässt. Fix vorsorglich eingebaut
   (`gap_check_loop` fängt jetzt pro Klient ab, loggt nach
   `~/.aos/fitness/logs/console.log`), aber **in echten Läufen nie tatsächlich
   als Ursache bestätigt** — kein Traceback im Log gefunden.
2. **Rich/loguru-Terminal-Kollision (echter Bug, bestätigt):** `logger.exception()`
   schrieb auf stderr, während Rich's `Live` denselben Terminal-Stream aktiv
   neu zeichnet — erzeugte sichtbar zerrissene/doppelte Panel-Boxen. Fix:
   `_setup_file_logging()` in `core.py` leitet loguru während der
   Console-Session in eine Datei um, zusätzlich kurze rote Fehlerzeile direkt
   im Panel statt stillem Swallow.
3. **Kein Bug, sondern fehlendes Lebenszeichen (echte Ursache, bestätigt):**
   Klienten ohne Lücke werden in <1s übersprungen (kein Event). Ein Klient MIT
   ungeklärter Lücke löst zwei synchrone KI-Calls aus (Gemini + Haiku-CLI-Review,
   gemessen ~21s für Schöffy) — währenddessen passiert im Panel nichts. Steht so
   ein Klient als letzter in der Registry-Reihenfolge, ist seine Zeile das letzte
   sichtbare Lebenszeichen für die nächsten `interval` Sekunden. Fix: kurze
   "Prüfe Trainingslücke..."-Zeile *vor* den KI-Calls + "Zyklus fertig"-Zeile
   mit Uhrzeit des nächsten Checks danach.
4. **Falscher Alarm, kein technischer Bug (Datenmodell-Fix):** Schöffy hatte die
   App nur **einmalig** ausprobiert (`status: "freund"` in `client.json`, eine
   einzige Session je) — kein aktives Coaching-Verhältnis, trotzdem meldete
   jeder 30-Minuten-Zyklus erneut seine "18-Tage-Lücke". `load_client_registry()`
   (`fitness/data.py`) gibt jetzt zusätzlich `status` durch,
   `gap_check.NON_COACHING_STATUSES = {"freund", "interessent"}` filtert solche
   Klienten vor dem Gap-Check raus (Daniel = `"coach"` und Matthias = kein
   Status, also aktive echte Coaching-Beziehungen, werden weiter geprüft).

**Lehre:** bei "hängt"/"friert ein"-Symptomen erst mit einer Zeitmessung pro
Klient/Schritt nachweisen, WO die Zeit wirklich hingeht, bevor man Crash-Theorien
nachjagt — Schritt 1 (Crash-Vermutung) hat sich am Ende als falsche Fährte
herausgestellt, Schritt 3+4 waren die eigentlichen Ursachen.

---

## Symlink-Gotcha

Watcher beobachtet den **physischen** Pfad `runtime_root()/users`, NICHT
`AOS_USERS` (`~/.aos/users/`): `<uid>/fitness` ist dort nur ein Symlink auf
`~/.aos/fitness/users/<uid>`, und watchdog/inotify folgt bei rekursivem Watch
keinen Symlinks (gleicher Gotcha wie im Enrichment-Watcher,
`fitness/catalog/api/watcher.py`).

## Firestore-Daemon an die Console gekoppelt (seit 2026-10-16)

`fitness-log console` startet `fitness-firestore-daemon.service` (user-scope), falls er nicht
läuft, und stoppt ihn beim Beenden — auch bei Ctrl-C, Exception, SIGTERM/SIGHUP. Lief der
Daemon schon vorher, bleibt er an. `--no-daemon` schaltet die Kopplung ab. Logik:
`console/daemon.py::firestore_daemon()`. Ausgaben nur vor/nach dem Rich-Live. Der Daemon pullt
beim Start einmal alle Dokumente (ADDED-Replay mit rev-Konfliktprüfung) und danach in
Echtzeit — dadurch sieht der watchdog der Console neue Klienten-Daten. Gleiches Replay
ohne Dauerprozess: `vos-firestore pull fitness|fuel` (`~/vitalos/bin`).

## Textual-Dashboard (Default seit 2026-10-16) — `console/tui.py` + `console/model.py`

`fitness-log console` startet jetzt ein Textual-Dashboard; die alte Ein-Panel-Rich-Console
bleibt mit `--classic` erhalten (`core.py::run`, unverändert).

```
Status: Daemon ● läuft · Entwürfe offen N · Gap-Check in mm:ss · Sortierung · Filter
┌ Klienten (Name, Letzte, Tage, 28T, Block, Entw.) ┬ [1 Live][2 Session][3 Journal][4 Entwürfe] ┐
```

- **Klienten-Tabelle:** ein Eintrag pro Klient (Multi-UID dedupliziert), Ampel nach Tage-seit-letzter-
  Session (≥3 gelb, ≥6 rot = `coach_ai.GAP_THRESHOLD_DAYS`; `freund`/`interessent` gedimmt),
  Sessions der letzten 28 Tage, offene Entwürfe. `o` wechselt Sortierung (zuletzt aktiv / längste Pause / Name).
- **1 Live:** Event-Feed (watchdog + Gap-Check wie bisher), `f` filtert auf den gewählten Klienten.
- **2 Session:** Detail der Session des gewählten Klienten, `[`/`]` blättert durch die Historie.
- **3 Journal:** letzte 5 Journal-Einträge.
- **4 Entwürfe:** ALLE offenen KI-Entwürfe aus der Persistenz (auch aus früheren Läufen — die
  klassische Console zeigte nur neu entstandene), `a` freigeben / `d` verwerfen (`drafts.mark_status`),
  `c` Text kopieren (`wl-copy`, sonst OSC52), `h` Erledigte ein/aus. Senden an Klient bleibt Ausbaustufe 3.
- **Aktionen:** `g` Gap-Check für den gewählten Klienten (auch `freund`), `G` alle, `p` Pull
  (`vos-firestore pull fitness`, überschreibbar mit `FITNESS_CONSOLE_PULL_CMD`), `D` Daemon an/aus,
  `r` neu laden, `q` beenden. Der Gap-Check-Zeitplan läuft in der TUI (`--gap-interval`), die
  Restzeit steht in der Statuszeile; der erste Lauf startet nach 5 s.
- **Sicherheit:** Kliententexte (Namen, Notizen, Orte, Journal) werden ausschließlich als `rich.Text`
  gerendert, nie als Markup geparst.
- **Datenschicht:** `model.py` (reine Funktionen: `clients()`, `session_files()`, `session_text()`,
  `journal_entries()`, `drafts_for()`, `daemon_state()`) ist UI-frei und einzeln testbar.
- **Test ohne echte Daten:** App mit `App.run_test()` in einem isolierten `HOME` (Pfade folgen `$HOME`).
  Beispiel-Szenario mit 3 Fake-Klienten, Entwürfen, Sortierung, Freigabe und Filter lief grün.

## Daemon-Ablösung (2026-10-16): `fitness-sync.service` statt `fitness-firestore-daemon.service`

Die Console koppelt jetzt `fitness-sync.service` (`python -m backend sync run --notify`, Quelle
`backend/deploy/fitness-sync.service`, nach `~/.config/systemd/user/` kopiert, **nicht enabled** —
er läuft nur, solange die Console läuft). Die Unit hat `Conflicts=fitness-firestore-daemon.service`:
beim Start stoppt systemd den alten Daemon, es schreibt immer nur EIN Sync-Prozess. Zusätzlich
hält ein Lockfile (`<root>/.fitsync/fitsync.lock`) eine zweite Instanz draußen.

**Abdeckung:** das neue Backend synchronisiert nur **Sessions** (Konfliktlogik `decide()`, Tombstones,
keine SQLite). Nicht mehr live gespiegelt: Journal, Habits, Habit-Records, Habit-Journals (früher
Daemon) und Nutrition/Supplements (Fuel, bewusst draußen). Diese Teile holt `vos-firestore pull
fitness|fuel` auf Abruf (`p` in der Console) — ohne Dauerprozess und ohne dieselben Dateien wie der
Session-Sync zu schreiben. Der alte `fitness.firestore.mirror` bleibt als Code im Repo, wird aber
nicht mehr gestartet. `D` in der Console schaltet `fitness-sync.service` an/aus.
