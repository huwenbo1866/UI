import logging
import os
import uuid
import json
import re
import requests

from pathlib import Path
from typing import Optional
from urllib.parse import quote
import asyncio

from fastapi import (
    BackgroundTasks,
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
    Query,
)


from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from open_webui.internal.db import get_session, SessionLocal

from open_webui.constants import ERROR_MESSAGES
from open_webui.retrieval.vector.factory import VECTOR_DB_CLIENT

from open_webui.models.channels import Channels
from open_webui.models.users import Users
from open_webui.models.files import (
    FileForm,
    FileModel,
    FileModelResponse,
    Files,
)
from open_webui.models.chats import Chats
from open_webui.models.knowledge import Knowledges
from open_webui.models.groups import Groups


from open_webui.routers.retrieval import ProcessFileForm, process_file
from open_webui.routers.audio import transcribe

from open_webui.storage.provider import Storage

from open_webui.utils.file_progress import update_file_progress
from open_webui.utils.auth import get_admin_user, get_verified_user
from open_webui.utils.access_control import has_access
from open_webui.utils.misc import strict_match_mime_type
from pydantic import BaseModel

log = logging.getLogger(__name__)

router = APIRouter()


############################
# Check if the current user has access to a file through any knowledge bases the user may be in.
############################


# TODO: Optimize this function to use the knowledge_file table for faster lookups.
def has_access_to_file(
    file_id: Optional[str],
    access_type: str,
    user=Depends(get_verified_user),
    db: Optional[Session] = None,
) -> bool:
    file = Files.get_file_by_id(file_id, db=db)
    log.debug(f"Checking if user has {access_type} access to file")
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    # Check if the file is associated with any knowledge bases the user has access to
    knowledge_bases = Knowledges.get_knowledges_by_file_id(file_id, db=db)
    user_group_ids = {
        group.id for group in Groups.get_groups_by_member_id(user.id, db=db)
    }
    for knowledge_base in knowledge_bases:
        if knowledge_base.user_id == user.id or has_access(
            user.id, access_type, knowledge_base.access_control, user_group_ids, db=db
        ):
            return True

    knowledge_base_id = file.meta.get("collection_name") if file.meta else None
    if knowledge_base_id:
        knowledge_bases = Knowledges.get_knowledge_bases_by_user_id(
            user.id, access_type, db=db
        )
        for knowledge_base in knowledge_bases:
            if knowledge_base.id == knowledge_base_id:
                return True

    # Check if the file is associated with any channels the user has access to
    channels = Channels.get_channels_by_file_id_and_user_id(file_id, user.id, db=db)
    if access_type == "read" and channels:
        return True

    # Check if the file is associated with any chats the user has access to
    # TODO: Granular access control for chats
    chats = Chats.get_shared_chats_by_file_id(file_id, db=db)
    if chats:
        return True

    return False


def normalize_transcript_text(text: str) -> str:
    """
    轻量转写后处理（本地、低成本、稳定）
    目标：不改语义，只做清洗与可读性提升
    """
    if not text:
        return ""

    t = text.replace("\r\n", "\n").replace("\r", "\n")

    # 压缩多余空白
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)

    # 清理常见重复标点
    t = re.sub(r"[，,]{2,}", "，", t)
    t = re.sub(r"[。\.]{2,}", "。", t)
    t = re.sub(r"[！!]{2,}", "！", t)
    t = re.sub(r"[？?]{2,}", "？", t)

    # 去掉独立成行的语气词（非常保守，避免误删正文）
    t = re.sub(r"(?m)^\s*(嗯+|呃+|额+|啊+|唉+)\s*$", "", t)

    # 再清一次空行
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    return t


def split_text_for_llm(text: str, max_chars: int = 6000, overlap: int = 300) -> list[str]:
    """
    按字符切块，尽量在换行处切，避免把一句话硬截断
    """
    if not text:
        return []

    chunks = []
    n = len(text)
    start = 0

    while start < n:
        end = min(start + max_chars, n)
        # 优先在换行处分块
        if end < n:
            cut = text.rfind("\n", start, end)
            if cut != -1 and cut > start + max_chars // 2:
                end = cut

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= n:
            break

        start = max(0, end - overlap)

    return chunks


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "y", "on"}


