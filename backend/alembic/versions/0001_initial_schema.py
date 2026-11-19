"""Initial PostgreSQL schema migration for ModelOps360.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('Admin', 'ML_Engineer', 'Viewer')", name="ck_users_role"),
    )
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False, unique=True),
        sa.Column("domain", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "dataset_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("dataset_id", sa.String(64), sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("version_hash", sa.String(64), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("storage_uri", sa.Text(), nullable=False),
        sa.Column("validation_passed", sa.Boolean(), nullable=False),
        sa.Column("validation_report", sa.JSON(), nullable=False),
        sa.Column("eda_summary", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("dataset_id", "version_number", name="uq_dataset_version_num"),
    )
    op.create_table(
        "models",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False, unique=True),
        sa.Column("use_case", sa.String(64), nullable=False),
        sa.Column("production_version_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "retraining_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False, unique=True),
        sa.Column("model_id", sa.String(64), sa.ForeignKey("models.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("challenger_version_id", sa.String(64), nullable=True),
        sa.Column("champion_version_id", sa.String(64), nullable=True),
        sa.Column("decision", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("retraining_jobs")
    op.drop_table("models")
    op.drop_table("dataset_versions")
    op.drop_table("datasets")
    op.drop_table("users")
