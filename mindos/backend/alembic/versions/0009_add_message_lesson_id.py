"""add lesson_id to messages (per-lesson chat separation)

Revision ID: 0009_add_message_lesson_id
Revises: 0008_add_streak_freeze_referral
Create Date: 2026-09-02 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0009_add_message_lesson_id"
down_revision = "0008_add_streak_freeze_referral"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "messages",
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index(op.f("ix_messages_lesson_id"), "messages", ["lesson_id"], unique=False)
    # Mavjud xabarlar lesson_id=NULL bo'lib qoladi — ular "umumiy suhbat"
    # bo'limiga tushadi, hech narsa o'chirilmaydi/yo'qolmaydi.


def downgrade():
    op.drop_index(op.f("ix_messages_lesson_id"), table_name="messages")
    op.drop_column("messages", "lesson_id")
