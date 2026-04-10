"""Add superseded status and apply named constraints

Revision ID: 347272763bf0
Revises: 334a1444185e
Create Date: 2026-04-10 13:48:21.398214

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '347272763bf0'
down_revision: Union[str, Sequence[str], None] = '334a1444185e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('framework_proposals', schema=None) as batch_op:
        batch_op.alter_column('status',
               existing_type=sa.VARCHAR(length=8),
               type_=sa.Enum('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', name='frameworkproposalstatus'),
               existing_nullable=True)

def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('framework_proposals', schema=None) as batch_op:
        batch_op.alter_column('status',
               existing_type=sa.Enum('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', name='frameworkproposalstatus'),
               type_=sa.VARCHAR(length=8),
               existing_nullable=True)
