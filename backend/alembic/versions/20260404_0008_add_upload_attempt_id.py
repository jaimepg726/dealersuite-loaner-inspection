"""Add upload_attempt_id to inspection_media for idempotent video upload dedup

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-04

Adds a nullable upload_attempt_id (UUID string) to inspection_media.
The frontend generates one UUID per completed recording and passes it
through both the direct-Drive path (/upload-session) and the legacy
fallback path (/upload).  The backend stores it and uses it as a
secondary idempotency key so the same recording attempt cannot produce
two finalized media records regardless of which upload path completes.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inspection_media",
        sa.Column("upload_attempt_id", sa.String(36), nullable=True),
    )
    # Composite index: fast lookup when deduping on (inspection_id, attempt_id)
    op.create_index(
        "ix_inspection_media_attempt_id",
        "inspection_media",
        ["inspection_id", "upload_attempt_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_inspection_media_attempt_id", table_name="inspection_media")
    op.drop_column("inspection_media", "upload_attempt_id")
