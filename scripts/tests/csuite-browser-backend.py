"""Browser fixture: production job code + isolated DB + controlled engine output."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from coach_csuite import ROOT, create_router
from coach_csuite_runtime import Runtime


def fixture_engine(engine, system, user, skill, body):
    import time
    time.sleep(0.4)
    if 'Fehlerfall' in str(body.context):
        raise RuntimeError('Engine im Test nicht erreichbar')
    return '# Agenda\n\n1. Ziel klären\n2. Nächsten Schritt festlegen', engine


with tempfile.TemporaryDirectory(prefix='csuite-browser-') as folder:
    runtime = Runtime(Path(folder) / 'runs.sqlite', fixture_engine)
    app = FastAPI()
    app.include_router(create_router(runtime))
    app.mount('/workspaces', StaticFiles(directory=ROOT / 'workspaces'))
    uvicorn.run(app, host='127.0.0.1', port=15940, log_level='warning')
