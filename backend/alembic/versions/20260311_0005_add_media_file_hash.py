"""add file_hash column to inspection_media for duplicate detection

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'inspection_media',
        sa.Column('file_hash', sa.String(length=64), nullable=True),
    )
    op.create_index(
        'ix_inspection_media_file_hash',
        'inspection_media',
        ['file_hash'],
    )


def downgrade() -> None:
    op.drop_index('ix_inspection_media_file_hash', table_name='inspection_media')
    op.drop_column('inspection_media', 'file_hash')