def _call_openai_compatible_chat(messages: list, model: str, timeout: int = 120) -> str:
    """
    调用 OpenAI 兼容 chat completions 接口（可接你现有的模型服务）
    环境变量：
      LECTURE_MINUTES_LLM_BASE_URL  例如: http://127.0.0.1:11434/v1 或 https://api.openai.com/v1
      LECTURE_MINUTES_LLM_API_KEY    可为空（若本地服务不需要）
      LECTURE_MINUTES_LLM_MODEL      例如: deepseek-chat / gpt-4o-mini / qwen-plus
    """
    base_url = (os.getenv("LECTURE_MINUTES_LLM_BASE_URL") or "").rstrip("/")
    api_key = os.getenv("LECTURE_MINUTES_LLM_API_KEY", "")
    if not base_url:
        raise RuntimeError("LECTURE_MINUTES_LLM_BASE_URL is not set")

    url = f"{base_url}/chat/completions"

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
    }

    resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    try:
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        raise RuntimeError(f"Unexpected chat response: {data}")

def rewrite_transcript_llm(transcript_text: str, file_name: str = "") -> str:
    """
    对 ASR 原始逐字稿做“复述纠正”：
    - 不做事实扩写
    - 补标点 / 分句
    - 修正常见同音误识别（在上下文足够确定时）
    - 不确定内容可保留原词，不强猜
    返回空字符串表示未启用或失败（调用方可回退到原文）
    """
    text = (transcript_text or "").strip()
    if not text:
        return ""

    enabled = _env_bool("STT_LLM_REWRITE_ENABLED", True)
    if not enabled:
        return ""

    # 优先使用专用模型；没有就复用纪要模型
    model = (
        os.getenv("STT_LLM_REWRITE_MODEL", "").strip()
        or os.getenv("LECTURE_MINUTES_LLM_MODEL", "").strip()
    )
    if not model:
        log.info("[STT] LLM transcript rewrite skipped: no model configured")
        return ""

    chunks = split_text_for_llm(text, max_chars=3500, overlap=120)
    rewritten_parts = []

    for idx, chunk in enumerate(chunks, start=1):
        system_prompt = (
            "你是一个中文课堂录音整理助手。"
            "你的任务是将 ASR（语音识别）原始逐字稿整理为“可读版逐字稿”。"
            "必须遵守："
            "1) 不添加原文中没有的新事实；"
            "2) 优先保持原意，不要改写成摘要；"
            "3) 只在高置信度时纠正明显同音/近音错误；"
            "4) 补充标点、断句、分段；"
            "5) 遇到不确定词语，宁可保留原词，不要强行猜测；"
            "6) 输出仅为整理后的正文，不要解释。"
        )

        user_prompt = (
            f"文件名：{file_name}\n"
            f"这是第 {idx}/{len(chunks)} 段 ASR 原始逐字稿，请整理为可读版逐字稿（不是摘要）：\n\n"
            f"{chunk}"
        )

        # ✅ 注意：按你当前 helper 的签名来调用（messages + model）
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            part = _call_openai_compatible_chat(messages=messages, model=model, timeout=120)
            if part and part.strip():
                rewritten_parts.append(part.strip())
            else:
                rewritten_parts.append(chunk.strip())  # 回退
        except Exception as e:
            log.warning(f"[STT] LLM transcript rewrite chunk {idx} failed: {e}")
            rewritten_parts.append(chunk.strip())

    return "\n".join([p for p in rewritten_parts if p]).strip()


