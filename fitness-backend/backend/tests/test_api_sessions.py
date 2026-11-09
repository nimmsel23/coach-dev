from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.tests.api_helpers import COACH, KLIENT, make_app


@pytest.fixture
def env(tmp_path):
    client, settings, store = make_app(tmp_path)
    return client, settings, store


def put(client, doc_id, body, uid=KLIENT):
    return client.put(f"/api/users/{uid}/sessions/{doc_id}", json=body)


def test_health(env):
    r = env[0].get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] and r.json()["loopback_only"]


def test_clients_mit_statistik_und_coach_zuletzt(env):
    client, _, store = env
    store.write(KLIENT, "2026-10-12", {"date": "2026-10-12"})
    store.write(KLIENT, "2026-10-14", {"date": "2026-10-14"})
    rows = client.get("/api/clients").json()
    assert [r["uid"] for r in rows] == [KLIENT, COACH]
    assert rows[0]["sessions"] == 2 and rows[0]["last_session_date"] == "2026-10-14"
    assert rows[1]["is_coach"] and rows[1]["sessions"] == 0 and rows[1]["last_session_date"] is None


def test_session_lebenszyklus_mit_rev(env):
    client, _, _ = env
    r = put(client, "2026-10-14", {"sessionMode": "strength", "exercises": [{"id": "020"}]})
    assert r.status_code == 200
    body = r.json()
    assert body["rev"] == 1 and body["date"] == "2026-10-14" and body["saved_at"]

    got = client.get(f"/api/users/{KLIENT}/sessions/2026-10-14").json()
    assert got["rev"] == 1 and got["exercises"] == [{"id": "020"}]

    assert put(client, "2026-10-14", {**got, "effort": 7}).json()["rev"] == 2       # rev=1 passt -> 2
    stale = put(client, "2026-10-14", {**got, "effort": 9})                          # rev=1 ist jetzt veraltet
    assert stale.status_code == 409 and stale.json()["current_rev"] == 2
    assert client.get(f"/api/users/{KLIENT}/sessions/2026-10-14").json()["effort"] == 7  # nichts überschrieben
    assert put(client, "2026-10-14", {"effort": 3}).json()["rev"] == 3              # ohne rev: letzter gewinnt


def test_vorversion_wird_gesichert(env):
    client, settings, _ = env
    put(client, "2026-10-14", {"v": 1})
    put(client, "2026-10-14", {"v": 2})
    assert (settings.data_root / ".fitsync" / "prev" / KLIENT / "2026-10-14.json").exists()


def test_session_id_suffix(env):
    client, _, _ = env
    r = put(client, "2026-10-14__hiit", {"x": 1})
    assert r.status_code == 200 and r.json()["session_id"] == "hiit"
    ids = [s["doc_id"] for s in client.get(f"/api/users/{KLIENT}/sessions").json()]
    assert ids == ["2026-10-14__hiit"]


@pytest.mark.parametrize("doc_id,body", [("abc", {}), ("2026-10-14.json", {}), ("2026-10-14", {"date": "2026-10-15"}),
                                         ("2026-10-14", {"exercises": "kaputt"}), ("2026-10-14", {"rev": "x"})])
def test_ungueltige_eingaben_422(env, doc_id, body):
    assert put(env[0], doc_id, body).status_code == 422


def test_unbekannte_uid_404_und_ungueltige_uid_422(env):
    client = env[0]
    assert client.get("/api/users/NIEMAND/sessions").status_code == 404
    assert client.get("/api/users/a%20b/sessions").status_code == 422


def test_session_nicht_gefunden_404(env):
    assert env[0].get(f"/api/users/{KLIENT}/sessions/2026-10-14").status_code == 404


def test_liste_sortiert_limit_since_und_defekte_ueberspringen(env):
    client, _, store = env
    for d in ("2026-10-10", "2026-10-12", "2026-10-14"):
        store.write(KLIENT, d, {"date": d, "exercises": [1, 2]})
    store.path(KLIENT, "2026-10-13").write_text("{kaputt")
    base = f"/api/users/{KLIENT}/sessions"
    assert [s["doc_id"] for s in client.get(base).json()] == ["2026-10-14", "2026-10-12", "2026-10-10"]
    assert [s["doc_id"] for s in client.get(base, params={"limit": 1}).json()] == ["2026-10-14"]
    assert [s["doc_id"] for s in client.get(base, params={"since": "2026-10-12"}).json()] == ["2026-10-14", "2026-10-12"]
    assert client.get(base, params={"since": "gestern"}).status_code == 422
    assert client.get(f"{base}/2026-10-13").status_code == 409   # defekt wird gemeldet, nicht verschluckt


def test_parallele_saves_gehen_nicht_verloren(env):
    client, _, _ = env
    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(lambda i: put(client, "2026-10-14", {"n": i}).status_code, range(8)))
    assert codes == [200] * 8
    assert client.get(f"/api/users/{KLIENT}/sessions/2026-10-14").json()["rev"] == 8


def test_zusammenfassung_enthaelt_aktivitaet_bei_cardio(env):
    client, _, store = env
    store.write(KLIENT, "2026-05-26", {"date": "2026-05-26", "sessionMode": "cardio",
                                       "activity": {"type": "swimming", "intensity": 5, "duration": "25", "notes": "x"}})
    store.write(KLIENT, "2026-05-27", {"date": "2026-05-27", "sessionMode": "strength", "activity": {}})
    rows = {s["doc_id"]: s for s in client.get(f"/api/users/{KLIENT}/sessions").json()}
    assert rows["2026-05-26"]["activity"] == {"type": "swimming", "duration": "25", "intensity": 5}  # ohne notes
    assert rows["2026-05-27"]["activity"] is None
