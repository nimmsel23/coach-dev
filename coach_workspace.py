"""Serve ~/workspace under Coach :9150 /workspace/ (local-only)."""
from __future__ import annotations

import html
import mimetypes
import os
from pathlib import Path

from fastapi import Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse

BLOCKED_NAMES = {
    ".git",
    ".env",
    ".venv",
    "node_modules",
    "__pycache__",
    ".claude",
}
BLOCKED_SUFFIXES = (".env", ".pem", ".key", ".sqlite", ".db")


def workspace_root() -> Path:
    configured = os.environ.get("COACH_WORKSPACE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    link = Path(__file__).resolve().parent / "workspace"
    if link.exists():
        return link.resolve()
    return (Path.home() / "workspace").resolve()


def _blocked(path: Path) -> bool:
    for part in path.parts:
        if part in BLOCKED_NAMES:
            return True
    name = path.name
    if name.startswith(".env"):
        return True
    return name.endswith(BLOCKED_SUFFIXES)


def resolve_workspace(relative: str) -> Path | None:
    root = workspace_root()
    if not root.is_dir():
        return None
    relative = (relative or "").strip("/")
    candidate = (root / relative).resolve() if relative else root
    if not candidate.is_relative_to(root):
        return None
    if _blocked(candidate.relative_to(root) if candidate != root else Path(".")):
        # also block if any parent segment is blocked
        return None
    # re-check each part from root
    cur = root
    if relative:
        for part in Path(relative).parts:
            cur = cur / part
            if part in BLOCKED_NAMES or part.startswith(".env"):
                return None
    return candidate


def directory_listing(directory: Path, url_path: str, *, tree_root: Path | None = None, label: str = "~/workspace") -> HTMLResponse:
    root = (tree_root or workspace_root()).resolve()
    directory = directory.resolve()
    try:
        rel = "." if directory == root else str(directory.relative_to(root))
    except ValueError:
        rel = directory.name
    entries = []
    try:
        children = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError as err:
        return JSONResponse({"detail": str(err)}, status_code=500)
    if directory != root:
        parent = url_path.rstrip("/").rsplit("/", 1)[0] or url_path
        entries.append(f'<li><a href="{html.escape(parent)}/">../</a></li>')
    for child in children:
        if child.name in BLOCKED_NAMES or child.name.startswith(".env"):
            continue
        name = child.name + ("/" if child.is_dir() else "")
        href = f"{url_path.rstrip('/')}/{html.escape(child.name)}"
        if child.is_dir():
            href += "/"
        mark = "dir" if child.is_dir() else "file"
        if child.is_symlink():
            mark += " →"
        entries.append(f'<li data-kind="{mark}"><a href="{href}">{html.escape(name)}</a></li>')
    body = "\n".join(entries) or "<li><em>leer</em></li>"
    readme = directory / "README.md"
    readme_bit = ""
    if readme.is_file():
        text = html.escape(readme.read_text(encoding="utf-8", errors="replace")[:8000])
        readme_bit = f"<section><h2>README.md</h2><pre>{text}</pre></section>"
    page = f"""<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{html.escape(label)}/{html.escape(rel)}</title>
<style>
  body{{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#0b0e14;color:#e8eef8}}
  main{{max-width:960px;margin:0 auto;padding:2rem 1.25rem}}
  a{{color:#5ee0a0}} h1{{font-size:1.35rem;margin:0 0 .5rem}}
  .muted{{color:#9aa8bd;font-size:.9rem;margin-bottom:1.25rem}}
  ul{{list-style:none;padding:0;margin:0 0 2rem;border:1px solid #243044;border-radius:.75rem;overflow:hidden}}
  li{{border-top:1px solid #243044}} li:first-child{{border-top:0}}
  li a{{display:block;padding:.7rem 1rem;text-decoration:none;color:inherit}}
  li a:hover{{background:#141a24}}
  pre{{white-space:pre-wrap;background:#141a24;border:1px solid #243044;border-radius:.75rem;padding:1rem;font-size:.8rem;line-height:1.45;color:#c5d0e0}}
</style></head><body><main>
<p class="muted">{html.escape(label)} · lokal :9150</p>
<h1>/{html.escape(rel)}</h1>
<ul>{body}</ul>
{readme_bit}
</main></body></html>"""
    return HTMLResponse(page, headers={"Cache-Control": "no-store"})


def _serve_tree(root: Path, relative: str, request: Request, url_prefix: str, *, label: str):
    relative = (relative or "").strip("/")
    candidate = (root / relative).resolve() if relative else root.resolve()
    if not candidate.is_relative_to(root.resolve()):
        return JSONResponse({"detail": "Forbidden"}, status_code=403)
    if relative:
        for part in Path(relative).parts:
            if part in BLOCKED_NAMES or part.startswith(".env"):
                return JSONResponse({"detail": "Not found or blocked"}, status_code=404)
    if not candidate.exists():
        return JSONResponse({"detail": "Not found"}, status_code=404)
    if candidate.is_dir():
        index = candidate / "index.html"
        if index.is_file():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        url = request.url.path
        if not url.endswith("/"):
            url += "/"
        if not url.startswith(url_prefix.rstrip("/")):
            url = url_prefix.rstrip("/") + "/" + (relative + "/" if relative else "")
        return directory_listing(candidate, url, tree_root=root, label=label)
    mime, _ = mimetypes.guess_type(str(candidate))
    if candidate.suffix.lower() in {".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".csv"}:
        text = candidate.read_text(encoding="utf-8", errors="replace")
        if candidate.suffix.lower() == ".md":
            return PlainTextResponse(text, media_type="text/markdown; charset=utf-8")
        return PlainTextResponse(text, media_type=(mime or "text/plain") + "; charset=utf-8")
    return FileResponse(candidate, media_type=mime, headers={"Cache-Control": "no-cache"})


def serve_workspace(relative: str, request: Request):
    from coach_local_plans import local_only

    local_only(request)
    root = workspace_root()
    if not root.is_dir():
        return JSONResponse(
            {"detail": "workspace missing", "expected": str(root)},
            status_code=503,
        )
    if relative.strip("/") and resolve_workspace(relative) is None:
        return JSONResponse({"detail": "Not found or blocked"}, status_code=404)
    prefix = "/workspace/" if request.url.path.startswith("/workspace") else "/arbeitsplatz/"
    return _serve_tree(root, relative, request, prefix, label="~/workspace")


def serve_client_files(client_id: str, relative: str, request: Request):
    """Browse ~/.local/Klienten/<client_id>/ under /k/<client_id>/files/."""
    from coach_local_plans import clients_root, local_only, plans_module

    local_only(request)
    try:
        plans_module.LocalPlans(clients_root()).client(client_id)
    except plans_module.PlanError as error:
        return JSONResponse({"detail": str(error)}, status_code=error.status)
    root = (clients_root() / client_id).resolve()
    if not root.is_dir():
        return JSONResponse({"detail": "Client workspace missing"}, status_code=404)
    return _serve_tree(
        root,
        relative,
        request,
        f"/k/{client_id}/files/",
        label=f"Klienten/{client_id}",
    )
