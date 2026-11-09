import json
import threading
import time
from datetime import datetime, timezone

import pytest
from loguru import logger

from backend.core.clients import Client
from backend.sync import notify, source
from backend.sync.daemon import SyncDaemon
from backend.sync.events import RemoteEvent
from backend.sync.pull import RemoteDoc
from backend.core.store import SessionStore

UID, COACH = "UID-M", "UID-C"
NOW = datetime.now(timezone.utc).isoformat()
REG = {UID: Client(UID, "Matthias", "matthias", False), COACH: Client(COACH, "Daniel", "daniel", True)}


class FakeHandle:
    def __init__(self):
        self.ok, self.stopped = True, False

    def alive(self):
        return self.ok

    def stop(self):
        self.stopped = True


class FakeListener:
    def __init__(self, fail_first=0):
        self.starts, self.fail_first, self.emit, self.handles = 0, fail_first, None, []

    def start(self, uids, emit):
        self.starts += 1
        if self.starts <= self.fail_first:
            raise RuntimeError("Netz weg")
        self.emit = emit
        h = FakeHandle()
        self.handles.append(h)
        return h


def ev(doc_id="2026-10-14", kind="added", uid=UID, **data):
    doc = None if kind == "removed" else RemoteDoc(doc_id, {"date": doc_id[:10], **data})
    return RemoteEvent(uid, kind, doc_id, doc)


@pytest.fixture
def sent(monkeypatch):
    out = []
    monkeypatch.setattr(notify, "send_desktop", lambda t, b: out.append((t, b)) or True)
    return out


def make(tmp_path, **kw):
    kw.setdefault("listener", FakeListener())
    kw.setdefault("registry", REG)
    kw.setdefault("hub", False)
    return SyncDaemon(root=tmp_path, **kw)


# ---- Entscheidungslogik / Lehren aus dem alten Mirror ----------------------------------------
def test_added_flut_ueberschreibt_lokal_neuere_staende_nie(tmp_path):
    d = make(tmp_path)
    store = SessionStore(tmp_path)
    store.write(UID, "2026-10-14", {"x": "lokal korrigiert", "saved_at": "2026-10-14T15:00:00+00:00"})   # rev 0
    d.handle(ev("2026-10-14", x="alt", saved_at="2026-10-10T09:00:00+00:00"))                          # rev 0 == 0, remote älter
    assert store.read(UID, "2026-10-14")[0]["x"] == "lokal korrigiert"
    assert d.stats["übersprungen"] == 1 and d.stats["aktualisiert"] == 0


def test_added_flut_gleicher_stand_ist_unveraendert(tmp_path):
    d = make(tmp_path)
    store = SessionStore(tmp_path)
    store.write(UID, "2026-10-14", {"rev": 3, "saved_at": NOW})
    d.handle(ev(rev=3, saved_at=NOW))
    assert d.stats["übersprungen"] == 1 and not (tmp_path / ".fitsync" / "prev").exists()


def test_neu_und_hoeheres_rev_werden_uebernommen(tmp_path):
    d = make(tmp_path)
    store = SessionStore(tmp_path)
    d.handle(ev("2026-10-13", rev=1))
    d.handle(ev("2026-10-13", kind="modified", rev=2, effort=7))
    assert store.read(UID, "2026-10-13")[0]["effort"] == 7
    assert d.stats["angelegt"] == 1 and d.stats["aktualisiert"] == 1


def test_removed_wird_nur_geloggt_nie_geloescht(tmp_path):
    d = make(tmp_path)
    store = SessionStore(tmp_path)
    store.write(UID, "2026-10-14", {"rev": 1})
    d.handle(ev("2026-10-14", kind="removed"))
    assert store.read(UID, "2026-10-14")[0] == {"rev": 1} and d.stats["remote_gelöscht"] == 1


def test_ungueltige_doc_id_wird_gezaehlt(tmp_path):
    d = make(tmp_path)
    d.handle(RemoteEvent(UID, "added", "../evil", RemoteDoc("../evil", {})))
    assert d.stats["fehler"] == 1 and not (tmp_path / "users").exists()


def test_handle_safe_faengt_alles_ab(tmp_path, monkeypatch):
    import backend.sync.daemon as dm

    monkeypatch.setattr(dm, "pull_one_checked", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    d = make(tmp_path)
    d.handle_safe(ev())            # darf den Listener-Thread nicht beenden
    assert d.stats["fehler"] == 1


def test_dry_run_schreibt_nichts_und_meldet_nichts(tmp_path, sent):
    d = make(tmp_path, dry_run=True, notify_=True, batch_window=0)
    d.handle(ev(saved_at=NOW))
    d.write_status(True)
    assert sent == [] and not (tmp_path / "users").exists() and not (tmp_path / ".fitsync").exists()


# ---- Benachrichtigung ---------------------------------------------------------------------
def test_klienten_workout_wird_gemeldet_coach_nicht(tmp_path, sent):
    d = make(tmp_path, notify_=True, batch_window=0)
    d.handle(ev(uid=COACH, saved_at=NOW))
    assert sent == []
    d.handle(ev("2026-10-15", saved_at=NOW, sessionMode="strength", exercises=[1, 2]))
    assert len(sent) == 1 and sent[0][0] == "Matthias: Workout eingegangen" and "2 Übungen" in sent[0][1]


def test_start_flut_wird_zur_sammelmeldung_gebuendelt(tmp_path, sent):
    d = make(tmp_path, notify_=True, batch_window=0.2)
    for i in range(1, 6):
        d.handle(ev(f"2026-10-1{i}", saved_at=NOW))
    assert sent == []                       # noch im Bündelungsfenster
    time.sleep(0.5)
    assert len(sent) == 1 and sent[0][0] == "Matthias: 5 Workouts eingegangen"


def test_notify_fehler_stoppt_daemon_nicht(tmp_path, monkeypatch):
    monkeypatch.setattr(notify, "notify_changes", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("dbus")))
    d = make(tmp_path, notify_=True, batch_window=0)
    d.handle(ev(saved_at=NOW))
    assert d.stats["fehler"] == 1