def generate_lecture_minutes_llm(transcript_text: str, file_name: str = "") -> str:
    """
    可选：用 LLM 将逐字稿整理成课堂听课纪要（成本远低于云 STT）
    默认关闭；通过环境变量开启。
    """
    if not _env_bool("LECTURE_MINUTES_LLM_ENABLED", False):
        return ""

    model = os.getenv("LECTURE_MINUTES_LLM_MODEL", "").strip()
    if not model:
        raise RuntimeError("LECTURE_MINUTES_LLM_MODEL is not set")

    if not transcript_text or len(transcript_text.strip()) < 20:
        return ""

    system_prompt = (
        "你是课堂听课纪要整理助手。"
        "请基于转写文本生成高质量、结构化、可学习的中文听课纪要。"
        "要求：\n"
        "1) 忠于原文，不编造未提及内容；\n"
        "2) 保留关键术语（必要时括号补充英文/原词）；\n"
        "3) 输出结构清晰，适合学生复习；\n"
        "4) 若转写有噪声或口误，可在不改变含义前提下整理；\n"
        "5) 不要输出与课堂无关的客套话。"
    )

    chunk_prompt_template = (
        "下面是课堂录音转写文本的一部分，请先做“分块纪要”。\n"
        "文件名：{file_name}\n\n"
        "请输出以下结构（Markdown）：\n"
        "## 本段主题\n"
        "## 关键知识点（条目化）\n"
        "## 例子/案例\n"
        "## 老师强调/易错点\n"
        "## 待确认内容（若转写不清）\n\n"
        "转写片段：\n"
        "{chunk}"
    )

    final_prompt_template = (
        "下面是同一堂课多个分块纪要，请合并成最终《课堂录音听课纪要》。\n"
        "要求：去重、按逻辑重组、保持完整性与可复习性。\n\n"
        "请输出 Markdown，结构如下：\n"
        "# 课堂录音听课纪要\n"
        "## 课程主题\n"
        "## 核心主线\n"
        "## 知识点详解\n"
        "## 例子/案例\n"
        "## 易错点 / 老师强调\n"
        "## 课后复习建议\n"
        "## 待确认片段（若有）\n\n"
        "分块纪要如下：\n"
        "{partials}"
    )

    chunks = split_text_for_llm(
        transcript_text,
        max_chars=int(os.getenv("LECTURE_MINUTES_CHUNK_CHARS", "6000")),
        overlap=int(os.getenv("LECTURE_MINUTES_CHUNK_OVERLAP", "300")),
    )

    if not chunks:
        return ""

    partials = []
    for idx, chunk in enumerate(chunks, 1):
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": chunk_prompt_template.format(
                    file_name=file_name or "未命名音视频",
                    chunk=chunk,
                ),
            },
        ]
        part = _call_openai_compatible_chat(messages, model=model, timeout=180)
        partials.append(f"### 分块 {idx}\n{part}")

    # 只有一块时，直接返回（避免多一次成本）
    if len(partials) == 1:
        return f"# 课堂录音听课纪要\n\n{partials[0]}".strip()

    final_messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": final_prompt_template.format(partials="\n\n".join(partials)),
        },
    ]
    final_minutes = _call_openai_compatible_chat(final_messages, model=model, timeout=240)
    return final_minutes.strip()


def build_audio_learning_document(
    file_name: str,
    raw_text: str,
    corrected_text: Optional[str] = None,
    lecture_minutes: Optional[str] = None,
) -> str:
    parts = [
        "# 课堂录音处理结果",
        "",
        "## 文件名",
        file_name,
        "",
    ]

    if lecture_minutes and lecture_minutes.strip():
        parts += [
            "## 课堂录音听课纪要",
            lecture_minutes.strip(),
            "",
        ]
    else:
        parts += [
            "## 课堂录音听课纪要",
            "（未启用 LLM 纪要整理，当前仅提供逐字稿）",
            "",
        ]

    # 保留原始 ASR 结果（便于核对）
    parts += [
        "## 课堂录音逐字稿（ASR原始）",
        (raw_text or "").strip(),
        "",
    ]

    # 若有 LLM 纠正版，则额外展示
    if corrected_text and corrected_text.strip():
        parts += [
            "## 课堂录音逐字稿（LLM复述纠正稿）",
            corrected_text.strip(),
            "",
        ]

    return "\n".join(parts).strip() + "\n"



