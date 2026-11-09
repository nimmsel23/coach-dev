"""Stichprobe gegen die echte KB und den echten yuhonas-Klon (nur lesen; wird ohne Klon übersprungen)."""
import pytest

from backend.catalog import index, view, yuhonas as yu

pytestmark = pytest.mark.skipif(not yu.status().get("available"), reason="yuhonas-Klon nicht vorhanden")


@pytest.fixture(autouse=True)
def _cache(tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_CACHE_DIR", str(tmp_path / "cache"))
    index.reset_cache()
    view._links_cache.clear()


def test_klon_hat_erwartete_groessenordnung_und_bilder_sind_aufloesbar():
    db = yu.load()
    assert len(db.entries) > 800
    e = db.by_exercise_id["yuhonas_chin-up"]
    assert e.images and yu.resolve_image(e.images[0]) is not None
    assert yu.resolve_image("../dist/exercises.json") is None


def test_experten_klimmzug_ist_verknuepft_und_findbar():
    r = view.search("klimmzug", 5)
    assert r["total"] > 0 and r["results"][0]["source"] in {"expert", "inbox"}
    v = view.get("020")
    assert v["source"] == "expert" and v["link"]["via"] == "yuhonas_id" and v["yuhonas"] is not None
    assert v["fields"]["images"]["source"] == "yuhonas"
    assert v["local"]["exercise_id"] == "020"            # lokale KB bleibt sichtbar, nicht überschrieben


def test_session_ids_aus_der_praxis_sind_aufloesbar():
    for ex_id in ("yuhonas_chin-up", "yuhonas_face_pull", "yuhonas_hammer_curls", "yuhonas_push-up_wide", "yuhonas_sit-up"):
        assert view.get(ex_id)["exercise_id"] == ex_id


def test_get_records_liefert_lokale_plus_ergaenzte_yuhonas_ohne_doppelte_ids():
    records = index.get_records()
    ids = [r.exercise_id for r in records]
    assert len(ids) == len(set(ids))
    assert any(r.source == "yuhonas" for r in records) and any(r.source == "expert" for r in records)
    assert len(ids) >= len(index.get_local_records())


def test_coverage_funktioniert_fuer_direkten_yuhonas_eintrag():
    from fitness.catalog.coverage import calculate_coverage, load_coverage_rules, load_muscle_region_index, load_muscle_taxonomy

    cov = calculate_coverage("yuhonas_chin-up", 3, 8, records=index.get_records(), taxonomy=load_muscle_taxonomy(),
                             region_index=load_muscle_region_index(), rules=load_coverage_rules())
    assert cov["exercise_id"] == "yuhonas_chin-up" and cov["muscle_scores"]
