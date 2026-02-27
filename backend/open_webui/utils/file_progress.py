import time
from typing import Optional, Any
from sqlalchemy.orm import Session

from open_webui.models.files import Files


def _clamp_progress(v: Optional[int]) -> Optional[int]:
    if v is None:
        return None
    return max(0, min(100, int(v)))


def update_file_progress(
    file_id: str,
    db: Session,
    *,
    status: Optional[str] = None,
    stage: Optional[str] = None,
    progress_pct: Optional[int] = None,
    message: Optional[str] = None,
    current_chunk: Optional[int] = None,
    total_chunks: Optional[int] = None,
    eta_seconds: Optional[int] = None,
    error: Optional[str] = None,
    content_ready: Optional[bool] = None,
    **extra: Any,
):
    file = Files.get_file_by_id(file_id, db=db)
    if not file:
        return

    data = dict(file.data or {})

    # 只有显式启用进度 UI 的文件才更新
    if not data.get("show_process_ui", False):
        return

    if status is not None:
        data["status"] = status
    if stage is not None:
        data["stage"] = stage
    if progress_pct is not None:
        data["progress_pct"] = _clamp_progress(progress_pct)
    if message is not None:
        data["message"] = message
    if current_chunk is not None:
        data["current_chunk"] = current_chunk
    if total_chunks is not None:
        data["total_chunks"] = total_chunks
    if eta_seconds is not None:
        data["eta_seconds"] = eta_seconds
    if content_ready is not None:
        data["content_ready"] = content_ready
    if error is not None:
        data["error"] = error

    data["updated_at"] = int(time.time())

    for k, v in extra.items():
        if v is not None:
            data[k] = v

    Files.update_file_data_by_id(file_id, data, db=db)