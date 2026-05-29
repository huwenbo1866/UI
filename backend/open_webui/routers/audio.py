import hashlib
import json
import logging
import os
import uuid
import html
import base64
from functools import lru_cache
from pydub import AudioSegment
from pydub.silence import detect_nonsilent
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Callable
from opencc import OpenCC
from fnmatch import fnmatch
import aiohttp
import aiofiles
import requests
import mimetypes

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
    APIRouter,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel


from open_webui.utils.misc import strict_match_mime_type
from open_webui.utils.auth import get_admin_user, get_verified_user
from open_webui.utils.access_control import has_permission
from open_webui.utils.headers import include_user_info_headers
from open_webui.config import (
    WHISPER_MODEL_AUTO_UPDATE,
    WHISPER_COMPUTE_TYPE,
    WHISPER_MODEL_DIR,
    WHISPER_VAD_FILTER,
    CACHE_DIR,
    WHISPER_LANGUAGE,
    WHISPER_MULTILINGUAL,
    ELEVENLABS_API_BASE_URL,
)

from open_webui.constants import ERROR_MESSAGES
from open_webui.env import (
    ENV,
    AIOHTTP_CLIENT_SESSION_SSL,
    AIOHTTP_CLIENT_TIMEOUT,
    DEVICE_TYPE,
    ENABLE_FORWARD_USER_INFO_HEADERS,
)


router = APIRouter()

# Constants
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024  # Convert MB to bytes
AZURE_MAX_FILE_SIZE_MB = 200
AZURE_MAX_FILE_SIZE = AZURE_MAX_FILE_SIZE_MB * 1024 * 1024  # Convert MB to bytes

log = logging.getLogger(__name__)

SPEECH_CACHE_DIR = CACHE_DIR / "audio" / "speech"
SPEECH_CACHE_DIR.mkdir(parents=True, exist_ok=True)


##########################################
#
# Utility functions
#
##########################################

from pydub import AudioSegment
from pydub.utils import mediainfo


def is_audio_conversion_required(file_path):
    """
    Check if the given audio file needs conversion to mp3.
    """
    SUPPORTED_FORMATS = {"flac", "m4a", "mp3", "mp4", "mpeg", "wav", "webm"}

    if not os.path.isfile(file_path):
        log.error(f"File not found: {file_path}")
        return False

    try:
        info = mediainfo(file_path)
        codec_name = info.get("codec_name", "").lower()
        codec_type = info.get("codec_type", "").lower()
        codec_tag_string = info.get("codec_tag_string", "").lower()

        if codec_name == "aac" and codec_type == "audio" and codec_tag_string == "mp4a":
            # File is AAC/mp4a audio, recommend mp3 conversion
            return True

        # If the codec name is in the supported formats
        if codec_name in SUPPORTED_FORMATS:
            return False

        return True
    except Exception as e:
        log.error(f"Error getting audio format: {e}")
        return False


def convert_audio_to_mp3(file_path):
    """Convert audio file to mp3 format."""
    try:
        output_path = os.path.splitext(file_path)[0] + ".mp3"
        audio = AudioSegment.from_file(file_path)
        audio.export(output_path, format="mp3")
        log.info(f"Converted {file_path} to {output_path}")
        return output_path
    except Exception as e:
        log.error(f"Error converting audio file: {e}")
        return None



def prepare_audio_for_stt(file_path):
    """
    将输入音视频统一转换为适合 STT 的中间格式：
    - 16kHz
    - mono
    - wav (PCM)
    并做轻量预处理，目标是提升可识别性，而不是单纯缩小体积。
    """
    try:
        base, _ = os.path.splitext(file_path)
        output_path = f"{base}_stt.wav"

        audio = AudioSegment.from_file(file_path)

        # 统一采样率与声道
        audio = audio.set_frame_rate(16000).set_channels(1)

        # 轻量音量归一化：避免过轻/过响
        try:
            from pydub.effects import normalize
            audio = normalize(audio, headroom=1.0)
        except Exception:
            pass

        # 轻量高通，减弱低频噪声（空调/桌面震动/环境低频）
        try:
            audio = audio.high_pass_filter(80)
        except Exception:
            pass

        audio.export(output_path, format="wav")
        log.info(f"Prepared STT audio: {file_path} -> {output_path}")
        return output_path
    except Exception as e:
        log.error(f"Error preparing audio for STT: {e}")
        return file_path



def set_stt_model(
    model_id: str = None,
    model_type: str = "faster-whisper",
    auto_update: bool = False,
    device: str = None,
):
    """
    加载 STT 模型（支持多种模型类型）
    
    Args:
        model_id: 模型 ID（如 "base", "qwen-audio"）
        model_type: 模型类型（"faster-whisper", "qwen-audio"）
        auto_update: 是否允许自动更新/下载模型
        device: 计算设备（"cpu" 或 "cuda"）
    
    Returns:
        加载的模型实例，或 None 如果失败
    """
    from open_webui.utils.stt_models import STTModelFactory
    
    if not model_id:
        return None
    
    try:
        if device is None:
            device = DEVICE_TYPE if DEVICE_TYPE and DEVICE_TYPE == "cuda" else "cpu"
        
        if model_type == "faster-whisper":
            return STTModelFactory.get_model(
                model_id=model_id,
                model_type="faster-whisper",
                device=device,
                compute_type=WHISPER_COMPUTE_TYPE,
                download_root=str(WHISPER_MODEL_DIR),
                local_files_only=not auto_update,
            )
        elif model_type == "qwen-audio":
            return STTModelFactory.get_model(
                model_id="qwen-audio",
                model_type="qwen-audio",
                device=device,
            )
        else:
            log.error(f"Unknown STT model type: {model_type}")
            return None
    except Exception as e:
        log.error(f"Failed to load STT model {model_id} ({model_type}): {e}")
        return None


def set_faster_whisper_model(model: str, auto_update: bool = False):
    """
    兼容旧版本的 Whisper 模型加载函数
    使用新的 STT 模型框架
    """
    return set_stt_model(
        model_id=model,
        model_type="faster-whisper",
        auto_update=auto_update,
    )




def resolve_stt_profile(metadata: Optional[dict] = None, profile: Optional[str] = None) -> str:
    """
    区分两类 STT 场景：
    - interactive: 语音输入 / 语音模式，优先低时延
    - artifact: 音视频文件纪要，优先稳态质量与结构化产物
    """
    normalized = (profile or '').strip().lower()
    if normalized in {'interactive', 'realtime', 'voice', 'dictation'}:
        return 'interactive'
    if normalized in {'artifact', 'minutes', 'file', 'upload'}:
        return 'artifact'

    metadata = metadata or {}
    for key in ('stt_profile', 'profile', 'mode', 'purpose', 'source'):
        value = str(metadata.get(key, '')).strip().lower()
        if value in {'interactive', 'realtime', 'voice', 'dictation'}:
            return 'interactive'
        if value in {'artifact', 'minutes', 'file', 'upload'}:
            return 'artifact'

    # 默认保守：API /audio/transcriptions 走 interactive，文件处理显式传 artifact
    return 'interactive'



_cc_t2s = OpenCC("t2s")


def normalize_to_simplified_chinese(text: str) -> str:
    if not text:
        return text
    return _cc_t2s.convert(text)


def normalize_segments_to_simplified_chinese(segments: list[dict]) -> list[dict]:
    normalized = []

    for seg in segments or []:
        item = dict(seg)
        item["text"] = normalize_to_simplified_chinese((item.get("text") or "").strip())
        normalized.append(item)

    return normalized


def maybe_save_transcript_json(file_dir: str, file_id: str, data: dict, enabled: bool = True):
    if not enabled:
        return

    transcript_file = f"{file_dir}/{file_id}.json"
    with open(transcript_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)



##########################################
#
# Audio API
#
##########################################


