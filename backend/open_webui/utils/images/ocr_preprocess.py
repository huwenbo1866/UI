import os
import time
from typing import Any

import cv2
import numpy as np


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def should_enable_ocr_preprocess() -> bool:
    return _env_bool("OCR_PREPROCESS_ENABLED", default=True)


def is_photo_question_file(filename: str | None, metadata: dict[str, Any] | None) -> bool:
    normalized = (filename or "").lower()
    if normalized.startswith("photo-question-") or normalized.startswith(
        "camera-photo-question-"
    ):
        return True

    payload = metadata if isinstance(metadata, dict) else {}
    source = str(payload.get("source") or "").lower()
    scene = str(payload.get("scene") or "").lower()
    return source == "photo-question" or scene == "ocr"


def preprocess_image_for_ocr(
    image_bytes: bytes,
    profile: str = "text_document",
) -> tuple[bytes, dict[str, Any]]:
    started_at = time.perf_counter()

    np_buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode image bytes")

    input_h, input_w = image.shape[:2]

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast = clahe.apply(denoised)

    blurred = cv2.GaussianBlur(contrast, (0, 0), sigmaX=1.1)
    sharpened = cv2.addWeighted(contrast, 1.6, blurred, -0.6, 0)

    binary = cv2.adaptiveThreshold(
        sharpened,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        7,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

    if profile == "text_document":
        output_image = cleaned
    else:
        output_image = sharpened

    success, encoded = cv2.imencode(
        ".jpg",
        output_image,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(os.getenv("OCR_PREPROCESS_JPEG_QUALITY", "95"))],
    )
    if not success:
        raise ValueError("Unable to encode enhanced image")

    output_bytes = encoded.tobytes()
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)

    return output_bytes, {
        "profile": profile,
        "input_resolution": f"{input_w}x{input_h}",
        "output_format": "image/jpeg",
        "processing_ms": elapsed_ms,
    }
