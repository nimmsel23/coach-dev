"""Local-only routes against temporary client workspaces; never connect to Firestore."""
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from fastapi import FastAPI
import httpx
from coach_local_plans import create_router

async def inline_thread(fn, *args):
    return fn(*args)

class LocalPlanHTTPTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'test-client').mkdir()
        (self.root/'test-client/client.json').write_text(json.dumps({'name':'Fixture Client','firebase_uid':'fixture-uid'}))
        self.sent = []
        def deliver(payload):
            self.sent.append(payload)
            return {'planId':payload['planId'],'version':1}
        self.app = FastAPI()
        self.app.include_router(create_router(self.root,deliver=deliver))
        self.prefix = '/api/coach/local/clients/test-client/plans'

    @patch('coach_local_plans.asyncio.to_thread', new=inline_thread)
    async def test_edit_release_delivery_and_export(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(self.app),base_url='http://localhost') as client:
            clients = await client.get('/api/coach/local/clients')
            self.assertEqual(clients.json()['clients'][0]['name'], 'Fixture Client')
            plan = (await client.post(self.prefix,json={'name':'Draft'})).json()
            url = f'{self.prefix}/{plan["id"]}'
            empty = await client.post(url+'/versions',json={'expectedUpdatedAt':plan['updatedAt']})
            self.assertEqual(empty.status_code,400)
            edited = (await client.put(url,json={**plan,'expectedUpdatedAt':plan['updatedAt'],'routines':[{'id':'a','label':'A','exercises':[{'id':'ex','name':'Bench'}]}]})).json()
            stale = await client.put(url,json={**plan,'expectedUpdatedAt':plan['updatedAt']})
            self.assertEqual(stale.status_code,409)
            released = (await client.post(url+'/versions',json={'expectedUpdatedAt':edited['updatedAt']})).json()
            await client.put(url,json={**released,'name':'Private change','expectedUpdatedAt':released['updatedAt']})
            self.assertEqual(self.sent,[])
            self.assertEqual((await client.post(url+'/deliver',json={'version':9})).status_code,409)
            result = await client.post(url+'/deliver',json={'version':1})
            self.assertEqual(result.status_code,200)
            self.assertEqual(self.sent[0]['snapshot']['name'],'Draft')
            self.assertEqual(self.sent[0]['clientUid'],'fixture-uid')
            self.assertIn('Private change',(await client.get(url+'/export/md')).text)
            self.assertEqual(len((await client.get(url+'/versions')).json()['versions']),1)
            self.assertFalse((self.root/'test-client/data/plan.json').exists())

    async def test_loopback_and_origin_guards(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(self.app,client=('100.64.1.2',123)),base_url='http://localhost') as client:
            self.assertEqual((await client.get('/api/coach/local/clients')).status_code,403)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(self.app),base_url='http://localhost') as client:
            bad = await client.post(self.prefix,json={'name':'bad'},headers={'Origin':'https://foreign.example'})
            self.assertEqual(bad.status_code,403)
            self.assertEqual((await client.get('/api/coach/local/clients/not-a-client/plans')).status_code,404)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(self.app),base_url='http://foreign.example') as client:
            self.assertEqual((await client.get('/api/coach/local/clients')).status_code,403)

if __name__ == '__main__': unittest.main()
