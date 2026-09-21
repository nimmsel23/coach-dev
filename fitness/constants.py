"""
fitness.constants — Domänen-Konstanten für Aktivitäten und Trainingsblöcke.
"""
from __future__ import annotations

ACTIVITY_EMOJI: dict[str, str] = {
    "running":    "🏃",
    "cycling":    "🚴",
    "swimming":   "🏊",
    "hiking":     "🥾",
    "rowing":     "🚣",
    "climbing":   "🧗",
    "yoga":       "🧘",
    "stretching": "🤸",
    "hiit":       "⚡",
    "walking":    "🚶",
    "parkour":    "🤾",
}

ACTIVITY_LABEL: dict[str, str] = {
    "running":    "Laufen",
    "cycling":    "Radfahren",
    "swimming":   "Schwimmen",
    "hiking":     "Wandern",
    "rowing":     "Rudern",
    "climbing":   "Klettern",
    "yoga":       "Yoga",
    "stretching": "Stretching",
    "hiit":       "HIIT",
    "walking":    "Spazieren",
    "parkour":    "Parkour",
}

# Textual Rich-Markup Styles (für TUI)
BLOCK_RICH_STYLE: dict[str, str] = {
    "push":  "bold magenta",
    "pull":  "bold green",
    "legs":  "bold dark_orange",
    "upper": "bold cyan",
    "lower": "bold yellow",
    "full":  "bold gold1",
}

# ANSI-Farbnamen (für fitness-log ANSI-Renderer)
BLOCK_ANSI_COLOR: dict[str, str] = {
    "push":  "accent",
    "pull":  "green",
    "legs":  "orange",
    "upper": "blue",
    "lower": "yellow",
    "full":  "yellow",
}

WEEKDAYS_DE: list[str] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def block_rich_style(block: str) -> str:
    """Gibt den Rich-Markup-Style für einen Trainingsblock zurück."""
    bl = (block or "").lower()
    for key, style in BLOCK_RICH_STYLE.items():
        if key in bl:
            return style
    return "bold bright_magenta"


def block_ansi_color(block: str) -> str:
    """Gibt den ANSI-Farbnamen für einen Trainingsblock zurück."""
    bl = (block or "").lower()
    for key, color in BLOCK_ANSI_COLOR.items():
        if key in bl:
            return color
    return "accent"
