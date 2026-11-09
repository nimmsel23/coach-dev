import json

import pytest

from backend.core import tombstones
from backend.core.store import SessionStore
from backend.services import sessions as svc
from backend.sync.daemon import SyncDaemon
from backend.sync.events import RemoteEvent
from backend.sync.pull import RemoteDoc, pull_sessions
from backend.tests.api_helpers import KLIENT, make_app

UID = "UID-X"


@pytest.fixture
def store(tmp_path):
    return SessionStore(tmp_path)


def test_delete_geht_in_den_papierkorb_und_setzt_tombstone(store):
    store.write(UID, "2026-10-14", {"rev": 4, "x": 1})
    r = svc.delete_session(store, UID, "2026-10-14")
    assert r["rev"] == 4 and not store.path(UID, "2026-10-14").exists()
    assert json.loads(open(r["trash"]).read()) == {"rev": 4, "x": 1}         # wiederherstellbar
    assert tombstones.load(store.root, UID)["2026-10-14"]["rev"] == 4


def test_delete_unbekannt_und_rev_konflikt(store):
    with pytest.raises(svc.SessionNotFound):
        svc.delete_session(store, UID, "2026-10-14")
    store.write(UID, "2026-10-14", {"rev": 4})
    with pytest.raises(svc.RevConflict) as e:
        svc.delete_session(store, UID, "2026-10-14", expected_rev=2)
    assert e.value.current_rev == 4 and store.path(UID, "2026-10-14").exists()


def test_defekte_datei_darf_aufgeraeumt_werden(store):
    store.sessions_dir(UID).mkdir(parents=True)
    store.path(UID, "2026-10-14").write_text("{kaputt")
    assert svc.delete_session(store, UID, "2026-10-14")["rev"] == 0


def test_pull_stellt_geloeschte_session_nicht_wieder_her(store):
    store.write(UID, "2026-10-14", {"rev": 4})
    svc.delete_session(store, UID, "2026-10-14")
    r = pull_sessions(UID, [RemoteDoc("2026-10-14", {"rev": 4})], store)
    assert r.counts["übersprungen"] == 1 and store.list_ids(UID) == set()
    r = pull_sessions(UID, [RemoteDoc("2026-10-14", {})], store)                  # Legacy ohne rev: 0 <= 4
    assert store.list_ids(UID) == set()


def test_neuere_remote_rev_stellt_wieder_her_und_raeumt_tombstone_auf(store):
    store.write(UID, "2026-10-14", {"rev": 4})
    svc.delete_session(store, UID, "2026-10-14")
    r = pull_sessions(UID, [RemoteDoc("2026-10-14", {"rev": 5, "x": "woanders bearbeitet"})], store)
    assert r.counts["angelegt"] == 1 and store.read(UID, "2026-10-14")[0]["x"] == "woanders bearbeitet"
    assert "2026-10-14" not in tombstones.load(store.root, UID)


def test_dry_run_raeumt_tombstone_nicht_auf(store):
    store.write(UID, "2026-10-14", {"rev": 4})
    svc.delete_session(store, UID, "2026-10-14")
    pull_sessions(UID, [RemoteDoc("2026-10-14", {"rev": 9})], store, dry_run=True)
    assert "2026-10-14" in tombstones.load(store.root, UID) and store.list_ids(UID) == set()


def test_daemon_respektiert_tombstones(tmp_path):
    store = SessionStore(tmp_path)
    store.write(UID, "2026-10-14", {"rev": 4})
    svc.delete_session(store, UID, "2026-10-14")
    d = SyncDaemon(root=tmp_path, registry={}, listener=None, hub=False)
    d.handle(RemoteEvent(UID, "added", "2026-10-14", RemoteDoc("2026-10-14", {"rev": 4})))
    assert store.list_ids(UID) == set() and d.stats["übersprungen"] == 1


def test_neuanlage_nach_loeschen_zaehlt_rev_weiter(store):
    """Sonst würde der alte Firestore-Stand (rev 4) den neuen lokalen (rev 1) beim Pull überschreiben."""
    store.write(UID, "2026-10-14", {"rev": 4})
    svc.delete_session(store, UID, "2026-10-14")
    new = svc.save_session(store, UID, "2026-10-14", {"x": "neu"})
    assert new["rev"] == 5 and "2026-10-14" not in tombstones.load(store.root, UID)
    pull_sessions(UID, [RemoteDoc("2026-10-14", {"rev": 4, "x": "alt"})], store)
    assert store.read(UID, "2026-10-14")[0]["x"] == "neu"


def test_neuanlage_nach_loeschen_rev_basis(store):
    store.write(UID, "2026-10-14", {"rev": 4})
    svc.delete_session(store, UID, "2026-10-14")
    with pytest.raises(svc.RevConflict):
        svc.save_session(store, UID, "2026-10-14", {"rev": 2})
    assert svc.save_session(store, UID, "2026-10-14", {"rev": 4})["rev"] == 5


# ---- API ----
def test_api_delete_und_full_liste(tmp_path):
    client, _, store = make_app(tmp_path)
    base = f"/api/users/{KLIENT}/sessions"
    client.put(f"{base}/2026-10-13", json={"sessionMode": "strength", "exercises": [{"id": "020"}], "freies_feld": 1})
    client.put(f"{base}/2026-10-14", json={"sessionMode": "cardio", "activity": {"type": "run"}})

    summaries = client.get(base).json()
    assert summaries[0]["doc_id"] == "2026-10-14" and "freies_feld" not in summaries[1]
    full = client.get(base, params={"full": "true"}).json()
    assert [f["doc_id"] for f in full] == ["2026-10-14", "2026-10-13"]
    assert full[1]["freies_feld"] == 1 and full[1]["exercises"] == [{"id": "020"}] and full[1]["rev"] == 1
    assert len(client.get(base, params={"full": "true", "limit": 1}).json()) == 1

    assert client.delete(f"{base}/2026-10-13", params={"rev": 9}).status_code == 409
    r = client.delete(f"{base}/2026-10-13", params={"rev": 1})
    assert r.status_code == 200 and r.json()["deleted"] == "2026-10-13"
    assert client.get(f"{base}/2026-10-13").status_code == 404
    assert client.delete(f"{base}/2026-10-13").status_code == 404
    assert client.delete(f"{base}/abc").status_code == 422
