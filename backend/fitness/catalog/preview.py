from __future__ import annotations

import shutil
import subprocess
import tempfile
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class PreviewResult:
    used_glow: bool
    message: str
    preview_path: Path | None = None
    glow_path: str | None = None


def glow_binary() -> str | None:
    return shutil.which("glow")


def write_preview_file(markdown: str, *, prefix: str = "fitness-agent-preview-") -> Path:
    with tempfile.NamedTemporaryFile("w", suffix=".md", prefix=prefix, delete=False, encoding="utf-8") as handle:
        handle.write(markdown)
        return Path(handle.name)


def preview_file(path: Path, *, require_tty: bool = True) -> PreviewResult:
    glow = glow_binary()
    if glow is None:
        return PreviewResult(used_glow=False, message="glow is not installed.", preview_path=path)
    if require_tty:
        try:
            import sys

            if not sys.stdin.isatty() or not sys.stdout.isatty():
                return PreviewResult(used_glow=False, message="glow requires an interactive terminal.", preview_path=path, glow_path=glow)
        except Exception:
            return PreviewResult(used_glow=False, message="glow requires an interactive terminal.", preview_path=path, glow_path=glow)
    subprocess.run([glow, str(path)], check=False)
    return PreviewResult(used_glow=True, message=f"Previewed {path.name} with glow.", preview_path=path, glow_path=glow)


def preview_text(markdown: str, *, require_tty: bool = True) -> tuple[PreviewResult, Path]:
    path = write_preview_file(markdown)
    result = preview_file(path, require_tty=require_tty)
    return result, path


def render_markdown(markdown: str, *, prefer_glow: bool = True) -> PreviewResult:
    path = write_preview_file(markdown)
    try:
        if prefer_glow and glow_binary() and sys.stdin.isatty() and sys.stdout.isatty():
            result = preview_file(path, require_tty=False)
            return result
        sys.stdout.write(markdown.rstrip() + "\n")
        return PreviewResult(used_glow=False, message="Rendered markdown as plain text.", preview_path=path)
    finally:
        cleanup_preview_file(path)


def cleanup_preview_file(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass
