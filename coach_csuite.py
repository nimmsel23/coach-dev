"""C-Suite agent bridge — local CLI engines + Gemini oneshot + GitHub-Issue fallback.

  GET  /api/csuite/engines
  POST /api/csuite/run     { workspaceId, skillId?, engine, context?, message? }
  POST /api/csuite/issue   { title, body, labels? }  — oneshot GitHub Issue

Loopback only (same idea as coach_org). Never executes outbound send; returns
draft text for the dashboard HITL queue.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import asyncio
import urllib.error
import urllib.request
from urllib.parse import urlparse
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
WORKSPACES = ROOT / "workspaces"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "testclient"}
DEFAULT_TIMEOUT = int(os.environ.get("COACH_CSUITE_TIMEOUT", "120"))
GH_REPO = os.environ.get("COACH_CSUITE_GH_REPO", "nimmsel23/coach-dev")

ENGINES_CLI = {
    "claude": "claude",
    "agy": "agy",
    "cursor-agent": "cursor-agent",
    "codex": "codex",
}


class RunBody(BaseModel):
    workspaceId: str = "coo"
    clientId: str | None = None
    eventId: str | None = None
    expectedEventRevision: str | None = None
    expectedContextRevision: str | None = None
    skillId: str | None = None
    engine: str = "claude"
    context: dict[str, Any] = Field(default_factory=dict)
    message: str | None = None
    # Optional: dashboard fetched Git-brain client-side (fetch ./system-prompt.md).
    systemPrompt: str | None = None
    skills: dict[str, Any] | None = None


class IssueBody(BaseModel):
    title: str
    body: str
    labels: list[str] = Field(default_factory=lambda: ["csuite"])


def guard(request: Request) -> None:
    client = request.client.host if request.client else ""
    if "tailscale-funnel-request" in request.headers:
        raise HTTPException(403, "Nicht über Funnel verfügbar.")
    host = request.url.hostname or ""
    if host not in LOCAL_HOSTS and not (client == "testclient" and host == "testserver"):
        raise HTTPException(403, "Lokaler Coach-Hostname erforderlich.")
    origin = request.headers.get("origin")
    if origin and urlparse(origin).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise HTTPException(403, "Workspace-Aufträge nur über die lokale Coach-Oberfläche.")
    if client not in LOCAL_HOSTS:
        raise HTTPException(403, "C-Suite-Bridge nur lokal (127.0.0.1).")


def _read_env_key(name: str) -> str:
    val = (os.environ.get(name) or "").strip()
    if val:
        return val
    # fitness.env first — fuel/gemini.env keys are often stale for generateContent.
    for path in (
        Path.home() / ".env" / "fitness.env",
        Path.home() / ".env" / "relax.env",
        Path.home() / ".env" / "fuel.env",
        Path.home() / ".env" / "gemini.env",
        Path.home() / ".env" / "aos.env",
    ):
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                if k.strip() == name:
                    found = v.strip().strip('"').strip("'")
                    if found:
                        return found
        except OSError:
            continue
    return ""


def gemini_key() -> str:
    keys = gemini_keys()
    return keys[0] if keys else ""


def gemini_model() -> str:
    # C-Suite pins a working flash model; ignore stale GEMINI_MODEL previews.
    return os.environ.get("COACH_CSUITE_GEMINI_MODEL", "").strip() or "gemini-2.5-flash"


GEMINI_MODEL_FALLBACKS = (
    "gemini-2.5-flash",
    "gemini-flash-latest",
)


def gemini_keys() -> list[str]:
    """Collect unique API keys from env + known ~/.env files (fitness first)."""
    found: list[str] = []
    env_val = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if env_val:
        found.append(env_val)
    for path in (
        Path.home() / ".env" / "fitness.env",
        Path.home() / ".env" / "relax.env",
        Path.home() / ".env" / "gemini.env",
        Path.home() / ".env" / "fuel.env",
        Path.home() / ".env" / "aos.env",
    ):
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line.startswith("GEMINI_API_KEY="):
                    continue
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val and val not in found:
                    found.append(val)
                break
        except OSError:
            continue
    return found


def load_workspace(workspace_id: str) -> dict[str, Any]:
    if workspace_id not in {"coo", "cmo", "cso", "cpo", "cto", "cfo"}:
        raise HTTPException(404, "Unbekannter Workspace")
    ws = WORKSPACES / workspace_id
    if not ws.is_dir():
        raise HTTPException(404, f"Workspace nicht gefunden: {workspace_id}")
    prompt_path = ws / "system-prompt.md"
    skills_path = ws / "skills.json"
    config_path = ws / "config.json"
    prompt = prompt_path.read_text(encoding="utf-8") if prompt_path.is_file() else ""
    skills: dict[str, Any] = {}
    if skills_path.is_file():
        skills = json.loads(skills_path.read_text(encoding="utf-8"))
    config: dict[str, Any] = {}
    if config_path.is_file():
        config = json.loads(config_path.read_text(encoding="utf-8"))
    knowledge = []
    for path in sorted((ws / "knowledge").glob("*.md")):
        if path.resolve().is_relative_to(ws.resolve()):
            knowledge.append(f"## {path.name}\n{path.read_text(encoding='utf-8')}")
    if knowledge:
        prompt += "\n\n# Workspace-Wissen\n" + "\n\n".join(knowledge)
    tools = skills.get("tools") or skills.get("skills") or []
    return {
        "id": workspace_id,
        "dir": ws,
        "prompt": prompt,
        "skills": skills,
        "config": config,
        "tools": tools,
    }


def skill_meta(ws: dict[str, Any], skill_id: str | None) -> dict[str, Any] | None:
    if not skill_id:
        return None
    for t in ws["tools"]:
        name = t.get("name") or t.get("id")
        if name == skill_id:
            return t
    raise HTTPException(400, f"Unbekannter Skill: {skill_id}")


def build_user_prompt(ws: dict[str, Any], skill: dict[str, Any] | None, body: RunBody) -> str:
    parts = [
        f"Workspace: {ws['id']}",
        "Aufgabe: Erzeuge einen fertigen Entwurf für diesen Workspace.",
        "Regeln: Keine Außenwirkung ausführen. Fehlende Fakten als „fehlt:“ markieren.",
        "Antwort nur als nutzbarer Text (Briefing/Analyse/Mail-Entwurf) — kein Meta-Geplänkel.",
    ]
    if skill:
        parts.append(f"Skill: {skill.get('name') or skill.get('id')}")
        parts.append(f"Skill-Beschreibung: {skill.get('description', '')}")
        req = skill.get("requiresApproval")
        parts.append(f"requiresApproval: {bool(req)}")
    if body.context:
        parts.append("Kontext (JSON):")
        parts.append(json.dumps(body.context, ensure_ascii=False, indent=2))
    if body.message:
        parts.append("Freie Nachricht vom CEO:")
        parts.append(body.message)
    return "\n\n".join(parts)


def run_stub(skill: dict[str, Any] | None, body: RunBody) -> str:
    name = (
        (body.context or {}).get("clientName")
        or (body.context or {}).get("name")
        or "Klient"
    )
    sid = (skill or {}).get("name") or body.skillId or "chat"
    if body.message and not body.skillId:
        return (
            f"[COO Stub]\nVerstanden: „{body.message[:240]}“.\n"
            "Nutze engine=claude|agy|gemini für echten Oneshot."
        )
    return (
        f"[COO Stub · {sid}]\n"
        f"Klient: {name}\n"
        f"Kontext-Keys: {', '.join(sorted((body.context or {}).keys())) or '—'}\n"
        "Server-Bridge erreichbar; wähle eine echte Engine für Inhalt."
    )


def _run_cmd(cmd: list[str], *, timeout: int, cwd: Path | None = None, env: dict | None = None) -> str:
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(cwd or ROOT),
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, f"Engine-Timeout nach {timeout}s") from exc
    except FileNotFoundError as exc:
        raise HTTPException(503, f"Engine nicht installiert: {cmd[0]}") from exc
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0 and not out:
        raise HTTPException(502, f"Engine fehlgeschlagen ({proc.returncode}): {err[:800] or 'ohne stderr'}")
    if not out:
        raise HTTPException(502, f"Engine lieferte leeren Output: {err[:800]}")
    return out


def run_claude(system: str, user: str) -> str:
    bin_path = shutil.which("claude")
    if not bin_path:
        raise HTTPException(503, "claude CLI nicht gefunden")
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as fh:
        fh.write(system)
        sys_path = fh.name
    try:
        # Text-only oneshot: keine Tools → kein Dateischreiben vom Agenten.
        try:
            return _run_cmd(
                [
                    bin_path,
                    "-p",
                    "--output-format",
                    "text",
                    "--tools",
                    "",
                    "--system-prompt-file",
                    sys_path,
                    user,
                ],
                timeout=DEFAULT_TIMEOUT,
            )
        except HTTPException as first:
            # Fallback if --system-prompt-file unsupported on this CLI build.
            if "system-prompt" not in str(first.detail).lower() and first.status_code != 502:
                raise
            return _run_cmd(
                [
                    bin_path,
                    "-p",
                    "--output-format",
                    "text",
                    "--tools",
                    "",
                    "--system-prompt",
                    system[:12000],
                    user,
                ],
                timeout=DEFAULT_TIMEOUT,
            )
    finally:
        Path(sys_path).unlink(missing_ok=True)


def run_agy(system: str, user: str) -> str:
    bin_path = shutil.which("agy")
    if not bin_path:
        raise HTTPException(503, "agy CLI nicht gefunden")
    prompt = f"{system.strip()}\n\n---\n\n{user}"
    return _run_cmd(
        [bin_path, "-p", "--output-format", "text", "--mode", "plan", prompt],
        timeout=DEFAULT_TIMEOUT,
    )


def run_cursor_agent(system: str, user: str) -> str:
    bin_path = shutil.which("cursor-agent") or shutil.which("agent")
    if not bin_path:
        raise HTTPException(503, "cursor-agent nicht gefunden")
    prompt = f"{system.strip()}\n\n---\n\n{user}"
    return _run_cmd(
        [bin_path, "-p", "--mode", "ask", "--output-format", "text", prompt],
        timeout=DEFAULT_TIMEOUT,
    )


def run_codex(system: str, user: str) -> str:
    bin_path = shutil.which("codex")
    if not bin_path:
        raise HTTPException(503, "codex CLI nicht gefunden")
    prompt = f"{system.strip()}\n\n---\n\n{user}"
    # Non-interactive exec if available; fall back to print-style.
    return _run_cmd(
        [bin_path, "exec", "--sandbox", "read-only", "--skip-git-repo-check", prompt],
        timeout=DEFAULT_TIMEOUT,
    )


def run_gemini(system: str, user: str) -> str:
    keys = gemini_keys()
    if not keys:
        raise HTTPException(503, "GEMINI_API_KEY fehlt (Env oder ~/.env/fitness.env)")
    preferred = gemini_model()
    models: list[str] = []
    for m in (preferred, *GEMINI_MODEL_FALLBACKS):
        if m and m not in models:
            models.append(m)
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.35},
    }
    last_err = "kein Versuch"
    data = None
    for key in keys:
        key_invalid = False
        for model in models:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent?key={key}"
            )
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=min(DEFAULT_TIMEOUT, 90)) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                key_invalid = False
                break
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")[:400]
                last_err = f"{model} → HTTP {exc.code}: {detail}"
                if exc.code in {400, 401, 403} and "API key" in detail:
                    key_invalid = True
                    break  # next key
                continue
            except Exception as exc:  # noqa: BLE001
                last_err = f"{model} → {exc}"
                continue
        if data is not None:
            break
        if key_invalid:
            continue
    if data is None:
        raise HTTPException(502, f"Gemini-Aufruf fehlgeschlagen: {last_err}")
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Gemini-Antwort ohne Text") from exc
    if not text:
        raise HTTPException(502, "Gemini lieferte leeren Text")
    return text


def create_github_issue(title: str, body: str, labels: list[str]) -> dict[str, Any]:
    bin_path = shutil.which("gh")
    if not bin_path:
        raise HTTPException(503, "gh CLI nicht gefunden")
    cmd = [bin_path, "issue", "create", "--repo", GH_REPO, "--title", title[:200], "--body", body]
    for label in labels:
        if re.fullmatch(r"[A-Za-z0-9_./-]{1,50}", label):
            cmd.extend(["--label", label])
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, "gh issue create Timeout") from exc
    if proc.returncode != 0:
        # Label may not exist — retry without labels once.
        if labels and "label" in (proc.stderr or "").lower():
            return create_github_issue(title, body, [])
        raise HTTPException(502, f"gh issue create fehlgeschlagen: {(proc.stderr or proc.stdout)[:800]}")
    url = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout else ""
    return {"ok": True, "url": url, "repo": GH_REPO}


def engine_status() -> list[dict[str, Any]]:
    rows = []
    for engine, binary in ENGINES_CLI.items():
        if engine not in {"claude", "codex"}:
            continue
        path = shutil.which(binary)
        if engine == "cursor-agent" and not path:
            path = shutil.which("agent")
        rows.append({"id": engine, "available": bool(path), "path": path})
    rows.append({"id": "gemini", "available": bool(gemini_key()), "path": "api"})
    return rows


def run_engine(engine: str, system: str, user: str, skill: dict[str, Any] | None, body: RunBody) -> tuple[str, str]:
    engine = (engine or "claude").strip().lower()
    if engine == "stub":
        return run_stub(skill, body), "stub"
    if engine == "claude":
        return run_claude(system, user), "claude"
    if engine == "agy":
        return run_agy(system, user), "agy"
    if engine in {"cursor-agent", "cursor", "agent"}:
        return run_cursor_agent(system, user), "cursor-agent"
    if engine == "codex":
        return run_codex(system, user), "codex"
    if engine == "gemini":
        return run_gemini(system, user), "gemini"
    if engine == "issue":
        # Generate with gemini/claude if possible, else stub, then open issue.
        draft_engine = "gemini" if gemini_key() else ("claude" if shutil.which("claude") else "stub")
        text, used = run_engine(draft_engine, system, user, skill, body)
        title = f"[COO] {body.skillId or 'task'} · {(body.context or {}).get('clientName') or (body.context or {}).get('name') or 'draft'}"
        issue = create_github_issue(title, text, ["csuite", f"csuite/{body.workspaceId}"])
        return (
            f"{text}\n\n---\nGitHub-Issue: {issue.get('url') or '(kein URL)'}",
            f"issue+{used}",
        )
    raise HTTPException(400, f"Unbekannte Engine: {engine}")


def default_title(skill: dict[str, Any] | None, body: RunBody) -> str:
    name = (body.context or {}).get("clientName") or (body.context or {}).get("name") or ""
    sid = (skill or {}).get("name") or body.skillId or "chat"
    return f"{sid} · {name}".strip(" ·")


def create_router(runtime=None) -> APIRouter:
    from coach_csuite_runtime import Runtime, install_routes
    runtime = runtime or Runtime()
    router = APIRouter(prefix="/api/csuite", tags=["csuite"])
    install_routes(router, runtime, guard)

    @router.get("/engines")
    async def engines(request: Request):
        guard(request)
        return {"ok": True, "engines": engine_status()}

    @router.post("/run")
    async def run(request: Request, body: RunBody):
        guard(request)
        # Compatibility endpoint also records the real result and failures.
        run = runtime.create(body)
        result = await asyncio.to_thread(runtime.wait, run["id"])
        if result["status"] == "failed":
            raise HTTPException(502, result["error"])
        return {"ok": True, **result}

    @router.post("/issue")
    async def issue(request: Request, body: IssueBody):
        guard(request)
        result = create_github_issue(body.title, body.body, body.labels)
        return result

    return router
