"""
fitness_http.py — HTTP-Fallback-Helpers für den fitness-Dispatcher.

Wird von bin/fitness genutzt wenn kein direkter Backend-Zugriff möglich ist
(Server läuft, aber Python-Libs nicht importierbar o.ä.).
"""

import json
import os
import urllib.parse
import urllib.request

DEV_PORT = int(os.environ.get("FITNESS_PORT", 9100))
_BASE = f"http://127.0.0.1:{DEV_PORT}"


def api_get(path: str, timeout: float = 5.0) -> dict:
    url = f"{_BASE}{path}"
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def session_today() -> dict:
    from datetime import date
    return api_get(f"/session?date={date.today()}")

def session_get(date: str) -> dict:
    return api_get(f"/session?date={date}")

def session_list(limit: int = 10) -> list:
    return api_get(f"/session/history?limit={limit}")

def journal_today() -> dict:
    from datetime import date
    return api_get(f"/journal?date={date.today()}")

def journal_get(date: str) -> dict:
    return api_get(f"/journal?date={date}")

def journal_list() -> list:
    return api_get("/journal/list")

def coverage(days: int = 7) -> dict:
    return api_get(f"/coverage/detailed?days={days}")

def gaps(days: int = 7) -> dict:
    return api_get(f"/coverage/gaps?days={days}")

def search(query: str) -> dict:
    q = urllib.parse.quote(query)
    return api_get(f"/exercises/search?q={q}")
