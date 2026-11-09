"""Hyprland-Scratchpad: die Inbox-TUI in einem Special Workspace (special:S-fitness).

Nutzt die klassischen Dispatcher (exec / togglespecialworkspace / movetoworkspacesilent /
focuswindow). Hyprland 0.56 mit hyprlang-Config versteht sie; bei Lua-Config melden sie
"Invalid dispatcher" — dann gibt es einen klaren Fehler statt Raten.
"""
from __future__ import annotations

import json
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

from loguru import logger

from backend.notifier.config import ScratchpadCfg
from backend.notifier.paths import notifier_dir

REPO_ROOT = Path(__file__).resolve().parents[2]
Hyprctl = Callable[[list[str]], tuple[int, str]]


class HyprError(RuntimeError):
    pass


def default_hyprctl(args: list[str]) -> tuple[int, str]:
    proc = subprocess.run(["hyprctl", *args], capture_output=True, text=True, timeout=5)
    return proc.returncode, (proc.stdout or proc.stderr).strip()


def terminal_argv(cfg: ScratchpadCfg, command: list[str]) -> list[str]:
    if cfg.terminal == "foot":
        return ["foot", "--app-id", cfg.app_id, "-e", *command]
    if cfg.terminal == "kitty":
        return ["kitty", "--class", cfg.app_id, *command]
    if cfg.terminal == "alacritty":
        return ["alacritty", "--class", cfg.app_id, "-e", *command]
    raise HyprError(f"Terminal '{cfg.terminal}' nicht unterstützt")


def request_focus(directory: Path, entry_id: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "focus.json").write_text(json.dumps({"id": entry_id, "ts": time.time()}))


def take_focus_request(directory: Path) -> str | None:
    path = directory / "focus.json"
    try:
        data = json.loads(path.read_text())
        path.unlink(missing_ok=True)
        return data.get("id")
    except FileNotFoundError:
        return None
    except Exception:
        path.unlink(missing_ok=True)
        return None


class Scratchpad:
    def __init__(self, cfg: ScratchpadCfg, *, root: Path, hyprctl: Hyprctl = default_hyprctl,
                 sleep: Callable[[float], None] = time.sleep, repo_root: Path = REPO_ROOT,
                 launch_timeout: float = 4.0):
        self.cfg, self.root, self._hyprctl, self._sleep = cfg, Path(root), hyprctl, sleep
        self.repo_root, self.launch_timeout = repo_root, launch_timeout

    @property
    def workspace(self) -> str:
        return f"special:{self.cfg.workspace}"

    # --- Hyprland abfragen -----------------------------------------------------
    def _query(self, what: str) -> list[dict]:
        rc, out = self._hyprctl([what, "-j"])
        if rc != 0:
            raise HyprError(f"hyprctl {what} fehlgeschlagen: {out}")
        return json.loads(out or "[]")

    def window(self) -> dict | None:
        for c in self._query("clients"):
            if c.get("class") == self.cfg.app_id or c.get("initialClass") == self.cfg.app_id:
                return c
        return None

    def visible(self) -> bool:
        return any((m.get("specialWorkspace") or {}).get("name") == self.workspace for m in self._query("monitors"))

    def _dispatch(self, name: str, arg: str) -> None:
        rc, out = self._hyprctl(["dispatch", name, arg])
        if "Invalid dispatcher" in out:
            raise HyprError("Hyprland akzeptiert die klassischen Dispatcher nicht (Lua-Config?). "
                            "Dieses Scratchpad unterstützt nur hyprlang-Configs.")
        if rc != 0 or (out and out != "ok"):
            raise HyprError(f"hyprctl dispatch {name} {arg!r}: {out or rc}")

    # --- Aktionen ----------------------------------------------------------------
    def launch_command(self) -> str:
        cfg = self.cfg
        inner = f"exec {shlex.quote(sys.executable)} " \
                f"-m backend.notifier tui --scratchpad --root {shlex.quote(str(self.root))}"
        rules = f"[workspace {self.workspace} silent;float;size {cfg.width_pct}% {cfg.height_pct}%;center]"
        return f"{rules} {shlex.join(terminal_argv(cfg, ['sh', '-c', inner]))}"

    def _wait_for_window(self) -> dict | None:
        waited = 0.0
        while waited < self.launch_timeout:
            win = self.window()
            if win:
                return win
            self._sleep(0.2)
            waited += 0.2
        return None

    def show(self, focus: str | None = None) -> None:
        if focus:
            request_focus(notifier_dir(self.root), focus)
        win = self.window()
        if win is None:
            logger.info(f"Scratchpad: starte {self.cfg.app_id} in {self.workspace}")
            self._dispatch("exec", self.launch_command())
            win = self._wait_for_window()
            if win is None:
                raise HyprError(f"Fenster '{self.cfg.app_id}' ist nach {self.launch_timeout:.0f}s nicht erschienen")
        if (win.get("workspace") or {}).get("name") != self.workspace:
            self._dispatch("movetoworkspacesilent", f"{self.workspace},class:^({self.cfg.app_id})$")
        if not self.visible():
            self._dispatch("togglespecialworkspace", self.cfg.workspace)
        self._dispatch("focuswindow", f"class:^({self.cfg.app_id})$")

    def hide(self) -> None:
        if self.visible():
            self._dispatch("togglespecialworkspace", self.cfg.workspace)

    def toggle(self, focus: str | None = None) -> str:
        """Gibt "hidden" oder "shown" zurück."""
        if self.window() is not None and self.visible():
            self.hide()
            return "hidden"
        self.show(focus)
        return "shown"
