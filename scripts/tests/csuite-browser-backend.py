"""Browser fixture: production job code + isolated DB + controlled engine output."""
import sys
import os
import subprocess
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from coach_csuite import ROOT, create_router
from coach_csuite_runtime import Runtime
from coach_coo_operations import CooOperations
import json


def fixture_engine(engine, system, user, skill, body):
    import time
    time.sleep(0.4)
    if 'Fehlerfall' in str(body.context):
        raise RuntimeError('Engine im Test nicht erreichbar')
    if body.clientId:
        assert body.context['clientContext']['client']['id'] == body.clientId
    return '# Agenda\n\n1. Ziel klären\n2. Nächsten Schritt festlegen', engine


with tempfile.TemporaryDirectory(prefix='csuite-browser-') as folder:
    archive = Path(folder) / 'archive'
    archive.mkdir()
    def git(*args):
        subprocess.run(['git', '-C', str(archive), *args], check=True, capture_output=True)
    git('init', '-b', 'master')
    git('config', 'user.name', 'Browser Test')
    git('config', 'user.email', 'browser@example.invalid')
    git('remote', 'add', 'origin', 'git@github.com:nimmsel23/business-vitaltraining.git')
    (archive / 'README').write_text('fixture')
    git('add', 'README')
    git('commit', '-m', 'initial')
    os.environ['COACH_CLIENT_ARCHIVE_ROOT'] = str(archive)
    clients = Path(folder) / 'clients'
    for cid, name in [('alice', 'Alice Beispiel'), ('bob', 'Bob Beispiel')]:
        root = clients / cid
        root.mkdir(parents=True)
        (root / 'client.json').write_text(json.dumps({'name': name, 'role': 'client'}))
        (root / 'KLIENT.md').write_text('Ziel: konsistente Woche\n- [ ] Offene Frage zum Alltag')
    runtime = Runtime(Path(folder) / 'runs.sqlite', fixture_engine, CooOperations(clients, calendar=lambda **kwargs: {'status': 'connected', 'message': 'Google-Kalender · Testdaten', 'events': [{'id': 'meeting-1', 'title': 'Erstgespräch', 'start': '2026-11-27T10:00:00+01:00', 'end': '2026-11-27T10:30:00+01:00', 'revision': 'calendar-v1'}]}))
    app = FastAPI()
    app.include_router(create_router(runtime))
    app.mount('/workspaces', StaticFiles(directory=ROOT / 'workspaces'))
    uvicorn.run(app, host='127.0.0.1', port=15940, log_level='warning')
