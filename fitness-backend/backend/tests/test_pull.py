import json
from datetime import datetime, timezone

from backend.sync.pull import RemoteDoc, pull_sessions


def docs(*items):
    return [RemoteDoc(i, d) for i, d in items]


def test_legt_neue_sessions_an(store, uid):
    r = pull_sessions(uid, docs(("2026-10-14", {"rev": 1}), ("2026-10-14__hiit", {"rev": 1})), store)
    assert r.counts["angelegt"] == 2 and r.errors == 0
    assert store.list_ids(uid) == {"2026-10-14", "2026-10-14__hiit"}


def test_aktualisiert_bei_hoeherem_rev(store, uid):
    store.write(uid, "2026-10-14", {"rev": 1, "x": "alt"})
    r = pull_sessions(uid, docs(("2026-10-14", {"rev": 2, "x": "neu"})), store)
    assert r.counts["aktualisiert"] == 1
    assert store.read(uid, "2026-10-14")[0]["x"] == "neu"


def test_neustart_flut_ueberschreibt_lokal_neuere_nicht(store, uid):
    """Regression Datenverlust Matthias: rev 0==0, lokal neuer -> lokal bleibt."""
    store.write(uid, "2026-10-14", {"x": "lokal korrigiert", "saved_at": "2026-10-14T15:00:00+00:00"})
    r = pull_sessions(uid, docs(("2026-10-14", {"x": "alt", "saved_at": "2026-10-10T09:00:00+00:00"})), store)
    assert r.counts["übersprungen"] == 1 and r.counts["aktualisiert"] == 0
    assert store.read(uid, "2026-10-14")[0]["x"] == "lokal korrigiert"


def test_dry_run_schreibt_nichts_zaehlt_aber(store, uid):
    store.write(uid, "2026-10-13", {"rev": 1})
    r = pull_sessions(uid, docs(("2026-10-14", {"rev": 1}), ("2026-10-13", {"rev": 5})), store, dry_run=True)
    assert r.counts["angelegt"] == 1 and r.counts["aktualisiert"] == 1
    assert store.list_ids(uid) == {"2026-10-13"}
    assert store.read(uid, "2026-10-13")[0] == {"rev": 1}
    assert not (store.root / ".fitsync").exists()


def test_nur_lokal_wird_gemeldet_nicht_geloescht(store, uid):
    store.write(uid, "2026-10-01", {"rev": 1})
    r = pull_sessions(uid, docs(("2026-10-14", {"rev": 1})), store)
    assert r.counts["nur_lokal"] == 1
    assert "2026-10-01" in store.list_ids(uid)


def test_owner_guard_ueberspringt_fremde_dokumente(store, uid):
    r = pull_sessions(uid, docs(("2026-10-14", {"rev": 1, "owner_uid": "jemand-anderes"})), store)
    assert r.counts["übersprungen"] == 1 and store.list_ids(uid) == set()


def test_eigene_owner_uid_ist_ok(store, uid):
    r = pull_sessions(uid, docs(("2026-10-14", {"rev": 1, "owner_uid": uid})), store)
    assert r.counts["angelegt"] == 1


def test_ungueltige_doc_id_ist_fehler_und_stoppt_nicht(store, uid):
    r = pull_sessions(uid, docs(("../evil", {"rev": 1}), ("2026-10-14", {"rev": 1})), store)
    assert r.errors == 1 and r.counts["angelegt"] == 1
    assert not (store.root / "users" / "evil.json").exists()


def test_defekte_lokale_datei_wird_quarantaene_dann_neu(store, uid):
    store.sessions_dir(uid).mkdir(parents=True)
    store.path(uid, "2026-10-14").write_text("{kaputt")
    r = pull_sessions(uid, docs(("2026-10-14", {"rev": 1})), store)
    assert r.counts["angelegt"] == 1
    assert (store.sessions_dir(uid) / "2026-10-14.json.corrupt").read_text() == "{kaputt"


def test_defekt_im_dry_run_wird_nicht_angefasst(store, uid):
    store.sessions_dir(uid).mkdir(parents=True)
    store.path(uid, "2026-10-14").write_text("{kaputt")
    pull_sessions(uid, docs(("2026-10-14", {"rev": 1})), store, dry_run=True)
    assert store.path(uid, "2026-10-14").read_text() == "{kaputt"


def test_timestamps_in_verschachtelten_feldern(store, uid):
    ts = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
    r = pull_sessions(uid, docs(("2026-10-14", {"saved_at": ts, "slots": [{"at": ts}]})), store)
    assert r.errors == 0
    data = store.read(uid, "2026-10-14")[0]
    assert data["saved_at"] == ts.isoformat() and data["slots"][0]["at"] == ts.isoformat()


def test_fehler_in_einem_dokument_stoppt_lauf_nicht(store, uid, monkeypatch):
    real_write = store.write

    def flaky(u, doc_id, data):
        if doc_id == "2026-10-13":
            raise OSError("Platte voll")
        return real_write(u, doc_id, data)

    monkeypatch.setattr(store, "write", flaky)
    r = pull_sessions(uid, docs(("2026-10-13", {"rev": 1}), ("2026-10-14", {"rev": 1})), store)
    assert r.errors == 1 and r.counts["angelegt"] == 1


def test_idempotent_zweiter_lauf_aendert_nichts(store, uid):
    d = docs(("2026-10-14", {"rev": 2, "saved_at": "2026-10-14T10:00:00+00:00"}))
    pull_sessions(uid, d, store)
    r2 = pull_sessions(uid, d, store)
    assert r2.counts["übersprungen"] == 1 and r2.counts["aktualisiert"] == 0 and r2.counts["angelegt"] == 0
