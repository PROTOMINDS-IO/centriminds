"""Initial schema.

Revision ID: 0001
Revises:
Create Date: 2026-10-02

Accounts, their machine profiles and projects; a project's measurement
metadata, annotations and analysis runs. `app/models.py` describes the same
tables (tests/test_migrations.py compares the two).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)

    op.create_table(
        "machine_profile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("builtin_key", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("builtin_key"),
    )
    op.create_index("ix_machine_profile_user_id", "machine_profile", ["user_id"])

    op.create_table(
        "project",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("notes_markdown", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("odx_filename", sa.String(), nullable=False),
        sa.Column("odx_hash", sa.String(), nullable=False),
        sa.Column("n_blocks", sa.Integer(), nullable=False),
        sa.Column("bin_count", sa.Integer(), nullable=False),
        sa.Column("freq_min_hz", sa.Float(), nullable=False),
        sa.Column("freq_max_hz", sa.Float(), nullable=False),
        sa.Column("freq_step_hz", sa.Float(), nullable=False),
        sa.Column("rpm_min", sa.Float(), nullable=False),
        sa.Column("rpm_max", sa.Float(), nullable=False),
        sa.Column("odx_header_path", sa.String(), nullable=True),
        sa.Column("odx_export_human", sa.String(), nullable=True),
        sa.Column("odx_format_version", sa.String(), nullable=True),
        sa.Column("bowl_diameter_mm", sa.Float(), nullable=True),
        sa.Column("machine_profile_id", sa.Integer(), nullable=True),
        sa.Column("detected_profile_id", sa.Integer(), nullable=True),
        sa.Column(
            "machine_profile_chosen", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("machine_parameters", sa.JSON(), nullable=False, server_default="{}"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["machine_profile_id"],
            ["machine_profile.id"],
            name="fk_project_machine_profile_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["detected_profile_id"],
            ["machine_profile.id"],
            name="fk_project_detected_profile_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
    )
    op.create_index("ix_project_machine_profile_id", "project", ["machine_profile_id"])
    op.create_index("ix_project_name", "project", ["name"])
    op.create_index("ix_project_odx_hash", "project", ["odx_hash"])
    op.create_index("ix_project_user_id", "project", ["user_id"])

    op.create_table(
        "measurement_metadata",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("sensor_location", sa.String(), nullable=True),
        sa.Column("sensor_direction", sa.String(), nullable=True),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("operator", sa.String(), nullable=True),
        sa.Column("site", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id"),
    )

    op.create_table(
        "annotation",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("annotation_type", sa.String(), nullable=False),
        sa.Column("freq_hz", sa.Float(), nullable=True),
        sa.Column("freq_hz_end", sa.Float(), nullable=True),
        sa.Column("rpm", sa.Float(), nullable=True),
        sa.Column("amplitude", sa.Float(), nullable=True),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        sa.Column("author", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("payload_json", sa.String(), nullable=False),
        sa.Column("rpm_end", sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
    )
    op.create_index("ix_annotation_project_id", "annotation", ["project_id"])

    op.create_table(
        "analysis_run",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("params_json", sa.String(), nullable=False),
        sa.Column("results_json", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
    )
    op.create_index("ix_analysis_run_project_id", "analysis_run", ["project_id"])


def downgrade() -> None:
    # Dropping a table drops its indexes with it.
    for table in (
        "analysis_run",
        "annotation",
        "measurement_metadata",
        "project",
        "machine_profile",
        "user",
    ):
        op.drop_table(table)
