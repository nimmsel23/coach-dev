# fuel/ — Fuel Domain unter Coach

```
~/dev/coach-dev/backend/fuel/   # Python-Paket `fuel` + Node (server.mjs)
```

```bash
# Python API (PYTHONPATH=…/backend)
cd ~/dev/coach-dev/backend
poetry -C fuel run uvicorn fuel.api.main:app --host 127.0.0.1 --port 8000

# oder
PYTHONPATH=~/dev/coach-dev/backend python -m uvicorn fuel.api.main:app --port 8000
```

Node: `node server.mjs` (siehe package.json).
