"""add streak-freeze and referral columns to users

Revision ID: 0008_add_streak_freeze_referral
Revises: 0007_add_push_subscriptions
Create Date: 2026-08-31 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0008_add_streak_freeze_referral"
down_revision = "0007_add_push_subscriptions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("streak_freezes", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("users", sa.Column("last_freeze_refill_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("referral_code", sa.String(length=12), nullable=True))
    op.add_column("users", sa.Column("referred_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("users", sa.Column("referral_rewarded", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index(op.f("ix_users_referral_code"), "users", ["referral_code"], unique=True)

    # server_default'lar faqat mavjud qatorlarni to'ldirish uchun — yangi INSERT'lar
    # ORM default'idan (Column(default=...)) foydalanadi, shuning uchun keyinchalik olib tashlaymiz
    op.alter_column("users", "streak_freezes", server_default=None)
    op.alter_column("users", "referral_rewarded", server_default=None)


def downgrade():
    op.drop_index(op.f("ix_users_referral_code"), table_name="users")
    op.drop_column("users", "referral_rewarded")
    op.drop_column("users", "referred_by_id")
    op.drop_column("users", "referral_code")
    op.drop_column("users", "last_freeze_refill_at")
    op.drop_column("users", "streak_freezes")
