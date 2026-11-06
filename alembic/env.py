from __future__ import annotations

import sys
from pathlib import Path
from logging.config import fileConfig

from alembic import context

# fitness-dev root im sys.path damit 'db' importierbar ist
_HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_HERE))

from db import engine as _engine, Base  # noqa: E402
import db.models  # noqa: F401 — alle Models registrieren damit autogenerate greift

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Ohne DB-Verbindung — SQL direkt ausgeben."""
    context.configure(
        url=str(_engine.url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite: ALTER TABLE nur via batch möglich
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Mit laufender DB-Verbindung."""
    with _engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
