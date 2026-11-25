"""Isolated source-merge browser acceptance; all writes stay in a temp KB."""
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import yaml
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fitness.api.routers import exercises_inbox
from fitness.catalog.core import source_merge
from fitness.catalog.agent import inbox_actions

root=Path(tempfile.mkdtemp(prefix='coach-source-fusion-'))
(root/'inbox_test.yml').write_text(yaml.safe_dump({'exercises':[{'exercise_id':'test','display_name':'Klimmzug','english':'Chin-Up','coaching_notes':['Coach-Hinweis behalten.'],'wger_id':1,'external_ids':{'wger':[1]},'source':'inbox'}]}))
raw={
 'wger':[{'wger_id':1,'display_name':'Klimmzug alt','equipment':['Stange']},{'wger_id':152,'display_name':'Chin-ups','coaching_notes':['Rücken kontrollieren.'],'equipment':['Stange']},{'wger_id':999,'display_name':'Falscher Vorschlag'}],
 'yuhonas':[{'yuhonas_id':'Chin-Up','display_name':'Chin-Up','instructions':['Kontrolliert hochziehen.'],'equipment':['Stange']}],
}
exercises_inbox.INBOX_DIR=root
exercises_inbox._source_entry_by_id=lambda source,id:next((entry for entry in raw[source] if str(entry[f'{source}_id'])==str(id)),None)
source_merge.search_source_entries=lambda source,query:[{'id':str(entry[f'{source}_id']),**entry} for entry in raw[source]]
inbox_actions._git_commit_paths=lambda *args:True
exercises_inbox._write_back_to_firestore=lambda *args:None
app=FastAPI()
app.add_middleware(CORSMiddleware,allow_origins=['http://127.0.0.1:15918'],allow_methods=['POST'],allow_headers=['Content-Type'])
app.include_router(exercises_inbox.router)
uvicorn.run(app,host='127.0.0.1',port=15930,log_level='warning')