class TTSConfigForm(BaseModel):
    OPENAI_API_BASE_URL: str
    OPENAI_API_KEY: str
    OPENAI_PARAMS: Optional[dict] = None
    API_KEY: str
    ENGINE: str
    MODEL: str
    VOICE: str
    SPLIT_ON: str
    AZURE_SPEECH_REGION: str
    AZURE_SPEECH_BASE_URL: str
    AZURE_SPEECH_OUTPUT_FORMAT: str


class STTConfigForm(BaseModel):
    OPENAI_API_BASE_URL: str
    OPENAI_API_KEY: str
    ENGINE: str
    MODEL: str
    SUPPORTED_CONTENT_TYPES: list[str] = []
    WHISPER_MODEL: str
    DEEPGRAM_API_KEY: str
    AZURE_API_KEY: str
    AZURE_REGION: str
    AZURE_LOCALES: str
    AZURE_BASE_URL: str
    AZURE_MAX_SPEAKERS: str
    MISTRAL_API_KEY: str
    MISTRAL_API_BASE_URL: str
    MISTRAL_USE_CHAT_COMPLETIONS: bool


class AudioConfigUpdateForm(BaseModel):
    tts: TTSConfigForm
    stt: STTConfigForm


@router.get("/config")
async def get_audio_config(request: Request, user=Depends(get_admin_user)):
    return {
        "tts": {
            "OPENAI_API_BASE_URL": request.app.state.config.TTS_OPENAI_API_BASE_URL,
            "OPENAI_API_KEY": request.app.state.config.TTS_OPENAI_API_KEY,
            "OPENAI_PARAMS": request.app.state.config.TTS_OPENAI_PARAMS,
            "API_KEY": request.app.state.config.TTS_API_KEY,
            "ENGINE": request.app.state.config.TTS_ENGINE,
            "MODEL": request.app.state.config.TTS_MODEL,
            "VOICE": request.app.state.config.TTS_VOICE,
            "SPLIT_ON": request.app.state.config.TTS_SPLIT_ON,
            "AZURE_SPEECH_REGION": request.app.state.config.TTS_AZURE_SPEECH_REGION,
            "AZURE_SPEECH_BASE_URL": request.app.state.config.TTS_AZURE_SPEECH_BASE_URL,
            "AZURE_SPEECH_OUTPUT_FORMAT": request.app.state.config.TTS_AZURE_SPEECH_OUTPUT_FORMAT,
        },
        "stt": {
            "OPENAI_API_BASE_URL": request.app.state.config.STT_OPENAI_API_BASE_URL,
            "OPENAI_API_KEY": request.app.state.config.STT_OPENAI_API_KEY,
            "ENGINE": request.app.state.config.STT_ENGINE,
            "MODEL": request.app.state.config.STT_MODEL,
            "SUPPORTED_CONTENT_TYPES": request.app.state.config.STT_SUPPORTED_CONTENT_TYPES,
            "WHISPER_MODEL": request.app.state.config.WHISPER_MODEL,
            "DEEPGRAM_API_KEY": request.app.state.config.DEEPGRAM_API_KEY,
            "AZURE_API_KEY": request.app.state.config.AUDIO_STT_AZURE_API_KEY,
            "AZURE_REGION": request.app.state.config.AUDIO_STT_AZURE_REGION,
            "AZURE_LOCALES": request.app.state.config.AUDIO_STT_AZURE_LOCALES,
            "AZURE_BASE_URL": request.app.state.config.AUDIO_STT_AZURE_BASE_URL,
            "AZURE_MAX_SPEAKERS": request.app.state.config.AUDIO_STT_AZURE_MAX_SPEAKERS,
            "MISTRAL_API_KEY": request.app.state.config.AUDIO_STT_MISTRAL_API_KEY,
            "MISTRAL_API_BASE_URL": request.app.state.config.AUDIO_STT_MISTRAL_API_BASE_URL,
            "MISTRAL_USE_CHAT_COMPLETIONS": request.app.state.config.AUDIO_STT_MISTRAL_USE_CHAT_COMPLETIONS,
        },
    }


@router.post("/config/update")
async def update_audio_config(
    request: Request, form_data: AudioConfigUpdateForm, user=Depends(get_admin_user)
):
    request.app.state.config.TTS_OPENAI_API_BASE_URL = form_data.tts.OPENAI_API_BASE_URL
    request.app.state.config.TTS_OPENAI_API_KEY = form_data.tts.OPENAI_API_KEY
    request.app.state.config.TTS_OPENAI_PARAMS = form_data.tts.OPENAI_PARAMS
    request.app.state.config.TTS_API_KEY = form_data.tts.API_KEY
    request.app.state.config.TTS_ENGINE = form_data.tts.ENGINE
    request.app.state.config.TTS_MODEL = form_data.tts.MODEL
    request.app.state.config.TTS_VOICE = form_data.tts.VOICE
    request.app.state.config.TTS_SPLIT_ON = form_data.tts.SPLIT_ON
    request.app.state.config.TTS_AZURE_SPEECH_REGION = form_data.tts.AZURE_SPEECH_REGION
    request.app.state.config.TTS_AZURE_SPEECH_BASE_URL = (
        form_data.tts.AZURE_SPEECH_BASE_URL
    )
    request.app.state.config.TTS_AZURE_SPEECH_OUTPUT_FORMAT = (
        form_data.tts.AZURE_SPEECH_OUTPUT_FORMAT
    )

    request.app.state.config.STT_OPENAI_API_BASE_URL = form_data.stt.OPENAI_API_BASE_URL
    request.app.state.config.STT_OPENAI_API_KEY = form_data.stt.OPENAI_API_KEY
    request.app.state.config.STT_ENGINE = form_data.stt.ENGINE
    request.app.state.config.STT_MODEL = form_data.stt.MODEL
    request.app.state.config.STT_SUPPORTED_CONTENT_TYPES = (
        form_data.stt.SUPPORTED_CONTENT_TYPES
    )

    request.app.state.config.WHISPER_MODEL = form_data.stt.WHISPER_MODEL
    request.app.state.config.DEEPGRAM_API_KEY = form_data.stt.DEEPGRAM_API_KEY
    request.app.state.config.AUDIO_STT_AZURE_API_KEY = form_data.stt.AZURE_API_KEY
    request.app.state.config.AUDIO_STT_AZURE_REGION = form_data.stt.AZURE_REGION
    request.app.state.config.AUDIO_STT_AZURE_LOCALES = form_data.stt.AZURE_LOCALES
    request.app.state.config.AUDIO_STT_AZURE_BASE_URL = form_data.stt.AZURE_BASE_URL
    request.app.state.config.AUDIO_STT_AZURE_MAX_SPEAKERS = (
        form_data.stt.AZURE_MAX_SPEAKERS
    )
    request.app.state.config.AUDIO_STT_MISTRAL_API_KEY = form_data.stt.MISTRAL_API_KEY
    request.app.state.config.AUDIO_STT_MISTRAL_API_BASE_URL = (
        form_data.stt.MISTRAL_API_BASE_URL
    )
    request.app.state.config.AUDIO_STT_MISTRAL_USE_CHAT_COMPLETIONS = (
        form_data.stt.MISTRAL_USE_CHAT_COMPLETIONS
    )

    if request.app.state.config.STT_ENGINE == "":
        request.app.state.faster_whisper_model = set_faster_whisper_model(
            form_data.stt.WHISPER_MODEL, WHISPER_MODEL_AUTO_UPDATE
        )
    else:
        request.app.state.faster_whisper_model = None

    return {
        "tts": {
            "ENGINE": request.app.state.config.TTS_ENGINE,
            "MODEL": request.app.state.config.TTS_MODEL,
            "VOICE": request.app.state.config.TTS_VOICE,
            "OPENAI_API_BASE_URL": request.app.state.config.TTS_OPENAI_API_BASE_URL,
            "OPENAI_API_KEY": request.app.state.config.TTS_OPENAI_API_KEY,
            "OPENAI_PARAMS": request.app.state.config.TTS_OPENAI_PARAMS,
            "API_KEY": request.app.state.config.TTS_API_KEY,
            "SPLIT_ON": request.app.state.config.TTS_SPLIT_ON,
            "AZURE_SPEECH_REGION": request.app.state.config.TTS_AZURE_SPEECH_REGION,
            "AZURE_SPEECH_BASE_URL": request.app.state.config.TTS_AZURE_SPEECH_BASE_URL,
            "AZURE_SPEECH_OUTPUT_FORMAT": request.app.state.config.TTS_AZURE_SPEECH_OUTPUT_FORMAT,
        },
        "stt": {
            "OPENAI_API_BASE_URL": request.app.state.config.STT_OPENAI_API_BASE_URL,
            "OPENAI_API_KEY": request.app.state.config.STT_OPENAI_API_KEY,
            "ENGINE": request.app.state.config.STT_ENGINE,
            "MODEL": request.app.state.config.STT_MODEL,
            "SUPPORTED_CONTENT_TYPES": request.app.state.config.STT_SUPPORTED_CONTENT_TYPES,
            "WHISPER_MODEL": request.app.state.config.WHISPER_MODEL,
            "DEEPGRAM_API_KEY": request.app.state.config.DEEPGRAM_API_KEY,
            "AZURE_API_KEY": request.app.state.config.AUDIO_STT_AZURE_API_KEY,
            "AZURE_REGION": request.app.state.config.AUDIO_STT_AZURE_REGION,
            "AZURE_LOCALES": request.app.state.config.AUDIO_STT_AZURE_LOCALES,
            "AZURE_BASE_URL": request.app.state.config.AUDIO_STT_AZURE_BASE_URL,
            "AZURE_MAX_SPEAKERS": request.app.state.config.AUDIO_STT_AZURE_MAX_SPEAKERS,
            "MISTRAL_API_KEY": request.app.state.config.AUDIO_STT_MISTRAL_API_KEY,
            "MISTRAL_API_BASE_URL": request.app.state.config.AUDIO_STT_MISTRAL_API_BASE_URL,
            "MISTRAL_USE_CHAT_COMPLETIONS": request.app.state.config.AUDIO_STT_MISTRAL_USE_CHAT_COMPLETIONS,
        },
    }


