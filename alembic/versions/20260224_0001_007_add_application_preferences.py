"""Add user_workflow_preferences table.

Revision ID: 20260224_007
Revises: 20260218_006
Create Date: 2026-02-24

Adds:
- user_workflow_preferences — dedicated 1:1 table (keyed on user_id) that stores
  per-user workflow behaviour settings with typed columns and proper defaults:
    * workflow_gate_threshold FLOAT  — match-score threshold (0–1) that pauses the
      workflow for user confirmation. Default 0.5 (50%).
    * auto_generate_documents BOOL   — when true, resume advice and cover letter are
      generated automatically after company research. Default false (on-demand).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "20260224_007"
down_revision = "20260218_006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_workflow_preferences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "workflow_gate_threshold",
            sa.Float(),
            nullable=False,
            server_default="0.5",
        ),
        sa.Column(
            "auto_generate_documents",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_user_workflow_preferences_user_id",
        "user_workflow_preferences",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_user_workflow_preferences_user_id", table_name="user_workflow_preferences")
    op.drop_table("user_workflow_preferences")
