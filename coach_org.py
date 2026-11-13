"""/api/org — Live-Anbindung für das Org-Cockpit „vitalos · Organisation“ (nur lokal).

Das Cockpit liegt als statische GitHub Page unter https://nimmsel23.github.io/dashboards/org/
(Quelle ~/.vos/org-dashboard). Läuft coach-api auf diesem Rechner, holt es sich hier die echte Lage
und legt Daniels Antworten ab. Ohne coach-api bleibt die Page beim Schnappschuss.

  GET  /api/org/state     Coaching-Lage (anonym, aus ~/.vos/coaching/report.py) + letzte Antworten
  POST /api/org/decision  {"id", "status": "angenommen"|"abgelehnt", "reason"?}
  POST /api/org/line      {"text"}  — „Eine Zeile, wenn du willst“

Antworten landen additiv in ~/workspace/team/owner/ANTWORTEN.md und werden dort committet
(Push im Hintergrund).

Zugang: direkt über Loopback (Laptop) oder übers Tailnet (Handy) via
`tailscale serve --https=8443 --set-path /api/org http://127.0.0.1:9150/api/org` — dieser Port ist
NICHT gefunnelt. Tailnet-Anfragen müssen die Tailscale-Identität eines Owner-Kontos tragen
(`Tailscale-User-Login`, von tailscale serve gesetzt); Funnel-Anfragen tragen keine Identität und
werden abgelehnt. Schreibende Anfragen nur von erlaubten Ursprüngen.
"""
from __future__ import annotations

import ipaddress
import json
import os
import re
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request

from coach_workspace import workspace_root

VIENNA = ZoneInfo("Europe/Vienna")
ALLOWED_ORIGINS = {"https://nimmsel23.github.io"}
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
TAILNET_NETS = (ipaddress.ip_network("100.64.0.0/10"), ipaddress.ip_network("fd7a:115c:a1e0::/48"))


def _is_tailnet(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(ip in net for net in TAILNET_NETS)


OWNER_LOGINS = {
    x.strip().lower()
    for x in os.environ.get("COACH_ORG_TAILNET_LOGINS", "nimmsel23@gmail.com,nimmdaniel@gmail.com").split(",")
    if x.strip()
}
REPORT = Path(os.environ.get("COACH_ORG_REPORT", Path.home() / ".vos" / "coaching" / "report.py"))
DECISION_IDS = re.compile(r"^[a-z0-9-]{1,40}$")
ENTRY = re.compile(r"^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (Entscheid|Zeile)(?: ([a-z0-9-]+))?: (.*)$")


def owner_file() -> Path:
    return workspace_root() / "team" / "owner" / "ANTWORTEN.md"


def guard(request: Request) -> None:
    """Laptop direkt oder Owner übers Tailnet; nie Funnel, nie ein anderer Proxy."""
    client = request.client.host if request.client else ""
    login = request.headers.get("tailscale-user-login", "").strip().lower()
    # uvicorn übernimmt hinter tailscale serve die Tailnet-IP aus X-Forwarded-For als Absender.
    if client not in LOCAL_HOSTS | {"testclient"} and not (login and _is_tailnet(client)):
        raise HTTPException(403, "Nur lokal.")
    if login:
        # Über tailscale serve: nur Owner-Konten, nie Funnel, nur *.ts.net.
        if login not in OWNER_LOGINS or "tailscale-funnel-request" in request.headers:
            raise HTTPException(403, "Nur Owner im Tailnet.")
        if not (request.url.hostname or "").endswith(".ts.net"):
            raise HTTPException(403, "Tailnet-Hostname erforderlich.")
    else:
        if request.url.hostname not in LOCAL_HOSTS:
            raise HTTPException(403, "Lokaler Hostname erforderlich.")
        if any(h in request.headers for h in ("x-forwarded-for", "x-forwarded-host", "forwarded", "tailscale-funnel-request")):
            raise HTTPException(403, "Nicht über Proxy.")
    origin = request.headers.get("origin")
    if origin:
        parts = urlsplit(origin)
        local = parts.scheme == "http" and parts.hostname in LOCAL_HOSTS
        if origin not in ALLOWED_ORIGINS and not local:
            raise HTTPException(403, "Fremder Ursprung abgelehnt.")


def coaching() -> dict | None:
    if not REPORT.exists():
        return None
    try:
        out = subprocess.run(["python3", str(REPORT), "--json"], capture_output=True, text=True, timeout=180)
        return json.loads(out.stdout) if out.returncode == 0 else None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return None


def read_answers(limit: int = 30) -> list[dict]:
    path = owner_file()
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = ENTRY.match(line)
        if m:
            rows.append({"at": m[1], "kind": m[2], "id": m[3], "text": m[4]})
    return rows[-limit:][::-1]


def _commit_and_push(path: Path, message: str) -> None:
    repo = workspace_root()
    rel = str(path.relative_to(repo))
    git = ["git", "-C", str(repo)]
    subprocess.run([*git, "add", "--", rel], capture_output=True, timeout=30)
    subprocess.run([*git, "commit", "-q", "-m", message, "--", rel], capture_output=True, timeout=30)

    def push() -> None:
        subprocess.run([*git, "pull", "-q", "--rebase", "--autostash"], capture_output=True, timeout=120)
        subprocess.run([*git, "push", "-q"], capture_output=True, timeout=120)

    threading.Thread(target=push, daemon=True).start()


def append(kind: str, text: str, ident: str | None = None) -> dict:
    text = " ".join(text.split())
    if not text:
        raise HTTPException(400, "Leerer Text.")
    if len(text) > 500:
        raise HTTPException(413, "Höchstens 500 Zeichen.")
    now = datetime.now(VIENNA).strftime("%Y-%m-%d %H:%M")
    path = owner_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(
            "# Antworten des Owners\n\n"
            "Aus dem Org-Cockpit (https://nimmsel23.github.io/dashboards/org/) über coach-api `/api/org`.\n"
            "Additiv, neueste unten. Ilse liest das für den nächsten Wochenbrief.\n\n",
            encoding="utf-8",
        )
    label = f"{kind} {ident}" if ident else kind
    with path.open("a", encoding="utf-8") as fh:
        fh.write(f"- {now} · {label}: {text}\n")
    _commit_and_push(path, f"owner: {label} aus dem Org-Cockpit")
    return {"ok": True, "at": now}


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/org")

    @router.get("/state")
    async def state(request: Request):
        guard(request)
        return {
            "live": True,
            "today": datetime.now(VIENNA).strftime("%Y-%m-%d"),
            "coaching": coaching(),
            "answers": read_answers(),
        }

    async def body(request: Request) -> dict:
        raw = await request.body()
        if len(raw) > 4000:
            raise HTTPException(413, "Zu groß.")
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            raise HTTPException(400, "Ungültiges JSON.")
        if not isinstance(data, dict):
            raise HTTPException(400, "Objekt erwartet.")
        return data

    @router.post("/decision")
    async def decision(request: Request):
        guard(request)
        data = await body(request)
        ident, status = str(data.get("id", "")), data.get("status")
        if not DECISION_IDS.match(ident) or status not in ("angenommen", "abgelehnt"):
            raise HTTPException(400, "id und status (angenommen|abgelehnt) nötig.")
        reason = str(data.get("reason") or "").strip()
        return append("Entscheid", f"{status}" + (f" — {reason}" if reason else ""), ident)

    @router.post("/line")
    async def line(request: Request):
        guard(request)
        data = await body(request)
        return append("Zeile", str(data.get("text", "")))

    return router
