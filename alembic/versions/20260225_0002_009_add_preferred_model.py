"""Add preferred_model to user_workflow_preferences.

Revision ID: 20260225_009
Revises: 20260225_008
Create Date: 2026-02-25

Adds:
- preferred_model VARCHAR(64) nullable — Gemini model name chosen by the user
  for BYOK mode. NULL means "use the system default". Ignored when the server
  uses Vertex AI.
"""
from alembic import op
import sqlalchemy as sa


revision = "20260225_009"
down_revision = "20260225_008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_workflow_preferences",
        sa.Column("preferred_model", sa.String(64), nullable=True, server_default=None),
    )


def downgrade() -> None:
    op.drop_column("user_workflow_preferences", "preferred_model")
