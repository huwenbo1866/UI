import time
import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict
from sqlalchemy import BigInteger, Column, JSON, Text, and_
from sqlalchemy.orm import Session

from open_webui.internal.db import Base, engine, get_db_context


class KnowledgeDefenseWrongQuestion(Base):
    __tablename__ = 'knowledge_defense_wrong_question'

    id = Column(Text, primary_key=True, unique=True)
    user_id = Column(Text, nullable=False, index=True)
    source_type = Column(Text, nullable=False, default='pack')
    source_id = Column(Text, nullable=True, index=True)
    file_id = Column(Text, nullable=True)
    chapter = Column(Text, nullable=True)

    question_id = Column(Text, nullable=False)
    question = Column(Text, nullable=False)
    options = Column(JSON, nullable=True)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=False)
    last_user_answer = Column(Text, nullable=False)

    wrong_count = Column(BigInteger, nullable=False, default=1)
    consecutive_correct_count = Column(BigInteger, nullable=False, default=0)
    first_wrong_at = Column(BigInteger, nullable=False)
    last_wrong_at = Column(BigInteger, nullable=False, index=True)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)


class WrongQuestionModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    source_type: str
    source_id: Optional[str] = None
    file_id: Optional[str] = None
    chapter: Optional[str] = None
    question_id: str
    question: str
    options: Optional[list[str]] = None
    correct_answer: str
    explanation: str
    last_user_answer: str
    wrong_count: int
    consecutive_correct_count: int
    first_wrong_at: int
    last_wrong_at: int
    created_at: int
    updated_at: int


class WrongQuestionUpsertForm(BaseModel):
    source_type: str = 'pack'
    source_id: Optional[str] = None
    file_id: Optional[str] = None
    chapter: Optional[str] = None
    question_id: str
    question: str
    options: Optional[list[str]] = None
    correct_answer: str
    explanation: str
    last_user_answer: str


class WrongQuestionResolveForm(BaseModel):
    source_type: str = 'pack'
    source_id: Optional[str] = None
    question_id: str
    mastery_threshold: int = 2
    file_id: Optional[str] = None
    chapter: Optional[str] = None
    question: Optional[str] = None

class WrongQuestionResolveResponse(BaseModel):
    removed: bool
    streak: int
    target: int
    item: Optional[WrongQuestionModel] = None


class WrongQuestionListResponse(BaseModel):
    items: list[WrongQuestionModel]
    total: int


