import io
import json

import pytest
from typer.testing import CliRunner

from backend.notifier import cli as cli_mod
from backend.notifier import popup as popup_mod
from backend.notifier import waybar
from backend.notifier.config import NotifyConfig, WaybarCfg
from backend.notifier.inbox import Inbox
from backend.notifier.paths import notifier_dir

runner = CliRunner()


def rec(ib, doc="2026-10-14", uid="U1", client="Matthias", summary=None, saved=None):
    ib.record(uid=uid, client=client, doc_id=doc, data={"date": doc[:10], "saved_at": saved or f"{doc[:10]}T10:00:00+00:00", "rev": 1},
              action="angelegt", summary=summary or f"{doc[:10]} · Kraft · 3 Übungen")


# --- Waybar ------------------------------------------------------------------------------
def test_waybar_leer(tmp_path):
    p = waybar.payload(Inbox(tmp_path), WaybarCfg())
    assert p["class"] == "empty" and p["text"] == "" and p["tooltip"] == "Keine neuen Workouts"


def test_waybar_zaehlt_ungesehene(tmp_path):
    ib = Inbox(tmp_path)
    rec(ib, "2026-10-14"), rec(ib, "2026-10-13")
    ib.mark_seen(["U1/2026-10-13"])
    p = waybar.payload(ib, WaybarCfg(format="Fit {count}"))
    assert p["text"] == "Fit 1" and p["class"] == "unseen" and "Matthias" in p["tooltip"] and "2026-10-13" not in p["tooltip"]


def test_waybar_tooltip_ist_maskiert_und_gekuerzt(tmp_path):
    ib = Inbox(tmp_path)
    for i in range(1, 6):
        rec(ib, f"2026-10-0{i}", client="<b>X&Y</b>", summary="a <i> b")
    p = waybar.payload(ib, WaybarCfg(tooltip_max=3))
    assert "&lt;b&gt;X&amp;Y&lt;/b&gt;" in p["tooltip"] and "<b>" not in p["tooltip"]
    assert p["tooltip"].splitlines()[-1] == "… und 2 weitere"


def test_waybar_follow_gibt_nur_bei_aenderung_aus(tmp_path):
    ib = Inbox(tmp_path)
    out = io.StringIO()
    calls = []

    def sleep(_):
        calls.append(1)
        if len(calls) == 2:
            rec(ib)                               # Änderung zwischen zwei Takten

    waybar.follow(ib, WaybarCfg(), out=out, sleep=sleep, max_loops=4)
    lines = [json.loads(l) for l in out.getvalue().splitlines()]
    assert [l["class"] for l in lines] == ["empty", "unseen"]


# --- CLI ------------------------------------------------------------------------------------
@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("FITNESS_NOTIFY_CONFIG", str(tmp_path / "notify.yaml"))
    return tmp_path


def test_init_schreibt_config_und_schuetzt_vor_ueberschreiben(env):
    r = runner.invoke(cli_mod.app, ["init"])
    assert r.exit_code == 0 and (env / "notify.yaml").exists()
    assert runner.invoke(cli_mod.app, ["init"]).exit_code == 1
    assert runner.invoke(cli_mod.app, ["init", "--force"]).exit_code == 0


def test_list_seen_und_waybar(env):
    ib = Inbox(notifier_dir(env / "data"))
    rec(ib, "2026-10-14"), rec(ib, "2026-10-13", uid="U2", client="Simon")
    data = json.loads(runner.invoke(cli_mod.app, ["list", "--json"]).output)
    assert [e["client"] for e in data] == ["Matthias", "Simon"] and all(e["unseen"] for e in data)
    assert json.loads(runner.invoke(cli_mod.app, ["waybar"]).output)["text"] == "Fit 2"
    assert "1 als gesehen" in runner.invoke(cli_mod.app, ["seen", "U1/2026-10-14"]).output
    assert [e["id"] for e in json.loads(runner.invoke(cli_mod.app, ["list", "--unseen", "--json"]).output)] == ["U2/2026-10-13"]
    assert "1 als gesehen" in runner.invoke(cli_mod.app, ["seen", "--all"]).output
    assert json.loads(runner.invoke(cli_mod.app, ["waybar"]).output)["class"] == "empty"


def test_kaputte_config_stoppt_mit_klarer_meldung(env):
    (env / "notify.yaml").write_text("urgency: laut\n")
    r = runner.invoke(cli_mod.app, ["waybar"])
    assert r.exit_code == 2 and "Config-Fehler" in r.output
    assert runner.invoke(cli_mod.app, ["doctor"]).exit_code == 1


def test_cli_chronik_liest_bestehende_sessions_ohne_inbox(env):
    from datetime import date
    from backend.core.store import SessionStore
    root = env / "data"
    day = date.today().isoformat()
    SessionStore(root).write("U1", day, {"date": day, "sessionMode": "strength"})
    result = runner.invoke(cli_mod.app, ["list", "--chronicle", "--json", "--uid", "U1"])
    assert result.exit_code == 0, result.output
    assert [e["date"] for e in json.loads(result.output)] == [day]
    assert not notifier_dir(root).exists()


# --- Action-Helfer (Klick auf die Meldung) ---------------------------------------------------------
class FakePad:
    shown = []

    def __init__(self, cfg, *, root, **kw):
        self.root = root

    def show(self, focus=None):
        FakePad.shown.append((str(self.root), focus))


def payload(root, ids):
    return json.dumps({"title": "T", "body": "B", "actions": [["open", "Öffnen"]], "root": str(root), "ids": ids})


@pytest.mark.parametrize("action,opens,seen", [("open", True, False), ("default", True, False), ("seen", False, True), ("", False, False)])
def test_wait_action_fuehrt_die_gewaehlte_action_aus(env, monkeypatch, action, opens, seen):
    FakePad.shown = []
    root = env / "data"
    ib = Inbox(notifier_dir(root))
    rec(ib)
    monkeypatch.setattr(popup_mod, "wait_for_action", lambda p, **kw: action)
    monkeypatch.setattr(cli_mod, "Scratchpad", FakePad)
    r = runner.invoke(cli_mod.app, ["_wait-action", "--payload", payload(root, ["U1/2026-10-14"])])
    assert r.exit_code == 0, r.output
    assert (FakePad.shown == [(str(root), "U1/2026-10-14")]) is opens
    assert (ib.unseen_count() == 0) is seen
