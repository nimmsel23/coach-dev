"""Replayed snapshots must not churn Git or rebuild the catalog per document."""
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import yaml
from fitness.firestore import mirror


def change(data, kind='ADDED'):
    return SimpleNamespace(type=SimpleNamespace(name=kind), document=SimpleNamespace(id=data.get('exercise_id', 'one'), to_dict=lambda: data))


class CatalogMirrorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.path = self.root / 'exercises' / 'approved_from_firebase.yml'
        self.path.parent.mkdir()
        self.base = {'exercise_id': 'one', 'source': 'approved', 'display_name': 'One', 'notes': ['A', 'B']}
        self.path.write_text(yaml.safe_dump({'exercises': [self.base]}, sort_keys=False))
        self.commit = Mock()
        self.rebuild = Mock()
        for name, value in [('_APPROVED_FILE', self.path), ('_CATALOG_DATA_DIR', self.root), ('_git_commit_paths', self.commit), ('_rebuild_runtime_catalog', self.rebuild)]:
            patcher = patch.object(mirror, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_initial_and_reconnected_snapshots_with_reordered_keys_are_noops(self):
        before = self.path.read_bytes()
        stamp = self.path.stat().st_mtime_ns
        incoming = dict(reversed(list(self.base.items())))
        incoming.update(_hash='new transport hash', updated_at=datetime.now(timezone.utc))
        for kind in ['ADDED', 'MODIFIED', 'ADDED']:
            mirror.on_kb_exercises(None, [change(incoming, kind)], None)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.path.stat().st_mtime_ns, stamp)
        self.commit.assert_not_called()
        self.rebuild.assert_not_called()

    def test_multiple_real_changes_produce_one_commit_and_one_rebuild(self):
        updates = [{**self.base, 'display_name': 'Updated'}, {'exercise_id': 'two', 'source': 'approved', 'display_name': 'Two'}]
        mirror.on_kb_exercises(None, list(map(change, updates)), None)
        self.commit.assert_called_once()
        self.rebuild.assert_called_once()
        saved = yaml.safe_load(self.path.read_text())['exercises']
        self.assertEqual([ex['display_name'] for ex in saved], ['Updated', 'Two'])
        # A reconnect after writing the same data stays quiet.
        mirror.on_kb_exercises(None, list(map(change, updates)), None)
        self.commit.assert_called_once()
        self.rebuild.assert_called_once()

    def test_real_approval_removes_matching_draft_in_same_commit(self):
        inbox = self.root / 'inbox'
        inbox.mkdir()
        draft = inbox / 'inbox_two.yml'
        draft.write_text('exercises: []')
        mirror.on_kb_exercises(None, [change({'exercise_id': 'two', 'source': 'approved'})], None)
        self.assertFalse(draft.exists())
        self.assertEqual(self.commit.call_args.args[0], [self.path, draft])
        self.rebuild.assert_called_once()

    def test_noop_replay_keeps_a_new_review_draft(self):
        inbox = self.root / 'inbox'
        inbox.mkdir()
        draft = inbox / 'inbox_one.yml'
        draft.write_text('exercises: []')
        mirror.on_kb_exercises(None, [change(self.base)], None)
        self.assertTrue(draft.exists())
        self.commit.assert_not_called()

    def test_pending_removed_and_metadata_only_changes_do_not_create_a_catalog(self):
        self.path.unlink()
        mirror.on_kb_exercises(None, [change({'source': 'unreviewed'}), change(self.base, 'REMOVED')], None)
        self.assertFalse(self.path.exists())
        self.commit.assert_not_called()

    def test_nested_timestamps_are_serializable_and_keep_approval_metadata(self):
        stamp = datetime(2026, 10, 31, tzinfo=timezone.utc)
        update = {**self.base, 'approved_at': stamp, 'review_state': {'approved_at': stamp}}
        mirror.on_kb_exercises(None, [change(update)], None)
        saved = yaml.safe_load(self.path.read_text())['exercises'][0]
        self.assertEqual(saved['approved_at'], stamp.isoformat())
        self.assertEqual(saved['review_state']['approved_at'], stamp.isoformat())
        mirror.on_kb_exercises(None, [change(update)], None)
        self.commit.assert_called_once()


if __name__ == '__main__':
    unittest.main()