def load_speech_pipeline(request):
    from transformers import pipeline
    from datasets import load_dataset

    if request.app.state.speech_synthesiser is None:
        request.app.state.speech_synthesiser = pipeline(
            "text-to-speech", "microsoft/speecht5_tts"
        )

    if request.app.state.speech_speaker_embeddings_dataset is None:
        request.app.state.speech_speaker_embeddings_dataset = load_dataset(
            "Matthijs/cmu-arctic-xvectors", split="validation"
        )


@router.post("/speech")
async def speech(request: Request, user=Depends(get_verified_user)):
    if request.app.state.config.TTS_ENGINE == "":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if user.role != "admin" and not has_permission(
        user.id, "chat.tts", request.app.state.config.USER_PERMISSIONS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
        )

    body = await request.body()
    name = hashlib.sha256(
        body
        + str(request.app.state.config.TTS_ENGINE).encode("utf-8")
        + str(request.app.state.config.TTS_MODEL).encode("utf-8")
    ).hexdigest()

    file_path = SPEECH_CACHE_DIR.joinpath(f"{name}.mp3")
    file_body_path = SPEECH_CACHE_DIR.joinpath(f"{name}.json")

    # Check if the file already exists in the cache
    if file_path.is_file():
        return FileResponse(file_path)

    payload = None
    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception as e:
        log.exception(e)
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    r = None
    if request.app.state.config.TTS_ENGINE == "openai":
        payload["model"] = request.app.state.config.TTS_MODEL

        try:
            timeout = aiohttp.ClientTimeout(total=AIOHTTP_CLIENT_TIMEOUT)
            async with aiohttp.ClientSession(
                timeout=timeout, trust_env=True
            ) as session:
                payload = {
                    **payload,
                    **(request.app.state.config.TTS_OPENAI_PARAMS or {}),
                }

                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {request.app.state.config.TTS_OPENAI_API_KEY}",
                }
                if ENABLE_FORWARD_USER_INFO_HEADERS:
                    headers = include_user_info_headers(headers, user)

                r = await session.post(
                    url=f"{request.app.state.config.TTS_OPENAI_API_BASE_URL}/audio/speech",
                    json=payload,
                    headers=headers,
                    ssl=AIOHTTP_CLIENT_SESSION_SSL,
                )

                r.raise_for_status()

                async with aiofiles.open(file_path, "wb") as f:
                    await f.write(await r.read())

                async with aiofiles.open(file_body_path, "w") as f:
                    await f.write(json.dumps(payload))

            return FileResponse(file_path)

        except Exception as e:
            log.exception(e)
            detail = None

            status_code = 500
            detail = f"Open WebUI: Server Connection Error"

            if r is not None:
                status_code = r.status

                try:
                    res = await r.json()
                    if "error" in res:
                        detail = f"External: {res['error']}"
                except Exception:
                    detail = f"External: {e}"

            raise HTTPException(
                status_code=status_code,
                detail=detail,
            )

    elif request.app.state.config.TTS_ENGINE == "elevenlabs":
        voice_id = payload.get("voice", "")

        if voice_id not in get_available_voices(request):
            raise HTTPException(
                status_code=400,
                detail="Invalid voice id",
            )

        try:
            timeout = aiohttp.ClientTimeout(total=AIOHTTP_CLIENT_TIMEOUT)
            async with aiohttp.ClientSession(
                timeout=timeout, trust_env=True
            ) as session:
                async with session.post(
                    f"{ELEVENLABS_API_BASE_URL}/v1/text-to-speech/{voice_id}",
                    json={
                        "text": payload["input"],
                        "model_id": request.app.state.config.TTS_MODEL,
                        "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
                    },
                    headers={
                        "Accept": "audio/mpeg",
                        "Content-Type": "application/json",
                        "xi-api-key": request.app.state.config.TTS_API_KEY,
                    },
                    ssl=AIOHTTP_CLIENT_SESSION_SSL,
                ) as r:
                    r.raise_for_status()

                    async with aiofiles.open(file_path, "wb") as f:
                        await f.write(await r.read())

                    async with aiofiles.open(file_body_path, "w") as f:
                        await f.write(json.dumps(payload))

            return FileResponse(file_path)

        except Exception as e:
            log.exception(e)
            detail = None

            try:
                if r.status != 200:
                    res = await r.json()
                    if "error" in res:
                        detail = f"External: {res['error'].get('message', '')}"
            except Exception:
                detail = f"External: {e}"

            raise HTTPException(
                status_code=getattr(r, "status", 500) if r else 500,
                detail=detail if detail else "Open WebUI: Server Connection Error",
            )

    elif request.app.state.config.TTS_ENGINE == "azure":
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception as e:
            log.exception(e)
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        region = request.app.state.config.TTS_AZURE_SPEECH_REGION or "eastus"
        base_url = request.app.state.config.TTS_AZURE_SPEECH_BASE_URL
        language = request.app.state.config.TTS_VOICE
        locale = "-".join(request.app.state.config.TTS_VOICE.split("-")[:1])
        output_format = request.app.state.config.TTS_AZURE_SPEECH_OUTPUT_FORMAT

        try:
            data = f"""<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{locale}">
                <voice name="{language}">{html.escape(payload["input"])}</voice>
            </speak>"""
            timeout = aiohttp.ClientTimeout(total=AIOHTTP_CLIENT_TIMEOUT)
            async with aiohttp.ClientSession(
                timeout=timeout, trust_env=True
            ) as session:
                async with session.post(
                    (base_url or f"https://{region}.tts.speech.microsoft.com")
                    + "/cognitiveservices/v1",
                    headers={
                        "Ocp-Apim-Subscription-Key": request.app.state.config.TTS_API_KEY,
                        "Content-Type": "application/ssml+xml",
                        "X-Microsoft-OutputFormat": output_format,
                    },
                    data=data,
                    ssl=AIOHTTP_CLIENT_SESSION_SSL,
                ) as r:
                    r.raise_for_status()

                    async with aiofiles.open(file_path, "wb") as f:
                        await f.write(await r.read())

                    async with aiofiles.open(file_body_path, "w") as f:
                        await f.write(json.dumps(payload))

                    return FileResponse(file_path)

        except Exception as e:
            log.exception(e)
            detail = None

            try:
                if r.status != 200:
                    res = await r.json()
                    if "error" in res:
                        detail = f"External: {res['error'].get('message', '')}"
            except Exception:
                detail = f"External: {e}"

            raise HTTPException(
                status_code=getattr(r, "status", 500) if r else 500,
                detail=detail if detail else "Open WebUI: Server Connection Error",
            )

    elif request.app.state.config.TTS_ENGINE == "transformers":
        payload = None
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception as e:
            log.exception(e)
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        import torch
        import soundfile as sf

        load_speech_pipeline(request)

        embeddings_dataset = request.app.state.speech_speaker_embeddings_dataset

        speaker_index = 6799
        try:
            speaker_index = embeddings_dataset["filename"].index(
                request.app.state.config.TTS_MODEL
            )
        except Exception:
            pass

        speaker_embedding = torch.tensor(
            embeddings_dataset[speaker_index]["xvector"]
        ).unsqueeze(0)

        speech = request.app.state.speech_synthesiser(
            payload["input"],
            forward_params={"speaker_embeddings": speaker_embedding},
        )

        sf.write(file_path, speech["audio"], samplerate=speech["sampling_rate"])

        async with aiofiles.open(file_body_path, "w") as f:
            await f.write(json.dumps(payload))

        return FileResponse(file_path)


