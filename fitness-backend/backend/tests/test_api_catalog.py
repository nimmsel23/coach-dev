import json

import pytest
from fastapi.testclient import TestClient

from backend.api.app import create_app
from backend.core.settings import Settings
from backend.tests.api_helpers import make_app


@pytest.fixture
def clone(tmp_path, monkeypatch):
    root = tmp_path / "yuhonas"
    (root / "dist").mkdir(parents=True)
    (root / "dist" / "exercises.json").write_text(json.dumps([
        {"id": "Chin-Up", "name": "Chin-Up", "category": "strength", "primaryMuscles": ["lats"],
         "secondaryMuscles": [], "instructions": ["x"], "images": ["Chin-Up/0.jpg"]}]))
    (root / "exercises" / "Chin-Up").mkdir(parents=True)
    (root / "exercises" / "Chin-Up" / "0.jpg").write_bytes(b"\xff\xd8\xff" + b"JPEG")
    (tmp_path / "geheim.txt").write_text("nicht ausliefern")
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(root))
    return root


def test_status_und_bild(tmp_path, clone):
    client = make_app(tmp_path)[0]
    st = client.get("/api/catalog/status").json()
    assert st["available"] is True and st["entries"] == 1
    r = client.get("/api/catalog/images/Chin-Up/0.jpg")
    assert r.status_code == 200 and r.content.startswith(b"\xff\xd8\xff")
    assert "max-age" in r.headers["cache-control"]


@pytest.mark.parametrize("path", ["../geheim.txt", "%2e%2e/geheim.txt", "Chin-Up/../../geheim.txt",
                                  "Chin-Up/0.txt", "Chin-Up/gibtsnicht.jpg", "%2fetc%2fpasswd", "Chin-Up%5c0.jpg"])
def test_bild_pfad_traversal_und_unbekanntes_404(tmp_path, clone, path):
    r = make_app(tmp_path)[0].get(f"/api/catalog/images/{path}")
    assert r.status_code == 404 and b"nicht ausliefern" not in r.content


def test_fehlender_klon_status_meldet_es_und_bild_404(tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(tmp_path / "gibtsnicht"))
    client = make_app(tmp_path)[0]
    assert client.get("/api/catalog/status").json()["available"] is False
    assert client.get("/api/catalog/images/Chin-Up/0.jpg").status_code == 404