def is_progress_media_file(file: UploadFile) -> bool:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    filename = (file.filename or "").lower()

    return (
        content_type in {"audio/mpeg", "audio/mp3", "video/mp4"}
        or filename.endswith(".mp3")
        or filename.endswith(".mp4")
    )



############################
# Upload File
############################


def process_uploaded_file(
    request,
    file,
    file_path,
    file_item,
    file_metadata,
    user,
    db: Optional[Session] = None,
):
    def _process_handler(db_session):
        try:
            if file.content_type:
                stt_supported_content_types = getattr(
                    request.app.state.config, "STT_SUPPORTED_CONTENT_TYPES", []
                )

                content_type = (file.content_type or "").split(";")[0].strip().lower()
                is_mp4_video = content_type == "video/mp4"
                should_use_stt = (
                    strict_match_mime_type(stt_supported_content_types, file.content_type)
                    or is_mp4_video
                )

                if should_use_stt:
                    update_file_progress(
                        file_item.id,
                        db_session,
                        status="processing",
                        stage="extracting_audio",
                        progress_pct=5,
                        message="正在抽取音频",
                    )

                    file_path_processed = Storage.get_file(file_path)

                    def stt_progress_callback(**kwargs):
                        update_file_progress(
                            file_item.id,
                            db_session,
                            status="processing",
                            **kwargs,
                        )

                    result = transcribe(
                        request,
                        file_path_processed,
                        file_metadata,
                        user,
                        progress_callback=stt_progress_callback,
                    )
                    
                    raw_text = (result.get("text", "") or "").strip()

                    update_file_progress(
                        file_item.id,
                        db_session,
                        status="processing",
                        stage="normalizing",
                        progress_pct=78,
                        message="正在清洗逐字稿",
                    )

                    # ✅ 先做一层轻量 normalize（给 LLM 输入更稳定）
                    normalized_raw_text = normalize_transcript_text(raw_text)
                    
                    log.info(
                        f"[STT] file={getattr(file, 'filename', '')} "
                        f"raw_text_len={len(raw_text)} normalized_text_len={len(normalized_raw_text)}"
                    )
                    
                    update_file_progress(
                        file_item.id,
                        db_session,
                        status="processing",
                        stage="rewriting",
                        progress_pct=84,
                        message="正在优化可读版逐字稿",
                    )

                    # 1) 先用 LLM 对（normalize 后的）识别结果做“复述纠正”
                    corrected_text = ""
                    try:
                        corrected_text = rewrite_transcript_llm(
                            transcript_text=normalized_raw_text or raw_text,
                            file_name=getattr(file, "filename", "") or "",
                        )
                        if corrected_text:
                            log.info(
                                f"[STT] transcript rewrite generated, len={len(corrected_text)} for file={getattr(file, 'filename', '')}"
                            )
                        else:
                            log.info(
                                f"[STT] transcript rewrite skipped or disabled for file={getattr(file, 'filename', '')}"
                            )
                    except Exception as rewrite_err:
                        # 纠正失败不影响主链路：仍然入库原始逐字稿
                        log.warning(
                            f"[STT] transcript rewrite failed for file={getattr(file, 'filename', '')}: {rewrite_err}"
                        )
                        corrected_text = ""
                    
                    update_file_progress(
                        file_item.id,
                        db_session,
                        status="processing",
                        stage="minutes_generating",
                        progress_pct=90,
                        message="正在生成课堂纪要",
                    )

                    # 2) （可选）再用 LLM 生成听课纪要：优先基于纠正稿，其次 normalize稿，再次原始稿
                    lecture_minutes = ""
                    try:
                        lecture_minutes = generate_lecture_minutes_llm(
                            transcript_text=corrected_text or normalized_raw_text or raw_text,
                            file_name=getattr(file, "filename", "") or "",
                        )
                        if lecture_minutes:
                            log.info(
                                f"[STT] lecture minutes generated, len={len(lecture_minutes)} for file={getattr(file, 'filename', '')}"
                            )
                        else:
                            log.info(
                                f"[STT] lecture minutes skipped or disabled for file={getattr(file, 'filename', '')}"
                            )
                    except Exception as summary_err:
                        # 纪要失败不影响主链路：仍然入库逐字稿/纠正稿
                        log.warning(
                            f"[STT] lecture minutes generation failed for file={getattr(file, 'filename', '')}: {summary_err}"
                        )
                    
                    # 3) 构建最终入库文本（保留原始稿 + LLM纠正稿 + 可选纪要）
                    final_text = build_audio_learning_document(
                        file_name=getattr(file, "filename", "") or "",
                        raw_text=raw_text,                 # ✅ 注意参数名
                        corrected_text=corrected_text,     # ✅ 注意参数名
                        lecture_minutes=lecture_minutes,
                    )
                    
                    update_file_progress(
                        file_item.id,
                        db_session,
                        status="processing",
                        stage="indexing",
                        progress_pct=96,
                        message="正在写入知识库",
                        content_ready=True,
                    )

                    process_file(
                        request,
                        ProcessFileForm(
                            file_id=file_item.id,
                            content=final_text,
                        ),
                        user=user,
                        db=db_session,
                    )
                elif (not file.content_type.startswith(("image/", "video/"))) or (
                    request.app.state.config.CONTENT_EXTRACTION_ENGINE == "external"
                ):
                    process_file(
                        request,
                        ProcessFileForm(file_id=file_item.id),
                        user=user,
                        db=db_session,
                    )
                else:
                    raise Exception(
                        f"File type {file.content_type} is not supported for processing"
                    )
            else:
                log.info(
                    f"File type {file.content_type} is not provided, but trying to process anyway"
                )
                process_file(
                    request,
                    ProcessFileForm(file_id=file_item.id),
                    user=user,
                    db=db_session,
                )

        except Exception as e:
            log.error(f"Error processing file: {file_item.id}")
            update_file_progress(
                file_item.id,
                db_session,
                status="failed",
                stage="failed",
                progress_pct=100,
                message="处理失败",
                error=str(e.detail) if hasattr(e, "detail") else str(e),
            )

    if db:
        _process_handler(db)
    else:
        with SessionLocal() as db_session:
            _process_handler(db_session)


