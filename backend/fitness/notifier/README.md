# backend/notifier — Workout-Inbox, Scratchpad-TUI, Waybar-Badge

Macht aus „ein Klienten-Workout ist angekommen" mehr als eine Textzeile: Meldung mit Buttons,
persistente Inbox (gesehen/neu), eine TUI im Hyprland-Scratchpad und ein Zähler für Waybar.

## Einschalten

```
fitness-inbox init        # schreibt ~/.config/fitness-sync/notify.yaml (aktiviert den reichen Modus)
fitness-inbox doctor      # prüft notify-send, swaync, Terminal, Hyprland, Config
```

`fitness-inbox` ist ein Python-Console-Entry-Point des Pakets `fitness-agent`.
Das Paket enthält auch `backend`; Textual und alle weiteren Abhängigkeiten stehen
in der Root-`pyproject.toml`. Der Befehl liegt über einen Symlink in
`~/fitness-dev/bin` (bereits im Shell-PATH). Der alte Pfad
`backend/notifier/bin/fitness-inbox` leitet zum installierten Befehl weiter.

In der vorhandenen uv-Tool-Umgebung installieren/aktualisieren:

```sh
cd ~/fitness-dev
uv pip install --python ~/.local/share/uv/tools/fitness-agent/bin/python --editable .
ln -s ~/.local/share/uv/tools/fitness-agent/bin/fitness-inbox bin/fitness-inbox # einmalig
fitness-inbox tui
```

Bei einer frischen Installation eine Python-Venv mit `uv venv` anlegen, das
Paket mit `uv pip install --python <venv>/bin/python --editable .` installieren
und `bin/fitness-inbox` auf deren Console-Entry-Point verlinken. Das Kommando
funktioniert aus jedem Arbeitsverzeichnis; ein Wheel braucht keinen Checkout.

**Ohne `notify.yaml` bleibt alles wie vorher** (einfache Meldung, keine Inbox). Mit der Datei wirkt
`python3 -m backend sync pull sessions --clients --notify` automatisch im reichen Modus.

## Was passiert pro eingehendem Workout

| Schritt | Verhalten |
|---|---|
| Filter | nur Workouts, die in den letzten `max_age_days` (3) gespeichert wurden; ein erster Pull eines neuen Klienten meldet nicht das Archiv |
| Inbox | jedes kürzliche Workout landet in `<root>/notifier/inbox.json` — auch bei `mute`, Ruhezeit oder `enabled: false` (Badge und TUI bleiben vollständig). Nur `ignore` überspringt die Inbox |
| Popup | ≤ `max_individual` (3) einzelne Meldungen, darüber eine Sammelmeldung |
| Ersetzen | pro Workout ein Slot (`x-canonical-private-synchronous`): ein späteres Update desselben Workouts ersetzt die Meldung statt zu stapeln — **bei dir verifiziert** (swaync) |
| Buttons | **Öffnen** (Klick auf die Meldung oder Button) → Scratchpad mit Sprung auf genau dieses Workout · **Gesehen** → Inbox-Eintrag als gesehen |
| Dringlichkeit | `urgency` pro Klient/global, `urgent_effort: 9` → `critical` bei Effort ≥ 9 |
| Ruhezeiten | `suppress` = kein Popup (Inbox/Badge laufen weiter) · `silent` = Popup `low` ohne Ton |
| Sicherheit | Kliententexte werden für Pango-Markup maskiert (`<`, `&`); in der TUI werden sie nie als Markup geparst |

Ein Update nach „gesehen" macht den Eintrag wieder **neu** (verglichen wird der `saved_at`/`rev`-Stand).

## Konfiguration

Vollständig kommentiert in `fitness-inbox init`. Auszug:

