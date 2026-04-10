"""Uplevel messages to core concept

Revision ID: 3f638d72b588
Revises: 347272763bf0
Create Date: 2026-04-10 15:28:43.527074

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f638d72b588'
down_revision: Union[str, Sequence[str], None] = '347272763bf0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Only add missing columns to messages, avoiding failing constraint drops
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sent_text', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('status', sa.Enum('DRAFT', 'SENT', 'ARCHIVED', name='messagestatus'), nullable=True))
        batch_op.add_column(sa.Column('is_inbound', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('person_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('group_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('persona_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))
        
        # We try to create fks. If they exist without names, this might still trigger batch mode reconstruction.
        batch_op.create_foreign_key(batch_op.f('fk_messages_group_id_groups'), 'groups', ['group_id'], ['id'], ondelete='CASCADE')
        batch_op.create_foreign_key(batch_op.f('fk_messages_persona_id_personas'), 'personas', ['persona_id'], ['id'])
        batch_op.create_foreign_key(batch_op.f('fk_messages_person_id_persons'), 'persons', ['person_id'], ['id'], ondelete='CASCADE')

def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_column('updated_at')
        batch_op.drop_column('created_at')
        batch_op.drop_column('persona_id')
        batch_op.drop_column('group_id')
        batch_op.drop_column('person_id')
        batch_op.drop_column('is_inbound')
        batch_op.drop_column('status')
        batch_op.drop_column('sent_text')