def transcription_handler(
    request,
    file_path,
    metadata,
    user=None,
    stt_profile: str = "interactive",
    save_transcript_file: bool = False,
    stt_model_type: str = "faster-whisper",  # 支持指定 STT 模型类型
):
    filename = os.path.basename(file_path)
    file_dir = os.path.dirname(file_path)
    id = filename.split(".")[0]

    metadata = metadata or {}

    languages = [
        metadata.get("language", None) if not WHISPER_LANGUAGE else WHISPER_LANGUAGE,
        None,  # Always fallback to None in case transcription fails
    ]

    if request.app.state.config.STT_ENGINE == "":
        # 根据 stt_model_type 加载相应的模型
        if stt_model_type == "qwen-audio":
            # 使用 qwen-audio 模型
            if not hasattr(request.app.state, "qwen_audio_model"):
                request.app.state.qwen_audio_model = None
            
            if request.app.state.qwen_audio_model is None:
                request.app.state.qwen_audio_model = set_stt_model(
                    model_id="qwen-audio",
                    model_type="qwen-audio",
                    device=DEVICE_TYPE if DEVICE_TYPE and DEVICE_TYPE == "cuda" else "cpu",
                )
            
            model = request.app.state.qwen_audio_model
        else:
            # 默认使用 faster-whisper
            if request.app.state.faster_whisper_model is None:
                request.app.state.faster_whisper_model = set_faster_whisper_model(
                    request.app.state.config.WHISPER_MODEL
                )
            model = request.app.state.faster_whisper_model
        
        if model is None:
            raise Exception(f"Failed to load STT model: {stt_model_type}")
        
        try:
            # 使用新的 STT 模型框架的转录方法
            data = model.transcribe(
                audio_path=file_path,
                language=languages[0],
                stt_profile=stt_profile,
                multilingual=WHISPER_MULTILINGUAL,
            )
            
            # 转录结果中文本标准化
            data["text"] = normalize_to_simplified_chinese((data.get("text") or "").strip())
            data["segments"] = normalize_segments_to_simplified_chinese(data.get("segments", []))
            
            log.info(
                "Detected language '%s'"
                % (data.get("detected_language", "unknown"),)
            )
            
            maybe_save_transcript_json(file_dir, id, data, enabled=save_transcript_file)
            log.debug(data)
            return data
        
        except Exception as e:
            log.exception(f"Error in STT transcription: {e}")
            raise Exception(f"STT transcription failed: {e}")

    elif request.app.state.config.STT_ENGINE == "openai":
        r = None
        try:
            for language in languages:
                payload = {
                    "model": request.app.state.config.STT_MODEL,
                }

                if language:
                    payload["language"] = language

                headers = {
                    "Authorization": f"Bearer {request.app.state.config.STT_OPENAI_API_KEY}"
                }
                if user and ENABLE_FORWARD_USER_INFO_HEADERS:
                    headers = include_user_info_headers(headers, user)

                r = requests.post(
                    url=f"{request.app.state.config.STT_OPENAI_API_BASE_URL}/audio/transcriptions",
                    headers=headers,
                    files={"file": (filename, open(file_path, "rb"))},
                    data=payload,
                )

                if r.status_code == 200:
                    # Successful transcription
                    break

            r.raise_for_status()
            response_data = r.json()
            data = {
                "text": normalize_to_simplified_chinese(
                    (response_data.get("text") or "").strip()
                ),
                "detected_language": response_data.get("language"),
                "segments": normalize_segments_to_simplified_chinese(
                    response_data.get("segments", [])
                ),
            }

            maybe_save_transcript_json(file_dir, id, data, enabled=save_transcript_file)

            return data
        except Exception as e:
            log.exception(e)

            detail = None
            if r is not None:
                try:
                    res = r.json()
                    if "error" in res:
                        detail = f"External: {res['error'].get('message', '')}"
                except Exception:
                    detail = f"External: {e}"

            raise Exception(detail if detail else "Open WebUI: Server Connection Error")

    elif request.app.state.config.STT_ENGINE == "deepgram":
        try:
            # Determine the MIME type of the file
            mime, _ = mimetypes.guess_type(file_path)
            if not mime:
                mime = "audio/wav"  # fallback to wav if undetectable

            # Read the audio file
            with open(file_path, "rb") as f:
                file_data = f.read()

            # Build headers and parameters
            headers = {
                "Authorization": f"Token {request.app.state.config.DEEPGRAM_API_KEY}",
                "Content-Type": mime,
            }

            for language in languages:
                params = {}
                if request.app.state.config.STT_MODEL:
                    params["model"] = request.app.state.config.STT_MODEL

                if language:
                    params["language"] = language

                # Make request to Deepgram API
                r = requests.post(
                    "https://api.deepgram.com/v1/listen?smart_format=true",
                    headers=headers,
                    params=params,
                    data=file_data,
                )

                if r.status_code == 200:
                    # Successful transcription
                    break

            r.raise_for_status()
            response_data = r.json()

            # Extract transcript from Deepgram response
            try:
                transcript = response_data["results"]["channels"][0]["alternatives"][
                    0
                ].get("transcript", "")
            except (KeyError, IndexError) as e:
                log.error(f"Malformed response from Deepgram: {str(e)}")
                raise Exception(
                    "Failed to parse Deepgram response - unexpected response format"
                )
            data = {
                "text": normalize_to_simplified_chinese(transcript.strip()),
                "detected_language": metadata.get("language") if metadata else None,
                "segments": [],
            }

            maybe_save_transcript_json(file_dir, id, data, enabled=save_transcript_file)

            return data

        except Exception as e:
            log.exception(e)
            detail = None
            if r is not None:
                try:
                    res = r.json()
                    if "error" in res:
                        detail = f"External: {res['error'].get('message', '')}"
                except Exception:
                    detail = f"External: {e}"
            raise Exception(detail if detail else "Open WebUI: Server Connection Error")

    elif request.app.state.config.STT_ENGINE == "azure":
        # Check file exists and size
        if not os.path.exists(file_path):
            raise HTTPException(status_code=400, detail="Audio file not found")

        # Check file size (Azure has a larger limit of 200MB)
        file_size = os.path.getsize(file_path)
        if file_size > AZURE_MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds Azure's limit of {AZURE_MAX_FILE_SIZE_MB}MB",
            )

        api_key = request.app.state.config.AUDIO_STT_AZURE_API_KEY
        region = request.app.state.config.AUDIO_STT_AZURE_REGION or "eastus"
        locales = request.app.state.config.AUDIO_STT_AZURE_LOCALES
        base_url = request.app.state.config.AUDIO_STT_AZURE_BASE_URL
        max_speakers = request.app.state.config.AUDIO_STT_AZURE_MAX_SPEAKERS or 3

        # IF NO LOCALES, USE DEFAULTS
        if len(locales) < 2:
            locales = [
                "en-US",
                "es-ES",
                "es-MX",
                "fr-FR",
                "hi-IN",
                "it-IT",
                "de-DE",
                "en-GB",
                "en-IN",
                "ja-JP",
                "ko-KR",
                "pt-BR",
                "zh-CN",
            ]
            locales = ",".join(locales)

        if not api_key or not region:
            raise HTTPException(
                status_code=400,
                detail="Azure API key is required for Azure STT",
            )

        r = None
        try:
            # Prepare the request
            data = {
                "definition": json.dumps(
                    {
                        "locales": locales.split(","),
                        "diarization": {"maxSpeakers": max_speakers, "enabled": True},
                    }
                    if locales
                    else {}
                )
            }

            url = (
                base_url or f"https://{region}.api.cognitive.microsoft.com"
            ) + "/speechtotext/transcriptions:transcribe?api-version=2024-11-15"

            # Use context manager to ensure file is properly closed
            with open(file_path, "rb") as audio_file:
                r = requests.post(
                    url=url,
                    files={"audio": audio_file},
                    data=data,
                    headers={
                        "Ocp-Apim-Subscription-Key": api_key,
                    },
                )

            r.raise_for_status()
            response = r.json()

            # Extract transcript from response
            if not response.get("combinedPhrases"):
                raise ValueError("No transcription found in response")

            # Get the full transcript from combinedPhrases
            transcript = response["combinedPhrases"][0].get("text", "").strip()
            if not transcript:
                raise ValueError("Empty transcript in response")

            data = {
                "text": normalize_to_simplified_chinese(transcript.strip()),
                "detected_language": metadata.get("language") if metadata else None,
                "segments": [],
            }

            maybe_save_transcript_json(file_dir, id, data, enabled=save_transcript_file)

            log.debug(data)
            return data

        except (KeyError, IndexError, ValueError) as e:
            log.exception("Error parsing Azure response")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse Azure response: {str(e)}",
            )
        except requests.exceptions.RequestException as e:
            log.exception(e)
            detail = None

            try:
                if r is not None and r.status_code != 200:
                    res = r.json()
                    if "error" in res:
                        detail = f"External: {res['error'].get('message', '')}"
            except Exception:
                detail = f"External: {e}"

            raise HTTPException(
                status_code=getattr(r, "status_code", 500) if r else 500,
                detail=detail if detail else "Open WebUI: Server Connection Error",
            )

    elif request.app.state.config.STT_ENGINE == "mistral":
        # Check file exists
        if not os.path.exists(file_path):
            raise HTTPException(status_code=400, detail="Audio file not found")

        # Check file size
        file_size = os.path.getsize(file_path)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds limit of {MAX_FILE_SIZE_MB}MB",
            )

        api_key = request.app.state.config.AUDIO_STT_MISTRAL_API_KEY
        api_base_url = (
            request.app.state.config.AUDIO_STT_MISTRAL_API_BASE_URL
            or "https://api.mistral.ai/v1"
        )
        use_chat_completions = (
            request.app.state.config.AUDIO_STT_MISTRAL_USE_CHAT_COMPLETIONS
        )

        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="Mistral API key is required for Mistral STT",
            )

        r = None
        try:
            # Use voxtral-mini-latest as the default model for transcription
            model = request.app.state.config.STT_MODEL or "voxtral-mini-latest"

            log.info(
                f"Mistral STT - model: {model}, "
                f"method: {'chat_completions' if use_chat_completions else 'transcriptions'}"
            )

            if use_chat_completions:
                # Use chat completions API with audio input
                # This method requires mp3 or wav format
                audio_file_to_use = file_path

                if is_audio_conversion_required(file_path):
                    log.debug("Converting audio to mp3 for chat completions API")
                    converted_path = convert_audio_to_mp3(file_path)
                    if converted_path:
                        audio_file_to_use = converted_path
                    else:
                        log.error("Audio conversion failed")
                        raise HTTPException(
                            status_code=500,
                            detail="Audio conversion failed. Chat completions API requires mp3 or wav format.",
                        )

                # Read and encode audio file as base64
                with open(audio_file_to_use, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode("utf-8")

                # Prepare chat completions request
                url = f"{api_base_url}/chat/completions"

                # Add language instruction if specified
                language = metadata.get("language", None) if metadata else None
                if language:
                    text_instruction = f"Transcribe this audio exactly as spoken in {language}. Do not translate it."
                else:
                    text_instruction = "Transcribe this audio exactly as spoken in its original language. Do not translate it to another language."

                payload = {
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_audio",
                                    "input_audio": audio_base64,
                                },
                                {"type": "text", "text": text_instruction},
                            ],
                        }
                    ],
                }

                r = requests.post(
                    url=url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                )

                r.raise_for_status()
                response = r.json()

                # Extract transcript from chat completion response
                transcript = (
                    response.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )
                if not transcript:
                    raise ValueError("Empty transcript in response")

                data = {
                    "text": normalize_to_simplified_chinese(transcript.strip()),
                    "detected_language": metadata.get("language") if metadata else None,
                    "segments": [],
                }

            else:
                # Use dedicated transcriptions API
                url = f"{api_base_url}/audio/transcriptions"

                # Determine the MIME type
                mime_type, _ = mimetypes.guess_type(file_path)
                if not mime_type:
                    mime_type = "audio/webm"

                # Use context manager to ensure file is properly closed
                with open(file_path, "rb") as audio_file:
                    files = {"file": (filename, audio_file, mime_type)}
                    data_form = {"model": model}

                    # Add language if specified in metadata
                    language = metadata.get("language", None) if metadata else None
                    if language:
                        data_form["language"] = language

                    r = requests.post(
                        url=url,
                        files=files,
                        data=data_form,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                        },
                    )

                r.raise_for_status()
                response = r.json()

                # Extract transcript from response
                transcript = response.get("text", "").strip()
                if not transcript:
                    raise ValueError("Empty transcript in response")

                data = {
                    "text": normalize_to_simplified_chinese(transcript.strip()),
                    "detected_language": metadata.get("language") if metadata else None,
                    "segments": [],
                }

            # Save transcript to json file (consistent with other providers)
            maybe_save_transcript_json(file_dir, id, data, enabled=save_transcript_file)

            log.debug(data)
            return data

        except ValueError as e:
            log.exception("Error parsing Mistral response")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse Mistral response: {str(e)}",
            )
        except requests.exceptions.RequestException as e:
            log.exception(e)
            detail = None

            try:
                if r is not None and r.status_code != 200:
                    res = r.json()
                    if "error" in res:
                        detail = f"External: {res['error'].get('message', '')}"
                    else:
                        detail = f"External: {r.text}"
            except Exception:
                detail = f"External: {e}"

            raise HTTPException(
                status_code=getattr(r, "status_code", 500) if r else 500,
                detail=detail if detail else "Open WebUI: Server Connection Error",
            )


