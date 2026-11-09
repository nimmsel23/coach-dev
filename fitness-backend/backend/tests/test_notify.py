from datetime import datetime, timedelta, timezone

from backend.sync.notify import describe, notify_changes
from backend.sync.pull import Change

NOW = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)


def ch(doc_id="2026-10-14", action="angelegt", age_days=1, **extra):
    saved = (NOW - timedelta(days=age_days)).isoformat()
    data = {"date": doc_id[:10], "saved_at": saved, **extra}
    return Change("U2", doc_id, action, data)


class Outbox:
    def __init__(self, ok=True):
        self.sent, self.ok = [], ok

    def __call__(self, title, body):
        self.sent.append((title, body))
        return self.ok


def run(changes, out=None, **kw):
    out = out if out is not None else Outbox()
    n = notify_changes("Matthias", "U2", changes, send=out, now=NOW, **kw)
    return n, out.sent


def test_describe_kraft():
    d = {"date": "2026-10-14", "sessionMode": "strength", "block": "Push", "exercises": [1, 2, 3],
         "duration": "60min", "effort": 7, "notes": "Brust & Trizeps"}
    assert describe(d) == "2026-10-14 · Kraft · Push · 3 Übungen · 60min · Effort 7\nBrust & Trizeps"


def test_describe_laesst_leere_felder_weg():
    assert describe({"date": "2026-10-11", "sessionMode": "cardio", "effort": 7, "exercises": [], "duration": ""}) \
        == "2026-10-11 · Cardio · Effort 7"


def test_lange_notiz_wird_gekuerzt():
    assert describe({"date": "d", "notes": "x" * 200}).splitlines()[1].endswith("…")


def test_neu_und_aktualisiert_haben_verschiedene_titel():
    _, sent = run([ch(action="angelegt"), ch("2026-10-13", action="aktualisiert")])
    assert [t for t, _ in sent] == ["Matthias: Workout eingegangen", "Matthias: Workout aktualisiert"]


def test_sammelmeldung_ab_vier():
    n, sent = run([ch(f"2026-10-1{i}") for i in range(4)])
    assert n == 1 and sent[0][0] == "Matthias: 4 Workouts eingegangen"
    assert "2026-10-13" in sent[0][1]


def test_genau_drei_einzeln():
    assert run([ch(f"2026-10-1{i}") for i in range(3)])[0] == 3


def test_alte_workouts_werden_nicht_gemeldet():
    n, sent = run([ch("2026-09-01", age_days=40), ch("2026-10-14", age_days=1)])
    assert n == 1 and sent[0][1].startswith("2026-10-14")


def test_nur_alte_ergibt_nichts():
    assert run([ch("2026-04-07", age_days=190)]) == (0, [])


def test_ohne_zeitstempel_wird_gemeldet():
    c = Change("U2", "x", "angelegt", {"date": None})
    assert run([c])[0] == 1


def test_dry_run_sendet_nichts():
    out = Outbox()
    n, sent = run([ch()], out, dry_run=True)
    assert n == 1 and sent == []


def test_senderfehler_wirft_nicht():
    n, sent = run([ch()], Outbox(ok=False))
    assert n == 1 and len(sent) == 1


def test_logo_asset_vorhanden_und_wird_als_icon_gesendet(monkeypatch):
    import subprocess

    from backend.sync import notify

    assert notify.LOGO.is_file() and notify.LOGO.read_bytes()[:4] == b"\x89PNG"
    seen = {}
    monkeypatch.setattr(subprocess, "run", lambda cmd, **kw: seen.setdefault("cmd", cmd))
    assert notify.send_desktop("t", "b") is True
    assert f"--icon={notify.LOGO}" in seen["cmd"] and not any("heart" in a for a in seen["cmd"])


def test_app_name_ist_fitness_sync(monkeypatch):
    import subprocess

    from backend.sync import notify

    seen = {}
    monkeypatch.setattr(subprocess, "run", lambda cmd, **kw: seen.setdefault("cmd", cmd))
    notify.send_desktop("t", "b")
    assert "--app-name=Fitness Sync" in seen["cmd"]
