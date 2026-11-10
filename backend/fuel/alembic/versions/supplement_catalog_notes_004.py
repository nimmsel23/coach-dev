"""Persist notes on supplement catalog items.

Revision ID: supplement_catalog_notes_004
Revises: water_ml_integer_003
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "supplement_catalog_notes_004"
down_revision: Union[str, Sequence[str], None] = "water_ml_integer_003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("supplement_catalog", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("supplement_catalog", "notes")