class KnowledgeDefenseWrongQuestionTable:
    def _to_model(self, row: KnowledgeDefenseWrongQuestion) -> WrongQuestionModel:
        return WrongQuestionModel.model_validate(row)

    def get_wrong_questions(
        self,
        user_id: str,
        source_type: Optional[str] = None,
        source_id: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
        db: Optional[Session] = None,
    ) -> WrongQuestionListResponse:
        with get_db_context(db) as db:
            query = db.query(KnowledgeDefenseWrongQuestion).filter(
                KnowledgeDefenseWrongQuestion.user_id == user_id
            )

            if source_type:
                query = query.filter(KnowledgeDefenseWrongQuestion.source_type == source_type)
            if source_id:
                query = query.filter(KnowledgeDefenseWrongQuestion.source_id == source_id)

            total = query.count()
            items = (
                query.order_by(KnowledgeDefenseWrongQuestion.last_wrong_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )

            return WrongQuestionListResponse(
                items=[self._to_model(item) for item in items],
                total=total,
            )

    def upsert_wrong_question(
        self,
        user_id: str,
        form_data: WrongQuestionUpsertForm,
        db: Optional[Session] = None,
    ) -> WrongQuestionModel:
        now = int(time.time() * 1000)
        with get_db_context(db) as db:
            existing = (
                db.query(KnowledgeDefenseWrongQuestion)
                .filter(
                    and_(
                        KnowledgeDefenseWrongQuestion.user_id == user_id,
                        KnowledgeDefenseWrongQuestion.source_type == form_data.source_type,
                        KnowledgeDefenseWrongQuestion.source_id == form_data.source_id,
                        KnowledgeDefenseWrongQuestion.question_id == form_data.question_id,
                    )
                )
                .first()
            )

            if existing:
                existing.question = form_data.question
                existing.options = form_data.options
                existing.correct_answer = form_data.correct_answer
                existing.explanation = form_data.explanation
                existing.last_user_answer = form_data.last_user_answer
                existing.file_id = form_data.file_id
                existing.chapter = form_data.chapter
                existing.wrong_count = int(existing.wrong_count or 0) + 1
                existing.consecutive_correct_count = 0
                existing.last_wrong_at = now
                existing.updated_at = now
                db.commit()
                db.refresh(existing)
                return self._to_model(existing)

            row = KnowledgeDefenseWrongQuestion(
                id=str(uuid.uuid4()),
                user_id=user_id,
                source_type=form_data.source_type,
                source_id=form_data.source_id,
                file_id=form_data.file_id,
                chapter=form_data.chapter,
                question_id=form_data.question_id,
                question=form_data.question,
                options=form_data.options,
                correct_answer=form_data.correct_answer,
                explanation=form_data.explanation,
                last_user_answer=form_data.last_user_answer,
                wrong_count=1,
                consecutive_correct_count=0,
                first_wrong_at=now,
                last_wrong_at=now,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._to_model(row)

    def mark_wrong_question_correct(
        self,
        user_id: str,
        form_data: WrongQuestionResolveForm,
        db: Optional[Session] = None,
    ) -> WrongQuestionResolveResponse:
        now = int(time.time() * 1000)
        target = max(1, int(form_data.mastery_threshold or 2))

        with get_db_context(db) as db:
            row = (
                db.query(KnowledgeDefenseWrongQuestion)
                .filter(
                    and_(
                        KnowledgeDefenseWrongQuestion.user_id == user_id,
                        KnowledgeDefenseWrongQuestion.source_type == form_data.source_type,
                        KnowledgeDefenseWrongQuestion.source_id == form_data.source_id,
                        KnowledgeDefenseWrongQuestion.question_id == form_data.question_id,
                    )
                )
                .first()
            )

            if not row:
                return WrongQuestionResolveResponse(
                    removed=False,
                    streak=0,
                    target=target,
                    item=None,
                )

            row.consecutive_correct_count = int(row.consecutive_correct_count or 0) + 1
            row.updated_at = now

            if int(row.consecutive_correct_count or 0) >= target:
                db.delete(row)
                db.commit()
                return WrongQuestionResolveResponse(
                    removed=True,
                    streak=target,
                    target=target,
                    item=None,
                )

            db.commit()
            db.refresh(row)
            return WrongQuestionResolveResponse(
                removed=False,
                streak=int(row.consecutive_correct_count or 0),
                target=target,
                item=self._to_model(row),
            )

    def delete_wrong_question(
        self,
        user_id: str,
        wrong_question_id: str,
        db: Optional[Session] = None,
    ) -> bool:
        with get_db_context(db) as db:
            row = (
                db.query(KnowledgeDefenseWrongQuestion)
                .filter(
                    KnowledgeDefenseWrongQuestion.id == wrong_question_id,
                    KnowledgeDefenseWrongQuestion.user_id == user_id,
                )
                .first()
            )
            if not row:
                return False
            db.delete(row)
            db.commit()
            return True

    def clear_wrong_questions(
        self,
        user_id: str,
        source_type: Optional[str] = None,
        source_id: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> int:
        with get_db_context(db) as db:
            query = db.query(KnowledgeDefenseWrongQuestion).filter(
                KnowledgeDefenseWrongQuestion.user_id == user_id
            )
            if source_type:
                query = query.filter(KnowledgeDefenseWrongQuestion.source_type == source_type)
            if source_id:
                query = query.filter(KnowledgeDefenseWrongQuestion.source_id == source_id)
            deleted = query.delete(synchronize_session=False)
            db.commit()
            return deleted


WrongQuestions = KnowledgeDefenseWrongQuestionTable()

# Pragmatic table bootstrap for custom forks without an alembic migration yet.
Base.metadata.create_all(bind=engine, tables=[KnowledgeDefenseWrongQuestion.__table__])
