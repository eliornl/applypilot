"""Replace uq_user_job_company with partial unique index that excludes soft-deleted rows.

The old full unique constraint prevents reusing a (user, job_title, company_name) slot
after an application has been soft-deleted, causing IntegrityError on the next workflow
run for the same job. The partial index only enforces uniqueness among active rows.

Revision ID: 20260327_015
Revises: 20260306_014
Create Date: 2026-03-27
"""

from alembic import op

revision = "20260327_015"
down_revision = "20260306_014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS uq_user_job_company")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_job_company_active "
        "ON job_applications (user_id, job_title, company_name) "
        "WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_user_job_company_active")
    op.execute(
        "ALTER TABLE job_applications ADD CONSTRAINT uq_user_job_company "
        "UNIQUE (user_id, job_title, company_name)"
    )
