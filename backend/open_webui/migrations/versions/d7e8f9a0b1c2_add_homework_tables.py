"""Add homework tables

Revision ID: d7e8f9a0b1c2
Revises: a1b2c3d4e5f6
Create Date: 2026-03-06 23:20:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

HOMEWORK_TABLE_NAME = "homework_v2"
HOMEWORK_QUESTION_TABLE_NAME = "homework_question_v2"
HOMEWORK_SUBMISSION_TABLE_NAME = "homework_submission_v2"
HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME = "homework_submission_answer_v2"


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        HOMEWORK_TABLE_NAME,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("source_file", sa.Text(), nullable=True),
        sa.Column("source_file_id", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("difficulty_config", sa.JSON(), nullable=True),
        sa.Column("question_type_config", sa.JSON(), nullable=True),
        sa.Column("knowledge_points", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_homework_v2_user_id", HOMEWORK_TABLE_NAME, ["user_id"])

    op.create_table(
        HOMEWORK_QUESTION_TABLE_NAME,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("homework_id", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("difficulty", sa.String(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["homework_id"], [f"{HOMEWORK_TABLE_NAME}.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_homework_question_v2_homework_id",
        HOMEWORK_QUESTION_TABLE_NAME,
        ["homework_id"],
    )

    op.create_table(
        HOMEWORK_SUBMISSION_TABLE_NAME,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("homework_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_questions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["homework_id"], [f"{HOMEWORK_TABLE_NAME}.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_homework_submission_v2_homework_id",
        HOMEWORK_SUBMISSION_TABLE_NAME,
        ["homework_id"],
    )
    op.create_index(
        "ix_homework_submission_v2_user_id",
        HOMEWORK_SUBMISSION_TABLE_NAME,
        ["user_id"],
    )

    op.create_table(
        HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("submission_id", sa.String(), nullable=False),
        sa.Column("question_id", sa.String(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["submission_id"], [f"{HOMEWORK_SUBMISSION_TABLE_NAME}.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["question_id"], [f"{HOMEWORK_QUESTION_TABLE_NAME}.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_homework_submission_answer_v2_submission_id",
        HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME,
        ["submission_id"],
    )
    op.create_index(
        "ix_homework_submission_answer_v2_question_id",
        HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME,
        ["question_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_homework_submission_answer_v2_question_id",
        table_name=HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME,
    )
    op.drop_index(
        "ix_homework_submission_answer_v2_submission_id",
        table_name=HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME,
    )
    op.drop_table(HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME)

    op.drop_index("ix_homework_submission_v2_user_id", table_name=HOMEWORK_SUBMISSION_TABLE_NAME)
    op.drop_index(
        "ix_homework_submission_v2_homework_id", table_name=HOMEWORK_SUBMISSION_TABLE_NAME
    )
    op.drop_table(HOMEWORK_SUBMISSION_TABLE_NAME)

    op.drop_index(
        "ix_homework_question_v2_homework_id", table_name=HOMEWORK_QUESTION_TABLE_NAME
    )
    op.drop_table(HOMEWORK_QUESTION_TABLE_NAME)

    op.drop_index("ix_homework_v2_user_id", table_name=HOMEWORK_TABLE_NAME)
    op.drop_table(HOMEWORK_TABLE_NAME)
