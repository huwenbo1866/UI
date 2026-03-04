import pytest

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")

from open_webui.utils.images.ocr_preprocess import (
    is_photo_question_file,
    preprocess_image_for_ocr,
)


def test_is_photo_question_file_by_name_and_metadata():
    assert is_photo_question_file("photo-question-1.jpg", None) is True
    assert is_photo_question_file("random.jpg", {"source": "photo-question"}) is True
    assert is_photo_question_file("random.jpg", {"scene": "ocr"}) is True
    assert is_photo_question_file("random.jpg", {"scene": "chat"}) is False


def test_preprocess_image_for_ocr_outputs_jpeg_bytes():
    canvas = np.full((180, 600, 3), 255, dtype=np.uint8)
    cv2.putText(canvas, "OCR TEST 123", (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 0), 3)

    ok, encoded = cv2.imencode(".jpg", canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    assert ok is True

    output_bytes, meta = preprocess_image_for_ocr(encoded.tobytes())

    assert isinstance(output_bytes, bytes)
    assert len(output_bytes) > 0
    assert meta["output_format"] == "image/jpeg"
    assert "x" in meta["input_resolution"]
    assert isinstance(meta["processing_ms"], int)
