import json

import pytest
from loguru import logger

from backend.sync import logsetup
from backend.sync.lock import AlreadyRunning, single_instance
from backend.sync.pull import RemoteDoc, pull_sessions


def test_jsonl_enthaelt_strukturierte_events(store, uid, tmp_path):
    path = logsetup.setup(tmp_path / "logs")
    try:
        store.write(uid, "2026-10-13", {"rev": 3})
        pull_sessions(uid, [RemoteDoc("2026-10-13", {"rev": 1}), RemoteDoc("2026-10-14", {"rev": 1})], store)
        logger.complete()
    finally:
        logger.remove()
    events = [json.loads(l) for l in path.read_text().splitlines()]
    by_doc = {e["doc_id"]: e for e in events if e.get("event") == "session"}
    assert by_doc["2026-10-13"]["action"] == "übersprungen"
    assert "lokal neuer" in by_doc["2026-10-13"]["reason"]
    assert by_doc["2026-10-13"]["rev_local"] == 3 and by_doc["2026-10-13"]["rev_remote"] == 1
    assert by_doc["2026-10-14"]["action"] == "angelegt"
    summary = [e for e in events if e.get("event") == "summary"][0]
    assert summary["angelegt"] == 1 and summary["übersprungen"] == 1


def test_lock_verhindert_zweite_instanz(tmp_path):
    lock = tmp_path / "x.lock"
    with single_instance(lock):
        with pytest.raises(AlreadyRunning):
            with single_instance(lock):
                pass
    with single_instance(lock):  # nach Freigabe wieder möglich
        pass
