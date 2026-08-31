"""add push_subscriptions table for web push notifications

Revision ID: 0007_add_push_subscriptions
Revises: 0006_add_analytics_events
Create Date: 2026-08-31 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0007_add_push_subscriptions"
down_revision = "0006_add_analytics_events"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(length=500), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_push_subscriptions_user_id"), "push_subscriptions", ["user_id"])


def downgrade():
    op.drop_index(op.f("ix_push_subscriptions_user_id"), table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
