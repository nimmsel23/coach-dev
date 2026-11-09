"""Auswertung pro UID gegen die echte KB (einmal teurer Kaltstart, danach gecacht)."""
import pytest

from backend.core.store import SessionStore
from backend.services import analytics

A, B = "UID-A", "UID-B"


def strength(exercise_id="020", sets=3, rpe=7):
    return {"sessionMode": "strength", "block": "Pull", "exercises": [{"id": exercise_id, "name": "x", "sets": sets, "reps": 8, "weight": 60, "rpe": rpe}]}


@pytest.fixture
def store(tmp_path):
    return SessionStore(tmp_path)


def test_wochenauswertung_rechnet_nur_die_eigene_uid(store):
    store.write(A, "2026-10-12", {"date": "2026-10-12", **strength()})
    store.write(B, "2026-10-12", {"date": "2026-10-12", **strength("020", sets=5)})   # gleicher Tag, gleiche Übung
    a = analytics.weekly(store, A, "2026-W42")
    b = analytics.weekly(store, B, "2026-W42")
    assert a["sessions_count"] == 1 and a["entries_count"] == 1 and a["unknown_exercises"] == []
    assert a["muscle_scores"] and b["muscle_scores"]
    # B hat mehr Sätze -> höhere Scores; A bleibt unbeeinflusst (kein Vermischen wie in der SQLite-History)
    assert sum(b["muscle_scores"].values()) > sum(a["muscle_scores"].values())
    assert a["workout_ids"] == ["Pull"]


def test_zeitraum_filter(store):
    store.write(A, "2026-10-05", {"date": "2026-10-05", **strength()})
    store.write(A, "2026-10-12", {"date": "2026-10-12", **strength()})
    r = analytics.coverage_for_range(store, A, "2026-10-06", "2026-10-13")
    assert r["sessions_count"] == 1 and r["date_from"] == "2026-10-06"


def test_unbekannte_uebung_bricht_nicht_ab(store):
    store.write(A, "2026-10-12", {"date": "2026-10-12", "exercises": [
        {"id": "gibt-es-nicht-xyz", "name": "Phantasie", "sets": 3, "reps": 8, "rpe": 7},
        {"id": "020", "name": "Klimmzug", "sets": 3, "reps": 8, "rpe": 7}]})
    r = analytics.weekly(store, A, "2026-W42")
    assert r["entries_count"] == 2 and r["unknown_exercises"] == ["gibt-es-nicht-xyz"] and r["muscle_scores"]


def test_leere_woche_hat_empfehlung(store):
    r = analytics.weekly(store, A, "2026-W01")
    assert r["entries_count"] == 0 and r["recommendations"] == ["Log at least one workout in the selected week."]


@pytest.mark.parametrize("a,b", [("2026-10-10", "2026-10-01"), ("kaputt", "2026-10-01")])
def test_ungueltiger_zeitraum(store, a, b):
    with pytest.raises(analytics.InvalidRange):
        analytics.coverage_for_range(store, A, a, b)


def test_ungueltige_woche(store):
    with pytest.raises(analytics.InvalidRange):
        analytics.weekly(store, A, "42")
