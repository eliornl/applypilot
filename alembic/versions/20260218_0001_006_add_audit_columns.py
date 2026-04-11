"""Add audit/improvement columns: is_admin, agent_durations, deleted_at.

Revision ID: 20260218_006
Revises: 20260121_005
Create Date: 2026-02-18

Adds:
- users.is_admin          — boolean flag for admin-only endpoints
- workflow_sessions.agent_durations — JSONB map of per-agent timing (ms)
- job_applications.deleted_at       — soft-delete timestamp
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "20260218_006"
down_revision = "20260121_005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # users.is_admin
    # ------------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "is_admin",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )

    # ------------------------------------------------------------------
    # workflow_sessions.agent_durations
    # ------------------------------------------------------------------
    op.add_column(
        "workflow_sessions",
        sa.Column("agent_durations", JSONB(), nullable=True),
    )

    # ------------------------------------------------------------------
    # job_applications.deleted_at  (soft delete)
    # ------------------------------------------------------------------
    op.add_column(
        "job_applications",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Index makes filtered list queries fast (WHERE deleted_at IS NULL)
    op.create_index(
        "ix_job_applications_deleted_at",
        "job_applications",
        ["deleted_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_job_applications_deleted_at", table_name="job_applications")
    op.drop_column("job_applications", "deleted_at")
    op.drop_column("workflow_sessions", "agent_durations")
    op.drop_column("users", "is_admin")
