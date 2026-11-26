"""Durable local draft jobs. Approval never sends messages or runs arbitrary tools."""

import json
import hashlib
import os
import sqlite3
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel


def now():
    return datetime.now(timezone.utc).isoformat()


class Decision(BaseModel):
    expectedRevision: int
    status: str
    preview: str | None = None


class Runtime:
    def __init__(self, path=None, runner=None, operations=None):
        self.path = Path(path or os.environ.get('COACH_CSUITE_DB', Path.home() / '.local/state/coach/csuite.sqlite3'))
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.operations = operations
        self.runner = runner
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='csuite')
        self.futures = {}
        self.lock = threading.Lock()
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            # A terminated process cannot safely resume an engine invocation.
            for (raw,) in db.execute('SELECT data FROM runs').fetchall():
                item = json.loads(raw)
                if item['status'] in ('queued', 'running'):
                    self._change(db, item, status='failed', error='Server wurde unterbrochen. Auftrag erneut starten.')
        self.path.chmod(0o600)

    def coo(self):
        if self.operations is None:
            from coach_coo_operations import CooOperations
            self.operations = CooOperations()
        return self.operations

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.path, timeout=10)
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _change(self, db, item, **changes):
        item.update(changes)
        item['revision'] += 1
        item['updatedAt'] = now()
        item['events'].append({'status': item['status'], 'at': item['updatedAt']})
        db.execute('INSERT OR REPLACE INTO runs VALUES (?, ?)', (item['id'], json.dumps(item, ensure_ascii=False)))
        return item

    def get(self, run_id, db=None):
        if db is None:
            with self.db() as conn:
                return self.get(run_id, conn)
        row = db.execute('SELECT data FROM runs WHERE id = ?', (run_id,)).fetchone()
        if row is None:
            raise HTTPException(404, 'Auftrag nicht gefunden')
        return json.loads(row[0])

    def list(self, role):
        from coach_csuite import load_workspace
        load_workspace(role)
        with self.db() as db:
            items = [json.loads(row[0]) for row in db.execute('SELECT data FROM runs')]
        return sorted((item for item in items if item['workspaceId'] == role), key=lambda x: x['createdAt'], reverse=True)

    def create(self, body):
        from coach_csuite import load_workspace, skill_meta, build_user_prompt, default_title
        if body.engine not in ('claude', 'gemini', 'codex'):
            raise HTTPException(400, 'Engine wählen: claude, gemini oder codex. Keine Demo-Ergebnisse.')
        if not (body.message or '').strip() and not body.context:
            raise HTTPException(400, 'Bitte einen Auftrag mit Kontext eingeben.')
        if body.clientId:
            if body.workspaceId != 'coo':
                raise HTTPException(400, 'Klientenkontext ist an den COO gebunden.')
            snapshot = self.coo().context(body.clientId)
            if body.expectedContextRevision != snapshot['revision']:
                raise HTTPException(409, 'Klientendaten wurden geändert. Bitte den Stand neu laden und erneut prüfen.')
            if body.eventId:
                snapshot['appointment'] = self.coo().appointment(body.eventId, body.expectedEventRevision)
            body = body.model_copy(update={'context': {**body.context, 'clientId': body.clientId, 'clientName': snapshot['client']['name'], 'clientContext': snapshot}})
        ws = load_workspace(body.workspaceId)
        skill = skill_meta(ws, body.skillId)
        # The server-owned Git brain is authoritative, never browser-supplied prompts.
        system = ws['prompt']
        user = build_user_prompt(ws, skill, body)
        item = dict(id=str(uuid.uuid4()), workspaceId=body.workspaceId, skillId=body.skillId,
                    engine=body.engine, title=default_title(skill, body), preview='', error=None,
                    requiresApproval=True, status='queued', createdAt=now(), revision=0,
                    events=[], context=body.context, message=body.message,
                    brain={'systemPrompt': system, 'skill': skill, 'sha256': hashlib.sha256((system + json.dumps(skill, sort_keys=True)).encode()).hexdigest()}, source='runtime')
        with self.lock:
            if sum(not f.done() for f in self.futures.values()) >= 8:
                raise HTTPException(429, 'Die Warteschlange ist voll. Bitte später erneut versuchen.')
            with self.db() as db:
                self._change(db, item)
            self.futures[item['id']] = self.pool.submit(self._execute, item['id'], body, system, user, skill)
            self.futures = {key: f for key, f in self.futures.items() if not f.done() or key == item['id']}
        return item

    def _execute(self, run_id, body, system, user, skill):
        from coach_csuite import run_engine
        try:
            with self.db() as db:
                self._change(db, self.get(run_id, db), status='running')
            text, engine = (self.runner or run_engine)(body.engine, system, user, skill, body)
            if not text.strip():
                raise ValueError('Engine lieferte keinen Entwurf')
            with self.db() as db:
                self._change(db, self.get(run_id, db), status='pending_approval', preview=text, generatedPreview=text, engine=engine)
        except Exception as exc:
            detail = str(exc.detail) if isinstance(exc, HTTPException) else str(exc)
            with self.db() as db:
                self._change(db, self.get(run_id, db), status='failed', error=detail[:2000])

    def wait(self, run_id):
        future = self.futures.get(run_id)
        if future:
            future.result()
        return self.get(run_id)

    def decide(self, run_id, body):
        allowed = {'pending_approval': {'approved', 'rejected'}, 'approved': {'completed', 'rejected'}}
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            item = self.get(run_id, db)
            if body.expectedRevision != item['revision']:
                raise HTTPException(409, 'Auftrag wurde geändert. Bitte neu laden.')
            if body.status not in allowed.get(item['status'], set()):
                raise HTTPException(409, 'Dieser Statuswechsel ist nicht möglich.')
            if body.status == 'approved':
                text = body.preview if body.preview is not None else item['preview']
                if not text.strip():
                    raise HTTPException(422, 'Ein leerer Entwurf kann nicht freigegeben werden.')
                item['preview'] = text
                item['approvedAt'] = now()
            if body.status == 'completed':
                # Only the approved revision becomes an immutable document.
                item['artifact'] = item['preview']
                item['completedAt'] = now()
            return self._change(db, item, status=body.status)


