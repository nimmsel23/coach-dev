import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import yaml
from starlette.requests import Request
from fitness.api.routers.exercises_inbox import _link_source, inbox_link_source
from fitness.catalog.core.inbox_pipeline import build_inbox_draft_seed, preserve_reenrich_provenance
from fitness.catalog.core.source_merge import find_source_entries, search_source_entries


class SourceSelectionTest(unittest.TestCase):
    def test_replacing_source_does_not_accumulate_wrong_ids(self):
        ex = {'wger_id': 1, 'external_ids': {'wger': [1, 2], 'yuhonas': ['Correct']},
              'origin': {'source_refs': {'wger': ['1', '2'], 'yuhonas': ['Correct']}},
              'search_aliases': ['wger_1', 'Dips']}
        out = _link_source(ex, 'wger', {'wger_id': 194})
        self.assertEqual(out['external_ids'], {'wger': [194], 'yuhonas': ['Correct']})
        self.assertEqual(out['origin']['source_refs']['wger'], ['194'])
        self.assertNotIn('wger_1', out['search_aliases'])
        self.assertTrue(out['source_review_required'])
        self.assertEqual(ex['wger_id'], 1)

    def test_unlink_survives_ai_reintroducing_rejected_source(self):
        out = _link_source({'yuhonas_id': 'Bench_Dips', 'external_ids': {'yuhonas': ['Bench_Dips']}}, 'yuhonas', None)
        self.assertEqual(out['source_selection'], {'yuhonas': None})
        out = preserve_reenrich_provenance({'yuhonas_id': 'Bench_Dips', 'external_ids': {'yuhonas': ['Bench_Dips']}}, out)
        self.assertNotIn('yuhonas_id', out)
        self.assertNotIn('yuhonas', out['external_ids'])

    def test_manual_no_link_overrides_catalog_hints_and_exact_names(self):
        record = SimpleNamespace(wger_id=None, yuhonas_id='Bench_Dips', external_ids={}, source_selection={'yuhonas': None})
        with patch('fitness.catalog.core.source_merge._candidate_queries', return_value=['Bench Dips']):
            found = find_source_entries('Dips', record=record, wger_entries=[], yuhonas_entries=[{'yuhonas_id': 'Bench_Dips', 'display_name': 'Bench Dips'}])
        self.assertIsNone(found['yuhonas'])
        self.assertIsNone(found['yuhonas_candidate'])

    def test_fuzzy_high_score_is_only_a_proposal(self):
        entry = {'wger_id': 1, 'display_name': 'Walking Lunges'}
        with patch('fitness.catalog.core.source_merge._candidate_queries', return_value=['Walking Lunges variation']), \
             patch('fitness.catalog.core.source_merge._best_match_scored', return_value=(entry, 95)):
            found = find_source_entries('Walking Lunges variation', wger_entries=[entry], yuhonas_entries=[])
        self.assertIsNone(found['wger'])
        self.assertEqual(found['wger_candidate']['wger_id'], 1)

    def test_plain_dips_does_not_auto_link_bench_dips(self):
        with patch('fitness.catalog.core.source_merge._candidate_queries', return_value=['Dips']):
            found = find_source_entries('Dips', wger_entries=[], yuhonas_entries=[{'yuhonas_id': 'Bench_Dips', 'display_name': 'Bench Dips'}])
        self.assertIsNone(found['yuhonas'])

    def test_raw_search_includes_source_id_and_alternative_variants(self):
        entries = [{'yuhonas_id': 'Bench_Dips', 'display_name': 'Bench Dips'}, {'yuhonas_id': 'Dips_-_Chest_Version', 'display_name': 'Dips - Chest Version'}]
        with patch('fitness.catalog.core.source_merge._entries_from_file', return_value=entries):
            self.assertEqual(len(search_source_entries('yuhonas', 'dips')), 2)
            self.assertEqual(search_source_entries('yuhonas', 'Chest_Version')[0]['id'], 'Dips_-_Chest_Version')

    def test_corrected_source_restart_ignores_old_expert_equipment(self):
        payload = {'source_selection': {'yuhonas': None}, 'source_review_required': True}
        with patch('fitness.catalog.core.inbox_pipeline._canonical_record_seed', return_value={'equipment': ['bench'], 'yuhonas_id': 'Bench_Dips'}), \
             patch('fitness.catalog.core.inbox_pipeline.build_external_seed', return_value={'wger_id': 194}):
            seed = build_inbox_draft_seed('Dips', 'dips', payload, restart=True)
        self.assertNotIn('equipment', seed)
        self.assertNotIn('yuhonas_id', seed)
        self.assertEqual(seed['source_selection']['yuhonas'], None)

    def test_schema_cannot_reintroduce_rejected_filename_source(self):
        from fitness.catalog.core.exercise_schema import apply_exercise_schema
        ex = {'exercise_id': 'yuhonas_bench_dips', 'yuhonas_id': 'Bench_Dips',
              'external_ids': {'yuhonas': ['Bench_Dips']}, 'source_selection': {'yuhonas': None}}
        approved = apply_exercise_schema(ex, review_status='approved')
        self.assertNotIn('yuhonas_id', approved)
        self.assertNotIn('yuhonas', approved['origin']['source_refs'])

    def test_route_saves_authoritative_local_entry_and_replacement(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'inbox_test.yml'
            path.write_text(yaml.safe_dump({'exercises': [{'exercise_id': 'dips', 'wger_id': 1}]}))
            async def receive():
                return {'type': 'http.request', 'body': json.dumps({'source': 'wger', 'source_id': 194, 'current_data': {'wger_id': 999}}).encode()}
            request = Request({'type': 'http', 'headers': []}, receive)
            with patch('fitness.api.routers.exercises_inbox.INBOX_DIR', root), \
                 patch('fitness.api.routers.exercises_inbox._source_entry_by_id', return_value={'wger_id': 194}), \
                 patch('fitness.api.routers.exercises_inbox._write_back_to_firestore'), \
                 patch('fitness.catalog.agent.inbox_actions._git_commit_paths'):
                result = asyncio.run(inbox_link_source('inbox_test', request))
            self.assertEqual(result['exercise']['external_ids']['wger'], [194])
            self.assertTrue(path.with_suffix('.yml.bak').exists())
            self.assertEqual(yaml.safe_load(path.read_text())['exercises'][0]['source_selection'], {'wger': 194})


if __name__ == '__main__':
    unittest.main()
