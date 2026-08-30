"""initial schema with pgvector

Revision ID: 0001_initial
Revises:
Create Date: 2025-01-01 00:00:00

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgvector extension yoqish — MUHIM: bu migratsiya birinchi ishlatiladi
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("telegram_id", sa.String(50), unique=True, nullable=True, index=True),
        sa.Column("telegram_username", sa.String(100), nullable=True),
        sa.Column("lang", sa.Enum("uz", "ru", "en", name="langenum"), nullable=False, server_default="uz"),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="Asia/Tashkent"),
        sa.Column("plan", sa.Enum("free", "pro", "team", "enterprise", name="planenum"), nullable=False, server_default="free"),
        sa.Column("streak", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_streak", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_active", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("onboarding_completed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("notify_daily", sa.Boolean, server_default="true"),
        sa.Column("notify_time", sa.String(5), server_default="09:00"),
        sa.Column("notify_streak", sa.Boolean, server_default="true"),
        sa.Column("notify_sr", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "curricula",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic", sa.String(500), nullable=False),
        sa.Column("level", sa.Enum("beginner", "intermediate", "advanced", name="levelenum"), nullable=False),
        sa.Column("total_weeks", sa.Integer, server_default="12"),
        sa.Column("daily_minutes", sa.Integer, server_default="30"),
        sa.Column("status", sa.Enum("active", "paused", "completed", name="curriculumstatus"), server_default="active"),
        sa.Column("curriculum_data", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "lessons",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("curriculum_id", sa.Integer, sa.ForeignKey("curricula.id", ondelete="CASCADE"), nullable=False),
        sa.Column("week", sa.Integer, nullable=False),
        sa.Column("day", sa.Integer, nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.JSON, nullable=True),
        sa.Column("status", sa.Enum("pending", "in_progress", "completed", name="lessonstatus"), server_default="pending"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("message_type", sa.String(20), server_default="text"),
        sa.Column("tokens_used", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "memories",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("importance", sa.Float, server_default="1.0"),
        sa.Column("memory_type", sa.String(50), server_default="fact"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # pgvector cosine similarity uchun HNSW indeks
    op.execute(
        "CREATE INDEX memories_embedding_idx ON memories "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "homeworks",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("lesson_id", sa.Integer, sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("user_answer", sa.Text, nullable=True),
        sa.Column("ai_feedback", sa.Text, nullable=True),
        sa.Column("score", sa.Integer, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "spaced_items",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("lesson_id", sa.Integer, sa.ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("front", sa.Text, nullable=False),
        sa.Column("back", sa.Text, nullable=False),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("interval_days", sa.Float, server_default="1.0"),
        sa.Column("ease_factor", sa.Float, server_default="2.5"),
        sa.Column("repetitions", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan", sa.Enum("free", "pro", "team", "enterprise", name="planenum"), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(255), unique=True, nullable=True),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("channel", sa.Enum("telegram", "email", "in_app", name="notificationchannel"), server_default="telegram"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "referrals",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("referrer_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("referred_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("code", sa.String(20), unique=True, nullable=False, index=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("reward_given", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("referrals")
    op.drop_table("notifications")
    op.drop_table("subscriptions")
    op.drop_table("spaced_items")
    op.drop_table("homeworks")
    op.execute("DROP INDEX IF EXISTS memories_embedding_idx")
    op.drop_table("memories")
    op.drop_table("messages")
    op.drop_table("lessons")
    op.drop_table("curricula")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
