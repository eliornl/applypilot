"""Add email verification fields to users table.

Revision ID: 20260121_005
Revises: 004
Create Date: 2026-01-21

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260121_005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add email_verified and email_verified_at columns to users table."""
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    
    # Set existing Google OAuth users as verified (they have verified emails via Google)
    op.execute("""
        UPDATE users 
        SET email_verified = true, email_verified_at = created_at 
        WHERE google_id IS NOT NULL
    """)


def downgrade() -> None:
    """Remove email verification columns."""
    op.drop_column('users', 'email_verified_at')
    op.drop_column('users', 'email_verified')
