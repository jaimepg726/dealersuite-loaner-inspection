"""add storage fields to inspections

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('inspections', sa.Column('storage_key', sa.String(500), nullable=True))
    op.add_column('inspections', sa.Column('storage_backend', sa.String(20), nullable=False, server_default='local'))
    op.add_column('inspections', sa.Column('public_url', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('inspections', 'public_url')
    op.drop_column('inspections', 'storage_backend')
    op.drop_column('inspections', 'storage_key')
