import json
import os

import pytest

from backend.catalog import yuhonas as yu
from _catalog_helpers import ENTRIES, make_clone


@pytest.fixture
def clone(tmp_path):
    return make_clone(tmp_path / "free-exercise-db")


def test_laedt_eintraege_mit_id_schema_des_frueheren_imports(clone):
    db = yu.load(clone)
    assert len(db.entries) == 3
    e = db.by_exercise_id["yuhonas_chin-up"]                 # klein, Bindestrich bleibt
    assert e.raw_id == "Chin-Up" and e.name == "Chin-Up" and e.equipment == "body only"
    assert "yuhonas_face_pull" in db.by_exercise_id           # Unterstrich bleibt
    assert db.by_raw_id["Push-Up_Wide"].exercise_id == "yuhonas_push-up_wide"
    assert e.primary_muscles == ("lats",) and e.images == ("Chin-Up/0.jpg", "Chin-Up/1.jpg")


def test_fehlender_klon_gibt_klare_deutsche_meldung(tmp_path):
    with pytest.raises(yu.YuhonasUnavailable) as exc:
        yu.load(tmp_path / "gibt-es-nicht")
    assert "nicht gefunden" in str(exc.value) and "FITNESS_YUHONAS_DIR" in str(exc.value)
    st = yu.status(tmp_path / "gibt-es-nicht")
    assert st["available"] is False and "nicht gefunden" in st["error"]


@pytest.mark.parametrize("inhalt", ["{kaputt", '{"keine": "liste"}'])
def test_unbrauchbare_datei_ist_yuhonas_unavailable(tmp_path, inhalt):
    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "exercises.json").write_text(inhalt)
    with pytest.raises(yu.YuhonasUnavailable):
        yu.load(tmp_path)


def test_eintraege_ohne_id_oder_name_werden_uebersprungen(tmp_path):
    make_clone(tmp_path, [{"id": "", "name": "x"}, {"id": "A", "name": ""}, {"id": "Ok", "name": "Ok"}, "kein-dict"])
    assert [e.raw_id for e in yu.load(tmp_path).entries] == ["Ok"]


def test_cache_laedt_neu_wenn_datei_sich_aendert(clone):
    a = yu.load(clone)
    assert yu.load(clone) is a                                # unverändert: dasselbe Objekt
    make_clone(clone, ENTRIES[:1])
    st = (clone / "dist" / "exercises.json").stat()
    os.utime(clone / "dist" / "exercises.json", ns=(st.st_atime_ns, st.st_mtime_ns + 5_000_000_000))
    b = yu.load(clone)
    assert b is not a and len(b.entries) == 1


def test_yuhonas_dir_env_hat_vorrang(tmp_path):
    assert yu.yuhonas_dir({"FITNESS_YUHONAS_DIR": str(tmp_path / "x")}) == tmp_path / "x"


def test_bild_urls_nutzen_route_und_sind_url_kodiert(tmp_path):
    make_clone(tmp_path, [{"id": "A B", "name": "A B", "images": ["A B/0.jpg"]}])
    e = yu.load(tmp_path).entries[0]
    assert e.exercise_id == "yuhonas_a_b"
    assert e.image_urls() == [yu.IMAGE_ROUTE_PREFIX + "A%20B/0.jpg"]
    assert e.as_dict()["images"][0] == {"path": "A B/0.jpg", "url": yu.IMAGE_ROUTE_PREFIX + "A%20B/0.jpg"}


# ── resolve_image: Pfad-Traversal ─────────────────────────────────────────────────────────────────
def test_resolve_image_findet_vorhandenes_bild(clone):
    p = yu.resolve_image("Chin-Up/0.jpg", clone)
    assert p is not None and p.is_file() and p.name == "0.jpg"


@pytest.mark.parametrize("bad", [
    "", "../dist/exercises.json", "Chin-Up/../../dist/exercises.json", "/etc/passwd", "Chin-Up//0.jpg",
    "./Chin-Up/0.jpg", "Chin-Up/0.jpg\x00.png", "..\\dist\\exercises.json", "Chin-Up\\0.jpg",
    "Chin-Up/0.txt", "Chin-Up", "Chin-Up/9.jpg",                  # falsche Endung / Verzeichnis / nicht vorhanden
    "%2e%2e/dist/exercises.json",
])
def test_resolve_image_lehnt_boesartige_pfade_ab(clone, bad):
    assert yu.resolve_image(bad, clone) is None


def test_resolve_image_nur_str(clone):
    assert yu.resolve_image(None, clone) is None and yu.resolve_image(b"Chin-Up/0.jpg", clone) is None


def test_resolve_image_lehnt_symlink_aus_dem_klon_heraus_ab(clone, tmp_path):
    geheim = tmp_path / "geheim.jpg"
    geheim.write_bytes(b"geheim")
    (clone / "exercises" / "leak.jpg").symlink_to(geheim)                     # Datei-Symlink nach außen
    (clone / "exercises" / "dirleak").symlink_to(tmp_path, target_is_directory=True)   # Verzeichnis-Symlink
    assert yu.resolve_image("leak.jpg", clone) is None
    assert yu.resolve_image("dirleak/geheim.jpg", clone) is None


def test_resolve_image_erlaubt_symlink_innerhalb(clone):
    (clone / "exercises" / "alias.jpg").symlink_to(clone / "exercises" / "Chin-Up" / "0.jpg")
    assert yu.resolve_image("alias.jpg", clone) is not None


def test_resolve_image_ohne_klon_gibt_none(tmp_path):
    assert yu.resolve_image("Chin-Up/0.jpg", tmp_path / "nix") is None
