"""Add file chapter homework table

Revision ID: e1f2a3b4c5d6
Revises: d7e8f9a0b1c2
Create Date: 2026-03-26 21:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "file_chapter_homework",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("file_id", sa.String(), nullable=False),
        sa.Column("chapter_title", sa.Text(), nullable=False),
        sa.Column("chapter_start_page", sa.Integer(), nullable=False),
        sa.Column("chapter_end_page", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("questions", sa.JSON(), nullable=False),
        sa.Column("answer_markdown", sa.Text(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["file_id"], ["file.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_file_chapter_homework_file_id", "file_chapter_homework", ["file_id"])


def downgrade() -> None:
    op.drop_index("ix_file_chapter_homework_file_id", table_name="file_chapter_homework")
    op.drop_table("file_chapter_homework")
