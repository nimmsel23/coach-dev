import copy
import dataclasses

import pytest

from backend.catalog import index, view
from _catalog_helpers import make_clone, rec


@pytest.fixture
def katalog(tmp_path, monkeypatch):
    """Kontrollierte lokale Records + synthetischer yuhonas-Klon."""
    local = [
        rec("020", "Klimmzug an Leiste", german="Klimmzug", yuhonas_id="Chin-Up", category="arms",
            primary_muscles=["201_latissimus_dorsi", "207_teres_major"], equipment=["pull_up_bar", "body only"],
            instructions=[], tags=["expert"]),
        rec("030", "Face Pull", category="back", primary_muscles=["303_posterior_deltoid"]),          # Verknüpfung per Name
        rec("inbox_row", "Rudern am Kabel", source="inbox", source_file="inbox_row.yml"),
        rec("wger_1", "Klimmzüge an Maschine", source="bulk", source_file="unreviewed_wger.yml"),
        rec("yuhonas_face_pull", "Face Pull (Altimport)", source="bulk", source_file="unreviewed_yuhonas.yml"),
        rec("yuhonas_push-up_wide", "Push-Up Wide (Altimport)", source="bulk", source_file="unreviewed_yuhonas.yml"),
    ]
    monkeypatch.setattr(index, "get_local_records", lambda: local)
    monkeypatch.setattr(index, "kb_fingerprint", lambda: "fp-test")
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(make_clone(tmp_path / "klon")))
    view._links_cache.clear()
    yield local
    view._links_cache.clear()


def ids(result):
    return [r["exercise_id"] for r in result["results"]]


# ── Merge-Reihenfolge und Quellenkennzeichnung ────────────────────────────────────────────────────
def test_lokale_treffer_kommen_vor_yuhonas_und_sind_gekennzeichnet(katalog):
    r = view.search("pull", 20)
    assert r["yuhonas"] == {"available": True}
    by_id = {x["exercise_id"]: x for x in r["results"]}
    assert by_id["030"]["source"] == "expert" and by_id["030"]["has_yuhonas"] is True       # lokal + verknüpft
    assert "yuhonas_face_pull" not in by_id                                                 # Altimport verdeckt
    assert [x["source"] for x in r["results"]] == sorted((x["source"] for x in r["results"]), key=lambda s: {"expert": 0, "inbox": 1, "yuhonas": 2, "bulk": 3}[s])


def test_nicht_verknuepfte_yuhonas_eintraege_erscheinen_direkt(katalog):
    r = view.search("push", 20)
    assert ids(r) == ["yuhonas_push-up_wide"]
    row = r["results"][0]
    assert row["source"] == "yuhonas" and row["has_yuhonas"] is True
    assert row["primary_muscles"] == ["101_pectoralis_major"]                               # kanonisiert
    assert row["thumb"] == "/api/catalog/images/Push-Up_Wide/0.jpg"


def test_verknuepfter_yuhonas_eintrag_wird_nicht_doppelt_gelistet(katalog):
    r = view.search("chin", 20)
    assert ids(r)[0] == "020" and ids(r).count("020") == 1    # über den yuhonas-Namen auffindbar ("Chin-Up"), nur einmal
    assert "yuhonas_chin-up" not in ids(r)                    # der verknüpfte Direkt-Eintrag erscheint nicht zusätzlich
    assert r["results"][0]["has_yuhonas"] is True and r["results"][0]["source"] == "expert"
    r2 = view.search("klimmzug", 20)
    assert ids(r2)[0] == "020" and "yuhonas_chin-up" not in ids(r2)
    assert r2["results"][0]["thumb"] == "/api/catalog/images/Chin-Up/0.jpg"


def test_bulk_eintraege_ohne_yuhonas_bleiben_lokal_sichtbar_und_zuletzt(katalog):
    r = view.search("klimm", 20)
    assert ids(r) == ["020", "wger_1"]
    assert [x["source"] for x in r["results"]] == ["expert", "bulk"]


def test_ranking_exakt_vor_praefix_vor_enthaelt(katalog):
    katalog.append(rec("x1", "Face", source="expert"))
    katalog.append(rec("x2", "Aaa Face Wash", source="expert"))   # alphabetisch zuerst, aber nur "enthält"
    assert ids(view.search("face", 20))[:3] == ["x1", "030", "x2"]                         # exakt, Präfix, enthält


def test_limit_total_und_leere_suche(katalog):
    assert view.search("", 5) == {"results": [], "total": 0, "yuhonas": {"available": True}}
    r = view.search("a", 1)
    assert len(r["results"]) == 1 and r["total"] > 1
    assert len(view.search("a", 9999)["results"]) <= 50


# ── Einzelabruf: lokal zuerst, yuhonas getrennt sichtbar ──────────────────────────────────────────
def test_get_lokal_zeigt_beide_quellen_getrennt_und_markiert_herkunft_pro_feld(katalog):
    v = view.get("020")
    assert v["source"] == "expert" and v["link"] == {"via": "yuhonas_id", "yuhonas_id": "Chin-Up"}
    assert v["local"]["display_name"] == "Klimmzug an Leiste" and v["yuhonas"]["name"] == "Chin-Up"
    f = v["fields"]
    assert f["primary_muscles"] == {"value": ["201_latissimus_dorsi", "207_teres_major"], "source": "local"}
    assert f["instructions"]["source"] == "yuhonas" and f["instructions"]["value"][0] == "Greife die Stange."
    assert f["images"]["source"] == "yuhonas" and f["images"]["value"][0]["url"].endswith("Chin-Up/0.jpg")
    assert f["secondary_muscles"]["source"] == "yuhonas"                                    # lokal leer -> ergänzt, gekennzeichnet
    assert f["category"] == {"value": "arms", "source": "local"}


