#!/usr/bin/env python3
"""List open PRs on nimmsel23/fitness that touch inbox/**.

Public repo — unauthenticated GitHub API works (low rate limit).
Optional: GITHUB_TOKEN / GH_TOKEN for higher limits.

Usage:
  python3 scripts/list_inbox_prs.py
  python3 scripts/list_inbox_prs.py --json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

REPO = os.environ.get("FITNESS_KB_REPO", "nimmsel23/fitness")
API = f"https://api.github.com/repos/{REPO}"


def _get(url: str) -> object:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "vitalos-fitness-kb-inbox",
    }
    token = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def inbox_prs() -> list[dict]:
    pulls = _get(f"{API}/pulls?state=open&per_page=50")
    if not isinstance(pulls, list):
        raise SystemExit(f"unexpected pulls payload: {pulls!r}"[:200])
    out: list[dict] = []
    for pr in pulls:
        number = pr["number"]
        files = _get(f"{API}/pulls/{number}/files?per_page=100")
        if not isinstance(files, list):
            continue
        inbox_files = [
            f["filename"]
            for f in files
            if isinstance(f, dict) and str(f.get("filename", "")).startswith("inbox/")
        ]
        if not inbox_files:
            continue
        out.append({
            "number": number,
            "title": pr.get("title"),
            "html_url": pr.get("html_url"),
            "user": (pr.get("user") or {}).get("login"),
            "created_at": pr.get("created_at"),
            "updated_at": pr.get("updated_at"),
            "head": (pr.get("head") or {}).get("ref"),
            "draft": bool(pr.get("draft")),
            "inbox_files": inbox_files,
            "cache_source": "github_pr",
            "file_id": f"pr-{number}",
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    rows = inbox_prs()
    if args.json:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if not rows:
        print("no open inbox PRs")
        return 0
    for row in rows:
        files = ", ".join(row["inbox_files"])
        print(f"#{row['number']} {row['title']} [{files}] {row['html_url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