def transcribe(
    request: Request,
    file_path: str,
    metadata: Optional[dict] = None,
    user=None,
    progress_callback: Optional[Callable[..., None]] = None,
    profile: Optional[str] = None,
    stt_model_type: str = "faster-whisper",  # 支持指定 STT 模型类型
):
    log.info(f"transcribe: {file_path} {metadata} (model_type: {stt_model_type})")

    stt_profile = resolve_stt_profile(metadata, profile)

    def emit_progress(**kwargs):
        if progress_callback:
            try:
                progress_callback(**kwargs)
            except Exception as e:
                # 不要让进度回调本身影响主流程
                log.exception(e)

    if stt_profile == "interactive":
        emit_progress(
            stage="transcribing",
            progress_pct=15,
            message="正在识别语音",
        )

        result = transcription_handler(
            request,
            file_path,
            metadata,
            user,
            stt_profile="interactive",
            save_transcript_file=False,
            stt_model_type=stt_model_type,
        )

        emit_progress(
            stage="transcribing",
            progress_pct=100,
            message="语音识别完成",
        )

        return {
            "text": (result.get("text") or "").strip(),
            "segments": result.get("segments") or [],
            "detected_language": result.get("detected_language"),
            "chunk_count": 1,
        }

    emit_progress(
        stage="extracting_audio",
        progress_pct=5,
        message="正在抽取音频",
    )

    emit_progress(
        stage="preprocessing_audio",
        progress_pct=10,
        message="正在预处理音频",
    )

    try:
        file_path = prepare_audio_for_stt(file_path)
    except Exception as e:
        log.exception(e)

    emit_progress(
        stage="segmenting",
        progress_pct=15,
        message="正在切分音频",
    )

    chunk_items = [
        {
            "index": 0,
            "path": file_path,
            "logical_start_ms": 0,
            "logical_end_ms": 0,
            "export_start_ms": 0,
            "export_end_ms": 0,
        }
    ]

    try:
        chunk_items = split_audio(
            file_path,
            MAX_FILE_SIZE,
            format="wav",
        )
        log.info(f"Chunk items: {chunk_items}")
    except Exception as e:
        log.exception(e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT(e),
        )

    total_chunks = len(chunk_items)

    emit_progress(
        stage="transcribing",
        progress_pct=20,
        current_chunk=0,
        total_chunks=total_chunks,
        message=f"正在识别第 0/{total_chunks} 段",
    )

    # 用固定长度数组保存结果，保证最后拼接顺序和 chunk 顺序一致
    results = [None] * total_chunks

    # 限制并发，别无脑开满
    max_workers = max(
        1,
        min(int(os.getenv("STT_MAX_WORKERS", "2")), total_chunks),
    )

    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_idx = {
                executor.submit(
                    transcription_handler,
                    request,
                    chunk["path"],
                    metadata,
                    user,
                    "artifact",
                    True,
                    stt_model_type,  # 传递 stt_model_type 参数
                ): idx
                for idx, chunk in enumerate(chunk_items)
            }

            done_count = 0

            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]

                try:
                    result = future.result()
                    chunk = chunk_items[idx]

                    # 把 chunk 的时间信息挂到结果上，后面统一合并
                    result["_chunk"] = chunk

                    results[idx] = result
                    done_count += 1

                    pct = 20 + int((done_count / total_chunks) * 55)

                    emit_progress(
                        stage="transcribing",
                        progress_pct=pct,
                        current_chunk=done_count,
                        total_chunks=total_chunks,
                        message=f"正在识别第 {done_count}/{total_chunks} 段",
                    )

                except Exception as transcribe_exc:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Error transcribing chunk: {transcribe_exc}",
                    )
    finally:
        # 只清理临时 chunk，不删主文件
        for chunk in chunk_items:
            chunk_path = chunk["path"]
            if chunk_path != file_path and os.path.isfile(chunk_path):
                try:
                    os.remove(chunk_path)
                except Exception:
                    pass

    emit_progress(
        stage="transcribing",
        progress_pct=75,
        current_chunk=total_chunks,
        total_chunks=total_chunks,
        message="音频识别完成",
    )

    merged_texts = []
    merged_segments = []
    detected_languages = []

    for result in results:
        if not result:
            continue

        text = (result.get("text") or "").strip()
        if text:
            merged_texts.append(text)

        if result.get("detected_language"):
            detected_languages.append(result["detected_language"])

        chunk = result.get("_chunk", {})
        chunk_export_start_ms = chunk.get("export_start_ms", 0)
        chunk_export_end_ms = chunk.get("export_end_ms", chunk_export_start_ms)

        raw_segments = result.get("segments") or []

        if raw_segments:
            for seg in raw_segments:
                seg_text = (seg.get("text") or "").strip()
                if not seg_text:
                    continue

                merged_segments.append(
                    {
                        "start_ms": chunk_export_start_ms + int(seg.get("start_ms", 0)),
                        "end_ms": chunk_export_start_ms + int(seg.get("end_ms", 0)),
                        "text": seg_text,
                    }
                )
        else:
            # provider 没有返回细粒度 segments，就退化成一个 chunk 级 segment
            if text:
                merged_segments.append(
                    {
                        "start_ms": chunk_export_start_ms,
                        "end_ms": chunk_export_end_ms,
                        "text": text,
                    }
                )

    final_detected_language = detected_languages[0] if detected_languages else None

    return {
        "text": " ".join(merged_texts).strip(),
        "segments": merged_segments,
        "detected_language": final_detected_language,
        "chunk_count": total_chunks,
    }


