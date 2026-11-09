import json

from backend.core.store import SessionStore
from backend.services import plan
from backend.tests.api_helpers import COACH, KLIENT, make_app

PLAN = {"einheiten": [
    {"name": "Push", "abschnitte": [{"name": "A", "uebungen": [{"name": "Bankdrücken"}, {"name": "Dips"}]}]},
    {"name": "Pull", "abschnitte": [{"name": "A", "übungen": [{"name": "Klimmzug"}]}]},
    {"name": "Legs", "abschnitte": []}]}


def test_rotation_nach_letzter_einheit(tmp_path):
    store = SessionStore(tmp_path)
    (tmp_path / "users" / "U").mkdir(parents=True)
    (tmp_path / "users" / "U" / "plan.json").write_text(json.dumps(PLAN))
    store.write("U", "2026-10-10", {"block": "Push"})
    store.write("U", "2026-10-12", {"block": "Pull"})
    store.write("U", "2026-10-14", {"block": ""})                       # ohne block: wird übersprungen
    s = plan.today(store, "U", day="2026-10-15")
    assert s["source"] == "plan:user" and s["suggestion"] == {
        "block": "Legs", "exercises": [], "lastBlock": "Pull", "lastLoggedAt": "2026-10-12"}


def test_rotation_beginnt_vorn_und_laeuft_um(tmp_path):
    store = SessionStore(tmp_path)
    (tmp_path / "users" / "U").mkdir(parents=True)
    (tmp_path / "users" / "U" / "plan.json").write_text(json.dumps(PLAN))
    assert plan.today(store, "U", day="2026-10-15")["suggestion"]["block"] == "Push"       # nichts geloggt
    assert plan.today(store, "U", day="2026-10-15")["suggestion"]["exercises"] == ["Bankdrücken", "Dips"]
    store.write("U", "2026-10-12", {"block": "Legs"})
    assert plan.today(store, "U", day="2026-10-15")["suggestion"]["block"] == "Push"       # Umlauf


def test_globaler_plan_nur_fuer_coach(tmp_path):
    store = SessionStore(tmp_path)
    (tmp_path / "plan.json").write_text(json.dumps(PLAN))
    assert plan.today(store, "KLIENT", is_coach=False, day="2026-10-15")["source"] == "fallback"
    assert plan.today(store, "COACH", is_coach=True, day="2026-10-15")["source"] == "plan:global"


def test_fallback_nach_wochentag(tmp_path):
    s = plan.today(SessionStore(tmp_path), "U", day="2026-10-12")      # Montag
    assert s["source"] == "fallback" and s["suggestion"]["day"] == "Mo" and s["suggestion"]["block"] == "Push"
    assert plan.today(SessionStore(tmp_path), "U", day="2026-10-18")["suggestion"]["day"] == "So"


def test_api(tmp_path):
    client, settings, store = make_app(tmp_path)
    settings.data_root.mkdir(parents=True, exist_ok=True)
    (settings.data_root / "plan.json").write_text(json.dumps(PLAN))
    assert client.get(f"/api/users/{KLIENT}/plan/today", params={"date": "2026-10-12"}).json()["source"] == "fallback"
    assert client.get(f"/api/users/{COACH}/plan/today", params={"date": "2026-10-12"}).json()["source"] == "plan:global"
    assert client.get(f"/api/users/{KLIENT}/plan/today", params={"date": "gestern"}).status_code == 422
    assert client.get("/api/users/NIEMAND/plan/today").status_code == 404