@router.post("/", response_model=FileModelResponse)
def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    metadata: Optional[dict | str] = Form(None),
    process: bool = Query(True),
    process_in_background: bool = Query(True),
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    return upload_file_handler(
        request,
        file=file,
        metadata=metadata,
        process=process,
        process_in_background=process_in_background,
        user=user,
        background_tasks=background_tasks,
        db=db,
    )


def upload_file_handler(
    request: Request,
    file: UploadFile = File(...),
    metadata: Optional[dict | str] = Form(None),
    process: bool = Query(True),
    process_in_background: bool = Query(True),
    user=Depends(get_verified_user),
    background_tasks: Optional[BackgroundTasks] = None,
    db: Optional[Session] = None,
):
    log.info(f"file.content_type: {file.content_type} {process}")

    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.DEFAULT("Invalid metadata format"),
            )
    file_metadata = metadata if metadata else {}

    try:
        unsanitized_filename = file.filename
        filename = os.path.basename(unsanitized_filename)

        file_extension = os.path.splitext(filename)[1]
        # Remove the leading dot from the file extension
        file_extension = file_extension[1:] if file_extension else ""

        if process and request.app.state.config.ALLOWED_FILE_EXTENSIONS:
            request.app.state.config.ALLOWED_FILE_EXTENSIONS = [
                ext for ext in request.app.state.config.ALLOWED_FILE_EXTENSIONS if ext
            ]

            if file_extension not in request.app.state.config.ALLOWED_FILE_EXTENSIONS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=ERROR_MESSAGES.DEFAULT(
                        f"File type {file_extension} is not allowed"
                    ),
                )

        # replace filename with uuid
        id = str(uuid.uuid4())
        name = filename
        filename = f"{id}_{filename}"
        contents, file_path = Storage.upload_file(
            file.file,
            filename,
            {
                "OpenWebUI-User-Email": user.email,
                "OpenWebUI-User-Id": user.id,
                "OpenWebUI-User-Name": user.name,
                "OpenWebUI-File-Id": id,
            },
        )

        show_process_ui = process and is_progress_media_file(file)

        file_item = Files.insert_new_file(
            user.id,
            FileForm(
                **{
                    "id": id,
                    "filename": name,
                    "path": file_path,
                    "data": {
                        **(
                            {
                                "show_process_ui": True,
                                "status": "pending",
                                "stage": "queued",
                                "progress_pct": 0,
                                "message": "等待进入处理队列",
                                "current_chunk": 0,
                                "total_chunks": 0,
                                "content_ready": False,
                            }
                            if show_process_ui
                            else {}
                        ),
                    },
                    "meta": {
                        "name": name,
                        "content_type": (
                            file.content_type
                            if isinstance(file.content_type, str)
                            else None
                        ),
                        "size": len(contents),
                        "data": file_metadata,
                    },
                }
            ),
            db=db,
        )

        if "channel_id" in file_metadata:
            channel = Channels.get_channel_by_id_and_user_id(
                file_metadata["channel_id"], user.id, db=db
            )
            if channel:
                Channels.add_file_to_channel_by_id(
                    channel.id, file_item.id, user.id, db=db
                )

        if process:
            if background_tasks and process_in_background:
                background_tasks.add_task(
                    process_uploaded_file,
                    request,
                    file,
                    file_path,
                    file_item,
                    file_metadata,
                    user,
                )
                return {"status": True, **file_item.model_dump()}
            else:
                process_uploaded_file(
                    request,
                    file,
                    file_path,
                    file_item,
                    file_metadata,
                    user,
                    db=db,
                )
                return {"status": True, **file_item.model_dump()}
        else:
            if file_item:
                return file_item
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=ERROR_MESSAGES.DEFAULT("Error uploading file"),
                )

    except HTTPException as e:
        raise e
    except Exception as e:
        log.exception(e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT("Error uploading file"),
        )


