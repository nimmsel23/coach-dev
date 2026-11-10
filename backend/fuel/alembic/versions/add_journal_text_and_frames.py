"""Add journal_text to DailyJournal and create FuelFrame table

Revision ID: add_journal_text_frames_001
Revises: ace7b68444e2
Create Date: 2026-07-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_journal_text_frames_001'
down_revision: Union[str, Sequence[str], None] = 'ace7b68444e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add journal_text column to daily_journals (Freitext-Tagebuch pro Tag)
    op.add_column('daily_journals', sa.Column('journal_text', sa.Text(), nullable=True, default=''))

    # Create fuel_frames table (Frame-Snapshots für Ernährungs-Anamnese)
    # Hinweis: server_default funktioniert nicht zuverlässig über DB-Dialekte hinweg,
    # stattdessen default im Python-Modell setzen
    op.create_table('fuel_frames',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),  # Python setzt default
    sa.Column('data', sa.JSON(), nullable=False),  # Anamnese-Felder als JSON-Blob
    sa.PrimaryKeyConstraint('id'),
    sa.Index('ix_fuel_frames_created_at', 'created_at')
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop fuel_frames table
    op.drop_index('ix_fuel_frames_created_at', table_name='fuel_frames')
    op.drop_table('fuel_frames')

    # Drop journal_text column from daily_journals
    op.drop_column('daily_journals', 'journal_text')
