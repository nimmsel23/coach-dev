"""Real HTTP/local filesystem test server with an isolated registry and fake delivery."""
import json
import os
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
import uvicorn
from coach_local_plans import create_router

with tempfile.TemporaryDirectory(prefix='coach-local-client-') as folder:
    root = Path(folder)
    (root/'fixture-client').mkdir()
    (root/'fixture-client/client.json').write_text(json.dumps({'name':'Fixture Client','firebase_uid':'fixture-uid'}))
    app = FastAPI()
    def deliver(payload):
        (root/'delivery.json').write_text(json.dumps(payload))
        return {'planId':payload['planId'],'version':1}
    @app.get('/legacy-plan-worker.js')
    def old_cache_worker():
        return Response("""self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).pathname.startsWith('/api/coach/local/'))e.respondWith(caches.open('fixture-old-local-cache').then(async c=>(await c.match(e.request))||fetch(e.request).then(r=>{c.put(e.request,r.clone());return r})));});""", media_type='application/javascript')
    app.include_router(create_router(root,deliver=deliver))
    app.mount('/coach',StaticFiles(directory=os.environ.get('COACH_LOCAL_TEST_DIST','/tmp/coach-local-build'),html=True),name='coach')
    uvicorn.run(app,host='127.0.0.1',port=15904,log_level='warning')
