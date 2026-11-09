import json
from datetime import datetime, timezone

import pytest

from backend.core.store import InvalidDocId, jsonable


@pytest.mark.parametrize("bad", ["../x", "a/b", ".hidden", "", "a..b", "x\\y", "a b"])
def test_ungueltige_doc_ids(store, uid, bad):
    with pytest.raises(InvalidDocId):
        store.path(uid, bad)


def test_ungueltige_uid(store):
    with pytest.raises(InvalidDocId):
        store.sessions_dir("../etc")


def test_write_read_roundtrip_und_format(store, uid):
    store.write(uid, "2026-10-14", {"date": "2026-10-14", "name": "Übung ä"})
    text = store.path(uid, "2026-10-14").read_text()
    assert "Übung ä" in text          # ensure_ascii=False
    assert text.startswith("{\n  ")   # indent=2 wie bisher
    assert store.read(uid, "2026-10-14") == ({"date": "2026-10-14", "name": "Übung ä"}, None)


def test_atomar_kein_tmp_rest(store, uid):
    store.write(uid, "2026-10-14", {"a": 1})
    names = [p.name for p in store.sessions_dir(uid).iterdir()]
    assert names == ["2026-10-14.json"]


def test_backup_der_vorversion(store, uid):
    store.write(uid, "2026-10-14", {"v": 1})
    assert store.write(uid, "2026-10-14", {"v": 2}) is not None
    prev = store.root / ".fitsync" / "prev" / uid / "2026-10-14.json"
    assert json.loads(prev.read_text()) == {"v": 1}
    assert store.read(uid, "2026-10-14")[0] == {"v": 2}


def test_erstes_schreiben_hat_kein_backup(store, uid):
    assert store.write(uid, "2026-10-14", {"v": 1}) is None


def test_defekte_datei_wird_gemeldet_und_quarantaene(store, uid):
    store.sessions_dir(uid).mkdir(parents=True)
    store.path(uid, "2026-10-14").write_text("{kaputt")
    data, err = store.read(uid, "2026-10-14")
    assert data is None and err
    q = store.quarantine(uid, "2026-10-14")
    assert q.name == "2026-10-14.json.corrupt" and q.exists()
    assert store.read(uid, "2026-10-14") == (None, None)


def test_list_ids_filtert_fremddateien(store, uid):
    d = store.sessions_dir(uid); d.mkdir(parents=True)
    for n in ("2026-10-14.json", "2026-10-14__abc.json", "2026-10-14.json.bak", "training_history.sqlite", ".2026-10-15.json.tmp", "2026-10-14.json.corrupt"):
        (d / n).write_text("{}")
    assert store.list_ids(uid) == {"2026-10-14", "2026-10-14__abc"}


def test_jsonable_rekursiv():
    ts = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
    out = jsonable({"saved_at": ts, "slots": [{"at": ts, "x": (1, 2)}]})
    assert out == {"saved_at": ts.isoformat(), "slots": [{"at": ts.isoformat(), "x": [1, 2]}]}
    json.dumps(out)
