"""coach_plan_push: Umwandlung und Firestore-Sync gegen eine In-Memory-Fake-DB."""
import coach_plan_push as pp

PLAN = {"einheiten": [{"name": "Push · RPE 5-7", "frequenz": "weekly-1", "abschnitte": [
    {"name": "Krafttraining", "übungen": [
        {"name": "Incline Chest Press Maschine", "id": "yuhonas_leverage_incline_chest_press",
         "sätze": 3, "wdh": "8-12", "gewicht": "", "pause": "90s"},
        {"name": "Klimmzüge", "id": None, "sätze": 5, "wdh": "1", "gewicht": "BW", "pause": "2min"},
    ]}]}]}


class Doc:
    def __init__(self, store, path):
        self.store, self.path = store, path
        self.id = path[-1]
        self.reference = self

    @property
    def exists(self):
        return self.path in self.store

    def get(self):
        return self

    def to_dict(self):
        return self.store.get(self.path)

    def set(self, data):
        self.store[self.path] = dict(data)

    def delete(self):
        self.store.pop(self.path, None)

    def collection(self, name):
        return Col(self.store, self.path + (name,))


class Col:
    def __init__(self, store, path):
        self.store, self.path = store, path

    def document(self, doc_id):
        return Doc(self.store, self.path + (doc_id,))

    def stream(self):
        n = len(self.path)
        return [Doc(self.store, p) for p in list(self.store) if len(p) == n + 1 and p[:n] == self.path]


class FakeDb:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return Col(self.store, (name,))


def routines_col(db):
    return db.collection("fitness").document("U").collection("routines")


def test_build_routines_maps_fields():
    (r,) = pp.build_routines(PLAN)
    assert r["id"] == "plan-push-rpe-5-7"
    assert r["meta"]["exerciseCount"] == 2 and r["meta"]["source"] == pp.SOURCE
    a, b = r["exercises"]
    assert a["exercise_id"] == "yuhonas_leverage_incline_chest_press" and a["rest_seconds"] == 90
    assert [s["targetWeight"] for s in a["templateSets"]] == [None] * 3  # kein Gewicht bekannt -> nichts erfunden
    assert b["trackingType"] == "bodyweight_reps" and b["rest_seconds"] == 120 and b["templateSets"][0]["targetReps"] == 1
    assert a["order"] == 0 and b["order"] == 1


def test_sync_is_idempotent_and_removes_dropped_exercises():
    db = FakeDb()
    routines = pp.build_routines(PLAN)
    pp.sync_routines(db, "U", routines, now="t1")
    pp.sync_routines(db, "U", routines, now="t2")
    docs = routines_col(db).stream()
    assert [d.id for d in docs] == ["plan-push-rpe-5-7"]
    assert docs[0].to_dict()["created_at"] == "t1" and docs[0].to_dict()["updated_at"] == "t2"
    assert len(docs[0].collection("exercises").stream()) == 2

    shorter = {"einheiten": [{**PLAN["einheiten"][0], "abschnitte": [
        {"name": "K", "übungen": PLAN["einheiten"][0]["abschnitte"][0]["übungen"][:1]}]}]}
    summary = pp.sync_routines(db, "U", pp.build_routines(shorter), now="t3")
    assert summary["removed_exercises"] == 1
    assert len(routines_col(db).document("plan-push-rpe-5-7").collection("exercises").stream()) == 1


def test_foreign_routines_untouched_own_removed():
    db = FakeDb()
    routines_col(db).document("app-made").set({"name": "Von Hand", "source": None})
    routines_col(db).document("plan-push-rpe-5-7").set({"name": "x", "source": "app"})  # gleiche ID, fremd
    s = pp.sync_routines(db, "U", pp.build_routines(PLAN), now="t")
    assert s["skipped_foreign"] == ["plan-push-rpe-5-7"] and s["written"] == []
    assert routines_col(db).document("plan-push-rpe-5-7").get().to_dict()["name"] == "x"

    routines_col(db).document("plan-push-rpe-5-7").delete()
    pp.sync_routines(db, "U", pp.build_routines(PLAN), now="t")
    pp.sync_routines(db, "U", pp.build_routines({"einheiten": []}), now="t")  # Einheit aus Plan entfernt
    ids = [d.id for d in routines_col(db).stream()]
    assert ids == ["app-made"]
