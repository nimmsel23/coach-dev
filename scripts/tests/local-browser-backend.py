"""Real HTTP/local filesystem test server with an isolated registry and fake delivery."""
import json
import os
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
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
    app.include_router(create_router(root,deliver=deliver))
    app.mount('/coach',StaticFiles(directory=os.environ.get('COACH_LOCAL_TEST_DIST','/tmp/coach-local-build'),html=True),name='coach')
    uvicorn.run(app,host='127.0.0.1',port=15904,log_level='warning')
