"""fuel.http — HTTP-Fallback für den fuel-Dispatcher."""

import json
import os
import urllib.parse
import urllib.request

NODE_PORT = int(os.environ.get("PORT", 9000))
_BASE = f"http://127.0.0.1:{NODE_PORT}"


def api_get(path: str, timeout: float = 5.0):
    url = f"{_BASE}{path}"
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def nutrition_log(date: str) -> dict:
    return api_get(f"/nutrition/log?date={urllib.parse.quote(date)}")


def supplements_log(date: str) -> dict:
    return api_get(f"/supplements/log?date={urllib.parse.quote(date)}")


def daily(date: str) -> dict:
    return api_get(f"/nutrition/daily/{urllib.parse.quote(date)}")
