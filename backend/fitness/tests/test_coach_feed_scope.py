"""`/fitness/coach/feed?uid=` liest nur den gewählten Klienten."""
import json

import pytest
from fastapi import HTTPException

from fitness.api.routers import coaching


def _write(root, uid, day, body):
    folder = root / uid / "sessions"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{day}.json").write_text(json.dumps(body), encoding="utf-8")


def test_uid_feed_keeps_selected_client_when_limit_would_mix(tmp_path, monkeypatch):
    root = tmp_path / "users"
    _write(root, "client-a", "2026-11-01", {
        "date": "2026-11-01",
        "block": "Push",
        "exercises": [{"name": "Bankdrücken", "sets": 3, "reps": 8}],
        "kcal": 2100,
        "protein": 150,
    })
    _write(root, "client-b", "2026-11-08", {
        "date": "2026-11-08",
        "block": "Cardio",
        "sessionMode": "strength",
        "activity": {"type": "run", "duration": 30},
        "exercises": [],
        "kcal": 9000,
        "protein": 10,
    })
    monkeypatch.setattr(coaching, "SESS_ROOT", root)

    mixed = coaching.coach_feed(limit=1)
    assert [item["userId"] for item in mixed["feed"]] == ["client-b"]

    scoped = coaching.coach_feed(limit=1, uid="client-a")
    assert [item["id"] for item in scoped["feed"]] == ["client-a__2026-11-01"]
    assert scoped["feed"][0]["userId"] == "client-a"
    assert scoped["feed"][0]["kcal"] == 2100
    payload = json.dumps(scoped)
    assert "client-b" not in payload
    assert "9000" not in payload

    other = coaching.coach_feed(uid="client-b")
    assert [item["userId"] for item in other["feed"]] == ["client-b"]
    assert other["feed"][0]["block"] == "Cardio"
    assert other["feed"][0]["activity"] == {"type": "run", "duration": 30}
    assert other["feed"][0]["exercises"] == []


def test_unknown_or_unsafe_uid_does_not_return_another_client(tmp_path, monkeypatch):
    root = tmp_path / "users"
    secret = tmp_path / "secret" / "sessions"
    secret.mkdir(parents=True)
    (secret / "2026-11-01.json").write_text(
        json.dumps({"date": "2026-11-01", "notes": "geheim", "kcal": 1}),
        encoding="utf-8",
    )
    _write(root, "client-a", "2026-11-02", {
        "date": "2026-11-02",
        "block": "Pull",
        "exercises": [{"name": "Rudern", "sets": 3}],
    })
    (root / "default" / "sessions").mkdir(parents=True)
    (root / "default" / "sessions" / "2026-11-03.json").write_text(
        json.dumps({"date": "2026-11-03", "notes": "default"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(coaching, "SESS_ROOT", root)

    assert coaching.coach_feed(uid="client-missing")["feed"] == []
    assert coaching.coach_feed(uid="default")["feed"] == []
    assert [item["userId"] for item in coaching.coach_feed()["feed"]] == ["client-a"]

    with pytest.raises(HTTPException) as exc:
        coaching.coach_feed(uid="../secret")
    assert exc.value.status_code == 400
    assert "geheim" not in json.dumps(coaching.coach_feed()["feed"])