```yaml
enabled: true
max_age_days: 3
max_individual: 3
urgent_effort: 9
quiet_hours: {start: "22:00", end: "07:00", mode: suppress}
clients:
  matthias-mayer: {urgency: critical}
  simon: {mute: true}            # kein Popup, aber Inbox
scratchpad: {workspace: S-fitness, terminal: foot, width_pct: 70, height_pct: 80}
waybar: {format: "Fit {count}", format_empty: ""}
```

Klienten werden über slug, Name oder UID gefunden. Fehlerhafte Werte ergeben eine klare Meldung
(`Config-Fehler: …`, Exit 2), unbekannte Schlüssel nur eine Warnung.

## Scratchpad-TUI

`fitness-inbox tui` startet mit der **Chronik der letzten fünf Kalendertage**
(heute und vier Tage davor). Sie liest vorhandene lokale Sessions aus
`<root>/users/<uid>/sessions/*.json`, unabhängig von Notification-Eingängen.
Sortiert wird nach Workout-Datum, neueste zuerst. Klientennamen kommen aus
`~/Klienten/*/client.json`; eigene Coach-Sessions sind ebenfalls enthalten.
Neue, geänderte und entfernte Session-Dateien werden beim Polling erkannt.
Die Chronik erzeugt keine Inbox-Einträge und ändert keine Gesehen-Markierungen.

`h` zeigt die Chronik, `i` die Inbox. Gesehen/Neu-Aktionen und der Neu-Filter
sind nur in der Inbox aktiv. `fitness-inbox tui --inbox` startet direkt dort.
Die Chronik lässt sich auch mit `fitness-inbox list --chronicle` oder
`fitness-inbox list --chronicle --json --uid <uid>` lesen.

`fitness-inbox toggle` zeigt/versteckt die Inbox-TUI in `special:S-fitness` (Namensschema deiner
`S-term`/`S-music`/`S-files`). Beim ersten Aufruf wird sie gestartet (`foot --app-id fitness-inbox`,
schwebend, 70 % × 80 %, zentriert); danach bleibt sie im Hintergrund laufen und aktualisiert sich selbst
(neue Workouts erscheinen ohne Neustart).

| Taste | Aktion |
|---|---|
| ↑ ↓ / j k | Navigation |
| h / i | Chronik der letzten fünf Tage / Eingangs-Inbox |
| Leertaste | gesehen ⇄ neu |
| m | gesehen + zum nächsten Neuen |
| n | nächstes Neues (zyklisch) |
| A | alle sichtbaren Workouts gesehen (beachtet auch Suche und Klientenfilter) |
| u | nur Neue |
| c | Klienten-Filter durchschalten |
| r | neu laden |
| / | Suche nach Klient, Datum, Workout (Enter zurück zur Liste, Esc löscht Suche) |
| d | Details groß / geteilte Ansicht |
| ? | Tastenhilfe |
| Tab / Bild ↑ ↓ | Details fokussieren / scrollen |
| Esc | Suchfeld verlassen, große Details schließen; sonst Terminal-TUI beenden bzw. Scratchpad ausblenden |
| q | TUI beenden |

Beim Anzeigen wird ein Eintrag nach `auto_seen_seconds` (2 s) automatisch gesehen (`0` = aus).
Die Detailansicht zeigt Übungen mit Sätzen (`8 @ 5 · 7`), Notizen, Aktivität/Muskeln, Effort, Dauer.
Unter 100 Terminalspalten stehen Liste und Details untereinander. Die Kopfzeile
zeigt neue Workouts, Gesamtzahl, Klienten und Treffer in der aktuellen Ansicht.
Fehlende Session-Dateien werden nicht automatisch gesehen. Eine während der
Anzeige eingegangene neue Revision bleibt ungesehen, bis sie angezeigt wird.

`fitness-inbox tui` läuft ohne Hyprland. Der Scratchpad-Launcher übergibt
`tui --scratchpad`, damit Escape dort nur das Fenster ausblendet.

