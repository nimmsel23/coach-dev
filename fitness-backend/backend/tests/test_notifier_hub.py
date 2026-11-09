import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.core.clients import Client
from backend.notifier import hub as hub_mod
from backend.notifier import popup as popup_mod
from backend.notifier.config import NotifyConfig, QuietHours, parse
from backend.notifier.hub import Hub
from backend.notifier.popup import Popup, build_argv, escape_markup
from backend.sync.notify import describe, notify_changes
from backend.sync.pull import Change

NOON = datetime(2026, 10, 15, 12, 0).astimezone()
NIGHT = datetime(2026, 10, 15, 23, 30).astimezone()
NOW_UTC = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
CLIENTS = {"U1": Client("U1", "Matthias Mayer", "matthias-mayer", False)}


def change(doc="2026-10-14", action="angelegt", age_days=1, uid="U1", **extra):
    saved = datetime(2026, 10, 15, 12, tzinfo=timezone.utc).replace(day=15 - age_days).isoformat()
    return Change(uid, doc, action, {"date": doc[:10], "saved_at": saved, "rev": 1, "sessionMode": "strength",
                                     "exercises": [{"name": "Klimmzug"}], **extra})


def make(tmp_path, cfg=None, clock=NOON, ok=True):
    sent = []
    hub = Hub(tmp_path, cfg or NotifyConfig(), sender=lambda p: sent.append(p) or ok, clients=CLIENTS, clock=lambda: clock)
    return hub, sent


def run(hub, changes, **kw):
    return notify_changes("Matthias", "U1", changes, send=lambda t, b: pytest.fail("einfacher Sender darf nicht laufen"),
                          now=NOW_UTC, hub=hub, **kw)


# --- Popup-Aufbau -------------------------------------------------------------------
def test_popup_enthaelt_actions_tag_und_kontext(tmp_path):
    hub, sent = make(tmp_path)
    assert run(hub, [change()]) == 1
    [p] = sent
    assert p.title == "Matthias: Workout eingegangen"
    assert [a[0] for a in p.actions] == ["default", "open", "seen"]
    assert p.tag == "fitness-sync-U1-2026-10-14" and p.ids == ["U1/2026-10-14"] and p.root == str(tmp_path)
    assert p.urgency == "normal" and "<b>2026-10-14</b>" in p.body
    assert hub.inbox.unseen_count() == 1


def test_kliententexte_werden_maskiert(tmp_path):
    hub, sent = make(tmp_path)
    run(hub, [change(notes="<b>x</b> & <script>alert(1)</script>", block="Push & Pull")])
    body = sent[0].body
    assert "<script>" not in body and "&lt;script&gt;" in body and "Push &amp; Pull" in body
    assert body.count("<b>") == 1                       # nur unser eigenes Fett-Tag


def test_markup_aus_ist_trotzdem_maskiert(tmp_path):
    hub, sent = make(tmp_path, NotifyConfig(markup=False))
    run(hub, [change(notes="a < b & c")])
    assert "<b>" not in sent[0].body and "a &lt; b &amp; c" in sent[0].body


def test_aktualisiert_titel(tmp_path):
    hub, sent = make(tmp_path)
    run(hub, [change(action="aktualisiert")])
    assert sent[0].title == "Matthias: Workout aktualisiert"


def test_actions_koennen_aus(tmp_path):
    hub, sent = make(tmp_path, NotifyConfig(actions=False))
    run(hub, [change()])
    assert sent[0].actions == []


# --- Entscheidungen --------------------------------------------------------------------
def test_stumm_zeigt_kein_popup_aber_inbox(tmp_path):
    hub, sent = make(tmp_path, parse({"clients": {"matthias-mayer": {"mute": True}}}))
    assert run(hub, [change()]) == 1
    assert sent == [] and hub.inbox.unseen_count() == 1


def test_ignore_weder_popup_noch_inbox(tmp_path):
    hub, sent = make(tmp_path, parse({"clients": {"Matthias": {"ignore": True}}}))
    assert run(hub, [change()]) == 0
    assert sent == [] and hub.inbox.entries() == []


def test_deaktiviert_nur_inbox(tmp_path):
    hub, sent = make(tmp_path, NotifyConfig(enabled=False))
    run(hub, [change()])
    assert sent == [] and hub.inbox.unseen_count() == 1


def test_ruhezeit_suppress(tmp_path):
    cfg = NotifyConfig(quiet_hours=QuietHours("22:00", "07:00", "suppress"))
    hub, sent = make(tmp_path, cfg, clock=NIGHT)
    run(hub, [change()])
    assert sent == [] and hub.inbox.unseen_count() == 1


