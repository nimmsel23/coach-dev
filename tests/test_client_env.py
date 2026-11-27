"""coach_client_env: client.env-Schalter lesen/schreiben, ohne fremde Zeilen zu verlieren."""
import pytest
import coach_client_env as ce


@pytest.fixture
def root(tmp_path, monkeypatch):
    (tmp_path / "max").mkdir()
    (tmp_path / "max" / "client.env").write_text("FIREBASE_UID=abc\n# Kommentar\nFRAME_INTERVIEW=1\n")
    monkeypatch.setattr(ce, "CLIENTS_ROOT", tmp_path)
    return tmp_path


def test_write_keeps_foreign_lines_and_appends(root):
    env = ce.write_env("max", {"FRAME_INTERVIEW": "off", "FRAME_NUDGE_HOURS": "20"})
    text = (root / "max" / "client.env").read_text()
    assert "FIREBASE_UID=abc" in text and "# Kommentar" in text
    assert env["FRAME_INTERVIEW"] == "0" and env["FRAME_NUDGE_HOURS"] == "20"


def test_empty_value_removes_line(root):
    ce.write_env("max", {"FRAME_INTERVIEW": ""})
    assert "FRAME_INTERVIEW" not in ce.read_env("max")


@pytest.mark.parametrize("key,value", [("FIREBASE_UID", "x"), ("FRAME_NUDGE_HOURS", "abc"),
                                       ("FRAME_START", "1.12."), ("FRAME_INTERVIEW", "vielleicht")])
def test_rejects_unknown_or_invalid(root, key, value):
    before = (root / "max" / "client.env").read_text()
    with pytest.raises(ce.EnvError):
        ce.write_env("max", {key: value})
    assert (root / "max" / "client.env").read_text() == before


def test_rejects_bad_slug(root):
    with pytest.raises(ce.EnvError):
        ce.client_dir("../etc")


def test_view_defaults_off(root):
    (root / "max" / "client.env").write_text("")
    view = ce.settings_view("max", with_timer=False)
    frame = {s["key"]: s for s in view["settings"]}["FRAME_INTERVIEW"]
    assert frame["effective"] == "0" and view["frame"]["on"] is False
