"""add app_settings table

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'app_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key', sa.String(120), nullable=False, unique=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('created_at',sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
        sa.Column('updated_at',sa.DateTime(timezone=True),unullable=False,server_default=sa.func.now()),
    )
    op.create_index('ix_app_settings_key','app_settings',['key'],unique=True)


def downgrade():
    op.drop_index('ix_app_settings_key',table_name='app_settings')
    op.drop_table('app_settings')
