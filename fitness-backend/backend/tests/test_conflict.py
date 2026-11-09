from datetime import datetime, timezone

from backend.core.conflict import decide, rev_of


def test_neu_wenn_lokal_fehlt():
    d = decide(None, {"rev": 1})
    assert d.write and "neu" in d.reason


def test_hoeheres_remote_rev_gewinnt():
    assert decide({"rev": 2}, {"rev": 3}).write


def test_niedrigeres_remote_rev_verliert():
    d = decide({"rev": 3}, {"rev": 2})
    assert not d.write and "lokal neuer" in d.reason


def test_rev_hat_vorrang_vor_saved_at():
    # remote hat höheres rev, aber ÄLTERES saved_at (Client-Uhr-Drift) -> remote gewinnt trotzdem
    local = {"rev": 1, "saved_at": "2026-10-14T12:00:00+00:00"}
    remote = {"rev": 2, "saved_at": "2026-10-14T08:00:00+00:00"}
    assert decide(local, remote).write


def test_datenverlust_matthias_legacy_ohne_rev_lokal_neuer():
    """0 == 0 (kein rev-Feld): lokal korrigierte, NEUERE Session darf von älterem
    Firestore-Stand nicht überschrieben werden (z.B. Neustart-Flut aus on_snapshot)."""
    local = {"saved_at": "2026-10-14T15:54:48.094000+00:00"}
    remote = {"saved_at": "2026-10-10T09:00:00+00:00"}
    d = decide(local, remote)
    assert not d.write and "lokal saved_at neuer" in d.reason


def test_gleiches_rev_remote_neuer_gewinnt():
    local = {"saved_at": "2026-10-10T09:00:00+00:00"}
    remote = {"saved_at": "2026-10-14T15:54:48+00:00"}
    assert decide(local, remote).write


def test_unveraendert_wird_nicht_geschrieben():
    doc = {"rev": 4, "saved_at": "2026-10-14T15:54:48+00:00"}
    d = decide(doc, dict(doc))
    assert not d.write and "unverändert" in d.reason


def test_ohne_zeitstempel_bleibt_lokal():
    assert not decide({"rev": 0, "saved_at": "2026-10-14T00:00:00+00:00"}, {"rev": 0}).write


def test_lokal_ohne_zeitstempel_nimmt_remote():
    assert decide({"rev": 0}, {"rev": 0, "saved_at": "2026-10-14T00:00:00+00:00"}).write


def test_zeitstempel_formate_werden_geparst_nicht_als_string_verglichen():
    # "Z" vs "+00:00" und unterschiedliche Nachkommastellen: gleicher Zeitpunkt -> unverändert
    local = {"saved_at": "2026-10-14T15:54:48.094000+00:00"}
    remote = {"saved_at": "2026-10-14T15:54:48.094Z"}
    d = decide(local, remote)
    assert not d.write and "unverändert" in d.reason


def test_remote_datetime_objekt_wird_akzeptiert():
    local = {"saved_at": "2026-10-10T09:00:00+00:00"}
    remote = {"saved_at": datetime(2026, 10, 14, tzinfo=timezone.utc)}
    assert decide(local, remote).write


def test_kaputtes_rev_zaehlt_als_null():
    assert rev_of({"rev": "abc"}) == 0
    assert rev_of({"rev": None}) == 0
    assert rev_of({"rev": "7"}) == 7
