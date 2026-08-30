"""add missing updated_at columns (users, subscriptions)

Revision ID: 0002_add_updated_at
Revises: 0001_initial
Create Date: 2026-08-30 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0002_add_updated_at"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # app/models/user.py'dagi User va Subscription modellari updated_at ustunini
    # e'lon qilgan, lekin 0001_initial migratsiyasida bu ustun yaratilmagan edi -
    # natijada har qanday SELECT (masalan /auth/register, /auth/login) haqiqiy
    # Postgres'da "column users.updated_at does not exist" xatosi bilan yiqilardi.
    op.add_column(
        "users",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "updated_at")
    op.drop_column("users", "updated_at")
