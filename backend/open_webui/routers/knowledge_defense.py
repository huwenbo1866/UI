from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from open_webui.internal.db import get_session
from open_webui.models.knowledge_defense import (
    KnowledgeDefenseWrongQuestion,
    WrongQuestionListResponse,
    WrongQuestionModel,
    WrongQuestionResolveForm,
    WrongQuestionResolveResponse,
    WrongQuestionUpsertForm,
    WrongQuestions,
)
from open_webui.services.chapter_mindmap import update_chapter_mindmap_from_wrong_question
from open_webui.utils.auth import get_verified_user

router = APIRouter()


@router.get('/wrong-questions', response_model=WrongQuestionListResponse)
async def get_wrong_questions(
    source_type: Optional[str] = Query(default=None),
    source_id: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    return WrongQuestions.get_wrong_questions(
        user_id=user.id,
        source_type=source_type,
        source_id=source_id,
        limit=limit,
        offset=offset,
        db=db,
    )


@router.post('/wrong-questions', response_model=WrongQuestionModel)
async def upsert_wrong_question(
    form_data: WrongQuestionUpsertForm,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    item = WrongQuestions.upsert_wrong_question(user_id=user.id, form_data=form_data, db=db)

    if item and item.file_id and item.chapter:
        try:
            weight = min(2.0, 1.0 + max(0, int(item.wrong_count or 1) - 1) * 0.25)
            update_chapter_mindmap_from_wrong_question(
                file_id=item.file_id,
                chapter_title=item.chapter,
                question_text=item.question,
                is_correct=False,
                weight=weight,
                db=db,
            )
        except Exception:
            pass

    return item


@router.post('/wrong-questions/mark-correct', response_model=WrongQuestionResolveResponse)
async def mark_wrong_question_correct(
    form_data: WrongQuestionResolveForm,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    current = (
        db.query(KnowledgeDefenseWrongQuestion)
        .filter(
            KnowledgeDefenseWrongQuestion.user_id == user.id,
            KnowledgeDefenseWrongQuestion.source_type == form_data.source_type,
            KnowledgeDefenseWrongQuestion.source_id == form_data.source_id,
            KnowledgeDefenseWrongQuestion.question_id == form_data.question_id,
        )
        .first()
    )

    result = WrongQuestions.mark_wrong_question_correct(user_id=user.id, form_data=form_data, db=db)

    if current and current.file_id and current.chapter:
        try:
            update_chapter_mindmap_from_wrong_question(
                file_id=current.file_id,
                chapter_title=current.chapter,
                question_text=current.question,
                is_correct=True,
                weight=1.0,
                db=db,
            )
        except Exception:
            pass
    elif form_data.file_id and form_data.chapter and form_data.question:
        # 对于“首次即答对”的题目，虽然不会进入错题本，也需要回写章节掌握度颜色。
        try:
            update_chapter_mindmap_from_wrong_question(
                file_id=form_data.file_id,
                chapter_title=form_data.chapter,
                question_text=form_data.question,
                is_correct=True,
                weight=0.7,
                db=db,
            )
        except Exception:
            pass
    return result


@router.delete('/wrong-questions/{wrong_question_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_wrong_question(
    wrong_question_id: str,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    deleted = WrongQuestions.delete_wrong_question(
        user_id=user.id,
        wrong_question_id=wrong_question_id,
        db=db,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Wrong question not found')


@router.delete('/wrong-questions', status_code=status.HTTP_204_NO_CONTENT)
async def clear_wrong_questions(
    source_type: Optional[str] = Query(default=None),
    source_id: Optional[str] = Query(default=None),
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    WrongQuestions.clear_wrong_questions(
        user_id=user.id,
        source_type=source_type,
        source_id=source_id,
        db=db,
    )
