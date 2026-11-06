"""unique constraint on (date, session_id, exercise_id)

Revision ID: f3a1b8c2d4e5
Revises: c5d9a0897e46
Create Date: 2026-08-23 00:00:00.000000

Voraussetzung: vor `upgrade` muss der Datenbestand duplikatfrei sein
(Node hatte bisher einen eigenen, unkoordinierten SQLite-Writer parallel
zu diesem hier — Race-Duplikate sind plausibel). Dedup-Query vorab:

    SELECT date, session_id, exercise_id, COUNT(*) c
    FROM training_history GROUP BY 1,2,3 HAVING c > 1;

Bei Treffern vor der Migration bereinigen:

    DELETE FROM training_history WHERE id NOT IN (
      SELECT MAX(id) FROM training_history GROUP BY date, session_id, exercise_id
    );
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a1b8c2d4e5'
down_revision: Union[str, Sequence[str], None] = 'c5d9a0897e46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('training_history', schema=None) as batch_op:
        batch_op.create_unique_constraint(
            'uq_training_history_date_session_exercise',
            ['date', 'session_id', 'exercise_id'],
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('training_history', schema=None) as batch_op:
        batch_op.drop_constraint(
            'uq_training_history_date_session_exercise',
            type_='unique',
        )
