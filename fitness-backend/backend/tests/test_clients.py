import json

from backend.core.clients import load_clients


def mk(tmp, slug, cfg):
    d = tmp / slug
    d.mkdir()
    (d / "client.json").write_text(json.dumps(cfg))


def test_registry(tmp_path):
    mk(tmp_path, "daniel", {"name": "Daniel", "firebase_uid": "U1", "role": "coach", "status": "coach"})
    mk(tmp_path, "matthias-mayer", {"name": "Matthias Mayer", "firebase_uid": "U2", "firebase_uids": ["U2", "U3"]})
    mk(tmp_path, "felix", {"name": "Felix", "firebase_uids": []})          # Interessent ohne UID
    (tmp_path / "_template").mkdir()                                       # ohne client.json
    (tmp_path / "kaputt").mkdir(); (tmp_path / "kaputt" / "client.json").write_text("{x")
    reg = load_clients(tmp_path)
    assert set(reg) == {"U1", "U2", "U3"}
    assert reg["U1"].is_coach and not reg["U2"].is_coach
    assert reg["U3"].name == "Matthias Mayer" and reg["U3"].slug == "matthias-mayer"


def test_fehlendes_verzeichnis(tmp_path):
    assert load_clients(tmp_path / "nix") == {}
