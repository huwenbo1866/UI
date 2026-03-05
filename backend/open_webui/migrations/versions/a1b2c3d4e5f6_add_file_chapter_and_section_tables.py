"""Add file_chapter and file_section tables

Revision ID: a1b2c3d4e5f6
Revises: 8452d01d26d7
Create Date: 2026-03-05 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "8452d01d26d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create file_chapter table
    op.create_table(
        "file_chapter",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("file_id", sa.String(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("start_page", sa.Integer(), nullable=False),
        sa.Column("end_page", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.BigInteger()),
        sa.ForeignKeyConstraint(["file_id"], ["file.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_file_chapter_file_id", "file_chapter", ["file_id"])

    # Create file_section table
    op.create_table(
        "file_section",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("file_id", sa.String(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.BigInteger()),
        sa.ForeignKeyConstraint(["file_id"], ["file.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_file_section_file_id", "file_section", ["file_id"])


def downgrade() -> None:
    op.drop_index("ix_file_section_file_id", table_name="file_section")
    op.drop_table("file_section")
    op.drop_index("ix_file_chapter_file_id", table_name="file_chapter")
    op.drop_table("file_chapter")
