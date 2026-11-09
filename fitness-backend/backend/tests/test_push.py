import json

import pytest
from typer.testing import CliRunner

from backend.core.store import SessionStore
from backend.sync import source
from backend.sync.cli import sync_app
from backend.sync.lock import single_instance
from backend.sync.pull import RemoteDoc, pull_sessions
from backend.sync.push import push_sessions

UID = "UID-C"


class FakeTarget:
    def __init__(self, docs=None, fail_on=()):
        self.docs, self.fail_on, self.writes = dict(docs or {}), set(fail_on), []

    def fetch_all(self, uid):
        return {k: dict(v) for k, v in self.docs.items()}

    def write(self, uid, doc_id, data):
        if doc_id in self.fail_on:
            raise OSError("Firestore nicht erreichbar")
        self.writes.append((uid, doc_id, data))
        self.docs[doc_id] = data


@pytest.fixture
def store(tmp_path):
    return SessionStore(tmp_path)


def test_neu_wird_angelegt_dry_run_schreibt_nichts(store):
    store.write(UID, "2026-10-14", {"rev": 1, "x": 1})
    t = FakeTarget()
    r = push_sessions(UID, store, t, dry_run=True)
    assert r.counts["angelegt"] == 1 and t.writes == []
    r = push_sessions(UID, store, t, dry_run=False)
    assert r.counts["angelegt"] == 1 and t.writes[0][1] == "2026-10-14" and t.docs["2026-10-14"]["date"] == "2026-10-14"


def test_bekannter_fall_lokal_rev9_gegen_remote_ohne_rev(store, tmp_path):
    """2026-09-08 (lokal rev 9) / 2026-09-09 (lokal rev 2): in Firestore ohne rev -> lokal ist neuer."""
    store.write(UID, "2026-09-08", {"rev": 9, "saved_at": "2026-09-08T10:00:00+00:00", "effort": 8})
    store.write(UID, "2026-09-09", {"rev": 2, "saved_at": "2026-09-09T10:00:00+00:00"})
    t = FakeTarget({"2026-09-08": {"saved_at": "2026-09-08T09:00:00+00:00", "effort": 5},
                    "2026-09-09": {"saved_at": "2026-09-09T09:00:00+00:00"}})
    r = push_sessions(UID, store, t, dry_run=False)
    assert r.counts["aktualisiert"] == 2 and t.docs["2026-09-08"]["effort"] == 8
    # Vorversion des überschriebenen Firestore-Dokuments liegt lokal gesichert
    prev = json.loads((tmp_path / ".fitsync" / "prev-remote" / UID / "2026-09-08.json").read_text())
    assert prev["effort"] == 5


def test_remote_neuer_wird_nie_ueberschrieben(store):
    store.write(UID, "2026-10-14", {"rev": 2, "x": "lokal"})
    t = FakeTarget({"2026-10-14": {"rev": 5, "x": "remote"}})
    r = push_sessions(UID, store, t, dry_run=False)
    assert r.counts["übersprungen"] == 1 and t.writes == [] and t.docs["2026-10-14"]["x"] == "remote"


def test_gleiches_rev_ohne_rev_remote_neuer_gewinnt_nicht(store):
    store.write(UID, "2026-10-14", {"saved_at": "2026-10-10T09:00:00+00:00"})
    t = FakeTarget({"2026-10-14": {"saved_at": "2026-10-14T09:00:00+00:00"}})
    assert push_sessions(UID, store, t, dry_run=False).counts["übersprungen"] == 1 and t.writes == []


def test_kein_echo_nach_pull(store):
    """Frisch gepullte Dateien sind gleich dem Remote-Stand -> Push ändert nichts."""
    remote = {"2026-10-14": {"rev": 3, "saved_at": "2026-10-14T10:00:00+00:00", "x": 1},
              "2026-10-13": {"saved_at": "2026-10-13T10:00:00+00:00"}}
    pull_sessions(UID, [RemoteDoc(k, v) for k, v in remote.items()], store)
    t = FakeTarget(remote)
    r = push_sessions(UID, store, t, dry_run=False)
    assert r.counts["übersprungen"] == 2 and t.writes == [] and r.counts["aktualisiert"] == 0


