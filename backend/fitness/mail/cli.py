"""fitness-mail — Fitbit Gmail → ~/.aos/fitness/body/

poll  : IMAP-Poller (für Systemd-Timer)
parse : Rohmail von stdin verarbeiten (für aerc: :pipe fitness-mail parse)
show  : Letzte Body-Metriken als Tabelle

Handlers:
  weight   — Fitbit Waage-Email (Gewicht, BMI, Körperfett)
  activity — IFTTT Daily-Activity-Summary (Schritte, aktive Minuten, kcal)
  sleep    — Fitbit Sleep-Summary (Schlafdauer, Score)
  hr       — Fitbit Resting-Heart-Rate-Email
"""

import email
import email.policy
import imaplib
import json
import os
import re
import sys
from datetime import datetime, date, timezone
from pathlib import Path

import subprocess

import typer
from loguru import logger

app = typer.Typer(add_completion=False)

IMAP_HOST  = "imap.gmail.com"


def _notify(title: str, body: str) -> None:
    try:
        subprocess.run(
            ["notify-send", "--app-name=fitness-mail", "--icon=heart", title, body],
            env={**os.environ, "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/1000/bus"},
            timeout=3,
        )
    except Exception as e:
        logger.warning("notify-send fehlgeschlagen: {}", e)


IMAP_PORT = 993
BODY_DIR  = Path.home() / ".aos" / "fitness" / "body"


# ── Config helpers ────────────────────────────────────────────────────────────

def _env(key: str, default: str = "") -> str:
    val = os.environ.get(key, default)
    if not val:
        logger.error("missing env: {}", key)
        raise typer.Exit(1)
    return val


def _load_env() -> None:
    cfg = Path.home() / ".config" / "fitness-mail" / "fitness-mail.env"
    if cfg.exists():
        for line in cfg.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


# ── Body data storage ─────────────────────────────────────────────────────────

def _body_file(day: str) -> Path:
    BODY_DIR.mkdir(parents=True, exist_ok=True)
    return BODY_DIR / f"{day}.json"


def _read_body(day: str) -> dict:
    f = _body_file(day)
    if f.exists():
        try:
            return json.loads(f.read_text())
        except Exception:
            pass
    return {"date": day}


def _push_body_to_server(day: str, data: dict) -> None:
    """Fire-and-forget POST zu fitness-dev :9100 → triggert wger-Sync."""
    import urllib.request
    payload = json.dumps({**data, "date": day}).encode()
    req = urllib.request.Request(
        "http://localhost:9100/fitness/body",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=3)
    except Exception as e:
        logger.debug("server push fehlgeschlagen (ignoriert): {}", e)


def _write_body(day: str, data: dict) -> None:
    existing = _read_body(day)
    existing.update(data)
    existing["updated_at"] = datetime.now(timezone.utc).isoformat()
    _body_file(day).write_text(json.dumps(existing, indent=2))
    logger.info("body/{}.json updated: {}", day, list(data.keys()))
    _push_body_to_server(day, existing)


# ── Handlers ──────────────────────────────────────────────────────────────────

def _extract_text(msg: email.message.Message) -> str:
    """Alle Text-Parts eines Emails zusammenführen."""
    parts = []
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct in ("text/plain", "text/html"):
                try:
                    parts.append(part.get_payload(decode=True).decode("utf-8", errors="replace"))
                except Exception:
                    pass
    else:
        try:
            parts.append(msg.get_payload(decode=True).decode("utf-8", errors="replace"))
        except Exception:
            pass
    return "\n".join(parts)


def _date_from_msg(msg: email.message.Message) -> str:
    """Datum aus Email-Header (Date:) extrahieren, Fallback: heute."""
    raw = msg.get("Date", "")
    try:
        dt = email.utils.parsedate_to_datetime(raw)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return date.today().isoformat()


