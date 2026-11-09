"""Vorlagen für häufige Nachrichten (eingebaute + ~/.config/fitness-sync/push-templates.yaml)."""
from __future__ import annotations

from pathlib import Path

import yaml
from loguru import logger

from backend.pusher.message import Message
from backend.pusher.paths import templates_path

BUILTIN: dict[str, Message] = {
    "Erinnerung ans Logging": Message("Dein Training", "Hast du deine letzte Einheit schon eingetragen?", "/"),
    "Neuer Plan": Message("Neuer Trainingsplan", "Dein Coach hat dir einen neuen Plan freigeschaltet.", "/"),
    "Feedback": Message("Feedback von deinem Coach", "Ich habe mir dein Training angesehen — schau in die App.", "/"),
    "Check-in": Message("Kurzer Check-in", "Wie läuft die Woche? Antworte mir gern.", "/"),
}


def load_templates(path: Path | None = None) -> dict[str, Message]:
    """Eingebaute Vorlagen, darüber die eigenen (gleicher Name überschreibt). Kaputte Einträge werden übersprungen."""
    templates = dict(BUILTIN)
    path = path or templates_path()
    if not path.is_file():
        return templates
    try:
        raw = yaml.safe_load(path.read_text()) or {}
    except Exception as exc:
        logger.warning("Vorlagen nicht lesbar ({}): {}", path, exc)
        return templates
    if not isinstance(raw, dict):
        logger.warning("Vorlagen: Wurzel muss ein Mapping sein ({})", path)
        return templates
    for name, entry in raw.items():
        if not isinstance(entry, dict):
            continue
        message = Message(str(entry.get("title", "")), str(entry.get("body", "")), str(entry.get("link", "/")))
        if message.problems():
            logger.warning("Vorlage {!r} übersprungen: {}", name, "; ".join(message.problems()))
            continue
        templates[str(name)] = message
    return templates
