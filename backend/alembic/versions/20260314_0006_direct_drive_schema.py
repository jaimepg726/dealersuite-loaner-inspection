"""Direct-to-Drive architecture: add new Drive fields + indexes.
NOTE: file_data (BYTEA) is intentionally NOT dropped — legacy records need backfilling.

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-14
"""
from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New Direct-to-Drive columns on inspection_media ─────────────────────
    op.add_column('inspection_media', sa.Column('drive_file_id', sa.String(200), nullable=True))
    op.add_column('inspection_media', sa.Column('drive_url',     sa.String(500), nullable=True))
    op.add_column('inspection_media', sa.Column('file_size',     sa.Integer(),   nullable=True))
    op.add_column('inspection_media', sa.Column('uploaded_at',   sa.DateTime(timezone=True), nullable=True))

    # ── Indexes for common query patterns ────────────────────────────────────
    op.create_index('ix_inspection_media_created_at', 'inspection_media', ['created_at'])
    op.create_index('ix_inspections_started_at',      'inspections',      ['started_at'])


def downgrade() -> None:
    op.drop_index('ix_inspections_started_at',      table_name='inspections')
    op.drop_index('ix_inspection_media_created_at', table_name='inspection_media')
    op.drop_column('inspection_media', 'uploaded_at')
    op.drop_column('inspection_media', 'file_size')
    op.drop_column('inspection_media', 'drive_url')
    op.drop_column('inspection_media', 'drive_file_id')
