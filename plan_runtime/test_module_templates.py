import unittest
from module_templates import build_6pack, build_skills, build_all, sync, SRC_6PACK, SRC_SKILLS


class FakeDoc:
    def __init__(self, store, path): self.store, self.path = store, path
    @property
    def id(self): return self.path[-1]
    @property
    def exists(self): return self.path in self.store
    def to_dict(self): return self.store.get(self.path)
    def get(self): return self
    def set(self, data): self.store[self.path] = dict(data)
    def delete(self): self.store.pop(self.path, None)
    @property
    def reference(self): return self
    def collection(self, name): return FakeCol(self.store, self.path + (name,))


class FakeCol:
    def __init__(self, store, path): self.store, self.path = store, path
    def document(self, id): return FakeDoc(self.store, self.path + (id,))
    def stream(self):
        n = len(self.path)
        return [FakeDoc(self.store, p) for p in list(self.store) if len(p) == n + 1 and p[:n] == self.path]


class FakeDb:
    def __init__(self): self.store = {}
    def collection(self, name): return FakeCol(self.store, (name,))


class ModuleTemplatesTest(unittest.TestCase):
    def test_sixpack_days_become_workouts_with_merged_sets(self):
        routines = {r["id"]: r for r in build_6pack()}
        self.assertEqual(sorted(routines), ["mod-6pack-w1-d1", "mod-6pack-w1-d2", "mod-6pack-w1-d4", "mod-6pack-w1-d5", "mod-6pack-w1-d6"])
        day1 = routines["mod-6pack-w1-d1"]
        self.assertEqual(day1["meta"]["module"], {"id": "6pack", "week": 1, "day": 1})
        sides = next(e for e in day1["exercises"] if e["exercise_id"] == "side_plank_lifts")
        self.assertEqual([s["targetDuration"] for s in sides["templateSets"]], [30, 30])  # zwei Seiten = zwei Sätze
        self.assertTrue(all(e["trackingType"] == "duration" and e["moduleId"] == "6pack" for e in day1["exercises"]))
        self.assertEqual(day1["exercises"][1]["rest_seconds"], 0)

    def test_skills_carry_the_progression_ladder(self):
        routines = {r["id"]: r for r in build_skills()}
        self.assertEqual(len(routines), 14)
        lever = routines["mod-skill-front-lever"]["exercises"][0]
        self.assertEqual(lever["trackingType"], "duration")
        self.assertEqual(lever["progressionStage"], "Scapula Pulls")
        self.assertIn("Full Front Lever", lever["notes"])
        self.assertEqual(routines["mod-skill-muscle-up"]["exercises"][0]["trackingType"], "bodyweight_reps")

    def test_ids_are_unique_and_deterministic(self):
        ids = [r["id"] for r in build_all()]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(ids, [r["id"] for r in build_all()])

    def test_sync_is_idempotent_and_leaves_foreign_routines_alone(self):
        db, uid = FakeDb(), "u1"
        col = db.collection("fitness").document(uid).collection("routines")
        col.document("eigene").set({"name": "Meine", "source": None})
        col.document("mod-skill-front-lever").set({"name": "Fremd", "source": "app"})
        col.document("mod-skill-alt").set({"name": "Veraltet", "source": SRC_SKILLS})
        first = sync(db, uid, build_all())
        second = sync(db, uid, build_all())
        self.assertEqual(len(first["written"]), 18)
        self.assertEqual(first["skipped_foreign"], ["mod-skill-front-lever"])
        self.assertEqual(first["removed"], ["mod-skill-alt"])
        self.assertEqual(second["removed"], [])
        self.assertIsNotNone(col.document("eigene").to_dict())


if __name__ == "__main__":
    unittest.main()
