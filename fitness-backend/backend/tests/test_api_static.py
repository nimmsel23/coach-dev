import json

import pytest
from fastapi.testclient import TestClient

from backend.api.app import create_app
from backend.core.settings import Settings
from backend.tests.api_helpers import make_app


# ---- statische Auslieferung ----
@pytest.fixture
def web(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>SPA</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    (tmp_path / "geheim.txt").write_text("nicht ausliefern")
    client, settings, _ = make_app(tmp_path)
    settings = Settings(**{**settings.__dict__, "frontend_dist": dist})
    return TestClient(create_app(settings))


def test_spa_liefert_index_assets_und_fallback(web):
    assert "SPA" in web.get("/").text
    assert "SPA" in web.get("/coach/clients").text            # Client-Route -> index.html
    assert web.get("/assets/app.js").text == "console.log(1)"
    assert web.get("/favicon.svg").text == "<svg/>"


def test_api_und_docs_bleiben_unberuehrt(web):
    assert web.get("/api/health").json()["ok"] is True
    assert web.get("/openapi.json").status_code == 200 and "paths" in web.get("/openapi.json").json()
    r = web.get("/api/gibtsnicht")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")   # nie als HTML


def test_spa_traversal(web):
    for p in ("../geheim.txt", "%2e%2e/geheim.txt", "assets/../../geheim.txt"):
        assert "nicht ausliefern" not in web.get(f"/{p}").text


def test_ohne_dist_keine_spa_routen(tmp_path):
    assert make_app(tmp_path)[0].get("/").status_code == 404
