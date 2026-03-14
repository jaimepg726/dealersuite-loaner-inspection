"""Direct-to-Drive architecture: remove BYTEA storage, add indexes, add drive_file_id

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
    # ── Add missing index on inspections.started_at for date-range queries ──
    op.create_index(
        'ix_inspections_started_at',
        'inspections',
        ['started_at'],
    )

    # ── Add drive_file_id to inspection_media (VARCHAR replaces BYTEA) ──────
    op.add_column(
        'inspection_media',
        sa.Column('drive_file_id', sa.String(200), nullable=True),
    )

    # ── Drop the BYTEA file_data column (was storing raw media in Postgres) ─
    # Use IF EXISTS guard via raw SQL so the migration is idempotent on DBs
    # that were already migrated manually.
    op.execute(
        "ALTER TABLE inspection_media DROP COLUMN IF EXISTS file_data"
    )

    # ── Add index on inspection_media.created_at ────────────────────────────
    op.create_index(
        'ix_inspection_media_created_at',
        'inspection_media',
        ['created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_inspection_media_created_at', table_name='inspection_media')
    op.add_column(
        'inspection_media',
        sa.Column('file_data', sa.LargeBinary(), nullable=True),
    )
    op.drop_column('inspection_media', 'drive_file_id')
    op.drop_index('ix_inspections_started_at', table_name='inspections')
