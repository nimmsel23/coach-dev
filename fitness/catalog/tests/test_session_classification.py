from __future__ import annotations

import unittest

from fitness.data import activity_minutes, classify, performed_exercises, rollup_training_days, session_activities


class SessionClassificationTest(unittest.TestCase):
    def test_strength_exercises_win_over_cardio_mode_finisher(self) -> None:
        session = {
            "sessionMode": "cardio",
            "activity": {"type": "hiit", "duration": "5"},
            "exercises": [
                {
                    "id": "061",
                    "name": "Frontkniebeuge",
                    "setsArray": [{"weight": "60", "reps": "5"}],
                }
            ],
        }

        self.assertEqual(classify(session), "strength+addon")
        self.assertEqual([ex["id"] for ex in performed_exercises(session)], ["061"])

    def test_activity_without_exercise_signal_stays_cardio(self) -> None:
        session = {
            "sessionMode": "cardio",
            "activity": {"type": "swimming", "duration": "60"},
            "exercises": [{"id": "061", "name": "Frontkniebeuge", "setsArray": [{"weight": "", "reps": ""}]}],
        }

        self.assertEqual(classify(session), "cardio")
        self.assertEqual(performed_exercises(session), [])

    def test_cardio_sidecars_roll_up_to_one_training_day(self) -> None:
        sessions = [
            {
                "date": "2026-06-28",
                "_stem": "2026-06-28",
                "sessionMode": "cardio",
                "activity": {"type": "swimming", "duration": "45"},
                "exercises": [],
            },
            {
                "date": "2026-06-28",
                "_stem": "2026-06-28__walk",
                "sessionMode": "cardio",
                "activity": {"type": "walking", "duration": "30"},
                "exercises": [],
            },
        ]

        days = rollup_training_days(sessions)

        self.assertEqual(len(days), 1)
        self.assertEqual(classify(days[0]), "cardio")
        self.assertEqual(activity_minutes(days[0]), 75)
        self.assertEqual([a["type"] for a in session_activities(days[0])], ["swimming", "walking"])


if __name__ == "__main__":
    unittest.main()
