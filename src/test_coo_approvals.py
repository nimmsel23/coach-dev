"""Approval commits are scoped, idempotent, and leave failed jobs open."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from coach_coo_approvals import commit_approval
from coach_csuite_runtime import Runtime, Decision


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.git('init', '-b', 'master')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Test')
        self.git('remote', 'add', 'origin', 'git@github.com:nimmsel23/business-vitaltraining.git')
        (self.root / 'existing').write_text('original')
        self.git('add', 'existing')
        self.git('commit', '-m', 'initial')
        self.item = {'id': '11111111-1111-4111-8111-111111111111', 'createdAt': '2026-11-27T00:00:00Z', 'context': {'clientId': 'alice'}, 'workspaceId': 'coo', 'revision': 1, 'status': 'pending_approval', 'preview': 'original', 'events': []}

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], text=True, stderr=subprocess.DEVNULL).strip()

    def tearDown(self):
        self.tmp.cleanup()

    def test_only_reviewed_document_committed_and_retry_has_no_extra_commit(self):
        (self.root / 'existing').write_text('staged')
        self.git('add', 'existing')
        (self.root / 'existing').write_text('unstaged')
        result = commit_approval(self.item, '# Approved\n\nExact text', self.root)
        self.assertEqual(self.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), result['path'])
        self.assertEqual(self.git('show', ':existing'), 'staged')
        self.assertEqual((self.root / 'existing').read_text(), 'unstaged')
        self.assertTrue((self.root / result['path']).read_text().endswith('# Approved\n\nExact text'))
        self.assertEqual(commit_approval(self.item, '# Approved\n\nExact text', self.root), result)
        with self.assertRaises(HTTPException):
            commit_approval(self.item, 'different', self.root)
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '2')

    def test_failure_rolls_back_job_and_only_own_index_entry(self):
        (self.root / '.git/hooks/pre-commit').write_text('#!/bin/sh\nexit 1\n')
        (self.root / '.git/hooks/pre-commit').chmod(0o755)
        runtime = Runtime(self.root / 'runs.sqlite')
        runtime.operations = type('Ops', (), {'context': lambda self, cid: {}})()
        with runtime.db() as db:
            db.execute('INSERT INTO runs VALUES (?, ?)', (self.item['id'], json.dumps(self.item)))
        try:
            with patch.dict(os.environ, {'COACH_CLIENT_ARCHIVE_ROOT': str(self.root)}):
                with self.assertRaises(HTTPException):
                    runtime.decide(self.item['id'], Decision(expectedRevision=1, status='approved', preview='reviewed'))
            self.assertEqual(runtime.get(self.item['id'])['status'], 'pending_approval')
            self.assertEqual(self.git('diff', '--cached', '--name-only'), '')
            self.assertEqual(list(self.root.glob('klienten/**/*.md')), [])
        finally:
            runtime.pool.shutdown()

    def test_symlink_and_wrong_repository_refused(self):
        (self.root / 'klienten').symlink_to(self.root / 'elsewhere')
        with self.assertRaises(HTTPException):
            commit_approval(self.item, 'text', self.root)
        self.git('remote', 'set-url', 'origin', 'git@github.com:nimmsel23/other.git')
        with self.assertRaises(HTTPException):
            commit_approval(self.item, 'text', self.root)
