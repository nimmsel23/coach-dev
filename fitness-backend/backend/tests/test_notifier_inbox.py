import json
import threading
from datetime import datetime, timezone

from backend.notifier import inbox as inbox_mod
from backend.notifier.inbox import Inbox


def rec(ib, uid="U1", doc="2026-10-14", saved="2026-10-14T10:00:00+00:00", rev=1, client="Matthias", **extra):
    data = {"date": doc[:10], "saved_at": saved, "rev": rev, **extra}
    return ib.record(uid=uid, client=client, doc_id=doc, data=data, action="angelegt", summary=f"{doc} · Kraft")


def test_neu_ist_ungesehen(tmp_path):
    ib = Inbox(tmp_path)
    assert rec(ib) is True
    [e] = ib.entries()
    assert e.unseen and e.id == "U1/2026-10-14" and e.client == "Matthias" and ib.unseen_count() == 1


def test_gleicher_stand_ist_idempotent(tmp_path):
    ib = Inbox(tmp_path)
    rec(ib)
    ib.mark_seen(["U1/2026-10-14"])
    assert rec(ib) is False
    assert ib.unseen_count() == 0


def test_aktualisierung_macht_wieder_ungesehen(tmp_path):
    ib = Inbox(tmp_path)
    rec(ib)
    ib.mark_seen(["U1/2026-10-14"])
    assert rec(ib, saved="2026-10-14T18:00:00+00:00", rev=2) is True
    assert ib.unseen_count() == 1


def test_mark_seen_und_unseen(tmp_path):
    ib = Inbox(tmp_path)
    rec(ib), rec(ib, doc="2026-10-13")
    assert ib.mark_seen(["U1/2026-10-14", "gibt-es-nicht"]) == 1
    assert ib.mark_seen(["U1/2026-10-14"]) == 0
    assert [e.id for e in ib.entries(unseen_only=True)] == ["U1/2026-10-13"]
    assert ib.mark_unseen(["U1/2026-10-14"]) == 1
    assert ib.unseen_count() == 2


def test_mark_all_seen_pro_uid(tmp_path):
    ib = Inbox(tmp_path)
    rec(ib, uid="U1"), rec(ib, uid="U2", client="Simon")
    assert ib.mark_all_seen(uid="U2") == 1
    assert [e.uid for e in ib.entries(unseen_only=True)] == ["U1"]
    assert ib.mark_all_seen() == 1 and ib.unseen_count() == 0


def test_sortierung_neueste_zuerst(tmp_path):
    ib = Inbox(tmp_path)
    rec(ib, doc="2026-10-12", saved="2026-10-12T10:00:00+00:00")
    rec(ib, doc="2026-10-14", saved="2026-10-14T10:00:00+00:00")
    rec(ib, doc="2026-10-13", saved="2026-10-13T10:00:00+00:00")
    assert [e.doc_id for e in ib.entries()] == ["2026-10-14", "2026-10-13", "2026-10-12"]


def test_filter_nach_uid(tmp_path):
    ib = Inbox(tmp_path)
    rec(ib, uid="U1"), rec(ib, uid="U2")
    assert [e.uid for e in ib.entries(uid="U2")] == ["U2"]


def test_defekte_datei_wird_beiseite_gelegt(tmp_path):
    ib = Inbox(tmp_path)
    tmp_path.mkdir(exist_ok=True)
    ib.path.write_text("{kaputt")
    assert ib.entries() == []
    assert (tmp_path / "inbox.json.corrupt").read_text() == "{kaputt"
    rec(ib)
    assert ib.unseen_count() == 1


def test_prune_behaelt_ungesehene(tmp_path, monkeypatch):
    monkeypatch.setattr(inbox_mod, "MAX_ENTRIES", 3)
    ib = Inbox(tmp_path)
    for i in range(1, 6):
        rec(ib, doc=f"2026-10-0{i}", saved=f"2026-10-0{i}T10:00:00+00:00")
        if i <= 3:
            ib.mark_seen([f"U1/2026-10-0{i}"])
    ids = {e.doc_id for e in ib.entries()}
    assert {"2026-10-04", "2026-10-05"} <= ids          # ungesehene bleiben
    assert len(ids) <= 4                                  # gesehene wurden gekürzt


def test_signatur_aendert_sich(tmp_path):
    ib = Inbox(tmp_path)
    assert ib.signature() == (0, 0)
    rec(ib)
    s1 = ib.signature()
    rec(ib, doc="2026-10-15")
    assert ib.signature() != s1


def test_parallele_schreiber_verlieren_nichts(tmp_path):
    ib = Inbox(tmp_path)
    threads = [threading.Thread(target=lambda i=i: rec(Inbox(tmp_path), doc=f"2026-10-{i:02d}")) for i in range(1, 21)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(ib.entries()) == 20
    json.loads(ib.path.read_text())


def test_lesen_ohne_inbox_legt_nichts_an(tmp_path):
    ib = Inbox(tmp_path / "noch" / "nicht")
    assert ib.entries() == [] and ib.unseen_count() == 0 and ib.get("x") is None
    assert not (tmp_path / "noch").exists()