Eine leere Inbox zeigt Einrichtungshinweise. Die Eingangs-Inbox ist eine Eingangsübersicht
für neue/aktualisierte Workouts beim Pull mit `--notify`, kein Session-Archiv:
`init` allein trägt vorhandene Sessions nicht nachträglich ein.

Hyprland: verwendet die **klassischen Dispatcher** (`exec`, `togglespecialworkspace`, …), die bei dir mit
hyprlang-Config funktionieren (geprüft, Hyprland 0.56.2). Bei einer Lua-Config melden sie „Invalid dispatcher"
und das Tool bricht mit einer klaren Meldung ab. Float/Größe/Zentrierung kommen aus den `exec`-Regeln —
eine eigene `windowrule` ist **nicht nötig**.

## Snippets (Vorschläge — nichts davon ist eingetragen)

Keybind in `~/hypr-dev/config/hypr/modules/keybinds.conf` (beim Scratchpad-Block):

```
bind = $mainMod CTRL, F12, exec, fitness-inbox toggle     # frei; passt zu F12 = term, ALT+F12 = notes
```

Optional, nur wenn du das Fenster per Config statt per exec-Regel formen willst (Stil wie deine `windowrules.conf`):

```
windowrule {
    name = fitness-inbox
    match:class = ^(fitness-inbox)$
    float = yes
}
```

Waybar (`~/.config/waybar/config`), Modul in die Modulliste aufnehmen und definieren:

```json
"custom/fitness": {
    "exec": "fitness-inbox waybar --follow",
    "return-type": "json",
    "on-click": "fitness-inbox toggle",
    "tooltip": true
}
```

```css
#custom-fitness.unseen { color: #e8a317; font-weight: bold; }
#custom-fitness.empty  { padding: 0; }   /* Text ist leer → Modul klappt zusammen */
```

## Befehle

```
fitness-inbox tui | toggle | show | hide     Scratchpad bzw. TUI
fitness-inbox waybar [--follow]              JSON {text, tooltip, class: unseen|empty, percentage}
fitness-inbox list [--unseen] [--json]       Inbox im Terminal
fitness-inbox seen <id…> | --all             als gesehen markieren
fitness-inbox demo                           Demo-Meldung mit synthetischen Daten (rührt echte Daten nicht an)
```

`--root` (oder `FITNESS_DATA_ROOT`) wählt die Datenwurzel (Standard `~/.aos/fitness`), `FITNESS_NOTIFY_CONFIG`
eine andere Config-Datei.

## Dateien

```
<root>/notifier/inbox.json     Einträge + Gesehen-Stand (flock, atomar geschrieben)
<root>/notifier/focus.json     Sprung-Anfrage an die laufende TUI (wird einmalig konsumiert)
<root>/notifier/actions.log    Protokoll des Klick-Helfers (abgekoppelt, sonst unsichtbar)
<root>/notifier/waiters/*.pid  ein Wartehelfer pro Meldungs-Slot
```

## Grenzen / Hinweise

- Die Buttons werden von einem abgekoppelten Helfer (`notify-send --wait`) bedient. Der wartet höchstens
  **10 Minuten**; danach reagieren die Buttons in der Benachrichtigungszentrale nicht mehr. Die Inbox/TUI bleiben
  davon unberührt und sind der verlässliche Weg.
- Ein Helfer pro Meldungs-Slot: eine ersetzte Meldung beendet den älteren Helfer (per Test belegt, im Desktop
  nicht noch einmal live wiederholt).
- Die Meldung kommt erst, wenn der **Pull** läuft. Es gibt bewusst keinen eigenen Timer/Daemon. Wer periodisch
  pullen will, kann den Aufruf in eine eigene systemd-Timer-Unit legen — Achtung: jeder Lauf liest die gesamten
  Session-Collections (ein Firestore-Read pro Dokument).
- Tests: `python3 -m pytest backend/tests/test_notifier_*.py` (keine echten Meldungen; unter pytest liefert
  `from_config` immer `None`, selbst wenn bei dir eine `notify.yaml` liegt).
