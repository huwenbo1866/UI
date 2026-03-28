from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from open_webui.routers import files as files_router


@pytest.mark.asyncio
async def test_get_file_chapter_mindmaps_visible_for_owner(monkeypatch):
    monkeypatch.setattr(
        files_router.Files,
        "get_file_by_id",
        lambda _id, db=None: SimpleNamespace(id=_id, user_id="u1"),
    )
    monkeypatch.setattr(
        files_router.FileChapterMindmaps,
        "get_mindmaps_by_file_id",
        lambda _id, db=None: [
            SimpleNamespace(model_dump=lambda: {"id": "m1", "chapter_title": "第一章"})
        ],
    )

    result = await files_router.get_file_chapter_mindmaps(
        id="file-1",
        user=SimpleNamespace(id="u1", role="user"),
        db=None,
    )

    assert len(result["items"]) == 1
    assert result["items"][0]["id"] == "m1"


@pytest.mark.asyncio
async def test_get_file_chapter_mindmaps_forbidden_without_access(monkeypatch):
    monkeypatch.setattr(
        files_router.Files,
        "get_file_by_id",
        lambda _id, db=None: SimpleNamespace(id=_id, user_id="owner"),
    )
    monkeypatch.setattr(files_router, "has_access_to_file", lambda *args, **kwargs: False)

    with pytest.raises(HTTPException) as exc:
        await files_router.get_file_chapter_mindmaps(
            id="file-1",
            user=SimpleNamespace(id="u1", role="user"),
            db=None,
        )

    assert exc.value.status_code == 404