def compress_audio(file_path):
    if os.path.getsize(file_path) > MAX_FILE_SIZE:
        id = os.path.splitext(os.path.basename(file_path))[
            0
        ]  # Handles names with multiple dots
        file_dir = os.path.dirname(file_path)

        audio = AudioSegment.from_file(file_path)
        audio = audio.set_frame_rate(16000).set_channels(1)  # Compress audio

        compressed_path = os.path.join(file_dir, f"{id}_compressed.mp3")
        audio.export(compressed_path, format="mp3", bitrate="32k")
        # log.debug(f"Compressed audio to {compressed_path}")  # Uncomment if log is defined

        return compressed_path
    else:
        return file_path



def get_dynamic_split_params(audio: AudioSegment):
    duration_ms = len(audio)
    duration_min = duration_ms / 60000

    if audio.dBFS == float("-inf"):
        silence_thresh = -40
    else:
        # 比整体平均音量低一些，别太激进
        silence_thresh = max(-45, audio.dBFS - 14)

    if duration_min <= 5:
        return {
            "min_silence_len": 400,
            "silence_thresh": silence_thresh,
            "seek_step": 10,
            "keep_silence_ms": 250,
            "overlap_ms": 450,
            "min_chunk_ms": 4000,
            "target_chunk_ms": 10000,
            "max_chunk_ms": 16000,
            "merge_gap_ms": 150,
        }
    elif duration_min <= 30:
        return {
            "min_silence_len": 500,
            "silence_thresh": silence_thresh,
            "seek_step": 10,
            "keep_silence_ms": 300,
            "overlap_ms": 600,
            "min_chunk_ms": 5000,
            "target_chunk_ms": 14000,
            "max_chunk_ms": 22000,
            "merge_gap_ms": 200,
        }
    elif duration_min <= 90:
        return {
            "min_silence_len": 650,
            "silence_thresh": silence_thresh,
            "seek_step": 15,
            "keep_silence_ms": 350,
            "overlap_ms": 700,
            "min_chunk_ms": 7000,
            "target_chunk_ms": 18000,
            "max_chunk_ms": 28000,
            "merge_gap_ms": 250,
        }
    else:
        return {
            "min_silence_len": 800,
            "silence_thresh": silence_thresh,
            "seek_step": 20,
            "keep_silence_ms": 400,
            "overlap_ms": 800,
            "min_chunk_ms": 8000,
            "target_chunk_ms": 22000,
            "max_chunk_ms": 32000,
            "merge_gap_ms": 300,
        }


def _merge_intervals(intervals, max_gap_ms=200):
    if not intervals:
        return []

    intervals = sorted(intervals, key=lambda x: x[0])
    merged = [list(intervals[0])]

    for start, end in intervals[1:]:
        last = merged[-1]
        if start <= last[1] + max_gap_ms:
            last[1] = max(last[1], end)
        else:
            merged.append([start, end])

    return [(s, e) for s, e in merged]


