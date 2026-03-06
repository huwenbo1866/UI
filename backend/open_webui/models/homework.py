import logging
import time
import uuid
from threading import Lock
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import BigInteger, Boolean, Column, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Session

from open_webui.internal.db import Base, engine, get_db_context

log = logging.getLogger(__name__)

HOMEWORK_TABLE_NAME = "homework_v2"
HOMEWORK_QUESTION_TABLE_NAME = "homework_question_v2"
HOMEWORK_SUBMISSION_TABLE_NAME = "homework_submission_v2"
HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME = "homework_submission_answer_v2"

_SCHEMA_READY = False
_SCHEMA_LOCK = Lock()


####################
# Homework DB Schema
####################


class Homework(Base):
    __tablename__ = HOMEWORK_TABLE_NAME

    id = Column(String, primary_key=True, unique=True)
    user_id = Column(String, nullable=False, index=True)
    title = Column(Text, nullable=False)
    source_file = Column(Text, nullable=True)
    source_file_id = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    difficulty_config = Column(JSON, nullable=True)
    question_type_config = Column(JSON, nullable=True)
    knowledge_points = Column(JSON, nullable=True)

    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)


class HomeworkQuestion(Base):
    __tablename__ = HOMEWORK_QUESTION_TABLE_NAME

    id = Column(String, primary_key=True, unique=True)
    homework_id = Column(
        String,
        ForeignKey(f"{HOMEWORK_TABLE_NAME}.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index = Column(Integer, nullable=False, default=0)

    type = Column(String, nullable=False)
    difficulty = Column(String, nullable=False)
    question = Column(Text, nullable=False)
    options = Column(JSON, nullable=True)
    answer = Column(Text, nullable=True)
    analysis = Column(Text, nullable=True)

    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)


class HomeworkSubmission(Base):
    __tablename__ = HOMEWORK_SUBMISSION_TABLE_NAME

    id = Column(String, primary_key=True, unique=True)
    homework_id = Column(
        String,
        ForeignKey(f"{HOMEWORK_TABLE_NAME}.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(String, nullable=False, index=True)

    score = Column(Float, nullable=False, default=0.0)
    total_questions = Column(Integer, nullable=False, default=0)
    correct_count = Column(Integer, nullable=False, default=0)

    created_at = Column(BigInteger, nullable=False)


class HomeworkSubmissionAnswer(Base):
    __tablename__ = HOMEWORK_SUBMISSION_ANSWER_TABLE_NAME

    id = Column(String, primary_key=True, unique=True)
    submission_id = Column(
        String,
        ForeignKey(f"{HOMEWORK_SUBMISSION_TABLE_NAME}.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id = Column(
        String,
        ForeignKey(f"{HOMEWORK_QUESTION_TABLE_NAME}.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    answer = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=False, default=False)
    score = Column(Float, nullable=False, default=0.0)
    feedback = Column(Text, nullable=True)
    analysis = Column(Text, nullable=True)
    created_at = Column(BigInteger, nullable=False)


####################
# Pydantic Models
####################


class HomeworkModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    title: str
    source_file: Optional[str] = None
    source_file_id: Optional[str] = None
    description: Optional[str] = None
    difficulty_config: Optional[dict] = None
    question_type_config: Optional[dict] = None
    knowledge_points: Optional[list[str]] = None
    created_at: int
    updated_at: int


class HomeworkQuestionModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    homework_id: str
    order_index: int
    type: str
    difficulty: str
    question: str
    options: Optional[list[str]] = None
    answer: Optional[str] = None
    analysis: Optional[str] = None
    created_at: int
    updated_at: int


class HomeworkSubmissionModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    homework_id: str
    user_id: str
    score: float
    total_questions: int
    correct_count: int
    created_at: int


class HomeworkSubmissionAnswerModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    submission_id: str
    question_id: str
    answer: Optional[str] = None
    is_correct: bool
    score: float
    feedback: Optional[str] = None
    analysis: Optional[str] = None
    created_at: int


####################
# Forms
####################


class HomeworkCreateForm(BaseModel):
    title: str
    source_file: Optional[str] = None
    source_file_id: Optional[str] = None
    description: Optional[str] = None
    difficulty_config: dict = Field(default_factory=dict)
    question_type_config: dict = Field(default_factory=dict)
    knowledge_points: list[str] = Field(default_factory=list)


class HomeworkQuestionCreateForm(BaseModel):
    order_index: int = 0
    type: str
    difficulty: str
    question: str
    options: Optional[list[str]] = None
    answer: Optional[str] = None
    analysis: Optional[str] = None


class HomeworkSubmissionCreateForm(BaseModel):
    score: float
    total_questions: int
    correct_count: int


class HomeworkSubmissionAnswerCreateForm(BaseModel):
    question_id: str
    answer: Optional[str] = None
    is_correct: bool
    score: float
    feedback: Optional[str] = None
    analysis: Optional[str] = None


####################
# DB Access Layer
####################


def _ensure_homework_schema(db: Optional[Session] = None) -> None:
    global _SCHEMA_READY

    if _SCHEMA_READY:
        return

    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return

        bind = db.get_bind() if isinstance(db, Session) else engine
        Base.metadata.create_all(
            bind=bind,
            tables=[
                Homework.__table__,
                HomeworkQuestion.__table__,
                HomeworkSubmission.__table__,
                HomeworkSubmissionAnswer.__table__,
            ],
            checkfirst=True,
        )
        _SCHEMA_READY = True


class HomeworkTable:
    def insert_homework(
        self, user_id: str, form_data: HomeworkCreateForm, db: Optional[Session] = None
    ) -> Optional[HomeworkModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            now = int(time.time())
            row = Homework(
                id=str(uuid.uuid4()),
                user_id=user_id,
                title=form_data.title,
                source_file=form_data.source_file,
                source_file_id=form_data.source_file_id,
                description=form_data.description,
                difficulty_config=form_data.difficulty_config,
                question_type_config=form_data.question_type_config,
                knowledge_points=form_data.knowledge_points,
                created_at=now,
                updated_at=now,
            )

            try:
                db.add(row)
                db.commit()
                db.refresh(row)
                return HomeworkModel.model_validate(row)
            except Exception as e:
                log.exception(f"Error inserting homework: {e}")
                db.rollback()
                return None

    def get_homework_by_id(
        self, homework_id: str, db: Optional[Session] = None
    ) -> Optional[HomeworkModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            try:
                row = db.get(Homework, homework_id)
                if row:
                    return HomeworkModel.model_validate(row)
                return None
            except Exception as e:
                log.exception(f"Error getting homework by id: {e}")
                return None

    def get_homeworks_by_user_id(
        self, user_id: str, db: Optional[Session] = None
    ) -> list[HomeworkModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            try:
                rows = (
                    db.query(Homework)
                    .filter_by(user_id=user_id)
                    .order_by(Homework.created_at.desc())
                    .all()
                )
                return [HomeworkModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error getting homeworks by user id: {e}")
                return []


Homeworks = HomeworkTable()


class HomeworkQuestionTable:
    def insert_questions(
        self,
        homework_id: str,
        questions: list[HomeworkQuestionCreateForm],
        db: Optional[Session] = None,
    ) -> list[HomeworkQuestionModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            now = int(time.time())
            rows = []
            try:
                for q in questions:
                    row = HomeworkQuestion(
                        id=str(uuid.uuid4()),
                        homework_id=homework_id,
                        order_index=q.order_index,
                        type=q.type,
                        difficulty=q.difficulty,
                        question=q.question,
                        options=q.options,
                        answer=q.answer,
                        analysis=q.analysis,
                        created_at=now,
                        updated_at=now,
                    )
                    rows.append(row)
                    db.add(row)

                db.commit()
                for row in rows:
                    db.refresh(row)
                return [HomeworkQuestionModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error inserting homework questions: {e}")
                db.rollback()
                return []

    def get_questions_by_homework_id(
        self, homework_id: str, db: Optional[Session] = None
    ) -> list[HomeworkQuestionModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            try:
                rows = (
                    db.query(HomeworkQuestion)
                    .filter_by(homework_id=homework_id)
                    .order_by(HomeworkQuestion.order_index.asc())
                    .all()
                )
                return [HomeworkQuestionModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error getting homework questions: {e}")
                return []


HomeworkQuestions = HomeworkQuestionTable()


class HomeworkSubmissionTable:
    def insert_submission(
        self,
        homework_id: str,
        user_id: str,
        form_data: HomeworkSubmissionCreateForm,
        db: Optional[Session] = None,
    ) -> Optional[HomeworkSubmissionModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            row = HomeworkSubmission(
                id=str(uuid.uuid4()),
                homework_id=homework_id,
                user_id=user_id,
                score=form_data.score,
                total_questions=form_data.total_questions,
                correct_count=form_data.correct_count,
                created_at=int(time.time()),
            )
            try:
                db.add(row)
                db.commit()
                db.refresh(row)
                return HomeworkSubmissionModel.model_validate(row)
            except Exception as e:
                log.exception(f"Error inserting homework submission: {e}")
                db.rollback()
                return None

    def get_submissions_by_homework_id(
        self, homework_id: str, db: Optional[Session] = None
    ) -> list[HomeworkSubmissionModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            try:
                rows = (
                    db.query(HomeworkSubmission)
                    .filter_by(homework_id=homework_id)
                    .order_by(HomeworkSubmission.created_at.desc())
                    .all()
                )
                return [HomeworkSubmissionModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error getting submissions by homework id: {e}")
                return []


HomeworkSubmissions = HomeworkSubmissionTable()


class HomeworkSubmissionAnswerTable:
    def insert_submission_answers(
        self,
        submission_id: str,
        answers: list[HomeworkSubmissionAnswerCreateForm],
        db: Optional[Session] = None,
    ) -> list[HomeworkSubmissionAnswerModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            now = int(time.time())
            rows = []
            try:
                for answer in answers:
                    row = HomeworkSubmissionAnswer(
                        id=str(uuid.uuid4()),
                        submission_id=submission_id,
                        question_id=answer.question_id,
                        answer=answer.answer,
                        is_correct=answer.is_correct,
                        score=answer.score,
                        feedback=answer.feedback,
                        analysis=answer.analysis,
                        created_at=now,
                    )
                    rows.append(row)
                    db.add(row)

                db.commit()
                for row in rows:
                    db.refresh(row)
                return [HomeworkSubmissionAnswerModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error inserting submission answers: {e}")
                db.rollback()
                return []

    def get_submission_answers_by_submission_id(
        self, submission_id: str, db: Optional[Session] = None
    ) -> list[HomeworkSubmissionAnswerModel]:
        with get_db_context(db) as db:
            _ensure_homework_schema(db)
            try:
                rows = (
                    db.query(HomeworkSubmissionAnswer)
                    .filter_by(submission_id=submission_id)
                    .order_by(HomeworkSubmissionAnswer.created_at.asc())
                    .all()
                )
                return [HomeworkSubmissionAnswerModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error getting submission answers by submission id: {e}")
                return []


HomeworkSubmissionAnswers = HomeworkSubmissionAnswerTable()
