"""Add performance indexes on users and workflow_sessions.

Revision ID: 20260225_010
Revises: 20260225_009
Create Date: 2026-02-25

Adds:
- ix_users_last_login            — speeds up admin queries filtering by last login date
- ix_users_email_verified        — speeds up auth flow checks for unverified users
- ix_workflow_sessions_current_agent — speeds up dashboard queries grouping by active agent
"""
from alembic import op


revision = "20260225_010"
down_revision = "20260225_009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_users_last_login", "users", ["last_login"])
    op.create_index("ix_users_email_verified", "users", ["email_verified"])
    op.create_index(
        "ix_workflow_sessions_current_agent",
        "workflow_sessions",
        ["current_agent"],
    )


def downgrade() -> None:
    op.drop_index("ix_workflow_sessions_current_agent", table_name="workflow_sessions")
    op.drop_index("ix_users_email_verified", table_name="users")
    op.drop_index("ix_users_last_login", table_name="users")
