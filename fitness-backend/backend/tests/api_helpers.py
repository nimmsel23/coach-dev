"""Gemeinsame Helfer für API-Tests (kein conftest, damit parallele Arbeit nicht kollidiert)."""
import json

from fastapi.testclient import TestClient

from backend.api.app import create_app
from backend.core.settings import Settings
from backend.core.store import SessionStore

COACH = "UID-COACH"
KLIENT = "UID-MATTHIAS"


def make_app(tmp_path, *, raise_server_exceptions=True):
    klienten = tmp_path / "Klienten"
    for slug, cfg in {
        "daniel": {"name": "Daniel", "firebase_uid": COACH, "role": "coach", "status": "coach"},
        "matthias-mayer": {"name": "Matthias Mayer", "firebase_uid": KLIENT},
    }.items():
        (klienten / slug).mkdir(parents=True)
        (klienten / slug / "client.json").write_text(json.dumps(cfg))
    settings = Settings(data_root=tmp_path / "data", klienten_dir=klienten, host="127.0.0.1", port=9150)
    client = TestClient(create_app(settings), raise_server_exceptions=raise_server_exceptions)
    return client, settings, SessionStore(settings.data_root)
