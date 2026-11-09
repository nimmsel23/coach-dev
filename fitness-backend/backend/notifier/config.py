"""Konfiguration (YAML) mit sinnvollen Defaults.

Ohne Config-Datei ist der reiche Modus aus (siehe hub.from_config). Unbekannte
Schlüssel werden geloggt, nicht abgelehnt; falsche Werte ergeben einen
verständlichen ConfigError.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, fields
from datetime import time
from pathlib import Path
from typing import Any

import yaml
from loguru import logger

from backend.notifier.paths import config_path

URGENCIES = ("low", "normal", "critical")
QUIET_MODES = ("suppress", "silent")
TERMINALS = ("foot", "kitty", "alacritty")
_HHMM = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class QuietHours:
    start: str = "22:00"
    end: str = "07:00"
    mode: str = "suppress"      # suppress = kein Popup (Inbox/Badge bleiben) | silent = Popup, low, ohne Ton

    def contains(self, now: time) -> bool:
        start, end = _parse_time(self.start), _parse_time(self.end)
        if start <= end:
            return start <= now < end
        return now >= start or now < end      # über Mitternacht


@dataclass(frozen=True)
class ClientRule:
    mute: bool = False          # kein Popup, aber in Inbox und Badge
    ignore: bool = False        # weder Popup noch Inbox
    urgency: str | None = None


@dataclass(frozen=True)
class ScratchpadCfg:
    workspace: str = "S-fitness"      # → special:S-fitness (Namensschema deiner S-term/S-music/S-files)
    app_id: str = "fitness-inbox"
    terminal: str = "foot"
    width_pct: int = 70
    height_pct: int = 80


@dataclass(frozen=True)
class WaybarCfg:
    format: str = "Fit {count}"
    format_empty: str = ""            # leer = Modul versteckt sich (class "empty")
    tooltip_max: int = 8


@dataclass(frozen=True)
class NotifyConfig:
    enabled: bool = True
    max_age_days: int = 3
    max_individual: int = 3
    urgency: str = "normal"
    urgent_effort: int | None = None  # Effort >= Wert → critical
    timeout_ms: int | None = None
    actions: bool = True
    markup: bool = True
    sound: str | None = None          # Pfad; wird als sound-file-Hint übergeben
    quiet_hours: QuietHours | None = None
    clients: dict[str, ClientRule] = field(default_factory=dict)
    scratchpad: ScratchpadCfg = field(default_factory=ScratchpadCfg)
    waybar: WaybarCfg = field(default_factory=WaybarCfg)
    auto_seen_seconds: float = 2.0    # TUI: Eintrag nach n Sekunden Anzeige als gesehen (0 = aus)

    def rule_for(self, *identifiers: str | None) -> ClientRule:
        """Regel über slug, Name oder UID (Groß/Kleinschreibung egal)."""
        wanted = {i.casefold() for i in identifiers if i}
        for key, rule in self.clients.items():
            if key.casefold() in wanted:
                return rule
        return ClientRule()


def _parse_time(text: str) -> time:
    m = _HHMM.match(str(text).strip())
    if not m:
        raise ConfigError(f"Uhrzeit '{text}' ungültig (erwartet HH:MM)")
    return time(int(m.group(1)), int(m.group(2)))


def _build(cls, data: Any, where: str):
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ConfigError(f"{where}: Abschnitt muss ein Mapping sein")
    known = {f.name for f in fields(cls)}
    for key in data:
        if key not in known:
            logger.warning(f"notify.yaml: unbekannter Schlüssel '{where}.{key}' wird ignoriert")
    return {k: v for k, v in data.items() if k in known}


def _choice(value: Any, allowed: tuple, where: str):
    if value not in allowed:
        raise ConfigError(f"{where}: '{value}' ungültig, erlaubt: {', '.join(allowed)}")
    return value


def _int(value: Any, where: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ConfigError(f"{where}: ganze Zahl >= {minimum} erwartet, bekommen: {value!r}")
    return value


def parse(data: dict | None) -> NotifyConfig:
    raw = _build(NotifyConfig, data or {}, "root")
    quiet = raw.pop("quiet_hours", None)
    clients = raw.pop("clients", None) or {}
    scratch = raw.pop("scratchpad", None)
    waybar = raw.pop("waybar", None)

    cfg = NotifyConfig(**raw)
    _choice(cfg.urgency, URGENCIES, "urgency")
    _int(cfg.max_age_days, "max_age_days", 0)
    _int(cfg.max_individual, "max_individual", 1)
    if cfg.urgent_effort is not None:
        _int(cfg.urgent_effort, "urgent_effort", 1)
    if cfg.timeout_ms is not None:
        _int(cfg.timeout_ms, "timeout_ms", 0)
    if not isinstance(cfg.auto_seen_seconds, (int, float)) or cfg.auto_seen_seconds < 0:
        raise ConfigError("auto_seen_seconds: Zahl >= 0 erwartet")

    qh = None
    if quiet is not None:
        qh = QuietHours(**_build(QuietHours, quiet, "quiet_hours"))
        _parse_time(qh.start), _parse_time(qh.end)
        _choice(qh.mode, QUIET_MODES, "quiet_hours.mode")

    rules: dict[str, ClientRule] = {}
    if not isinstance(clients, dict):
        raise ConfigError("clients: Mapping erwartet")
    for name, rdata in clients.items():
        rule = ClientRule(**_build(ClientRule, rdata, f"clients.{name}"))
        if rule.urgency is not None:
            _choice(rule.urgency, URGENCIES, f"clients.{name}.urgency")
        rules[str(name)] = rule

    sp = ScratchpadCfg(**_build(ScratchpadCfg, scratch, "scratchpad"))
    _choice(sp.terminal, TERMINALS, "scratchpad.terminal")
    _int(sp.width_pct, "scratchpad.width_pct", 10)
    _int(sp.height_pct, "scratchpad.height_pct", 10)
    wb = WaybarCfg(**_build(WaybarCfg, waybar, "waybar"))

    return NotifyConfig(**{**cfg.__dict__, "quiet_hours": qh, "clients": rules, "scratchpad": sp, "waybar": wb})


def load_config(path: Path | None = None) -> NotifyConfig | None:
    """None, wenn die Datei fehlt (→ reicher Modus aus)."""
    path = path or config_path()
    if not path.is_file():
        return None
    try:
        return parse(yaml.safe_load(path.read_text()))
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path}: kein gültiges YAML ({exc})") from exc


DEFAULT_YAML = """\
# Fitness Sync — Benachrichtigungen für eingehende Klienten-Workouts.
# Diese Datei aktiviert den reichen Modus (Inbox, Actions, Scratchpad, Waybar).
# Löschen = zurück zur einfachen Meldung ohne Inbox.

