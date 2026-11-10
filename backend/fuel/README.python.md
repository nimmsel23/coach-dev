# Fuel Python API

`backend/` ist der FastAPI-Port des Fuel-Trackers. Der Tagesdatensatz wird in
`DailyJournal` gespeichert; Food- und Supplement-Einträge sowie deren
Mikronährstoffprofile bleiben innerhalb des Tagesdatensatzes nachvollziehbar.
Die Router werden zusätzlich direkt von `/home/alpha/workspace/VitalOS` unter
`/api/fuel/*` in dessen zentralen Server auf `:8000` eingebunden. Dabei bleibt
Fuel Datenbesitzer; die VitalOS-Postgres-Verbindung und die Fuel-SQLite-Datei
werden getrennt konfiguriert.

## Start

Benötigt Python 3.14 oder neuer. `pyproject.toml` und `poetry.lock` sind die
einzigen Quellen für Python-Metadaten und Abhängigkeiten. Aus dem
Repository-Root:

```bash
POETRY_VIRTUALENVS_IN_PROJECT=true poetry install --only main --no-root
poetry run python -m backend.migrate
poetry run uvicorn fuel.api.main:app --host 127.0.0.1 --port 4000
```

`backend/start-server.sh`, `bin/fuel-devctl` und `deploy.sh` verwenden die
Poetry-Umgebung unter `backend/.venv` und führen die Migration vor dem
Serverstart aus. Der API-Startup prüft und aktualisiert das Schema ebenfalls.
Für Schätzungen muss `GEMINI_API_KEY` in der Umgebung oder in
`~/.env/fuel.env` gesetzt sein. Ohne Gemini liefern Schätzrouten HTTP 503 und
speichern keine erfundenen Werte.

## Datenbank und Migrationen

Standardmäßig verwendet Fuel
`~/.aos/fuel/nutrition/nutrition.db`. `DATABASE_URL` kann auf eine andere
SQLite- oder PostgreSQL-Datenbank zeigen. Alembic verwaltet Schemaänderungen;
`create_all()` wird beim Start nicht mehr als Upgrade-Ersatz verwendet.
In einem zusammengesetzten Server kann `FUEL_DATABASE_URL` die Fuel-Datenbank
getrennt von der Host-Anwendung konfigurieren; diese Variable hat Vorrang vor
`DATABASE_URL`.

Ein vollständiges, bisher unversioniertes v4-Schema wird einmalig auf die
bekannte Basisrevision gestempelt und danach bis zum aktuellen Stand migriert.
Bei einem unvollständigen Schema bricht der Start mit einer Diagnose ab,
anstatt Tabellen oder Daten still zu überschreiben. Vor manuellen Migrationen
sollte eine Sicherung der Datenbank erstellt werden.

Details zu den behobenen Fehlern und zu älteren aggregierten Mikronährstoffen
stehen in [BUGFIXES.md](BUGFIXES.md).
