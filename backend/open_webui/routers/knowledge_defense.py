from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from open_webui.internal.db import get_session
from open_webui.models.knowledge_defense import (
    WrongQuestionListResponse,
    WrongQuestionModel,
    WrongQuestionUpsertForm,
    WrongQuestions,
)
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
    return WrongQuestions.upsert_wrong_question(user_id=user.id, form_data=form_data, db=db)


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
