"""Claude Code CLI headless client — primärer Nährwert-Schätzer vor Gemini-Fallback.

Nutzt `claude -p` (Print-Mode, non-interaktiv) mit Haiku. Läuft nur lokal wo
die Claude Code CLI installiert + authentifiziert ist — kein API-Key nötig.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess

from loguru import logger

CLAUDE_MODEL = "claude-haiku-4-5-20251001"
_CLAUDE_BIN = shutil.which("claude")


def available() -> bool:
    return _CLAUDE_BIN is not None


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.DOTALL)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                return None
    return None


def call_claude(prompt: str, *, timeout: int = 45, log_label: str = "Haiku") -> dict:
    """Headless Claude-CLI-Call. Returns {ok, text, error}."""
    if not available():
        return {"ok": False, "error": "claude CLI not found"}

    try:
        result = subprocess.run(
            [_CLAUDE_BIN, "-p", prompt, "--model", CLAUDE_MODEL, "--allowedTools", "WebSearch"],
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        logger.warning(f"{log_label} CLI timeout nach {timeout}s")
        return {"ok": False, "error": "timeout"}
    except OSError as e:
        logger.warning(f"{log_label} CLI Fehler: {e}")
        return {"ok": False, "error": str(e)}

    if result.returncode != 0:
        err = (result.stderr or "unknown").strip()[:200]
        logger.warning(f"{log_label} CLI exit {result.returncode}: {err}")
        return {"ok": False, "error": err}

    text = result.stdout.strip()
    if not text:
        return {"ok": False, "error": "empty output"}

    logger.info(f"{log_label} ok via CLI")
    return {"ok": True, "text": text}
