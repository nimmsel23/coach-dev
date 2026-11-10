"""Command failures must remain actionable in Firestore and the worker heartbeat."""
import unittest
from datetime import timedelta
from unittest.mock import Mock

from fitness.coach.sync import CoachWorker


class WorkerFailureTest(unittest.TestCase):
    def test_failure_keeps_message_and_command_identity_in_heartbeat(self):
        worker = CoachWorker.__new__(CoachWorker)
        worker.db = Mock()
        worker.max_age = timedelta(hours=24)
        worker.include_stale = False
        worker.dry_run = False
        worker.stats = {"done": 0, "error": 0}
        worker.last_error = None
        worker.worker = 'test-worker'
        worker.started_at = None
        worker.fb = Mock()
        worker._claim = Mock(return_value={})
        worker.executor = Mock()
        worker.executor.run.side_effect = AttributeError('missing external seed')
        command = Mock(id='failed-command')
        command.to_dict.return_value = {'action': 'reenrich', 'item_id': 'inbox_manual'}
        stream = worker.db.collection.return_value.where.return_value.stream
        stream.return_value = [command]

        self.assertEqual(worker.process(), (1, 0))
        result = command.reference.update.call_args.args[0]
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['error'], 'missing external seed')
        self.assertEqual(worker.last_error['command_id'], 'failed-command')
        self.assertEqual(worker.last_error['item_id'], 'inbox_manual')

        stream.return_value = []
        worker.heartbeat()
        state = worker.db.collection.return_value.document.return_value.set.call_args.args[0]
        self.assertEqual(state['errors_since_start'], 1)
        self.assertEqual(state['last_error']['message'], 'missing external seed')
        self.assertEqual(state['done_since_start'], 0)


if __name__ == '__main__':
    unittest.main()