def handle_weight(subject: str, body_text: str, day: str) -> bool:
    """
    Fitbit Waage-Email.
    Echtes Format (Fitbit):
      Subject: "Weight logged May 17, 2026 at 08:49AM"
      Body:    "Weight logged: 84.5 kilograms\n\nBody mass index: 23.91"
    """
    combined = subject + " " + body_text
    weight_kg = None

    # "84.5 kilograms" oder "84.5 kg" oder "84,5kg"
    m = re.search(r"(\d[\d,\.]+)\s*kilograms?", combined, re.IGNORECASE)
    if m:
        weight_kg = float(m.group(1).replace(",", "."))
    if weight_kg is None:
        m = re.search(r"(\d[\d,\.]+)\s*kg\b", combined, re.IGNORECASE)
        if m:
            weight_kg = float(m.group(1).replace(",", "."))
    # lbs → kg
    if weight_kg is None:
        m = re.search(r"(\d[\d,\.]+)\s*(?:lbs?|pounds?)", combined, re.IGNORECASE)
        if m:
            weight_kg = round(float(m.group(1).replace(",", ".")) * 0.453592, 2)

    if weight_kg is None:
        return False

    data: dict = {"weight_kg": weight_kg}

    # "Body mass index: 23.91" oder "BMI: 23.91"
    m = re.search(r"(?:body mass index|bmi)[:\s]+(\d[\d,\.]+)", body_text, re.IGNORECASE)
    if m:
        data["bmi"] = float(m.group(1).replace(",", "."))

    # Körperfett / body fat
    m = re.search(r"(?:body fat|k.rperfett|fett)[:\s%]*(\d[\d,\.]+)\s*%?", body_text, re.IGNORECASE)
    if m:
        data["body_fat_pct"] = float(m.group(1).replace(",", "."))

    # Lean mass
    m = re.search(r"(?:lean|mager)[:\s]+(\d[\d,\.]+)\s*(?:kg|kilograms?)", body_text, re.IGNORECASE)
    if m:
        data["lean_mass_kg"] = float(m.group(1).replace(",", "."))

    _write_body(day, data)
    return True


def handle_activity(subject: str, body_text: str, day: str) -> bool:
    """
    IFTTT Daily-Activity-Summary.
    Subject-Format (IFTTT): "fitbit daily: 8423 steps 42 active_min 2134 kcal"
    """
    combined = subject + " " + body_text

    steps = None
    m = re.search(r"(\d[\d,\.]+)\s*steps?", combined, re.IGNORECASE)
    if m:
        steps = int(m.group(1).replace(",", "").replace(".", ""))

    if steps is None:
        return False

    data: dict = {"steps": steps}

    m = re.search(r"(\d+)\s*active[_\s]?min", combined, re.IGNORECASE)
    if m:
        data["active_min"] = int(m.group(1))

    m = re.search(r"(\d[\d,\.]+)\s*(?:kcal|calories?|cal)", combined, re.IGNORECASE)
    if m:
        data["calories_burned"] = int(m.group(1).replace(",", "").replace(".", ""))

    m = re.search(r"(\d[\d,\.]+)\s*(?:km|kilometer)", combined, re.IGNORECASE)
    if m:
        data["distance_km"] = float(m.group(1).replace(",", "."))

    m = re.search(r"(\d[\d,\.]+)\s*(?:miles?|mi)\b", combined, re.IGNORECASE)
    if m:
        data["distance_km"] = round(float(m.group(1).replace(",", ".")) * 1.60934, 2)

    _write_body(day, data)
    return True


def handle_sleep(subject: str, body_text: str, day: str) -> bool:
    """
    Fitbit Sleep-Summary Email.
    Sucht: sleep score, hours slept, sleep stages.
    """
    combined = subject + " " + body_text

    score = None
    m = re.search(r"sleep\s+score[:\s]+(\d+)", combined, re.IGNORECASE)
    if m:
        score = int(m.group(1))

    # Stunden Schlaf
    hours = None
    m = re.search(r"(\d+)h\s*(\d+)?m?\s*(?:of\s+)?sleep", combined, re.IGNORECASE)
    if m:
        hours = int(m.group(1)) + (int(m.group(2) or 0) / 60)
    if hours is None:
        m = re.search(r"slept\s+(\d[\d,\.]+)\s*(?:hours?|h)", combined, re.IGNORECASE)
        if m:
            hours = float(m.group(1).replace(",", "."))

    if score is None and hours is None:
        return False

    data: dict = {}
    if score is not None:
        data["sleep_score"] = score
    if hours is not None:
        data["sleep_h"] = round(hours, 2)

    # Sleep stages (optional)
    for stage in ("deep", "light", "rem", "awake"):
        m = re.search(rf"{stage}[:\s]+(\d+)\s*(?:min|minutes?)", combined, re.IGNORECASE)
        if m:
            data[f"sleep_{stage}_min"] = int(m.group(1))

    _write_body(day, data)
    return True


