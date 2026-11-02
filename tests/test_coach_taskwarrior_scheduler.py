import io
import unittest
from unittest.mock import patch

import coach_taskwarrior_scheduler as scheduler


class FitnessWorkoutPullTest(unittest.TestCase):
    def setUp(self):
        scheduler._FITNESS_PULL_ATTEMPTS.clear()

    def tearDown(self):
        scheduler._FITNESS_PULL_ATTEMPTS.clear()

    def test_refreshes_only_loopback_and_throttles_per_uid(self):
        with patch.dict('os.environ', {'COACH_FITNESS_API_URL': 'http://127.0.0.1:9165'}, clear=False), \
             patch.object(scheduler, 'urlopen', return_value=io.BytesIO(b'{"ok":true}')) as opened:
            self.assertTrue(scheduler.refresh_fitness_workouts('test-uid', now=1000))
            self.assertIsNone(scheduler.refresh_fitness_workouts('test-uid', now=1100))
            self.assertEqual(opened.call_count, 1)
            self.assertIn('uid=test-uid', opened.call_args.args[0].full_url)

        with patch.dict('os.environ', {'COACH_FITNESS_API_URL': 'https://example.com'}, clear=False), \
             patch.object(scheduler, 'urlopen') as opened:
            self.assertFalse(scheduler.refresh_fitness_workouts('other-uid', now=2000))
            opened.assert_not_called()


if __name__ == '__main__':
    unittest.main()
