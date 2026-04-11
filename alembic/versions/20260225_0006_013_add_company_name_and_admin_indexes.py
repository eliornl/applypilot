"""Add indexes for company_name search and is_admin lookup

Revision ID: 20260225_013
Revises: 20260225_012
Create Date: 2026-02-25
"""

from alembic import op

revision = "20260225_013"
down_revision = "20260225_012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Case-insensitive functional index for company_name filtering and sorting
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_job_applications_company_name_lower "
        "ON job_applications (lower(company_name))"
    )
    # Index for admin-check queries (WHERE is_admin = TRUE)
    op.create_index(
        "ix_users_is_admin",
        "users",
        ["is_admin"],
        postgresql_where="is_admin = TRUE",
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_job_applications_company_name_lower")
    op.drop_index("ix_users_is_admin", table_name="users")