enabled: true            # false = keine Popups (Inbox und Badge laufen weiter)
max_age_days: 3          # nur Workouts, die in den letzten n Tagen gespeichert wurden
max_individual: 3        # mehr Treffer pro Klient → eine Sammelmeldung
urgency: normal          # low | normal | critical
# urgent_effort: 9       # Effort >= 9 → critical
# timeout_ms: 15000      # Anzeigedauer; leer = Standard von swaync
actions: true            # Buttons "Öffnen" / "Gesehen"
markup: true             # Fettdruck im Body (Kliententexte werden maskiert)
# sound: /usr/share/sounds/freedesktop/stereo/message.oga

# Ruhezeiten: suppress = kein Popup (Inbox/Badge bleiben), silent = leise (low, ohne Ton)
# quiet_hours:
#   start: "22:00"
#   end: "07:00"
#   mode: suppress

# Pro Klient (slug, Name oder UID):
# clients:
#   matthias-mayer: {urgency: critical}
#   simon: {mute: true}       # kein Popup, aber Inbox
#   felix-schmidt: {ignore: true}

scratchpad:
  workspace: S-fitness   # → special:S-fitness
  app_id: fitness-inbox
  terminal: foot         # foot | kitty | alacritty
  width_pct: 70
  height_pct: 80

waybar:
  format: "Fit {count}"
  format_empty: ""       # leer = Modul ausblenden, wenn nichts Neues da ist
  tooltip_max: 8

auto_seen_seconds: 2.0   # TUI: Eintrag nach n Sekunden als gesehen markieren (0 = aus)
"""


def write_default(path: Path | None = None, *, force: bool = False) -> Path:
    path = path or config_path()
    if path.exists() and not force:
        raise FileExistsError(str(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(DEFAULT_YAML)
    return path
