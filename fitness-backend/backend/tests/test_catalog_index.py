import dataclasses
import json
import os

import pytest
import yaml

from backend.catalog import index, yuhonas as yu
from _catalog_helpers import make_clone, rec


@pytest.fixture(autouse=True)
def isolierter_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_CACHE_DIR", str(tmp_path / "cache"))
    index.reset_cache()
    yield
    index.reset_cache()


def _asdicts(records):
    return json.loads(json.dumps([dataclasses.asdict(r) for r in records], sort_keys=True, default=str))


# ── Gleichheit zum alten Index (echte KB, nur lesen) ──────────────────────────────────────────────
def test_lokale_records_identisch_zu_build_exercise_index():
    from fitness.catalog.core.resolver import build_exercise_index

    neu = index.get_local_records()
    alt = build_exercise_index()
    assert len(neu) == len(alt) > 100
    assert _asdicts(neu) == _asdicts(alt)


def test_records_aus_festplattencache_sind_identisch():
    kalt = _asdicts(index.get_local_records())
    index.reset_cache()                                   # nur Speicher leeren, Datei bleibt
    assert index._cache_file().exists()
    assert _asdicts(index.get_local_records()) == kalt


def test_yaml_loader_nutzt_libyaml_wenn_vorhanden():
    from fitness.catalog.core import yaml_utils

    if not hasattr(yaml, "CSafeLoader"):
        pytest.skip("libyaml nicht installiert")
    assert yaml_utils._SAFE_LOADER is yaml.CSafeLoader


# ── Cache und Invalidierung (kontrollierte Fingerprints) ──────────────────────────────────────────
@pytest.fixture
def zaehler(monkeypatch):
    """Ersetzt den teuren Aufbau durch einen Zähler und den Fingerprint durch eine steuerbare Variable."""
    import fitness.catalog.core.resolver as resolver

    state = {"builds": 0, "fp": "fp-1"}

    def fake_build():
        state["builds"] += 1
        return [rec("001", f"Übung v{state['builds']}")]

    monkeypatch.setattr(resolver, "build_exercise_index", fake_build)
    monkeypatch.setattr(index, "kb_fingerprint", lambda: state["fp"])
    return state


def test_gleicher_fingerprint_baut_nur_einmal(zaehler):
    index.get_local_records()
    index.get_local_records()
    index.reset_cache()
    index.get_local_records()                             # aus Festplattencache
    assert zaehler["builds"] == 1


def test_neuer_fingerprint_baut_neu(zaehler):
    assert index.get_local_records()[0].display_name == "Übung v1"
    zaehler["fp"] = "fp-2"
    assert index.get_local_records()[0].display_name == "Übung v2"
    assert zaehler["builds"] == 2


def test_veralteter_festplattencache_wird_ignoriert(zaehler):
    index.get_local_records()
    index.reset_cache()
    zaehler["fp"] = "fp-neu"
    assert index.get_local_records()[0].display_name == "Übung v2"


@pytest.mark.parametrize("inhalt", ["", "{kaputt", '{"schema": 1}', '{"schema": 999, "fingerprint": "fp-1", "records": []}'])
def test_kaputter_festplattencache_wird_ignoriert(zaehler, inhalt):
    index._cache_file().parent.mkdir(parents=True, exist_ok=True)
    index._cache_file().write_text(inhalt)
    assert index.get_local_records()[0].exercise_id == "001"
    assert zaehler["builds"] == 1


def test_nicht_schreibbarer_cache_ist_nicht_fatal(zaehler, tmp_path, monkeypatch):
    blockiert = tmp_path / "datei"
    blockiert.write_text("x")
    monkeypatch.setenv("FITNESS_CACHE_DIR", str(blockiert / "unterordner"))    # mkdir scheitert
    assert index.get_local_records()[0].exercise_id == "001"


def test_fingerprint_aendert_sich_bei_kb_aenderung(tmp_path, monkeypatch):
    import fitness.catalog.core.loader as loader

    kb = tmp_path / "kb"
    (kb / "exercises").mkdir(parents=True)
    (kb / "inbox").mkdir()
    a, b = kb / "exercises" / "a.yml", kb / "inbox" / "inbox_b.yml"
    a.write_text("exercises: []\n")
    b.write_text("exercises: []\n")
    monkeypatch.setattr(loader, "catalog_path", lambda rel="": kb / rel if rel else kb)
    monkeypatch.setattr(loader, "iter_catalog_yaml_files",
                        lambda rel: sorted([*(kb / rel).rglob("*.yml"), *(kb / rel).rglob("*.yaml")]))
    fp0 = index.kb_fingerprint()
    assert index.kb_fingerprint() == fp0                                  # stabil
    a.write_text("exercises: [x]\n")                                       # Größe ändert sich
    fp1 = index.kb_fingerprint()
    assert fp1 != fp0
    st = b.stat()
    os.utime(b, ns=(st.st_atime_ns, st.st_mtime_ns + 7_000_000_000))       # nur mtime ändert sich
    fp2 = index.kb_fingerprint()
    assert fp2 != fp1
    (kb / "exercises" / "neu.yml").write_text("exercises: []\n")           # neue Datei
    assert index.kb_fingerprint() != fp2


# ── yuhonas direkt ergänzen ───────────────────────────────────────────────────────────────────────
@pytest.fixture
def lokal(monkeypatch):
    local = [rec("020", "Klimmzug", yuhonas_id="Chin-Up", primary_muscles=["201_latissimus_dorsi", "207_teres_major"]),
             rec("yuhonas_face_pull", "Face Pull (importiert)", source="bulk", source_file="unreviewed_yuhonas.yml")]
    monkeypatch.setattr(index, "get_local_records", lambda: local)
    return local


def test_get_records_ergaenzt_nur_unbekannte_ids_und_laesst_lokale_unveraendert(lokal, tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(make_clone(tmp_path / "klon")))
    vorher = _asdicts(lokal)
    records = index.get_records()
    ids = [r.exercise_id for r in records]
    assert ids[:2] == ["020", "yuhonas_face_pull"]                       # lokal zuerst, Reihenfolge erhalten
    assert ids[2:] == ["yuhonas_chin-up", "yuhonas_push-up_wide"]        # face_pull existiert lokal -> nicht doppelt
    assert _asdicts(lokal) == vorher                                      # nichts überschrieben
    assert records[2].source == "yuhonas" and records[2].yuhonas_id == "Chin-Up"
    assert records[2].tags == ["yuhonas", "unreviewed"] and records[2].images == ["Chin-Up/0.jpg", "Chin-Up/1.jpg"]


def test_yuhonas_record_muskeln_laufen_durch_die_vorhandene_normalisierung(tmp_path):
    e = yu.load(make_clone(tmp_path / "klon")).by_exercise_id["yuhonas_chin-up"]
    r = index.yuhonas_record(e)
    assert r.primary_muscles == ["201_latissimus_dorsi"] and r.secondary_muscles == ["402_biceps_brachii"]


def test_get_records_ohne_klon_liefert_lokale(lokal, tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(tmp_path / "nix"))
    assert [r.exercise_id for r in index.get_records()] == ["020", "yuhonas_face_pull"]


def test_get_records_ohne_yuhonas_flag(lokal, tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_YUHONAS_DIR", str(make_clone(tmp_path / "klon")))
    assert [r.exercise_id for r in index.get_records(include_yuhonas=False)] == ["020", "yuhonas_face_pull"]