def handle_hr(subject: str, body_text: str, day: str) -> bool:
    """
    Fitbit Resting Heart Rate Email.
    """
    combined = subject + " " + body_text
    m = re.search(r"(?:resting\s+heart\s+rate|resting\s+HR|ruhepuls)[:\s]+(\d+)", combined, re.IGNORECASE)
    if m:
        _write_body(day, {"resting_hr": int(m.group(1))})
        return True
    # Einfach: "XX bpm" im Subject
    m = re.search(r"(\d{2,3})\s*bpm", combined, re.IGNORECASE)
    if m:
        _write_body(day, {"resting_hr": int(m.group(1))})
        return True
    return False


def handle_weekly(subject: str, body_text: str, day: str) -> bool:
    """
    Fitbit Wöchentlicher Fortschrittsbericht (HTML-Email, deutsches Zahlenformat).
    Format geprüft 2026-05-21 gegen echte Fitbit-Mail (DE-Locale).
    """
    clean = re.sub(r"<[^>]+>", " ", body_text)
    clean = re.sub(r"&#?[a-zA-Z\d]+;", " ", clean)
    clean = re.sub(r"\s+", " ", clean)

    def de_int(s: str) -> int:
        return int(s.replace(".", "").replace(",", ""))

    def de_float(s: str) -> float:
        return float(s.replace(".", "").replace(",", "."))

    data: dict = {}

    # "52.360 Schritte insgesamt"
    m = re.search(r"([\d\.]+)\s+Schritte\s+insgesamt", clean, re.IGNORECASE)
    if m:
        try: data["weekly_steps"] = de_int(m.group(1))
        except ValueError: pass

    # "39,43 km insgesamt"
    m = re.search(r"([\d,\.]+)\s*km\s+insgesamt", clean, re.IGNORECASE)
    if m:
        try: data["weekly_distance_km"] = de_float(m.group(1))
        except ValueError: pass

    # "33 Aktivzonenminuten insgesamt"
    m = re.search(r"(\d+)\s+Aktivzonenminuten\s+insgesamt", clean, re.IGNORECASE)
    if m:
        try: data["weekly_active_min"] = int(m.group(1))
        except ValueError: pass

    # "2.806 durchsch. verbrannte Kalorien pro Tag"
    m = re.search(r"([\d\.]+)\s+durchsch", clean, re.IGNORECASE)
    if m:
        try: data["weekly_calories_avg"] = de_int(m.group(1))
        except ValueError: pass

    # "206 Etagen insgesamt"
    m = re.search(r"([\d\.]+)\s+Etagen\s+insgesamt", clean, re.IGNORECASE)
    if m:
        try: data["weekly_floors"] = de_int(m.group(1))
        except ValueError: pass

    # "6 Std 19 Min durchschn. erholsamer Schlaf"
    m = re.search(r"(\d+)\s+Std\s+(\d+)\s+Min\s+durchschn.*?Schlaf", clean, re.IGNORECASE)
    if m:
        try: data["weekly_sleep_h"] = round(int(m.group(1)) + int(m.group(2)) / 60, 2)
        except ValueError: pass

    # "68 SPM durchschn. Ruheherzfrequenz"
    m = re.search(r"(\d+)\s+SPM\s+durchschn.*?Ruheherzfrequenz", clean, re.IGNORECASE)
    if m:
        try: data["weekly_resting_hr"] = int(m.group(1))
        except ValueError: pass

    if not data:
        return False

    _write_body(day, data)
    return True


# Handler-Registry: (Name, Subject-Pattern, Handler-Funktion)
# Subject-Pattern: regex gegen Kleinbuchstaben-Subject geprüft
HANDLERS = [
    ("weekly",   re.compile(r"wöchentlich|fortschrittsbericht|weekly.*progress", re.IGNORECASE), handle_weekly),
    ("weight",   re.compile(r"weight|gewicht|waage|kg|lbs|weigh", re.IGNORECASE),  handle_weight),
    ("activity", re.compile(r"steps?|daily.?activity|aktiv|schritte",   re.IGNORECASE),  handle_activity),
    ("sleep",    re.compile(r"sleep|schlaf",                      re.IGNORECASE),  handle_sleep),
    ("hr",       re.compile(r"heart.?rate|bpm|puls",             re.IGNORECASE),  handle_hr),
]