############################
# List Files
############################


@router.get("/", response_model=list[FileModelResponse])
async def list_files(
    user=Depends(get_verified_user),
    content: bool = Query(True),
    db: Session = Depends(get_session),
):
    if user.role == "admin":
        files = Files.get_files(db=db)
    else:
        files = Files.get_files_by_user_id(user.id, db=db)

    if not content:
        for file in files:
            if "content" in file.data:
                del file.data["content"]

    return files


############################
# Search Files
############################


@router.get("/search", response_model=list[FileModelResponse])
async def search_files(
    filename: str = Query(
        ...,
        description="Filename pattern to search for. Supports wildcards such as '*.txt'",
    ),
    content: bool = Query(True),
    skip: int = Query(0, ge=0, description="Number of files to skip"),
    limit: int = Query(
        100, ge=1, le=1000, description="Maximum number of files to return"
    ),
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    """
    Search for files by filename with support for wildcard patterns.
    Uses SQL-based filtering with pagination for better performance.
    """
    # Determine user_id: null for admin (search all), user.id for regular users
    user_id = None if user.role == "admin" else user.id

    # Use optimized database query with pagination
    files = Files.search_files(
        user_id=user_id,
        filename=filename,
        skip=skip,
        limit=limit,
        db=db,
    )

    if not files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No files found matching the pattern.",
        )

    if not content:
        for file in files:
            if file.data and "content" in file.data:
                del file.data["content"]

    return files


############################
# Delete All Files
############################


@router.delete("/all")
async def delete_all_files(
    user=Depends(get_admin_user), db: Session = Depends(get_session)
):
    result = Files.delete_all_files(db=db)
    if result:
        try:
            Storage.delete_all_files()
            VECTOR_DB_CLIENT.reset()
        except Exception as e:
            log.exception(e)
            log.error("Error deleting files")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.DEFAULT("Error deleting files"),
            )
        return {"message": "All files deleted successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT("Error deleting files"),
        )


