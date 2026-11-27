#!/usr/bin/env python3
"""Klienten-Schalter aus `~/Klienten/<slug>/client.env` für den Coach regelbar machen.

Grundsatz (Klienten/AGENTS.md, Daniel 2026-11-27): Was im Klienten-Workspace per
`client.env` geschaltet wird, muss auch in coach-dev (CLI, Schmiede) regelbar sein.
Neue Schalter → in `SETTINGS` eintragen, dann tauchen sie in CLI und Schmiede auf.

CLI (über `coach`):
    coach client-env <slug>                     bekannte Schalter anzeigen
    coach client-env <slug> set KEY=WERT ...    setzen (leerer Wert = Zeile entfernen)
    coach frame <slug> [status|on|off] [--start YYYY-MM-DD] [--nudge STUNDEN]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

CLIENTS_ROOT = Path(os.environ.get("CLIENTS_ROOT", Path.home() / ".local" / "Klienten"))
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")

# Nur diese Keys sind über CLI/Schmiede änderbar (FIREBASE_UID u. ä. bleiben unangetastet).
SETTINGS: dict[str, dict] = {
    "FRAME_INTERVIEW": {
        "type": "bool", "default": "0", "group": "frame",
        "label": "Frame-Map-Interview per WhatsApp",
        "help": "Standard OFF. Nur auf Coach-Ansage pro Klient einschalten.",
    },
    "FRAME_START": {
        "type": "date", "default": "", "group": "frame",
        "label": "Start ab", "help": "Vor diesem Datum passiert nichts (leer = sofort).",
    },
    "FRAME_NUDGE_HOURS": {
        "type": "int", "default": "", "group": "frame",
        "label": "Nachhaken nach Stunden", "help": "Ohne Antwort nach N h einmal nachhaken (leer = nie).",
    },
}
FRAME_TIMER = "frame-interview.timer"


class EnvError(ValueError):
    pass


def client_dir(slug: str) -> Path:
    if not SLUG_RE.match(slug or ""):
        raise EnvError(f"ungültiger Klienten-Slug: {slug!r}")
    root = CLIENTS_ROOT / slug
    if not root.is_dir():
        raise EnvError(f"{slug}: Klienten-Ordner fehlt unter {CLIENTS_ROOT}")
    return root


def _parse(lines: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def read_env(slug: str) -> dict[str, str]:
    path = client_dir(slug) / "client.env"
    return _parse(path.read_text(encoding="utf-8").splitlines()) if path.is_file() else {}


def validate(key: str, value: str) -> str:
    if key not in SETTINGS:
        raise EnvError(f"{key}: nicht regelbar (bekannt: {', '.join(SETTINGS)})")
    value = (value or "").strip()
    if value == "":
        return ""
    kind = SETTINGS[key]["type"]
    if kind == "bool":
        low = value.lower()
        if low in ("1", "on", "true", "ja", "an"):
            return "1"
        if low in ("0", "off", "false", "nein", "aus"):
            return "0"
        raise EnvError(f"{key}: on/off erwartet, nicht {value!r}")
    if kind == "date":
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError as exc:
            raise EnvError(f"{key}: Datum YYYY-MM-DD erwartet, nicht {value!r}") from exc
    if kind == "int":
        if not value.isdigit() or int(value) <= 0:
            raise EnvError(f"{key}: positive ganze Zahl erwartet, nicht {value!r}")
        return str(int(value))
    return value


def write_env(slug: str, updates: dict[str, str]) -> dict[str, str]:
    """Setzt Keys in client.env; Kommentare und fremde Keys bleiben erhalten. "" entfernt die Zeile."""
    clean = {k: validate(k, v) for k, v in updates.items()}
    path = client_dir(slug) / "client.env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    done: set[str] = set()
    out: list[str] = []
    for raw in lines:
        stripped = raw.strip()
        key = stripped.partition("=")[0].strip() if "=" in stripped and not stripped.startswith("#") else None
        if key in clean:
            if key not in done and clean[key] != "":
                out.append(f"{key}={clean[key]}")
            done.add(key)
            continue
        out.append(raw)
    for key, value in clean.items():
        if key not in done and value != "":
            out.append(f"{key}={value}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    return read_env(slug)


def _timer_state() -> dict[str, str]:
    def ask(verb: str) -> str:
        try:
            res = subprocess.run(["systemctl", "--user", verb, FRAME_TIMER],
                                 capture_output=True, text=True, timeout=5)
            return res.stdout.strip() or "unbekannt"
        except (OSError, subprocess.SubprocessError):
            return "unbekannt"
    return {"unit": FRAME_TIMER, "enabled": ask("is-enabled"), "active": ask("is-active")}


def settings_view(slug: str, with_timer: bool = True) -> dict:
    env = read_env(slug)
    settings = [
        {"key": k, **meta, "value": env.get(k, ""), "effective": env.get(k) or meta["default"]}
        for k, meta in SETTINGS.items()
    ]
    state_path = client_dir(slug) / "frame_interview.json"
    try:
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else None
    except ValueError:
        state = None
    frame = {"on": env.get("FRAME_INTERVIEW") == "1", "state": None}
    if state:
        domains = state.get("domain_rotation") or []
        questions = state.get("question_order") or []
        di, qi = state.get("domain_index", 0), state.get("question_index", 0)
        frame["state"] = {
            "active": bool(state.get("active")),
            "domain": domains[di] if 0 <= di < len(domains) else None,
            "question": questions[qi] if 0 <= qi < len(questions) else None,
            "question_no": qi + 1, "questions_total": len(questions),
            "last_prompt_sent_at": state.get("last_prompt_sent_at"),
            "last_nudge_at": state.get("last_nudge_at"),
            "paused_until": state.get("paused_until"),
        }
    out = {"client": slug, "settings": settings, "frame": frame}
    if with_timer:
        out["timer"] = _timer_state()
    return out


def _print_view(view: dict) -> None:
    print(f"{view['client']}:")
    for s in view["settings"]:
        shown = s["value"] if s["value"] != "" else f"(leer → {s['effective'] or '—'})"
        print(f"  {s['key']:<18} {shown:<14} {s['label']}")
    st = view["frame"]["state"]
    if st:
        print(f"  Frame-Zustand: aktiv={st['active']} domain={st['domain']} "
              f"frage={st['question_no']}/{st['questions_total']} "
              f"zuletzt={st['last_prompt_sent_at'] or '—'} pause_bis={st['paused_until'] or '—'}")
    t = view.get("timer")
    if t:
        print(f"  Timer {t['unit']}: {t['enabled']}/{t['active']} (global, nur der Coach schaltet ihn)")


def main(argv: list[str] | None = None, frame_mode: bool = False) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        if frame_mode:
            p = argparse.ArgumentParser(prog="coach frame", description="Frame-Map-Interview pro Klient schalten")
            p.add_argument("slug")
            p.add_argument("action", nargs="?", default="status", choices=["status", "on", "off"])
            p.add_argument("--start", help="FRAME_START (YYYY-MM-DD, leer = sofort)")
            p.add_argument("--nudge", help="FRAME_NUDGE_HOURS (leer = nie)")
            p.add_argument("--json", action="store_true")
            a = p.parse_args(args)
            updates: dict[str, str] = {}
            if a.action != "status":
                updates["FRAME_INTERVIEW"] = "1" if a.action == "on" else "0"
            if a.start is not None:
                updates["FRAME_START"] = a.start
            if a.nudge is not None:
                updates["FRAME_NUDGE_HOURS"] = a.nudge
            if updates:
                write_env(a.slug, updates)
        else:
            p = argparse.ArgumentParser(prog="coach client-env",
                                        description="Regelbare Schalter aus client.env anzeigen/setzen")
            p.add_argument("slug")
            p.add_argument("action", nargs="?", default="show", choices=["show", "set"])
            p.add_argument("pairs", nargs="*", metavar="KEY=WERT")
            p.add_argument("--json", action="store_true")
            a = p.parse_args(args)
            if a.action == "set":
                if not a.pairs:
                    p.error("set braucht mindestens ein KEY=WERT")
                write_env(a.slug, dict(pair.partition("=")[::2] for pair in a.pairs))
        view = settings_view(a.slug)
    except EnvError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 2
    if a.json:
        print(json.dumps(view, ensure_ascii=False, indent=2))
    else:
        _print_view(view)
    return 0


def frame_main() -> None:
    raise SystemExit(main(sys.argv[1:], frame_mode=True))


def env_main() -> None:
    raise SystemExit(main())


if __name__ == "__main__":
    env_main()
