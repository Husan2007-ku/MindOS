"""add free-tier daily tts quota fields to users

Revision ID: 0005_add_tts_quota
Revises: 0004_add_gamification_telegram
Create Date: 2026-08-31 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0005_add_tts_quota"
down_revision = "0004_add_gamification_telegram"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("tts_daily_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("tts_count_date", sa.String(length=10), nullable=True))


def downgrade():
    op.drop_column("users", "tts_count_date")
    op.drop_column("users", "tts_daily_count")
