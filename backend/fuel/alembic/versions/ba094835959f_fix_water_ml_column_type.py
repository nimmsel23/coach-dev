"""Ensure water_ml uses the integer type expected by DailyJournal.

Revision ID: ba094835959f
Revises: c1fbe6c436a6
Create Date: 2026-07-10 07:25:27.561458

Older migration history created this value as JSON. Convert legacy numeric
values while keeping the migration safe for SQLite and PostgreSQL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'ba094835959f'
down_revision: Union[str, Sequence[str], None] = 'c1fbe6c436a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    column = next(c for c in inspect(bind).get_columns("daily_journals") if c["name"] == "water_ml")
    if isinstance(column["type"], sa.Integer):
        return

    if bind.dialect.name == "postgresql":
        json_type = "jsonb_typeof" if "JSONB" in str(column["type"]).upper() else "json_typeof"
        op.execute(
            "ALTER TABLE daily_journals ALTER COLUMN water_ml TYPE INTEGER "
            f"USING CASE WHEN {json_type}(water_ml) = 'number' "
            "THEN (water_ml::text)::numeric::integer ELSE 0 END"
        )
        op.execute("ALTER TABLE daily_journals ALTER COLUMN water_ml SET DEFAULT 0")
        op.execute("UPDATE daily_journals SET water_ml = 0 WHERE water_ml IS NULL")
        op.execute("ALTER TABLE daily_journals ALTER COLUMN water_ml SET NOT NULL")
    elif bind.dialect.name == "sqlite":
        with op.batch_alter_table("daily_journals") as batch_op:
            batch_op.alter_column(
                "water_ml",
                existing_type=column["type"],
                type_=sa.Integer(),
                existing_nullable=False,
                server_default="0",
            )
        op.execute("UPDATE daily_journals SET water_ml = 0 WHERE water_ml IS NULL")
    else:
        op.alter_column(
            "daily_journals", "water_ml", existing_type=column["type"], type_=sa.Integer()
        )


def downgrade() -> None:
    # No conversion back to JSON: that would make an ordinary integer ambiguous.
    pass