def _merge_short_intervals(intervals, min_chunk_ms):
    if not intervals:
        return []

    merged = []
    i = 0
    n = len(intervals)

    while i < n:
        start, end = intervals[i]

        while (end - start) < min_chunk_ms and i + 1 < n:
            i += 1
            _, next_end = intervals[i]
            end = next_end

        merged.append((start, end))
        i += 1

    if len(merged) >= 2 and (merged[-1][1] - merged[-1][0]) < min_chunk_ms:
        prev_start, _ = merged[-2]
        _, last_end = merged[-1]
        merged[-2] = (prev_start, last_end)
        merged.pop()

    return merged


def _find_best_split_point(
    audio: AudioSegment,
    desired_ms: int,
    search_start_ms: int,
    search_end_ms: int,
    silence_thresh: float,
    seek_step: int = 10,
    probe_ms: int = 300,
):
    """
    在 desired_ms 附近找一个更像“静音边界”的切点。
    找不到就退回 desired_ms。
    """
    best_point = desired_ms
    best_score = None

    half_probe = probe_ms // 2
    search_start_ms = max(0, search_start_ms)
    search_end_ms = min(len(audio), search_end_ms)

    for p in range(search_start_ms, search_end_ms + 1, seek_step):
        left = max(0, p - half_probe)
        right = min(len(audio), p + half_probe)
        seg = audio[left:right]

        dbfs = seg.dBFS
        if dbfs == float("-inf"):
            dbfs = -100

        if dbfs < silence_thresh:
            score = abs(p - desired_ms)
            if best_score is None or score < best_score:
                best_score = score
                best_point = p

    return best_point