def _dispatch(msg: email.message.Message) -> str | None:
    """Email an passenden Handler weiterleiten. Gibt Handler-Name zurück oder None."""
    subject   = (msg.get("Subject") or "").strip()
    body_text = _extract_text(msg)
    day       = _date_from_msg(msg)

    # Alle passenden Handler testen (ein Email kann mehreres enthalten)
    matched = False
    for name, pattern, fn in HANDLERS:
        if pattern.search(subject) or pattern.search(body_text[:500]):
            if fn(subject, body_text, day):
                logger.info("handler '{}' erfolgreich: {}", name, subject[:60])
                matched = True
    return "matched" if matched else None


# ── Commands ──────────────────────────────────────────────────────────────────

@app.command()
def poll() -> None:
    """IMAP-Poller: Gmail label 'fitness' → body data."""
    _load_env()
    user   = _env("FITNESS_MAIL_USER")
    passwd = _env("FITNESS_MAIL_PASS")
    label  = os.environ.get("FITNESS_MAIL_LABEL", "fitness")

    with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as imap:
        imap.login(user, passwd)
        status, _ = imap.select(label)
        if status != "OK":
            logger.error("Gmail-Label '{}' nicht gefunden", label)
            raise typer.Exit(1)

        _, uids = imap.search(None, "UNSEEN")
        uid_list = uids[0].split()
        if not uid_list:
            logger.info("poll: keine neuen Mails im Label '{}'", label)
            return

        logger.info("poll: {} neue Mail(s) gefunden", len(uid_list))
        for uid in uid_list:
            _, data = imap.fetch(uid, "(RFC822)")
            raw = data[0][1]
            msg = email.message_from_bytes(raw, policy=email.policy.default)
            subject = msg.get("Subject", "?")
            date_str = msg.get("Date", "?")
            logger.info("mail: subject='{}' date='{}'", subject, date_str)
            result = _dispatch(msg)
            if result:
                imap.store(uid, "+FLAGS", "\\Seen")
                day  = _date_from_msg(msg)
                d    = _read_body(day)
                lines = []
                if "weight_kg" in d:
                    lines.append(f"Gewicht: {d['weight_kg']} kg")
                if "steps" in d:
                    lines.append(f"Schritte: {d['steps']:,}")
                if "active_min" in d:
                    lines.append(f"Aktiv: {d['active_min']} min")
                if "calories_burned" in d:
                    lines.append(f"Kalorien: {d['calories_burned']} kcal")
                if "sleep_h" in d:
                    lines.append(f"Schlaf: {d['sleep_h']} h")
                if "resting_hr" in d:
                    lines.append(f"HR: {d['resting_hr']} bpm")
                _notify(f"Fitbit {day}", "\n".join(lines) if lines else subject[:80])
            else:
                logger.warning("kein Handler für: subject='{}'", subject)


@app.command()
def parse() -> None:
    """Rohmail von stdin verarbeiten (aerc: :pipe fitness-mail parse)."""
    _load_env()
    raw = sys.stdin.buffer.read()
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    result = _dispatch(msg)
    if not result:
        logger.warning("kein Handler hat gematcht für: {}", msg.get("Subject", "?"))
        raise typer.Exit(1)


@app.command()
def show(days: int = typer.Option(14, help="Letzte N Tage anzeigen")) -> None:
    """Letzte Body-Metriken als Tabelle ausgeben."""
    _load_env()
    BODY_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(BODY_DIR.glob("????-??-??.json"), reverse=True)[:days]
    if not files:
        print("Keine Body-Daten vorhanden.")
        return

    print(f"{'Datum':<12} {'Gewicht':>8} {'BMI':>6} {'Fett%':>7} {'Schritte':>9} {'Schlaf h':>9} {'HR':>5}")
    print("-" * 60)
    for f in files:
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        day     = d.get("date", f.stem)
        weight  = f"{d['weight_kg']:.1f} kg" if "weight_kg" in d else "-"
        bmi     = f"{d['bmi']:.1f}"           if "bmi"       in d else "-"
        fat     = f"{d['body_fat_pct']:.1f}%" if "body_fat_pct" in d else "-"
        steps   = str(d.get("steps", "-"))
        sleep   = f"{d['sleep_h']:.1f}"       if "sleep_h"   in d else "-"
        hr      = str(d.get("resting_hr", "-"))
        print(f"{day:<12} {weight:>8} {bmi:>6} {fat:>7} {steps:>9} {sleep:>9} {hr:>5}")


if __name__ == "__main__":
    app()


def main() -> None:
    app()
