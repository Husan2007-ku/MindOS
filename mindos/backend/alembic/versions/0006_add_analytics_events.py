"""add minimal analytics_events table for product funnel tracking

Revision ID: 0006_add_analytics_events
Revises: 0005_add_tts_quota
Create Date: 2026-08-31 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0006_add_analytics_events"
down_revision = "0005_add_tts_quota"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_analytics_events_user_id"), "analytics_events", ["user_id"])
    op.create_index(op.f("ix_analytics_events_event_type"), "analytics_events", ["event_type"])
    op.create_index(op.f("ix_analytics_events_created_at"), "analytics_events", ["created_at"])


def downgrade():
    op.drop_index(op.f("ix_analytics_events_created_at"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_event_type"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_user_id"), table_name="analytics_events")
    op.drop_table("analytics_events")
