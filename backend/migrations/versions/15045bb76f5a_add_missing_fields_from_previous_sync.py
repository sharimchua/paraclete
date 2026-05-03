"""Add missing fields from previous sync

Revision ID: 15045bb76f5a
Revises: 3f638d72b588
Create Date: 2026-04-10 19:00:56.531861

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "15045bb76f5a"
down_revision: Union[str, Sequence[str], None] = "3f638d72b588"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Surgical column additions to messages
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.add_column(sa.Column("date", sa.String(), nullable=True))
        batch_op.alter_column(
            "is_inbound",
            existing_type=sa.BOOLEAN(),
            nullable=True,
            existing_server_default=sa.text("'0'"),
        )
        batch_op.create_index(batch_op.f("ix_messages_date"), ["date"], unique=False)
        # Avoid dropping/creating fks as it blocks SQLite upgrade due to naming mismatches


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_messages_date"))
        batch_op.drop_column("date")
