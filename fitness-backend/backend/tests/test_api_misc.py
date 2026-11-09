import json
from datetime import datetime, timezone

import pytest

from backend.api import deps  # noqa: F401
from backend.services import analytics, catalog
from backend.sync import notify, source
from backend.sync.pull import RemoteDoc
from backend.tests.api_helpers import COACH, KLIENT, make_app

NOW_ISO = datetime.now(timezone.utc).isoformat()


@pytest.fixture
def env(tmp_path):
    return make_app(tmp_path)


def test_plan_templates_und_default(env):
    client = env[0]
    t = client.get("/api/plan/templates").json()
    assert t["default"] in t["templates"] and "push_day" in t["templates"]
    assert client.get("/api/plan").status_code == 200
    assert client.get("/api/plan", params={"template": "push_day"}).json()["slots"]


def test_unbekanntes_plan_template_404(env):
    # "ppl" war ein irreführendes Beispiel in der Doku — es gibt nur push_day/pull_day/legs_day
    assert env[0].get("/api/plan", params={"template": "ppl"}).status_code == 404


def test_analytics_routen_ohne_teure_kb(env, monkeypatch):
    client = env[0]
    monkeypatch.setattr(analytics, "weekly", lambda store, uid, week="current": {"uid": uid, "week": week})
    monkeypatch.setattr(analytics, "coverage_for_range", lambda store, uid, a, b, label=None: {"uid": uid, "a": a, "b": b})
    assert client.get(f"/api/users/{KLIENT}/analytics/weekly", params={"week": "2026-W41"}).json() == {"uid": KLIENT, "week": "2026-W41"}
    assert client.get(f"/api/users/{KLIENT}/analytics/coverage", params={"date_from": "2026-10-01", "date_to": "2026-10-07"}).json()["b"] == "2026-10-07"
    assert client.get(f"/api/users/{KLIENT}/analytics/coverage", params={"date_from": "x", "date_to": "y"}).status_code == 422


def test_ungueltiger_zeitraum_422(env):
    r = env[0].get(f"/api/users/{KLIENT}/analytics/weekly", params={"week": "quatsch"})
    assert r.status_code == 422


def test_unerwarteter_fehler_gibt_nur_fehler_id_nach_aussen(tmp_path, monkeypatch):
    client, _, _ = make_app(tmp_path, raise_server_exceptions=False)
    monkeypatch.setattr(catalog, "search", lambda q, limit=12: (_ for _ in ()).throw(RuntimeError("geheimes Detail /home/x")))
    r = client.get("/api/catalog/exercises", params={"q": "a"})
    assert r.status_code == 500 and r.json()["detail"] == "interner Fehler" and r.json()["error_id"]
    assert "geheim" not in r.text


def test_smoke_alle_get_routen_ohne_5xx(env, monkeypatch):
    client, _, store = env
    store.write(KLIENT, "2026-10-14", {"date": "2026-10-14"})
    monkeypatch.setattr(analytics, "weekly", lambda *a, **k: {})
    monkeypatch.setattr(analytics, "coverage_for_range", lambda *a, **k: {})
    monkeypatch.setattr(catalog, "search", lambda *a, **k: {"results": [], "total": 0})
    monkeypatch.setattr(catalog, "get", lambda *a, **k: {})
    fill = {"uid": KLIENT, "doc_id": "2026-10-14", "exercise_id": "020"}
    checked = 0
    for path, ops in client.get("/openapi.json").json()["paths"].items():
        if "get" not in ops:
            continue
        url = path
        for k, v in fill.items():
            url = url.replace("{" + k + "}", v)
        params = {p["name"]: "2026-10-01" for p in ops["get"].get("parameters", []) if p["in"] == "query" and p.get("required")}
        r = client.get(url, params=params)
        assert r.status_code < 500, f"{url} -> {r.status_code} {r.text[:200]}"
        checked += 1
    assert checked >= 9


# ---- Sync-API ----
@pytest.fixture
def sync_env(env, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send_desktop", lambda t, b: sent.append((t, b)) or True)
    remote = {KLIENT: [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO, "exercises": [1]})],
              COACH: [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})]}
    monkeypatch.setattr(source, "firestore_sessions", lambda uid: iter(remote.get(uid, [])))
    return env, sent


def test_sync_pull_dry_run_schreibt_nichts(sync_env):
    (client, settings, store), sent = sync_env
    r = client.post("/api/sync/pull", json={"clients": True, "notify": True, "dry_run": True})
    assert r.status_code == 200 and r.json()["results"][0]["angelegt"] == 1
    assert sent == [] and store.list_ids(KLIENT) == set()


def test_sync_pull_schreibt_und_meldet_nur_klienten(sync_env):
    (client, _, store), sent = sync_env
    r = client.post("/api/sync/pull", json={"clients": True, "notify": True})
    assert r.status_code == 200 and r.json()["errors"] == 0
    assert [x["uid"] for x in r.json()["results"]] == [KLIENT]          # Coach ist bei clients=true nicht dabei
    assert store.list_ids(KLIENT) == {"2026-10-14"} and len(sent) == 1


def test_sync_pull_ohne_ziel_422(env):
    assert env[0].post("/api/sync/pull", json={}).status_code == 422


def test_sync_log_liest_strukturierte_events(sync_env):
    from loguru import logger

    from backend.sync import logsetup

    (client, settings, _), _ = sync_env
    logsetup.setup(settings.log_dir)
    try:
        client.post("/api/sync/pull", json={"uids": [KLIENT]})
        logger.complete()
    finally:
        logger.remove()
    events = client.get("/api/sync/log", params={"event": "session", "uid": KLIENT}).json()
    assert events and events[-1]["action"] == "angelegt"
    assert client.get("/api/sync/log", params={"event": "summary"}).json()[-1]["angelegt"] == 1
    assert client.get("/api/sync/log", params={"action": "gibtsnicht"}).json() == []


def test_sync_status_ohne_und_mit_daemon(env):
    import os

    client, settings, _ = env
    assert client.get("/api/sync/status").json()["alive"] is False
    status = settings.data_root / ".fitsync" / "daemon-status.json"
    status.parent.mkdir(parents=True)
    status.write_text(json.dumps({"running": True, "pid": os.getpid(), "counts": {"events": 3}}))
    r = client.get("/api/sync/status").json()
    assert r["alive"] is True and r["counts"] == {"events": 3}
    status.write_text(json.dumps({"running": True, "pid": 2 ** 22 + 12345}))     # abgestürzt: running, aber PID weg
    assert client.get("/api/sync/status").json()["alive"] is False
