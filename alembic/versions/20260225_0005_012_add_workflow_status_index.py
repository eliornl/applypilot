"""Add single-column index on workflow_sessions.workflow_status.

Revision ID: 20260225_012
Revises: 20260225_011
Create Date: 2026-02-25

Adds:
- ix_workflow_sessions_status — enables efficient admin/metrics queries that
  filter globally by status (e.g. "all running sessions") without a leading
  user_id prefix, which the existing composite index ix_workflow_user_status
  cannot serve.
"""
from alembic import op


revision = "20260225_012"
down_revision = "20260225_011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_workflow_sessions_status",
        "workflow_sessions",
        ["workflow_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_workflow_sessions_status", table_name="workflow_sessions")