def test_nur_remote_wird_gemeldet_nicht_angefasst(store):
    store.write(UID, "2026-10-14", {"rev": 1})
    t = FakeTarget({"2026-10-14": {"rev": 1}, "2026-01-01": {"rev": 1}})
    r = push_sessions(UID, store, t, dry_run=False)
    assert r.counts["nur_remote"] == 1 and "2026-01-01" in t.docs


def test_only_filter(store):
    for d in ("2026-10-12", "2026-10-13", "2026-10-14"):
        store.write(UID, d, {"rev": 1})
    t = FakeTarget()
    r = push_sessions(UID, store, t, dry_run=False, only={"2026-10-13"})
    assert [w[1] for w in t.writes] == ["2026-10-13"] and r.counts["nur_remote"] == 0


def test_owner_guard_und_defekte_datei(store):
    store.write(UID, "2026-10-12", {"rev": 1, "owner_uid": "FREMD"})
    store.path(UID, "2026-10-13").write_text("{kaputt")
    t = FakeTarget()
    r = push_sessions(UID, store, t, dry_run=False)
    assert r.counts["übersprungen"] == 1 and r.counts["fehler"] == 1 and t.writes == []


def test_schreibfehler_stoppt_lauf_nicht(store):
    store.write(UID, "2026-10-13", {"rev": 1})
    store.write(UID, "2026-10-14", {"rev": 1})
    t = FakeTarget(fail_on={"2026-10-13"})
    r = push_sessions(UID, store, t, dry_run=False)
    assert r.counts["fehler"] == 1 and r.counts["angelegt"] == 1 and "2026-10-14" in t.docs


def test_defekte_quarantaene_dateien_werden_nicht_gepusht(store):
    store.write(UID, "2026-10-14", {"rev": 1})
    (store.sessions_dir(UID) / "2026-10-14.json.corrupt").write_text("müll")
    (store.sessions_dir(UID) / "2026-10-14.json.bak").write_text("{}")
    t = FakeTarget()
    push_sessions(UID, store, t, dry_run=False)
    assert [w[1] for w in t.writes] == ["2026-10-14"]


# ---- CLI ----
@pytest.fixture
def cli_env(tmp_path, monkeypatch):
    t = FakeTarget()
    monkeypatch.setattr(source, "FirestoreTarget", lambda: t)
    root = tmp_path / "root"
    SessionStore(root).write(UID, "2026-10-14", {"rev": 1})
    return t, root


def test_cli_ist_standardmaessig_dry_run(cli_env):
    t, root = cli_env
    r = CliRunner().invoke(sync_app, ["push", "sessions", "--uid", UID, "--root", str(root)])
    assert r.exit_code == 0 and t.writes == []


def test_cli_apply_schreibt_und_verlangt_explizite_uid(cli_env, monkeypatch):
    t, root = cli_env
    r = CliRunner().invoke(sync_app, ["push", "sessions", "--apply", "--root", str(root)])
    assert r.exit_code != 0 and t.writes == []                 # keine UID -> Abbruch
    r = CliRunner().invoke(sync_app, ["push", "sessions", "--apply", "--uid", UID, "--root", str(root)])
    assert r.exit_code == 0 and len(t.writes) == 1


def test_cli_apply_respektiert_lock(cli_env):
    t, root = cli_env
    with single_instance(root / ".fitsync" / "fitsync.lock"):
        r = CliRunner().invoke(sync_app, ["push", "sessions", "--apply", "--uid", UID, "--root", str(root)])
    assert r.exit_code == 2 and t.writes == []
