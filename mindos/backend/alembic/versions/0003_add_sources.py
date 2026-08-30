"""add sources + source_chunks (NotebookLM-style manba asosli o'rganish)

Revision ID: 0003_add_sources
Revises: 0002_add_updated_at
Create Date: 2026-08-30 00:00:00

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "0003_add_sources"
down_revision = "0002_add_updated_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sources",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("curriculum_id", sa.Integer, sa.ForeignKey("curricula.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("type", sa.Enum("file", "youtube", "text", name="sourcetype"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("origin", sa.String(1000), nullable=True),
        sa.Column("raw_text", sa.Text, nullable=True),
        sa.Column("status", sa.Enum("processing", "ready", "failed", name="sourcestatus"), nullable=False, server_default="processing"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("char_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "source_chunks",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("source_id", sa.Integer, sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
    )
    # pgvector cosine similarity uchun HNSW indeks (memories jadvalidagi bilan bir xil pattern)
    op.execute(
        "CREATE INDEX source_chunks_embedding_idx ON source_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS source_chunks_embedding_idx")
    op.drop_table("source_chunks")
    op.drop_table("sources")
    op.execute("DROP TYPE IF EXISTS sourcestatus")
    op.execute("DROP TYPE IF EXISTS sourcetype")
