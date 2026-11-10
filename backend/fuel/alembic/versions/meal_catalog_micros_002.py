"""Keep meal micro profiles and source metadata in the catalog.

Revision ID: meal_catalog_micros_002
Revises: add_journal_text_frames_001
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "meal_catalog_micros_002"
down_revision: Union[str, Sequence[str], None] = "add_journal_text_frames_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meal_catalog",
        sa.Column("micros", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "meal_catalog",
        sa.Column("micros_meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("meal_catalog", "micros_meta")
    op.drop_column("meal_catalog", "micros")