def install_routes(router, runtime, guard):
    from coach_csuite import RunBody

    @router.get('/coo/calendar')
    def coo_calendar(request: Request, refresh: bool = False):
        guard(request)
        from fastapi.responses import JSONResponse
        return JSONResponse(runtime.coo().calendar(refresh=refresh), headers={'Cache-Control': 'no-store'})

    @router.get('/coo/overview')
    def coo_overview(request: Request):
        guard(request)
        from fastapi.responses import JSONResponse
        return JSONResponse(runtime.coo().overview(runtime.list('coo')), headers={'Cache-Control': 'no-store'})

    @router.get('/coo/clients/{client_id}/context')
    def coo_context(request: Request, client_id: str):
        guard(request)
        from fastapi.responses import JSONResponse
        return JSONResponse(runtime.coo().context(client_id), headers={'Cache-Control': 'no-store'})

    @router.get('/runs')
    def runs(request: Request, workspaceId: str = 'coo'):
        guard(request)
        return {'ok': True, 'runs': runtime.list(workspaceId)}

    @router.post('/runs', status_code=202)
    def start(request: Request, body: RunBody):
        guard(request)
        return runtime.create(body)

    @router.get('/runs/{run_id}')
    def get(request: Request, run_id: str):
        guard(request)
        return runtime.get(run_id)

    @router.post('/runs/{run_id}/decision')
    def decide(request: Request, run_id: str, body: Decision):
        guard(request)
        return runtime.decide(run_id, body)

    @router.get('/runs/{run_id}/document')
    def document(request: Request, run_id: str):
        guard(request)
        item = runtime.get(run_id)
        if item['status'] != 'completed':
            raise HTTPException(409, 'Dokument wurde noch nicht freigegeben und abgelegt.')
        return Response(item['artifact'], media_type='text/markdown', headers={
            'Content-Disposition': f'attachment; filename="{item["id"]}.md"', 'Cache-Control': 'no-store'})