def test_ruhezeit_silent_ist_leise_und_low(tmp_path):
    cfg = NotifyConfig(quiet_hours=QuietHours("22:00", "07:00", "silent"), sound="/x.oga")
    hub, sent = make(tmp_path, cfg, clock=NIGHT)
    run(hub, [change()])
    assert sent[0].urgency == "low" and sent[0].silent
    assert "--hint=boolean:suppress-sound:true" in build_argv(sent[0])
    assert not any("sound-file" in a for a in build_argv(sent[0]))


def test_ausserhalb_der_ruhezeit_normal(tmp_path):
    hub, sent = make(tmp_path, NotifyConfig(quiet_hours=QuietHours("22:00", "07:00")), clock=NOON)
    run(hub, [change()])
    assert len(sent) == 1 and sent[0].urgency == "normal"


@pytest.mark.parametrize("effort,expected", [(9, "critical"), (10, "critical"), (8, "normal"), (None, "normal")])
def test_urgent_effort(tmp_path, effort, expected):
    hub, sent = make(tmp_path, NotifyConfig(urgent_effort=9))
    run(hub, [change(effort=effort)])
    assert sent[0].urgency == expected


def test_klienten_dringlichkeit_hat_vorrang_vor_default(tmp_path):
    hub, sent = make(tmp_path, parse({"urgency": "low", "clients": {"matthias-mayer": {"urgency": "critical"}}}))
    run(hub, [change()])
    assert sent[0].urgency == "critical"


def test_dry_run_sendet_und_speichert_nichts(tmp_path):
    hub, sent = make(tmp_path)
    assert run(hub, [change()], dry_run=True) == 1
    assert sent == [] and hub.inbox.entries() == []


def test_alte_workouts_weder_inbox_noch_popup(tmp_path):
    hub, sent = make(tmp_path)
    assert run(hub, [change(age_days=14)]) == 0
    assert sent == [] and hub.inbox.entries() == []


def test_sammelmeldung_aber_alle_in_der_inbox(tmp_path):
    hub, sent = make(tmp_path)
    changes = [change(f"2026-10-1{i}") for i in range(4)]
    assert run(hub, changes) == 1
    [p] = sent
    assert p.title == "Matthias: 4 Workouts eingegangen" and len(p.ids) == 4 and p.tag.endswith("-summary")
    assert hub.inbox.unseen_count() == 4


def test_schwellen_kommen_aus_der_config(tmp_path):
    hub, sent = make(tmp_path, NotifyConfig(max_individual=1))
    assert run(hub, [change("2026-10-13"), change("2026-10-14")]) == 1
    hub2, sent2 = make(tmp_path / "b", NotifyConfig(max_age_days=0))
    assert run(hub2, [change(age_days=1)]) == 0


def test_explizite_schwellen_schlagen_die_config(tmp_path):
    hub, sent = make(tmp_path, NotifyConfig(max_individual=1))
    assert run(hub, [change("2026-10-13"), change("2026-10-14")], max_individual=5) == 2


def test_update_nach_gesehen_wird_wieder_neu(tmp_path):
    hub, sent = make(tmp_path)
    run(hub, [change()])
    hub.inbox.mark_seen(["U1/2026-10-14"])
    c = change(action="aktualisiert")
    c.data["rev"], c.data["saved_at"] = 2, "2026-10-15T09:00:00+00:00"
    run(hub, [c])
    assert hub.inbox.unseen_count() == 1 and len(sent) == 2


def test_senderfehler_wirft_nicht(tmp_path):
    hub, sent = make(tmp_path, ok=False)
    assert run(hub, [change()]) == 1
    assert hub.inbox.unseen_count() == 1


# --- Popup / notify-send -------------------------------------------------------------------
def test_build_argv_vollstaendig():
    p = Popup(title="T", body="B", urgency="critical", tag="tag1", actions=[("open", "Öffnen")], timeout_ms=5000,
              sound="/s.oga")
    argv = build_argv(p)
    assert argv[0] == "notify-send" and argv[-2:] == ["T", "B"]
    for part in ("--app-name=Fitness Sync", "--urgency=critical", "--expire-time=5000", "--category=fitness.workout",
                 "--hint=string:x-canonical-private-synchronous:tag1", "--hint=string:sound-file:/s.oga",
                 "--action=open=Öffnen"):
        assert part in argv
    assert any(a.startswith("--icon=") and a.endswith("logo.png") for a in argv)


def test_show_ohne_actions_ruft_notify_send_direkt(tmp_path):
    calls = []
    ok = popup_mod.show(Popup("T", "B"), run=lambda argv, **kw: calls.append((argv, kw)))
    assert ok and calls[0][0][0] == "notify-send" and "--action" not in " ".join(calls[0][0])