############################
# Get File By Id
############################


@router.get("/{id}", response_model=Optional[FileModel])
async def get_file_by_id(
    id: str, user=Depends(get_verified_user), db: Session = Depends(get_session)
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "read", user, db=db)
    ):
        return file
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )


@router.get("/{id}/process/status")
async def get_file_process_status(
    id: str,
    stream: bool = Query(False),
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "read", user, db=db)
    ):
        if stream:
            MAX_FILE_PROCESSING_DURATION = 3600 * 2

            async def event_stream(file_id):
                # NOTE: We intentionally do NOT capture the request's db session here.
                # Each poll creates its own short-lived session to avoid holding a
                # connection for hours. A WebSocket push would be more efficient.
                for _ in range(MAX_FILE_PROCESSING_DURATION):
                    file_item = Files.get_file_by_id(file_id)  # Creates own session
                    if file_item:
                        data = file_item.model_dump().get("data", {})
                        status = data.get("status")

                        if status:
                            event = {
                                "status": data.get("status", "pending"),
                                "stage": data.get("stage"),
                                "progress_pct": data.get("progress_pct", 0),
                                "message": data.get("message", ""),
                                "current_chunk": data.get("current_chunk", 0),
                                "total_chunks": data.get("total_chunks", 0),
                                "eta_seconds": data.get("eta_seconds"),
                                "content_ready": data.get("content_ready", False),
                                "error": data.get("error"),
                            }

                            yield f"data: {json.dumps(event)}\n\n"
                            if status in ("completed", "failed"):
                                break
                        else:
                            # Legacy
                            break
                    else:
                        yield f"data: {json.dumps({'status': 'not_found'})}\n\n"
                        break

                    await asyncio.sleep(1)

            return StreamingResponse(
                event_stream(file.id),
                media_type="text/event-stream",
            )
        else:
            return {
                "status": file.data.get("status", "pending"),
                "stage": file.data.get("stage"),
                "progress_pct": file.data.get("progress_pct", 0),
                "message": file.data.get("message", ""),
                "current_chunk": file.data.get("current_chunk", 0),
                "total_chunks": file.data.get("total_chunks", 0),
                "eta_seconds": file.data.get("eta_seconds"),
                "content_ready": file.data.get("content_ready", False),
                "error": file.data.get("error"),
            }
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )


############################
# Get File Data Content By Id
############################


@router.get("/{id}/data/content")
async def get_file_data_content_by_id(
    id: str, user=Depends(get_verified_user), db: Session = Depends(get_session)
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "read", user, db=db)
    ):
        return {"content": file.data.get("content", "")}
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )


############################
# Update File Data Content By Id
############################


class ContentForm(BaseModel):
    content: str


@router.post("/{id}/data/content/update")
def update_file_data_content_by_id(
    request: Request,
    id: str,
    form_data: ContentForm,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "write", user, db=db)
    ):
        try:
            process_file(
                request,
                ProcessFileForm(file_id=id, content=form_data.content),
                user=user,
            )
            file = Files.get_file_by_id(id=id, db=db)
        except Exception as e:
            log.exception(e)
            log.error(f"Error processing file: {file.id}")

        return {"content": file.data.get("content", "")}
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )


############################
# Get File Content By Id
############################


