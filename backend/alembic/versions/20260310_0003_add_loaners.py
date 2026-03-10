"""add loaners table
Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa
revision='0003';down_revision='0002';branch_labels=None;depends_on=None
def upgrade():
  op.create_table('loaners',
    sa.Column('id',sa.Integer(),primary_key=True),
    sa.Column('vehicle_id',sa.Integer(),sa.ForeignKey('vehicles.id'),nullable=False),
    sa.Column('customer_name',sa.String(100),nullable=False),
    sa.Column('customer_phone',sa.String(20)),
    sa.Column('customer_email',sa.String(120)),
    sa.Column('ro_number',sa.String(30)),
    sa.Column('advisor_name',sa.String(80)),
    sa.Column('status',sa.String(20),nullable=False,server_default='Out'),
    sa.Column('mileage_out',sa.Integer()),
    sa.Column('mileage_in',sa.Integer()),
    sa.Column('fuel_out',sa.String(10)),
    sa.Column('fuel_in',sa.String(10)),
    sa.Column('checked_out_at',sa.DateTime(),nullable=False),
    sa.Column('checked_in_at',sa.DateTime()),
    sa.Column('notes',sa.Text()),
    sa.Column('created_by',sa.Integer(),sa.ForeignKey('users.id')),
  )
  op.create_index('ix_loaners_vid','loaners',['vehicle_id'])
  op.create_index('ix_loaners_status','loaners',['status'])
def downgrade(): op.drop_table('loaners')
