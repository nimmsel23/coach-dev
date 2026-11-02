from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fitness.firestore.sync import pull_workout_logs


class Snapshot:
    def __init__(self, doc_id: str, data: dict):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return self._data


class Collection:
    def __init__(self, docs):
        self.docs = docs

    def stream(self):
        if isinstance(self.docs, Exception):
            raise self.docs
        return self.docs


class UserDocument:
    def __init__(self, docs):
        self.docs = docs

    def collection(self, name):
        if name != "workouts":
            raise AssertionError(f"unexpected collection: {name}")
        return Collection(self.docs)


class RootCollection:
    def __init__(self, docs):
        self.docs = docs

    def document(self, uid):
        if uid != "fixture-uid":
            raise AssertionError(f"unexpected uid: {uid}")
        return UserDocument(self.docs)


class FakeFirestore:
    def __init__(self, docs):
        self.docs = docs

    def collection(self, name):
        if name != "fitness":
            raise AssertionError(f"unexpected collection: {name}")
        return RootCollection(self.docs)


class WorkoutLogPullTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runtime = Path(self.temp.name) / "fitness"
        self.user = self.runtime / "users" / "fixture-uid"
        self.user.mkdir(parents=True)

    def pull(self, docs):
        with patch("fitness.firestore.sync.runtime_root", return_value=self.runtime):
            return pull_workout_logs("fixture-uid", db=FakeFirestore(docs))

    def test_projects_only_metadata_and_keeps_local_workouts_separate(self):
        (self.user / "workouts.json").write_text('[{"id":"local-workout"}]')
        (self.user / "workouts").mkdir()
        (self.user / "workouts" / "assigned-plan.json").write_text('{"id":"assigned-plan"}')
        mirror = self.user / "cloud-workouts"
        mirror.mkdir()
        (mirror / "manual.json").write_text('{"note":"not owned by this mirror"}')
        docs = [Snapshot("cloud-workout-1", {
            "name": "Kraft A", "started_at": "2026-11-02T10:00:00+00:00",
            "finished_at": "2026-11-02T11:00:00+00:00", "sessionState": "completed",
            "sourcePlanId": "plan-1", "sourcePlanRoutineId": "routine-1",
            "routine_id": "routine-template", "exerciseCount": 4,
            "eventLog": [{"setId": "s1", "reps": 8}, {"setId": "s2", "reps": 7}],
            "exercises": [{"name": "sensitive detail"}], "notes": "never mirror",
        })]

        result = self.pull(docs)

        projection = json.loads((mirror / "cloud-workout-1.json").read_text())
        self.assertEqual(result, {"workout_logs": 1, "workout_logs_removed": 0})
        self.assertEqual(projection["completedSetCount"], 2)
        self.assertEqual(projection["sourcePlanRoutineId"], "routine-1")
        self.assertEqual(projection["sourceType"], "firestore-workout")
        self.assertNotIn("eventLog", projection)
        self.assertNotIn("exercises", projection)
        self.assertNotIn("notes", projection)
        self.assertTrue((self.user / "workouts.json").is_file())
        self.assertTrue((self.user / "workouts" / "assigned-plan.json").is_file())
        self.assertTrue((mirror / "manual.json").is_file())

        removed = self.pull([])
        self.assertEqual(removed, {"workout_logs": 0, "workout_logs_removed": 1})
        self.assertFalse((mirror / "cloud-workout-1.json").exists())
        self.assertTrue((mirror / "manual.json").is_file())

    def test_failed_firestore_read_keeps_previous_projection(self):
        mirror = self.user / "cloud-workouts"
        mirror.mkdir()
        previous = mirror / "existing.json"
        previous.write_text('{"sourceType":"firestore-workout","id":"existing"}')
        with patch("fitness.firestore.sync.runtime_root", return_value=self.runtime):
            with self.assertRaises(RuntimeError):
                pull_workout_logs("fixture-uid", db=FakeFirestore(RuntimeError("offline")))
        self.assertTrue(previous.is_file())

    def test_rejects_uid_path_traversal(self):
        with patch("fitness.firestore.sync.runtime_root", return_value=self.runtime):
            with self.assertRaises(ValueError):
                pull_workout_logs("../outside", db=FakeFirestore([]))


if __name__ == "__main__":
    unittest.main()
