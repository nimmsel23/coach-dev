"""Re-enrichment updates the selected draft and never returns stale content as success."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml
from fastapi import HTTPException
from starlette.requests import Request
from fitness.api.routers.exercises_inbox import inbox_reenrich


def request():
    async def receive():
        return {'type': 'http.request', 'body': json.dumps({
            'exercise_id': 'inbox_manual', 'display_name': 'Manual exercise',
            'current_data': {'exercise_id': 'inbox_manual', 'origin': {'type': 'manual'}},
        }).encode(), 'more_body': False}
    return Request({'type': 'http', 'method': 'POST', 'headers': []}, receive)


class ReenrichRouteTest(unittest.TestCase):
    def run_case(self, root, enriched):
        with patch('fitness.api.routers.exercises_inbox.INBOX_DIR', root), \
             patch('fitness.catalog.agent.gemini.load_gemini_key', return_value='test-key'), \
             patch('fitness.catalog.api.watcher.build_inbox_draft_seed', return_value={'origin': {'type': 'manual'}}), \
             patch('fitness.catalog.api.watcher.call_gemini', return_value=enriched), \
             patch('fitness.catalog.api.watcher.commit_inbox_draft'), \
             patch('fitness.catalog.api.watcher.run_kb_sync'):
            return asyncio.run(inbox_reenrich('inbox_selected', request()))

    def test_updates_selected_local_file_without_creating_duplicate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / 'inbox_selected.yml'
            target.write_text('exercises: []\n')
            result = self.run_case(root, {'exercise_id': 'inbox_manual', 'display_name': 'Enriched exercise'})
            self.assertTrue(result['ok'])
            self.assertEqual(Path(result['draft_path']), target)
            self.assertEqual(list(root.glob('*.yml')), [target])
            saved = yaml.safe_load(target.read_text())['exercises'][0]
            self.assertEqual(saved['display_name'], 'Enriched exercise')
            self.assertEqual(saved['origin']['type'], 'manual')
            self.assertEqual(saved['review_state']['status'], 'draft')

    def test_empty_model_response_does_not_return_old_draft_as_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / 'inbox_selected.yml'
            original = 'exercises: [{display_name: old}]\n'
            target.write_text(original)
            with self.assertRaises(HTTPException) as caught:
                self.run_case(root, None)
            self.assertEqual(caught.exception.status_code, 502)
            self.assertEqual(target.read_text(), original)


if __name__ == '__main__':
    unittest.main()
