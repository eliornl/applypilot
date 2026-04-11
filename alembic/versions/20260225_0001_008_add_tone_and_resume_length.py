"""Add cover_letter_tone and resume_length to user_workflow_preferences.

Revision ID: 20260225_008
Revises: 20260224_007
Create Date: 2026-02-25

Adds:
- cover_letter_tone VARCHAR(32)  — writing style for cover letters.
  Values: 'professional' (default) | 'conversational' | 'enthusiastic'
- resume_length    VARCHAR(16)  — verbosity of resume advice.
  Values: 'concise' (default) | 'detailed'
"""
from alembic import op
import sqlalchemy as sa


revision = "20260225_008"
down_revision = "20260224_007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_workflow_preferences",
        sa.Column(
            "cover_letter_tone",
            sa.String(32),
            nullable=False,
            server_default="professional",
        ),
    )
    op.add_column(
        "user_workflow_preferences",
        sa.Column(
            "resume_length",
            sa.String(16),
            nullable=False,
            server_default="concise",
        ),
    )


def downgrade() -> None:
    op.drop_column("user_workflow_preferences", "resume_length")
    op.drop_column("user_workflow_preferences", "cover_letter_tone")
