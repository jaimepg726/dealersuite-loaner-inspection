"""Add geo metadata fields to inspection_media

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('inspection_media', sa.Column('geo_latitude',          sa.Float(),        nullable=True))
    op.add_column('inspection_media', sa.Column('geo_longitude',         sa.Float(),        nullable=True))
    op.add_column('inspection_media', sa.Column('geo_accuracy_m',        sa.Float(),        nullable=True))
    op.add_column('inspection_media', sa.Column('geo_timestamp_utc',     sa.DateTime(timezone=True), nullable=True))
    op.add_column('inspection_media', sa.Column('geo_permission_status', sa.String(20),     nullable=True))
    op.add_column('inspection_media', sa.Column('overlay_burned_in',     sa.Boolean(),      nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('inspection_media', 'overlay_burned_in')
    op.drop_column('inspection_media', 'geo_permission_status')
    op.drop_column('inspection_media', 'geo_timestamp_utc')
    op.drop_column('inspection_media', 'geo_accuracy_m')
    op.drop_column('inspection_media', 'geo_longitude')
    op.drop_column('inspection_media', 'geo_latitude')