def _split_long_interval_by_silence(
    audio: AudioSegment,
    start_ms: int,
    end_ms: int,
    target_chunk_ms: int,
    max_chunk_ms: int,
    min_chunk_ms: int,
    silence_thresh: float,
    seek_step: int,
):
    """
    对过长区间继续切，但尽量切在“目标位置附近的静音点”。
    注意：这里返回的是“逻辑区间”，不带 overlap。
    overlap 只在导出文件时再加，避免子区间又被合并回去。
    """
    intervals = []
    cursor = start_ms

    while cursor < end_ms:
        remaining = end_ms - cursor
        if remaining <= max_chunk_ms:
            intervals.append((cursor, end_ms))
            break

        desired_cut = cursor + target_chunk_ms
        search_window_ms = min(5000, max(1500, target_chunk_ms // 3))

        cut = _find_best_split_point(
            audio=audio,
            desired_ms=desired_cut,
            search_start_ms=max(cursor + min_chunk_ms, desired_cut - search_window_ms),
            search_end_ms=min(end_ms - min_chunk_ms, desired_cut + search_window_ms),
            silence_thresh=silence_thresh,
            seek_step=seek_step,
            probe_ms=300,
        )

        if cut - cursor < min_chunk_ms:
            cut = min(cursor + target_chunk_ms, end_ms)

        if cut - cursor > max_chunk_ms:
            cut = cursor + max_chunk_ms

        if end_ms - cut < min_chunk_ms and (end_ms - cursor) <= (max_chunk_ms + min_chunk_ms):
            intervals.append((cursor, end_ms))
            break

        if cut <= cursor or cut >= end_ms:
            cut = min(cursor + target_chunk_ms, end_ms)

        intervals.append((cursor, cut))
        cursor = cut

    return intervals


def _export_segment_with_fallback(
    audio,
    start_ms,
    end_ms,
    base_path,
    index_holder,
    max_bytes,
    format="mp3",
    bitrate="48k",
    overlap_ms=600,
    min_export_ms=4000,
):
    """
    导出区间；如果仍超大小限制，则递归二分。
    """
    segment = audio[start_ms:end_ms]
    chunk_path = f"{base_path}_chunk_{index_holder[0]}.{format}"
    index_holder[0] += 1

    export_kwargs = {"format": format}
    if format == "mp3":
        export_kwargs["bitrate"] = bitrate

    segment.export(chunk_path, **export_kwargs)

    if os.path.getsize(chunk_path) <= max_bytes:
        return [chunk_path]

    try:
        os.remove(chunk_path)
    except Exception:
        pass

    duration_ms = end_ms - start_ms
    if duration_ms <= min_export_ms:
        raise Exception("Audio chunk cannot be reduced below max file size.")

    mid = start_ms + duration_ms // 2

    left_end = min(end_ms, mid + overlap_ms // 2)
    right_start = max(start_ms, mid - overlap_ms // 2)

    left_paths = _export_segment_with_fallback(
        audio,
        start_ms,
        left_end,
        base_path,
        index_holder,
        max_bytes,
        format=format,
        bitrate=bitrate,
        overlap_ms=overlap_ms,
        min_export_ms=min_export_ms,
    )

    right_paths = _export_segment_with_fallback(
        audio,
        right_start,
        end_ms,
        base_path,
        index_holder,
        max_bytes,
        format=format,
        bitrate=bitrate,
        overlap_ms=overlap_ms,
        min_export_ms=min_export_ms,
    )

    return left_paths + right_paths



def split_audio(
    file_path,
    max_bytes,
    format="mp3",
    bitrate="48k",
    min_silence_len=None,
    silence_thresh=None,
    seek_step=None,
    keep_silence_ms=None,
    overlap_ms=None,
    min_chunk_ms=None,
    target_chunk_ms=None,
    max_chunk_ms=None,
    merge_gap_ms=None,
):
    """
    更适合课堂录音的切分逻辑：

    1) 先按静音边界找语音区间
    2) 扩边保留一点上下文
    3) 合并过短片段 / 近邻片段
    4) 对过长片段在“附近静音点”继续切
    5) 导出时再加 overlap
    6) 若 chunk 仍超大小限制，再递归二分兜底
    """

    audio = AudioSegment.from_file(file_path)
    duration_ms = len(audio)
    file_size = os.path.getsize(file_path)

    dyn = get_dynamic_split_params(audio)

    min_silence_len = dyn["min_silence_len"] if min_silence_len is None else min_silence_len
    silence_thresh = dyn["silence_thresh"] if silence_thresh is None else silence_thresh
    seek_step = dyn["seek_step"] if seek_step is None else seek_step
    keep_silence_ms = dyn["keep_silence_ms"] if keep_silence_ms is None else keep_silence_ms
    overlap_ms = dyn["overlap_ms"] if overlap_ms is None else overlap_ms
    min_chunk_ms = dyn["min_chunk_ms"] if min_chunk_ms is None else min_chunk_ms
    target_chunk_ms = dyn["target_chunk_ms"] if target_chunk_ms is None else target_chunk_ms
    max_chunk_ms = dyn["max_chunk_ms"] if max_chunk_ms is None else max_chunk_ms
    merge_gap_ms = dyn["merge_gap_ms"] if merge_gap_ms is None else merge_gap_ms

    # 只有“既短又不超限”时才不切
    if duration_ms <= max_chunk_ms and file_size <= max_bytes:
        return [
            {
                "index": 0,
                "path": file_path,
                "logical_start_ms": 0,
                "logical_end_ms": duration_ms,
                "export_start_ms": 0,
                "export_end_ms": duration_ms,
            }
        ]

    nonsilent_ranges = detect_nonsilent(
        audio,
        min_silence_len=min_silence_len,
        silence_thresh=silence_thresh,
        seek_step=seek_step,
    )

    if not nonsilent_ranges:
        nonsilent_ranges = [(0, duration_ms)]

    expanded = []
    for start, end in nonsilent_ranges:
        expanded.append((
            max(0, start - keep_silence_ms),
            min(duration_ms, end + keep_silence_ms),
        ))

    intervals = _merge_intervals(expanded, max_gap_ms=merge_gap_ms)
    intervals = _merge_short_intervals(intervals, min_chunk_ms=min_chunk_ms)

    # 对过长区间继续切 —— 注意：这里得到的是“非重叠逻辑区间”
    logical_intervals = []
    for start, end in intervals:
        if (end - start) <= max_chunk_ms:
            logical_intervals.append((start, end))
        else:
            logical_intervals.extend(
                _split_long_interval_by_silence(
                    audio=audio,
                    start_ms=start,
                    end_ms=end,
                    target_chunk_ms=target_chunk_ms,
                    max_chunk_ms=max_chunk_ms,
                    min_chunk_ms=min_chunk_ms,
                    silence_thresh=silence_thresh,
                    seek_step=seek_step,
                )
            )

    # 再做一次“短尾合并”，但不要再做 merge_intervals，
    # 否则会把长段切分成果重新合并回去。
    logical_intervals = _merge_short_intervals(logical_intervals, min_chunk_ms=min_chunk_ms)

    base, _ = os.path.splitext(file_path)
    chunk_items = []
    index_holder = [0]

    for idx, (start, end) in enumerate(logical_intervals):
        export_start = max(0, start - overlap_ms)
        export_end = min(duration_ms, end + overlap_ms)

        paths = _export_segment_with_fallback(
            audio=audio,
            start_ms=export_start,
            end_ms=export_end,
            base_path=base,
            index_holder=index_holder,
            max_bytes=max_bytes,
            format=format,
            bitrate=bitrate,
            overlap_ms=overlap_ms,
        )

        # 第一版先假设大多数逻辑区间只导出成 1 个文件
        # 如果 fallback 递归切成多个文件，先粗略继承同一时间范围，下一步我们再细化。
        for path in paths:
            chunk_items.append(
                {
                    "index": len(chunk_items),
                    "path": path,
                    "logical_start_ms": start,
                    "logical_end_ms": end,
                    "export_start_ms": export_start,
                    "export_end_ms": export_end,
                }
            )

    return chunk_items

@router.post("/transcriptions")
def transcription(
    request: Request,
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    user=Depends(get_verified_user),
):
    if user.role != "admin" and not has_permission(
        user.id, "chat.stt", request.app.state.config.USER_PERMISSIONS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
        )
    log.info(f"file.content_type: {file.content_type}")
    stt_supported_content_types = getattr(
        request.app.state.config, "STT_SUPPORTED_CONTENT_TYPES", []
    )

    if not strict_match_mime_type(stt_supported_content_types, file.content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.FILE_NOT_SUPPORTED,
        )

    try:
        ext = file.filename.split(".")[-1]
        id = uuid.uuid4()

        filename = f"{id}.{ext}"
        contents = file.file.read()

        file_dir = f"{CACHE_DIR}/audio/transcriptions"
        os.makedirs(file_dir, exist_ok=True)
        file_path = f"{file_dir}/{filename}"

        with open(file_path, "wb") as f:
            f.write(contents)

        try:
            metadata = None

            if language:
                metadata = {"language": language}

            result = transcribe(request, file_path, metadata, user, profile="interactive")

            return {
                **result,
                "filename": os.path.basename(file_path),
            }

        except Exception as e:
            log.exception(e)

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_MESSAGES.DEFAULT(e),
            )

    except Exception as e:
        log.exception(e)

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT(e),
        )


def get_available_models(request: Request) -> list[dict]:
    available_models = []
    if request.app.state.config.TTS_ENGINE == "openai":
        # Use custom endpoint if not using the official OpenAI API URL
        if not request.app.state.config.TTS_OPENAI_API_BASE_URL.startswith(
            "https://api.openai.com"
        ):
            try:
                response = requests.get(
                    f"{request.app.state.config.TTS_OPENAI_API_BASE_URL}/audio/models"
                )
                response.raise_for_status()
                data = response.json()
                available_models = data.get("models", [])
            except Exception as e:
                log.error(f"Error fetching models from custom endpoint: {str(e)}")
                available_models = [{"id": "tts-1"}, {"id": "tts-1-hd"}]
        else:
            available_models = [{"id": "tts-1"}, {"id": "tts-1-hd"}]
    elif request.app.state.config.TTS_ENGINE == "elevenlabs":
        try:
            response = requests.get(
                f"{ELEVENLABS_API_BASE_URL}/v1/models",
                headers={
                    "xi-api-key": request.app.state.config.TTS_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout=5,
            )
            response.raise_for_status()
            models = response.json()

            available_models = [
                {"name": model["name"], "id": model["model_id"]} for model in models
            ]
        except requests.RequestException as e:
            log.error(f"Error fetching voices: {str(e)}")
    return available_models


@router.get("/models")
async def get_models(request: Request, user=Depends(get_verified_user)):
    return {"models": get_available_models(request)}


def get_available_voices(request) -> dict:
    """Returns {voice_id: voice_name} dict"""
    available_voices = {}
    if request.app.state.config.TTS_ENGINE == "openai":
        # Use custom endpoint if not using the official OpenAI API URL
        if not request.app.state.config.TTS_OPENAI_API_BASE_URL.startswith(
            "https://api.openai.com"
        ):
            try:
                response = requests.get(
                    f"{request.app.state.config.TTS_OPENAI_API_BASE_URL}/audio/voices"
                )
                response.raise_for_status()
                data = response.json()
                voices_list = data.get("voices", [])
                available_voices = {voice["id"]: voice["name"] for voice in voices_list}
            except Exception as e:
                log.error(f"Error fetching voices from custom endpoint: {str(e)}")
                available_voices = {
                    "alloy": "alloy",
                    "echo": "echo",
                    "fable": "fable",
                    "onyx": "onyx",
                    "nova": "nova",
                    "shimmer": "shimmer",
                }
        else:
            available_voices = {
                "alloy": "alloy",
                "echo": "echo",
                "fable": "fable",
                "onyx": "onyx",
                "nova": "nova",
                "shimmer": "shimmer",
            }
    elif request.app.state.config.TTS_ENGINE == "elevenlabs":
        try:
            available_voices = get_elevenlabs_voices(
                api_key=request.app.state.config.TTS_API_KEY
            )
        except Exception:
            # Avoided @lru_cache with exception
            pass
    elif request.app.state.config.TTS_ENGINE == "azure":
        try:
            region = request.app.state.config.TTS_AZURE_SPEECH_REGION
            base_url = request.app.state.config.TTS_AZURE_SPEECH_BASE_URL
            url = (
                base_url or f"https://{region}.tts.speech.microsoft.com"
            ) + "/cognitiveservices/voices/list"
            headers = {
                "Ocp-Apim-Subscription-Key": request.app.state.config.TTS_API_KEY
            }

            response = requests.get(url, headers=headers)
            response.raise_for_status()
            voices = response.json()

            for voice in voices:
                available_voices[voice["ShortName"]] = (
                    f"{voice['DisplayName']} ({voice['ShortName']})"
                )
        except requests.RequestException as e:
            log.error(f"Error fetching voices: {str(e)}")

    return available_voices


@lru_cache
def get_elevenlabs_voices(api_key: str) -> dict:
    """
    Note, set the following in your .env file to use Elevenlabs:
    AUDIO_TTS_ENGINE=elevenlabs
    AUDIO_TTS_API_KEY=sk_...  # Your Elevenlabs API key
    AUDIO_TTS_VOICE=EXAVITQu4vr4xnSDxMaL  # From https://api.elevenlabs.io/v1/voices
    AUDIO_TTS_MODEL=eleven_multilingual_v2
    """

    try:
        # TODO: Add retries
        response = requests.get(
            f"{ELEVENLABS_API_BASE_URL}/v1/voices",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()
        voices_data = response.json()

        voices = {}
        for voice in voices_data.get("voices", []):
            voices[voice["voice_id"]] = voice["name"]
    except requests.RequestException as e:
        # Avoid @lru_cache with exception
        log.error(f"Error fetching voices: {str(e)}")
        raise RuntimeError(f"Error fetching voices: {str(e)}")

    return voices


@router.get("/voices")
async def get_voices(request: Request, user=Depends(get_verified_user)):
    return {
        "voices": [
            {"id": k, "name": v} for k, v in get_available_voices(request).items()
        ]
    }