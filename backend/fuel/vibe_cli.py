"""Mistral-Vibe-CLI headless client — zweite Meinung neben Haiku (claude_cli).

Nutzt `vibe -p <prompt>` (headless, ein Prompt, Antwort auf stdout). Warnungen
(z.B. Skill-Load, untrusted Folder) landen auf stderr und werden ignoriert.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from loguru import logger

_VIBE_BIN = shutil.which("vibe")


def available() -> bool:
    return _VIBE_BIN is not None


def call_vibe(prompt: str, *, timeout: int = 45, log_label: str = "Vibe") -> dict:
    """Headless Vibe-Call. Returns {ok, text, error}."""
    if not available():
        return {"ok": False, "error": "vibe CLI not found"}
    try:
        result = subprocess.run(
            [_VIBE_BIN, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
            cwd=str(Path.home()),
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
