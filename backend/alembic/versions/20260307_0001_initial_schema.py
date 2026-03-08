"""initial schema — users, vehicles, inspections, damages

Revision ID: 0001
Revises:
Create Date: 2026-03-07

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # users
    # -----------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id",              sa.Integer(),     primary_key=True),
        sa.Column("name",            sa.String(120),   nullable=False),
        sa.Column("email",           sa.String(255),   nullable=False),
        sa.Column("hashed_password", sa.String(255),   nullable=False),
        sa.Column("role",            sa.String(20),    nullable=False, server_default="porter"),
        sa.Column("is_active",       sa.Boolean(),     nullable=False, server_default="true"),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login",      sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # -----------------------------------------------------------------------
    # vehicles
    # -----------------------------------------------------------------------
    op.create_table(
        "vehicles",
        sa.Column("id",               sa.Integer(),     primary_key=True),
        sa.Column("loaner_number",    sa.String(20),    nullable=True),
        sa.Column("vin",              sa.String(17),    nullable=False),
        sa.Column("year",             sa.Integer(),     nullable=True),
        sa.Column("make",             sa.String(50),    nullable=True),
        sa.Column("model",            sa.String(80),    nullable=True),
        sa.Column("plate",            sa.String(20),    nullable=True),
        sa.Column("mileage",          sa.Integer(),     nullable=True),
        sa.Column("color",            sa.String(30),    nullable=True),
        sa.Column("status",           sa.String(20),    nullable=False, server_default="Active"),
        sa.Column("vehicle_type",     sa.String(20),    nullable=False, server_default="Loaner"),
        sa.Column("is_active",        sa.Boolean(),     nullable=False, server_default="true"),
        sa.Column("drive_folder_url", sa.String(500),   nullable=True),
        sa.Column("drive_folder_id",  sa.String(200),   nullable=True),
        sa.Column("created_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_vehicles_vin",          "vehicles", ["vin"],          unique=True)
    op.create_index("ix_vehicles_loaner_number","vehicles", ["loaner_number"], unique=False)

    # -----------------------------------------------------------------------
    # inspections
    # -----------------------------------------------------------------------
    op.create_table(
        "inspections",
        sa.Column("id",               sa.Integer(),   primary_key=True),
        sa.Column("vehicle_id",       sa.Integer(),   sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inspector_id",     sa.Integer(),   sa.ForeignKey("users.id",    ondelete="SET NULL"), nullable=True),
        sa.Column("inspection_type",  sa.String(20),  nullable=False),
        sa.Column("status",           sa.String(20),  nullable=False, server_default="In Progress"),
        sa.Column("inspector_name",   sa.String(120), nullable=True),
        sa.Column("drive_folder_url", sa.String(500), nullable=True),
        sa.Column("drive_folder_id",  sa.String(200), nullable=True),
        sa.Column("video_url",        sa.String(500), nullable=True),
        sa.Column("video_drive_id",   sa.String(200), nullable=True),
        sa.Column("photo_count",      sa.Integer(),   nullable=False, server_default="0"),
        sa.Column("notes",            sa.Text(),      nullable=True),
        sa.Column("started_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at",     sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_inspections_vehicle_id",  "inspections", ["vehicle_id"])
    op.create_index("ix_inspections_inspector_id","inspections", ["inspector_id"])

    # -----------------------------------------------------------------------
    # damages
    # -----------------------------------------------------------------------
    op.create_table(
        "damages",
        sa.Column("id",            sa.Integer(),  primary_key=True),
        sa.Column("inspection_id", sa.Integer(),  sa.ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("location",      sa.String(30), nullable=True),
        sa.Column("description",   sa.Text(),     nullable=True),
        sa.Column("photo_drive_id",sa.String(200),nullable=True),
        sa.Column("photo_url",     sa.String(500),nullable=True),
        sa.Column("repair_order",  sa.String(50), nullable=True),
        sa.Column("status",        sa.String(20), nullable=False, server_default="Open"),
        sa.Column("manager_notes", sa.Text(),     nullable=True),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_damages_inspection_id", "damages", ["inspection_id"])
    op.create_index("ix_damages_status",        "damages", ["status"])
    op.create_index("ix_damages_repair_order",  "damages", ["repair_order"])


def downgrade() -> None:
    op.drop_table("damages")
    op.drop_table("inspections")
    op.drop_table("vehicles")
    op.drop_table("users")
