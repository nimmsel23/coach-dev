import asyncio
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml
from fastapi import HTTPException, Request
from fitness.catalog.core.source_fusion import merge_sources, source_choices
from fitness.api.routers.exercises_inbox import inbox_link_source

RAW = {'wger': {'wger_id':152,'display_name':'Chin-ups','coaching_notes':['Kontrolliert ziehen.'],'equipment':['bar']},
       'yuhonas': {'yuhonas_id':'Chin-Up','display_name':'Chin-Up','instructions':['Pull up.'],'images':['Chin-Up/0.jpg'],'equipment':['bar']}}

def lookup(source, value):
    return RAW[source] if str(RAW[source][f'{source}_id']) == str(value) else None

class SourceFusionTests(unittest.TestCase):
    def test_merge_preserves_originals_and_expert_content(self):
        before = copy.deepcopy(RAW)
        ex = {'exercise_id':'chin','source':'inbox','coaching_notes':['Coach cue.']}
        out = merge_sources(ex, {'wger':'152','yuhonas':'Chin-Up'}, {}, {}, lookup)
        self.assertEqual(out['external_ids'], {'wger':[152],'yuhonas':['Chin-Up']})
        self.assertEqual(out['coaching_notes'], ['Coach cue.'])
        self.assertEqual(out['instructions'], ['Pull up.'])
        self.assertEqual(out['source_snapshot'], RAW)
        self.assertEqual(out['origin']['wger'], RAW['wger'])
        self.assertEqual(out['source'], 'inbox')
        self.assertEqual(RAW, before)
        self.assertTrue(out['source_review_required'])

    def test_rejecting_a_proposal_does_not_remove_current_source(self):
        ex = merge_sources({'exercise_id':'chin'}, {'wger':152,'yuhonas':'Chin-Up'}, {}, {}, lookup)
        out = merge_sources(ex, source_choices(ex), {'wger':['999']}, {}, lookup)
        self.assertEqual(out['wger_id'],152)
        self.assertEqual(out['source_rejections']['wger'],['999'])
        self.assertEqual(out['source_snapshot']['yuhonas'], RAW['yuhonas'])

    def test_rejection_only_does_not_fill_empty_content(self):
        ex={'exercise_id':'chin','wger_id':152,'instructions':[],'source_snapshot':{'wger':{'old':'original'}}}
        out=merge_sources(ex,{'wger':152,'yuhonas':None},{'wger':['999']},{},lookup)
        expected={**ex,'source_rejections':{'wger':['999'],'yuhonas':[]}}
        self.assertEqual(out,expected)

    def test_invalid_second_source_does_not_change_anything(self):
        original = {'exercise_id':'chin','wger_id':1}
        with self.assertRaises(ValueError):
            merge_sources(original, {'wger':152,'yuhonas':'invalid'}, {}, {}, lookup)
        self.assertEqual(original, {'exercise_id':'chin','wger_id':1})

    def test_explicit_field_combine_and_reselect_rejected_candidate(self):
        out=merge_sources({'coaching_notes':['Old']},{'wger':152,'yuhonas':'Chin-Up'},{'wger':['152']},{'coaching_notes':'combine'},lookup)
        self.assertEqual(out['coaching_notes'],['Kontrolliert ziehen.'])
        self.assertEqual(out['source_rejections']['wger'],[])

    def test_local_merge_conflict_leaves_file_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'inbox_test.yml';text=yaml.safe_dump({'exercises':[{'exercise_id':'test'}]});path.write_text(text)
            async def run(payload):
                async def receive(): return {'type':'http.request','body':json.dumps(payload).encode()}
                return await inbox_link_source('inbox_test',Request({'type':'http','headers':[]},receive))
            with patch('fitness.api.routers.exercises_inbox.INBOX_DIR',root), patch('fitness.api.routers.exercises_inbox._source_entry_by_id',side_effect=lookup), patch('fitness.catalog.agent.inbox_actions._git_commit_paths'), patch('fitness.api.routers.exercises_inbox._write_back_to_firestore'):
                initial=asyncio.run(run({'operation':'inspect'}))
                path.write_text(text+'# concurrent edit\n')
                with self.assertRaises(HTTPException) as error:
                    asyncio.run(run({'operation':'merge','revision':initial['revision'],'selection':{'wger':152,'yuhonas':'Chin-Up'}}))
                self.assertEqual(error.exception.status_code,409)
                self.assertEqual(path.read_text(),text+'# concurrent edit\n')
                updated=asyncio.run(run({'operation':'inspect'}))
                result=asyncio.run(run({'operation':'merge','revision':updated['revision'],'selection':{'wger':152,'yuhonas':'Chin-Up'}}))
                self.assertTrue(result['ok'])
                self.assertEqual(yaml.safe_load(path.read_text())['exercises'][0]['external_ids']['yuhonas'],['Chin-Up'])

    def test_github_merge_uses_authoritative_file_and_blob_revision(self):
        text=yaml.safe_dump({'exercises':[{'exercise_id':'test'}]})
        async def receive():return {'type':'http.request','body':json.dumps({'operation':'merge','revision':'blob','selection':{'wger':152,'yuhonas':'Chin-Up'}}).encode()}
        with patch('fitness.catalog.core.github_drafts.read_draft',return_value=('inbox/inbox_test.yml',text,'blob')), patch('fitness.catalog.core.github_drafts.write_draft',return_value={'content':{'sha':'new-blob'}}) as write, patch('fitness.api.routers.exercises_inbox._source_entry_by_id',side_effect=lookup):
            result=asyncio.run(inbox_link_source('gh-14',Request({'type':'http','headers':[]},receive)))
            self.assertEqual(result['revision'],'new-blob')
            self.assertEqual(write.call_args.args[2],'blob')
            self.assertEqual(yaml.safe_load(write.call_args.args[1])['exercises'][0]['source_snapshot'],RAW)

if __name__=='__main__':unittest.main()