@router.get("/{id}/content")
async def get_file_content_by_id(
    id: str,
    user=Depends(get_verified_user),
    attachment: bool = Query(False),
    db: Session = Depends(get_session),
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "read", user, db=db)
    ):
        try:
            file_path = Storage.get_file(file.path)
            file_path = Path(file_path)

            # Check if the file already exists in the cache
            if file_path.is_file():
                # Handle Unicode filenames
                filename = file.meta.get("name", file.filename)
                encoded_filename = quote(filename)  # RFC5987 encoding

                content_type = file.meta.get("content_type")
                filename = file.meta.get("name", file.filename)
                encoded_filename = quote(filename)
                headers = {}

                if attachment:
                    headers["Content-Disposition"] = (
                        f"attachment; filename*=UTF-8''{encoded_filename}"
                    )
                else:
                    if content_type == "application/pdf" or filename.lower().endswith(
                        ".pdf"
                    ):
                        headers["Content-Disposition"] = (
                            f"inline; filename*=UTF-8''{encoded_filename}"
                        )
                        content_type = "application/pdf"
                    elif content_type != "text/plain":
                        headers["Content-Disposition"] = (
                            f"attachment; filename*=UTF-8''{encoded_filename}"
                        )

                return FileResponse(file_path, headers=headers, media_type=content_type)

            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=ERROR_MESSAGES.NOT_FOUND,
                )
        except Exception as e:
            log.exception(e)
            log.error("Error getting file content")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.DEFAULT("Error getting file content"),
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )


@router.get("/{id}/content/html")
async def get_html_file_content_by_id(
    id: str, user=Depends(get_verified_user), db: Session = Depends(get_session)
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    file_user = Users.get_user_by_id(file.user_id, db=db)
    if not file_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "read", user, db=db)
    ):
        try:
            file_path = Storage.get_file(file.path)
            file_path = Path(file_path)

            # Check if the file already exists in the cache
            if file_path.is_file():
                log.info(f"file_path: {file_path}")
                return FileResponse(file_path)
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=ERROR_MESSAGES.NOT_FOUND,
                )
        except Exception as e:
            log.exception(e)
            log.error("Error getting file content")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.DEFAULT("Error getting file content"),
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )


@router.get("/{id}/content/{file_name}")
async def get_file_content_by_id(
    id: str, user=Depends(get_verified_user), db: Session = Depends(get_session)
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "read", user, db=db)
    ):
        file_path = file.path

        # Handle Unicode filenames
        filename = file.meta.get("name", file.filename)
        encoded_filename = quote(filename)  # RFC5987 encoding
        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }

        if file_path:
            file_path = Storage.get_file(file_path)
            file_path = Path(file_path)

            # Check if the file already exists in the cache
            if file_path.is_file():
                return FileResponse(file_path, headers=headers)
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=ERROR_MESSAGES.NOT_FOUND,
                )
        else:
            # File path doesn’t exist, return the content as .txt if possible
            file_content = file.content.get("content", "")
            file_name = file.filename

            # Create a generator that encodes the file content
            def generator():
                yield file_content.encode("utf-8")

            return StreamingResponse(
                generator(),
                media_type="text/plain",
                headers=headers,
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )


############################
# Delete File By Id
############################


@router.delete("/{id}")
async def delete_file_by_id(
    id: str, user=Depends(get_verified_user), db: Session = Depends(get_session)
):
    file = Files.get_file_by_id(id, db=db)

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if (
        file.user_id == user.id
        or user.role == "admin"
        or has_access_to_file(id, "write", user, db=db)
    ):

        # Clean up KB associations and embeddings before deleting
        knowledges = Knowledges.get_knowledges_by_file_id(id, db=db)
        for knowledge in knowledges:
            # Remove KB-file relationship
            Knowledges.remove_file_from_knowledge_by_id(knowledge.id, id, db=db)
            # Clean KB embeddings (same logic as /knowledge/{id}/file/remove)
            try:
                VECTOR_DB_CLIENT.delete(
                    collection_name=knowledge.id, filter={"file_id": id}
                )
                if file.hash:
                    VECTOR_DB_CLIENT.delete(
                        collection_name=knowledge.id, filter={"hash": file.hash}
                    )
            except Exception as e:
                log.debug(f"KB embedding cleanup for {knowledge.id}: {e}")

        result = Files.delete_file_by_id(id, db=db)
        if result:
            try:
                Storage.delete_file(file.path)
                VECTOR_DB_CLIENT.delete(collection_name=f"file-{id}")
            except Exception as e:
                log.exception(e)
                log.error("Error deleting files")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=ERROR_MESSAGES.DEFAULT("Error deleting files"),
                )
            return {"message": "File deleted successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.DEFAULT("Error deleting file"),
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )