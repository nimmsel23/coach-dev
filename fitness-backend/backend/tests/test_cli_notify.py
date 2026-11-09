import json

from typer.testing import CliRunner

from backend.sync import notify, source
from backend.sync.cli import sync_app as app
from backend.sync.pull import RemoteDoc
from datetime import datetime, timezone

runner = CliRunner()
NOW_ISO = datetime.now(timezone.utc).isoformat()


def setup_env(tmp_path, monkeypatch, remote):
    kl = tmp_path / "Klienten"
    for slug, cfg in {
        "daniel": {"name": "Daniel", "firebase_uid": "UC", "role": "coach", "status": "coach"},
        "matthias": {"name": "Matthias", "firebase_uid": "UM"},
    }.items():
        (kl / slug).mkdir(parents=True)
        (kl / slug / "client.json").write_text(json.dumps(cfg))
    monkeypatch.setenv("FITNESS_KLIENTEN_DIR", str(kl))
    sent = []
    monkeypatch.setattr(notify, "send_desktop", lambda t, b: sent.append((t, b)) or True)
    monkeypatch.setattr(source, "firestore_sessions", lambda uid: iter(remote.get(uid, [])))
    return sent


def invoke(tmp_path, *args):
    return runner.invoke(app, ["pull", "sessions", "--root", str(tmp_path / "root"), *args])


def test_clients_notify_ende_zu_ende(tmp_path, monkeypatch):
    remote = {
        "UM": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO, "sessionMode": "strength", "exercises": [1, 2]})],
        "UC": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})],
    }
    sent = setup_env(tmp_path, monkeypatch, remote)
    r = invoke(tmp_path, "--clients", "--notify")
    assert r.exit_code == 0, r.output
    assert sent == [("Matthias: Workout eingegangen", sent[0][1])] and "2 Übungen" in sent[0][1]
    # Coach-UID (UC) wird bei --clients gar nicht erst gepullt:
    assert not (tmp_path / "root" / "users" / "UC").exists()


def test_zweiter_lauf_meldet_nichts_mehr(tmp_path, monkeypatch):
    remote = {"UM": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})]}
    sent = setup_env(tmp_path, monkeypatch, remote)
    invoke(tmp_path, "--clients", "--notify")
    invoke(tmp_path, "--clients", "--notify")
    assert len(sent) == 1


def test_coach_uid_explizit_wird_nicht_gemeldet(tmp_path, monkeypatch):
    remote = {"UC": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})]}
    sent = setup_env(tmp_path, monkeypatch, remote)
    r = invoke(tmp_path, "--uid", "UC", "--notify")
    assert r.exit_code == 0 and sent == []
    assert (tmp_path / "root" / "users" / "UC" / "sessions" / "2026-10-14.json").exists()  # gepullt, nur nicht gemeldet


def test_ohne_notify_flag_keine_meldung(tmp_path, monkeypatch):
    remote = {"UM": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})]}
    sent = setup_env(tmp_path, monkeypatch, remote)
    assert invoke(tmp_path, "--clients").exit_code == 0 and sent == []


def test_dry_run_meldet_nicht_und_schreibt_nicht(tmp_path, monkeypatch):
    remote = {"UM": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})]}
    sent = setup_env(tmp_path, monkeypatch, remote)
    assert invoke(tmp_path, "--clients", "--notify", "--dry-run").exit_code == 0
    assert sent == [] and not (tmp_path / "root" / "users").exists()


def test_notify_fehler_stoppt_weitere_klienten_nicht(tmp_path, monkeypatch):
    remote = {
        "UM": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})],
        "UX": [RemoteDoc("2026-10-14", {"date": "2026-10-14", "saved_at": NOW_ISO})],
    }
    setup_env(tmp_path, monkeypatch, remote)
    (tmp_path / "Klienten" / "x").mkdir()
    (tmp_path / "Klienten" / "x" / "client.json").write_text(json.dumps({"name": "X", "firebase_uid": "UX"}))
    calls = []

    def boom(name, uid, changes, **kw):
        calls.append(uid)
        raise RuntimeError("kaputt")

    monkeypatch.setattr(notify, "notify_changes", boom)
    r = invoke(tmp_path, "--clients", "--notify")
    assert r.exit_code == 1                       # Fehler wird gemeldet ...
    assert len(calls) == 2                        # ... aber beide Klienten wurden behandelt
    assert (tmp_path / "root" / "users" / "UX" / "sessions" / "2026-10-14.json").exists()
