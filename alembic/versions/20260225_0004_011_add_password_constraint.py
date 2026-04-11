"""Add check constraint enforcing password_hash for local auth users.

Revision ID: 20260225_011
Revises: 20260225_010
Create Date: 2026-02-25

Adds:
- ck_users_local_auth_has_password — ensures password_hash IS NOT NULL
  whenever auth_method = 'local', preventing accounts that cannot be logged
  into from ever being created.
"""
from alembic import op


revision = "20260225_011"
down_revision = "20260225_010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_users_local_auth_has_password",
        "users",
        "(auth_method != 'local') OR (password_hash IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_users_local_auth_has_password",
        "users",
        type_="check",
    )