def test_show_mit_actions_startet_abgekoppelten_helfer():
    calls = []
    p = Popup("T", "B", actions=[("open", "Öffnen")], ids=["U1/d"], root="/r")
    assert popup_mod.show(p, popen=lambda argv, **kw: calls.append((argv, kw)))
    argv, kw = calls[0]
    assert argv[:3] == [sys.executable, "-m", "backend.notifier"] and "_wait-action" in argv
    assert kw["start_new_session"] is True
    import json
    payload = json.loads(argv[argv.index("--payload") + 1])
    assert payload["ids"] == ["U1/d"] and payload["root"] == "/r"


def test_show_fehler_gibt_false():
    def boom(*a, **k):
        raise OSError("kein notify-send")
    assert popup_mod.show(Popup("T", "B"), run=boom) is False
    assert popup_mod.show(Popup("T", "B", actions=[("a", "A")]), popen=boom) is False


def test_wait_for_action_liest_stdout():
    res = subprocess.CompletedProcess([], 0, stdout="seen\n", stderr="")
    assert popup_mod.wait_for_action(Popup("T", "B", actions=[("seen", "x")]), run=lambda *a, **k: res) == "seen"
    assert popup_mod.wait_for_action(Popup("T", "B"), run=lambda *a, **k: (_ for _ in ()).throw(OSError())) == ""


def test_escape_markup():
    assert escape_markup("<a href='x'>&") == "&lt;a href='x'&gt;&amp;"


# --- Beschreibung --------------------------------------------------------------------------------
def test_describe_aktivitaet():
    d = {"date": "2026-10-11", "sessionMode": "cardio", "effort": 7, "exercises": [], "duration": "",
         "activity": {"type": "climbing", "duration": "60", "notes": "Boulderbar"}}
    assert describe(d) == "2026-10-11 · Cardio · Klettern · 60 min · Effort 7\nBoulderbar"


# --- from_config / Schutz vor echten Meldungen in Tests ----------------------------------------------
def test_from_config_ist_unter_pytest_immer_none(tmp_path, monkeypatch):
    cfg = tmp_path / "n.yaml"
    cfg.write_text("enabled: true\n")
    monkeypatch.setenv("FITNESS_NOTIFY_CONFIG", str(cfg))
    assert hub_mod.from_config(tmp_path) is None


def test_from_config_ohne_pytest_schutz(tmp_path, monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setattr(hub_mod, "_under_pytest", lambda: False)
    monkeypatch.setenv("FITNESS_NOTIFY_CONFIG", str(tmp_path / "fehlt.yaml"))
    assert hub_mod.from_config(tmp_path) is None            # keine Datei → einfacher Modus
    cfg = tmp_path / "n.yaml"
    cfg.write_text("urgency: low\n")
    monkeypatch.setenv("FITNESS_NOTIFY_CONFIG", str(cfg))
    hub = hub_mod.from_config(tmp_path)
    assert hub is not None and hub.config.urgency == "low" and hub.root == tmp_path


# --- ein Wartehelfer pro Tag ------------------------------------------------------------------------
def _sleeper(marker: bool):
    args = [sys.executable, "-c", "import time; time.sleep(60)"] + (["_wait-action"] if marker else [])
    return subprocess.Popen(args, start_new_session=True)


def _alive(proc) -> bool:
    return proc.poll() is None


def test_claim_beendet_aelteren_helfer_desselben_tags(tmp_path):
    old = _sleeper(marker=True)
    try:
        f = popup_mod._waiter_file(tmp_path, "fitness-sync-U1-2026-10-14")
        f.parent.mkdir(parents=True)
        f.write_text(str(old.pid))
        popup_mod.claim_waiter(tmp_path, "fitness-sync-U1-2026-10-14")
        old.wait(timeout=5)
        assert not _alive(old) and f.read_text() == str(os.getpid())
        popup_mod.release_waiter(tmp_path, "fitness-sync-U1-2026-10-14")
        assert not f.exists()
    finally:
        old.kill()


def test_claim_trifft_keine_fremden_prozesse(tmp_path):
    stranger = _sleeper(marker=False)                          # z. B. wiederverwendete PID
    try:
        f = popup_mod._waiter_file(tmp_path, "tag")
        f.parent.mkdir(parents=True)
        f.write_text(str(stranger.pid))
        popup_mod.claim_waiter(tmp_path, "tag")
        assert _alive(stranger)
    finally:
        stranger.kill()


def test_claim_ohne_pidfile_und_tag_mit_sonderzeichen(tmp_path):
    popup_mod.claim_waiter(tmp_path, "a/b c:d")
    assert (tmp_path / "waiters" / "a_b_c_d.pid").exists()
    popup_mod.release_waiter(tmp_path, "a/b c:d")
    popup_mod.release_waiter(tmp_path, "nie-angelegt")        # darf nicht werfen
