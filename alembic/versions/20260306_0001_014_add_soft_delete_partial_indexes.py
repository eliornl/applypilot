"""Add partial indexes for soft-delete queries on job_applications

Replaces full-table-scan filter on deleted_at IS NULL with efficient
partial indexes scoped to non-deleted rows only. Queries that include
deleted_at IS NULL (the default for all soft-delete reads) now hit the
much smaller partial index instead of scanning all rows.

Revision ID: 20260306_014
Revises: 20260225_013
Create Date: 2026-03-06
"""

from alembic import op

revision = "20260306_014"
down_revision = "20260225_013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial index: active applications by user + status (most common query)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_job_applications_user_status_active "
        "ON job_applications (user_id, status) "
        "WHERE deleted_at IS NULL"
    )

    # Partial index: active applications by user + created_at (for pagination)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_job_applications_user_created_active "
        "ON job_applications (user_id, created_at DESC) "
        "WHERE deleted_at IS NULL"
    )

    # Partial index: active applications by user alone (for count queries)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_job_applications_user_active "
        "ON job_applications (user_id) "
        "WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_job_applications_user_status_active", table_name="job_applications")
    op.drop_index("ix_job_applications_user_created_active", table_name="job_applications")
    op.drop_index("ix_job_applications_user_active", table_name="job_applications")
