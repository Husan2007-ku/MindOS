"""add gamification (xp, badges) and telegram account linking

Revision ID: 0004_add_gamification_telegram
Revises: 0003_add_sources
Create Date: 2026-08-31 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0004_add_gamification_telegram"
down_revision = "0003_add_sources"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("xp", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("telegram_link_code", sa.String(length=16), nullable=True))
    op.add_column("users", sa.Column("telegram_link_code_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_daily_reminder_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_users_telegram_link_code"), "users", ["telegram_link_code"], unique=True)

    op.create_table(
        "user_badges",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("badge_key", sa.String(length=50), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "badge_key", name="uq_user_badge"),
    )
    op.create_index(op.f("ix_user_badges_user_id"), "user_badges", ["user_id"])


def downgrade():
    op.drop_index(op.f("ix_user_badges_user_id"), table_name="user_badges")
    op.drop_table("user_badges")
    op.drop_index(op.f("ix_users_telegram_link_code"), table_name="users")
    op.drop_column("users", "last_daily_reminder_at")
    op.drop_column("users", "telegram_link_code_expires")
    op.drop_column("users", "telegram_link_code")
    op.drop_column("users", "xp")
