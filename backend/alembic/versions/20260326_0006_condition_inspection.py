"""Condition inspection type: nullable vehicle_id, vin_override column

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Allow condition inspections to have no linked vehicle
    op.alter_column(
        'inspections', 'vehicle_id',
        existing_type=sa.Integer(),
        nullable=True,
    )
    # Store raw VIN or last-7 for vehicle-less condition inspections
    op.add_column(
        'inspections',
        sa.Column('vin_override', sa.String(32), nullable=True),
    )


def downgrade() -> None:
    raise Exception("Downgrade not supported after condition inspections may exist")