# ---- Hauptschleife: Reconnect, Backoff, Beenden -----------------------------------------------
def run_in_thread(d, uids=(UID,)):
    stop = threading.Event()
    t = threading.Thread(target=d.run, args=(list(uids), stop), daemon=True)
    t.start()
    return t, stop


def wait_for(cond, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.01)
    return False


def test_run_verarbeitet_events_und_beendet_sauber(tmp_path):
    lst = FakeListener()
    d = make(tmp_path, listener=lst, poll=0.01)
    t, stop = run_in_thread(d)
    assert wait_for(lambda: lst.emit is not None)
    lst.emit(ev("2026-10-14", rev=1))                    # Listener-Thread-Aufruf
    assert wait_for(lambda: SessionStore(tmp_path).list_ids(UID) == {"2026-10-14"})
    status = json.loads((tmp_path / ".fitsync" / "daemon-status.json").read_text())
    assert status["running"] is True and status["uids"] == [UID]
    stop.set(); t.join(2)
    assert not t.is_alive() and lst.handles[0].stopped
    assert json.loads((tmp_path / ".fitsync" / "daemon-status.json").read_text())["running"] is False


def test_reconnect_wenn_listener_stirbt(tmp_path):
    lst = FakeListener()
    d = make(tmp_path, listener=lst, poll=0.01, backoff=(0.02, 0.05))
    t, stop = run_in_thread(d)
    assert wait_for(lambda: lst.starts == 1)
    lst.handles[0].ok = False                             # Verbindung weg
    assert wait_for(lambda: lst.starts == 2)              # neuer Start nach Backoff
    assert lst.handles[0].stopped and d.stats["neustarts"] >= 1
    lst.emit(ev("2026-10-14", rev=1))                     # neuer Listener funktioniert
    assert wait_for(lambda: SessionStore(tmp_path).list_ids(UID) == {"2026-10-14"})
    stop.set(); t.join(2)


def test_start_fehler_werden_mit_backoff_wiederholt(tmp_path):
    lst = FakeListener(fail_first=2)
    d = make(tmp_path, listener=lst, poll=0.01, backoff=(0.02, 0.02, 0.02))
    t, stop = run_in_thread(d)
    assert wait_for(lambda: len(lst.handles) == 1)
    assert lst.starts == 3 and d.stats["neustarts"] == 2
    stop.set(); t.join(2)


def test_stop_unterbricht_backoff_sofort(tmp_path):
    lst = FakeListener(fail_first=99)
    d = make(tmp_path, listener=lst, poll=0.01, backoff=(30,))
    t, stop = run_in_thread(d)
    assert wait_for(lambda: lst.starts == 1)
    t0 = time.time(); stop.set(); t.join(2)
    assert not t.is_alive() and time.time() - t0 < 1.0


def test_events_im_jsonl_log(tmp_path):
    from backend.sync import logsetup

    path = logsetup.setup(tmp_path / "logs")
    try:
        d = make(tmp_path)
        d.handle(ev("2026-10-14", rev=1))
        d.handle(ev("2026-10-14", kind="removed"))
        logger.complete()
    finally:
        logger.remove()
    events = [json.loads(l) for l in path.read_text().splitlines()]
    live = [e for e in events if e.get("event") == "session" and e["direction"] == "live"]
    assert [e["action"] for e in live] == ["angelegt", "remote_gelöscht"]


# ---- CLI ---------------------------------------------------------------------------------------
def test_cli_run_und_lock(tmp_path, monkeypatch):
    from typer.testing import CliRunner

    from backend.sync.cli import sync_app
    from backend.sync.lock import single_instance

    klienten = tmp_path / "Klienten" / "m"
    klienten.mkdir(parents=True)
    (klienten / "client.json").write_text(json.dumps({"name": "M", "firebase_uid": UID}))
    monkeypatch.setenv("FITNESS_KLIENTEN_DIR", str(tmp_path / "Klienten"))
    lst = FakeListener()
    monkeypatch.setattr(source, "FirestoreListener", lambda: lst)
    root = tmp_path / "root"

    r = CliRunner().invoke(sync_app, ["run", "--root", str(root), "--duration", "0.4"])
    assert r.exit_code == 0, r.output
    assert lst.starts == 1 and lst.handles[0].stopped

    with single_instance(root / ".fitsync" / "fitsync.lock"):
        r = CliRunner().invoke(sync_app, ["run", "--root", str(root), "--duration", "0.2"])
        assert r.exit_code == 2                           # zweite Instanz wird abgelehnt