def test_divergenzen_sind_sichtbar_mit_art_und_ohne_category(katalog):
    div = {d["field"]: d for d in view.get("020")["divergences"]}
    assert "category" not in div                                                            # verschiedene Vokabulare
    assert div["primary_muscles"]["kind"] == "lokal_erweitert"
    assert div["primary_muscles"]["local"] == ["201_latissimus_dorsi", "207_teres_major"]
    assert div["primary_muscles"]["yuhonas"] == ["201_latissimus_dorsi"]
    assert div["equipment"]["kind"] == "lokal_erweitert"


def test_abweichend_wenn_beide_seiten_etwas_anderes_nennen(katalog):
    katalog[0].primary_muscles = ["207_teres_major"]
    d = {x["field"]: x for x in view.get("020")["divergences"]}
    assert d["primary_muscles"]["kind"] == "abweichend"


def test_lokale_daten_werden_nie_veraendert(katalog):
    vorher = copy.deepcopy([dataclasses.asdict(r) for r in katalog])
    view.get("020"); view.get("030"); view.search("pull", 50); view.search("chin", 50)
    assert [dataclasses.asdict(r) for r in katalog] == vorher


def test_verknuepfung_ueber_exakten_namen(katalog):
    v = view.get("030")
    assert v["link"] == {"via": "name", "yuhonas_id": "Face_Pull"}


def test_mehrdeutiger_name_wird_nicht_verknuepft(katalog, tmp_path, monkeypatch):
    klon = make_clone(tmp_path / "doppelt", [
        {"id": "Face_Pull", "name": "Face Pull", "images": []}, {"id": "Face_Pull_2", "name": "Face-Pull", "images": []}])
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(klon))
    view._links_cache.clear()
    assert view.get("030")["link"] is None


def test_get_yuhonas_id_liefert_yuhonas_mit_hinweis_auf_lokales(katalog):
    v = view.get("yuhonas_chin-up")
    assert v["source"] == "yuhonas" and v["local"] is None and v["yuhonas"]["raw_id"] == "Chin-Up"
    assert v["linked_local"] == {"exercise_id": "020", "display_name": "Klimmzug an Leiste", "via": "yuhonas_id"}
    assert v["fields"]["primary_muscles"] == {"value": ["201_latissimus_dorsi"], "source": "yuhonas"}


def test_get_akzeptiert_roh_id_und_gross_klein(katalog):
    assert view.get("Chin-Up")["exercise_id"] == "yuhonas_chin-up"
    assert view.get("YUHONAS_FACE_PULL".lower())["source"] == "yuhonas"


def test_altimport_wird_bei_verfuegbarem_klon_direkt_aus_yuhonas_bedient(katalog):
    v = view.get("yuhonas_push-up_wide")
    assert v["source"] == "yuhonas" and v["local"] is None


def test_unbekannte_id(katalog):
    with pytest.raises(view.ExerciseNotFound) as exc:
        view.get("gibt_es_nicht")
    assert "gibt_es_nicht" in str(exc.value)


# ── Klon fehlt ────────────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def ohne_klon(katalog, tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(tmp_path / "nix"))
    view._links_cache.clear()


def test_ohne_klon_suche_funktioniert_mit_hinweis_und_altimport_bleibt_sichtbar(ohne_klon):
    r = view.search("face", 20)
    assert r["yuhonas"]["available"] is False and "nicht gefunden" in r["yuhonas"]["error"]
    assert set(ids(r)) == {"030", "yuhonas_face_pull"}                                      # Altimport ist die einzige yuhonas-Info


def test_ohne_klon_get_lokal_mit_warnung(ohne_klon):
    v = view.get("020")
    assert v["yuhonas"] is None and v["link"] is None and "nicht gefunden" in v["warnings"][0]


def test_ohne_klon_get_yuhonas_id_nur_per_altimport_sonst_hinweis(ohne_klon):
    assert view.get("yuhonas_face_pull")["source"] == "bulk"
    with pytest.raises(view.ExerciseNotFound) as exc:
        view.get("yuhonas_chin-up")
    assert "nicht gefunden" in str(exc.value) and "FITNESS_YUHONAS_DIR" in str(exc.value)


def test_get_berechnet_den_kb_fingerprint_nur_konstant_oft(katalog, monkeypatch):
    """Regression: get() einer yuhonas-ID rief den Fingerabdruck früher pro lokalem Record auf (>1700x je Request)."""
    aufrufe = []
    monkeypatch.setattr(index, "kb_fingerprint", lambda: aufrufe.append(1) or "fp-test")
    for _ in range(300):                                       # große Fixture: viele lokale Records
        katalog.append(rec(f"z{len(katalog)}", f"Füller {len(katalog)}", source="bulk"))
    view._links_cache.clear()
    view.get("yuhonas_chin-up")
    assert len(aufrufe) <= 3
    aufrufe.clear()
    view.search("füller", 5)
    assert len(aufrufe) <= 3
