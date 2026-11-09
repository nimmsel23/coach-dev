import pytest
from typer.testing import CliRunner

from backend.pusher import cli, service
from backend.tests._pusher_helpers import REGISTRY, FakeSource, default_settings

runner = CliRunner()


@pytest.fixture
def env(tmp_path, monkeypatch):
    source = FakeSource(default_settings())
    monkeypatch.setenv("FITNESS_DATA_ROOT", str(tmp_path))
    monkeypatch.setenv("FITNESS_PUSH_TEMPLATES", str(tmp_path / "keine-vorlagen.yaml"))
    monkeypatch.setattr(cli, "FirebasePushSource", lambda: source)
    monkeypatch.setattr(cli, "load_clients", lambda: REGISTRY)
    monkeypatch.setattr(cli, "_setup_logging", lambda: None)
    return source


def invoke(*args):
    return runner.invoke(cli.app, list(args))


def test_send_ohne_apply_ist_trockenlauf(env):
    r = invoke("send", "-t", "Hallo", "-b", "Text", "--all")
    assert r.exit_code == 0 and "TROCKENLAUF" in r.output and "Nichts gesendet" in r.output
    assert env.sent == []


def test_send_apply_sendet_an_namen_und_uids(env):
    r = invoke("send", "-t", "Hallo", "-b", "Text", "-u", "matthias", "--apply")
    assert r.exit_code == 0 and "GESENDET" in r.output
    assert [tokens for tokens, _ in env.sent] == [["tm1", "tm2"]]


def test_send_me_geht_nur_an_den_coach(env):
    invoke("send", "-t", "Test", "-b", "Nur ich", "--me", "--apply")
    assert [tokens for tokens, _ in env.sent] == [["tc1"]]


def test_send_all_laesst_nicht_bereite_aus(env):
    invoke("send", "-t", "Hallo", "-b", "Text", "--all", "--apply")
    assert sorted(t for tokens, _ in env.sent for t in tokens) == ["tc1", "tm1", "tm2"]


def test_genau_eine_auswahl_und_gueltige_nachricht(env):
    assert invoke("send", "-t", "a", "-b", "b").exit_code == 2                          # keine Auswahl
    assert invoke("send", "-t", "a", "-b", "b", "--all", "--me").exit_code == 2         # zwei Auswahlen
    r = invoke("send", "-t", "", "-b", "b", "--all", "--apply")
    assert r.exit_code == 2 and "Titel fehlt" in r.output
    r = invoke("send", "-t", "a", "-b", "b", "-l", "https://boese.example", "--all", "--apply")
    assert r.exit_code == 2 and "Host nicht erlaubt" in r.output
    r = invoke("send", "-t", "a", "-b", "b", "-u", "gibtsnicht", "--apply")
    assert r.exit_code == 2 and "Unbekannt" in r.output
    assert env.sent == []


def test_vorlage_und_unbekannte_vorlage(env):
    assert invoke("send", "--template", "Check-in", "--me").exit_code == 0
    r = invoke("send", "--template", "Gibtsnicht", "--me")
    assert r.exit_code == 2 and "Vorlage unbekannt" in r.output


def test_users_und_history(env, tmp_path):
    r = invoke("users")
    assert r.exit_code == 0 and "Matthias" in r.output and "Push aus" in r.output and "keine Geräte" in r.output
    invoke("send", "-t", "Verlauf", "-b", "Text", "--me", "--apply")
    r = invoke("history")
    assert "Verlauf" in r.output and "Echt" in r.output
    assert service.read_history(tmp_path / "pusher" / "history.jsonl")[0]["title"] == "Verlauf"
