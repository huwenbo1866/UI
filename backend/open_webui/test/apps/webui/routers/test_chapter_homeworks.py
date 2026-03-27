from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from open_webui.routers import files as files_router


@pytest.mark.asyncio
async def test_get_file_chapter_homeworks_hidden_when_env_false(monkeypatch):
    monkeypatch.setenv("KNOWLEDGE_CHAPTER_HOMEWORK_VISIBLE", "false")

    with pytest.raises(HTTPException) as exc:
        await files_router.get_file_chapter_homeworks(
            id="file-1",
            user=SimpleNamespace(id="u1", role="user"),
            db=None,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_file_chapter_homeworks_visible_when_env_true(monkeypatch):
    monkeypatch.setenv("KNOWLEDGE_CHAPTER_HOMEWORK_VISIBLE", "true")

    monkeypatch.setattr(
        files_router.Files,
        "get_file_by_id",
        lambda _id, db=None: SimpleNamespace(id=_id, user_id="u1"),
    )
    monkeypatch.setattr(
        files_router.FileChapterHomeworks,
        "get_homeworks_by_file_id",
        lambda _id, db=None: [
            SimpleNamespace(model_dump=lambda: {"id": "h1", "chapter_title": "第一章"})
        ],
    )

    result = await files_router.get_file_chapter_homeworks(
        id="file-1",
        user=SimpleNamespace(id="u1", role="user"),
        db=None,
    )

    assert len(result["items"]) == 1
    assert result["items"][0]["id"] == "h1"


@pytest.mark.asyncio
async def test_update_file_chapter_homework_forbidden_without_write_access(monkeypatch):
    monkeypatch.setenv("KNOWLEDGE_CHAPTER_HOMEWORK_VISIBLE", "true")

    monkeypatch.setattr(
        files_router.Files,
        "get_file_by_id",
        lambda _id, db=None: SimpleNamespace(id=_id, user_id="owner"),
    )
    monkeypatch.setattr(files_router, "has_access_to_file", lambda *args, **kwargs: False)

    with pytest.raises(HTTPException) as exc:
        await files_router.update_file_chapter_homework(
            id="file-1",
            homework_id="h1",
            form_data=files_router.FileChapterHomeworkUpdateForm(
                questions=[{"question": "Q1"}], answer_markdown="# A"
            ),
            user=SimpleNamespace(id="u1", role="user"),
            db=None,
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_update_file_chapter_homework_success(monkeypatch):
    monkeypatch.setenv("KNOWLEDGE_CHAPTER_HOMEWORK_VISIBLE", "true")

    monkeypatch.setattr(
        files_router.Files,
        "get_file_by_id",
        lambda _id, db=None: SimpleNamespace(id=_id, user_id="u1"),
    )
    monkeypatch.setattr(
        files_router.FileChapterHomeworks,
        "get_homework_by_id",
        lambda _id, db=None: SimpleNamespace(id=_id, file_id="file-1"),
    )
    monkeypatch.setattr(
        files_router.FileChapterHomeworks,
        "update_homework_by_id",
        lambda _id, form_data, db=None: SimpleNamespace(
            model_dump=lambda: {
                "id": _id,
                "questions": form_data.questions,
                "answer_markdown": form_data.answer_markdown,
            }
        ),
    )

    result = await files_router.update_file_chapter_homework(
        id="file-1",
        homework_id="h1",
        form_data=files_router.FileChapterHomeworkUpdateForm(
            questions=[{"question": "Q1", "answer": "A1"}],
            answer_markdown="# 参考答案",
        ),
        user=SimpleNamespace(id="u1", role="user"),
        db=None,
    )

    assert result["item"]["id"] == "h1"
    assert result["item"]["answer_markdown"] == "# 参考答案"
