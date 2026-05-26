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


def _resize_for_processing(image: np.ndarray, max_side: int) -> tuple[np.ndarray, float]:
    h, w = image.shape[:2]
    side = max(h, w)
    if side <= max_side:
        return image, 1.0
    ratio = max_side / float(side)
    resized = cv2.resize(
        image,
        (int(w * ratio), int(h * ratio)),
        interpolation=cv2.INTER_AREA,
    )
    return resized, ratio


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _try_document_warp(image: np.ndarray) -> tuple[np.ndarray, bool]:
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 60, 180)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    best = None
    image_area = float(h * w)

    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) != 4:
            continue

        area = cv2.contourArea(approx)
        if area < image_area * 0.15:
            continue

        pts = approx.reshape(4, 2).astype("float32")
        rect = _order_points(pts)
        (tl, tr, br, bl) = rect

        width_a = np.linalg.norm(br - bl)
        width_b = np.linalg.norm(tr - tl)
        height_a = np.linalg.norm(tr - br)
        height_b = np.linalg.norm(tl - bl)

        max_w = int(max(width_a, width_b))
        max_h = int(max(height_a, height_b))

        if max_w < 200 or max_h < 200:
            continue

        score = area / image_area
        if best is None or score > best[0]:
            best = (score, rect, max_w, max_h)

    if not best:
        return image, False

    _, rect, max_w, max_h = best
    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype="float32",
    )

    matrix = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, matrix, (max_w, max_h))
    return warped, True


def _enhance_text_document(gray: np.ndarray) -> np.ndarray:
    # 1) illumination correction: remove uneven lighting / shadows
    kernel_size = max(31, (min(gray.shape[:2]) // 12) | 1)
    background = cv2.medianBlur(gray, kernel_size)
    normalized = cv2.divide(gray, background, scale=255)

    # 2) denoise + local contrast enhancement
    denoised = cv2.bilateralFilter(normalized, d=7, sigmaColor=35, sigmaSpace=35)
    clahe = cv2.createCLAHE(clipLimit=2.8, tileGridSize=(8, 8))
    contrasted = clahe.apply(denoised)

    # 3) gentle sharpening to improve character edges
    blur = cv2.GaussianBlur(contrasted, (0, 0), sigmaX=1.0)
    sharp = cv2.addWeighted(contrasted, 1.45, blur, -0.45, 0)

    # 4) preserve grayscale (better for many OCR engines than hard binarization)
    return sharp


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

    max_side = int(os.getenv("OCR_PREPROCESS_MAX_SIDE", "2560"))
    resized, resize_ratio = _resize_for_processing(image, max_side=max_side)

    warped, warped_applied = _try_document_warp(resized)

    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    if profile == "text_document":
        enhanced = _enhance_text_document(gray)
    elif profile == "high_contrast_binary":
        enhanced = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            7,
        )
    else:
        enhanced = gray

    # upscale small documents to improve OCR confidence on tiny fonts
    h, w = enhanced.shape[:2]
    min_side = int(os.getenv("OCR_PREPROCESS_MIN_SIDE", "1400"))
    upscale_applied = False
    if min(h, w) < min_side:
        scale = min_side / float(min(h, w))
        enhanced = cv2.resize(
            enhanced,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_CUBIC,
        )
        upscale_applied = True

    success, encoded = cv2.imencode(
        ".jpg",
        enhanced,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(os.getenv("OCR_PREPROCESS_JPEG_QUALITY", "96"))],
    )
    if not success:
        raise ValueError("Unable to encode enhanced image")

    output_bytes = encoded.tobytes()
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    out_h, out_w = enhanced.shape[:2]

    return output_bytes, {
        "profile": profile,
        "input_resolution": f"{input_w}x{input_h}",
        "output_resolution": f"{out_w}x{out_h}",
        "output_format": "image/jpeg",
        "processing_ms": elapsed_ms,
        "resize_ratio": round(resize_ratio, 4),
        "document_warp_applied": warped_applied,
        "upscale_applied": upscale_applied,
    }
