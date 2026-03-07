"""
教材增强版章节识别引擎 (Enhanced Chapter Detection Engine)

3-layer detection pipeline:
  1. PDF 书签/大纲提取 (最可靠)
  2. 目录页解析
  3. 正文标题扫描

输出：一级章节列表，0-indexed 页码。
"""

import os
import re
import logging
from typing import List, Dict, Optional, Set

log = logging.getLogger(__name__)


CHAPTER_PATTERNS = [
    r"第\s*[一二三四五六七八九十百零〇\d]+\s*章",
    r"第\s*[一二三四五六七八九十百零〇\d]+\s*单\s*元",
    r"第\s*[一二三四五六七八九十百零〇\d]+\s*课",
    r"绪\s*论",
]

CHAPTER_RE = re.compile("|".join(CHAPTER_PATTERNS))
_RE_ZHANG = re.compile(r"第\s*[一二三四五六七八九十百零〇\d]+\s*章")
_RE_UNIT = re.compile(r"第\s*[一二三四五六七八九十百零〇\d]+\s*单\s*元")
_RE_KE = re.compile(r"第\s*[一二三四五六七八九十百零〇\d]+\s*课")

CATALOG_LINE_RE = re.compile(r"(.+?)\s*[\.．…·•]{2,}\s*(\d+)")
CATALOG_TRAILING_PAGE_RE = re.compile(r"(.+?)\s+(\d+)\s*$")
CATALOG_FLEXIBLE_PAGE_RE = re.compile(
    r"(.+?)(?:\s*[\.．…·•]{2,})?\s+([0-9０-９](?:[\s\u3000]*[0-9０-９])*)\s*$"
)
FULLWIDTH_DIGIT_TRANS = str.maketrans("０１２３４５６７８９", "0123456789")

MAX_TITLE_LENGTH = 40

POLICY_CHAPTER_ONLY = "chapter_only"
POLICY_UNIT_ONLY = "unit_only"
POLICY_AUTO = "auto"


def extract_chapters_from_pdf(pdf_path: str, source_name: Optional[str] = None) -> List[Dict]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(pdf_path)
    except Exception as e:
        log.warning(f"Failed to read PDF: {e}")
        return []

    total_pages = len(reader.pages)
    if total_pages == 0:
        return []

    source_label = source_name or os.path.basename(pdf_path)
    level_policy = _determine_level_policy(source_label)
    min_content_page = _determine_min_content_page(source_label)
    math_mode = _is_math_source(source_label)

    layer_used = "none"
    bookmark_rejected = False
    catalog_pages = set(_detect_catalog_pages(reader))

    chapters = _extract_from_bookmarks(reader)
    if chapters and _should_reject_bookmarks(chapters, total_pages, source_label):
        bookmark_rejected = True
        log.info("Bookmark extraction looks unreliable for this file, fallback to catalog/text scan")
        chapters = []
    elif chapters:
        layer_used = "bookmarks"
    log.debug(f"Layer 1 (bookmarks): found {len(chapters)} chapters")

    if not chapters:
        chapters = _extract_from_catalog_with_pages(
            reader,
            catalog_pages,
            min_content_page=min_content_page,
            math_mode=math_mode,
        )
        if chapters:
            layer_used = "catalog"
        if chapters and _should_reject_math_catalog(chapters, total_pages, source_label):
            log.info("Math catalog extraction looks unreliable, fallback to text scan")
            chapters = []
        log.debug(f"Layer 2 (catalog): found {len(chapters)} chapters")

    if not chapters:
        chapters = _extract_from_text_scan(
            reader,
            skip_pages=catalog_pages,
            min_content_page=min_content_page,
        )
        if chapters:
            layer_used = "text_scan"
        log.debug(f"Layer 3 (text scan): found {len(chapters)} chapters")

    if not chapters:
        return []

    chapters = _filter_mixed_levels(chapters, policy=level_policy)
    chapters = _dedupe_chapters(chapters)
    chapters = _compute_end_pages(chapters, total_pages)

    log.info(
        f"Extracted {len(chapters)} chapters from PDF ({total_pages} pages) via 3-layer pipeline"
    )
    log.info(
        "Chapter extraction details: "
        f"layer={layer_used}, policy={level_policy}, min_content_page={min_content_page}, "
        f"catalog_pages={len(catalog_pages)}, bookmark_rejected={bookmark_rejected}"
    )
    return chapters


def extract_primary_chapters(pdf_path: str, source_name: Optional[str] = None) -> List[Dict]:
    return extract_chapters_from_pdf(pdf_path, source_name=source_name)


def _extract_from_bookmarks(reader) -> List[Dict]:
    try:
        outline = reader.outline
    except Exception:
        return []

    if not outline:
        return []

    chapters = []
    for item in outline:
        if isinstance(item, list):
            continue
        try:
            title = str(item.title).strip()
            page_num = reader.get_destination_page_number(item)
            if not title or page_num is None:
                continue

            title = _sanitize_top_level_title(title)
            if CHAPTER_RE.match(title):
                chapters.append({"title": _normalize_title(title), "start_page": page_num})
        except Exception as e:
            log.debug(f"Skipping bookmark: {e}")
            continue

    return chapters


def _detect_catalog_pages(reader, max_scan: int = 10) -> List[int]:
    pages = []
    scan_limit = min(max_scan, len(reader.pages))

    for i in range(scan_limit):
        try:
            text = reader.pages[i].extract_text() or ""
        except Exception:
            continue

        score = 0
        if "目录" in text or "目 录" in text or "CONTENTS" in text.upper():
            score += 2

        dot_count = text.count("...") + text.count("……") + text.count("．．") + text.count("···")
        if dot_count >= 3:
            score += 2
        elif dot_count >= 1:
            score += 1

        if len(CHAPTER_RE.findall(text)) >= 2:
            score += 1

        lines = [line.strip() for line in text.split("\n") if line.strip()]
        trailing_page_lines = sum(1 for line in lines if re.search(r"\d+\s*$", line))
        if trailing_page_lines >= 5:
            score += 2

        if score >= 2:
            pages.append(i)

    return pages


def _extract_from_catalog_with_pages(
    reader,
    catalog_pages: Set[int],
    min_content_page: int = 0,
    math_mode: bool = False,
) -> List[Dict]:
    if not catalog_pages:
        return []

    chapters = []
    for page_idx in sorted(catalog_pages):
        try:
            text = reader.pages[page_idx].extract_text() or ""
        except Exception:
            continue

        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            result = _parse_catalog_line(line, math_mode=math_mode)
            if result:
                chapters.append(result)

    if not chapters:
        return []

    offset = _detect_page_offset(
        reader,
        chapters,
        skip_pages=catalog_pages,
        min_content_page=min_content_page,
    )

    for ch in chapters:
        ch["start_page"] = ch["start_page"] - 1 + offset
        ch["start_page"] = max(ch["start_page"], min_content_page)
        ch["start_page"] = max(0, min(ch["start_page"], len(reader.pages) - 1))

    return chapters


def _parse_catalog_line(line: str, math_mode: bool = False) -> Optional[Dict]:
    if math_mode and _is_noisy_math_catalog_line(line):
        return None

    title = ""
    page = None

    m = CATALOG_LINE_RE.search(line)
    if m:
        title = m.group(1).strip()
        page = int(m.group(2))
    else:
        m = CATALOG_TRAILING_PAGE_RE.search(line)
        if m:
            title = m.group(1).strip()
            page = int(m.group(2))
        else:
            m = CATALOG_FLEXIBLE_PAGE_RE.search(line)
            if not m:
                return None
            title = m.group(1).strip()
            page = _parse_catalog_page_number(m.group(2))
            if page is None:
                return None

    title = _sanitize_top_level_title(title)
    if not CHAPTER_RE.match(title):
        return None

    return {"title": _normalize_title(title), "start_page": page}


def _detect_page_offset(
    reader,
    catalog_entries: List[Dict],
    skip_pages: Optional[Set[int]] = None,
    min_content_page: int = 0,
) -> int:
    if not catalog_entries:
        return 0
    if skip_pages is None:
        skip_pages = set()

    first = catalog_entries[0]
    search_key = re.sub(r"\s+", "", first["title"])
    printed_page = first["start_page"]

    for delta in range(0, 25):
        for sign in [0, 1, -1]:
            candidate = (printed_page - 1) + (sign * delta)
            if candidate in skip_pages or candidate < min_content_page:
                continue
            if 0 <= candidate < len(reader.pages):
                try:
                    text = reader.pages[candidate].extract_text() or ""
                    text_compact = re.sub(r"\s+", "", text)
                    if search_key in text_compact:
                        log.debug(
                            f"Offset detection: '{first['title']}' printed p.{printed_page} "
                            f"found at PDF p.{candidate} → offset={sign * delta}"
                        )
                        return sign * delta
                except Exception:
                    continue

    return 0


def _extract_from_text_scan(
    reader,
    max_pages: int = 200,
    skip_pages: Optional[Set[int]] = None,
    min_content_page: int = 0,
) -> List[Dict]:
    if skip_pages is None:
        skip_pages = set()

    chapters = []
    scan_limit = min(max_pages, len(reader.pages))
    for i in range(scan_limit):
        if i < min_content_page or i in skip_pages:
            continue
        try:
            text = reader.pages[i].extract_text() or ""
        except Exception:
            continue

        for line in text.split("\n"):
            line = line.strip()
            if not line or len(line) > MAX_TITLE_LENGTH:
                continue
            if CHAPTER_RE.match(line):
                chapters.append({"title": _normalize_title(line), "start_page": i})

    return chapters


def _filter_mixed_levels(chapters: List[Dict], policy: str = "auto") -> List[Dict]:
    if policy == POLICY_CHAPTER_ONLY:
        filtered = [ch for ch in chapters if not _RE_UNIT.match(ch["title"]) and not _RE_KE.match(ch["title"])]
        return filtered if filtered else chapters

    if policy == POLICY_UNIT_ONLY:
        filtered = [ch for ch in chapters if not _RE_ZHANG.match(ch["title"]) and not _RE_KE.match(ch["title"])]
        return filtered if filtered else chapters

    has_unit = any(_RE_UNIT.match(ch["title"]) for ch in chapters)
    has_zhang = any(_RE_ZHANG.match(ch["title"]) for ch in chapters)
    has_ke = any(_RE_KE.match(ch["title"]) for ch in chapters)

    if has_unit and (has_zhang or has_ke):
        filtered = [ch for ch in chapters if not _RE_ZHANG.match(ch["title"]) and not _RE_KE.match(ch["title"])]
        return filtered if filtered else chapters

    return chapters


def _determine_level_policy(source_name: str) -> str:
    name = (source_name or "").lower()
    if any(k in name for k in ["数学", "math", "物理", "physics", "地理", "geography"]):
        return POLICY_CHAPTER_ONLY
    if any(
        k in name
        for k in ["化学", "chemistry", "生物", "biology", "历史", "history", "道德与法治", "道法", "morality", "ethics", "law"]
    ):
        return POLICY_UNIT_ONLY
    return POLICY_AUTO


def _determine_min_content_page(source_name: str) -> int:
    name = (source_name or "").lower()
    if "数学" in name or "math" in name:
        return 7
    return 0


def _is_math_source(source_name: str) -> bool:
    name = (source_name or "").lower()
    return "数学" in name or "math" in name


def _is_noisy_math_catalog_line(line: str) -> bool:
    text = line.translate(FULLWIDTH_DIGIT_TRANS)
    text = re.sub(r"[\u3000]+", " ", text)

    if re.search(r"\b\d+\s*[\.．]\s*\d+\b", text):
        return True

    noisy_keywords = ["阅读与思考", "图说数学史", "数学活动", "小结", "综合与实践"]
    return any(k in text for k in noisy_keywords)


def _should_reject_math_catalog(chapters: List[Dict], total_pages: int, source_name: str) -> bool:
    if not _is_math_source(source_name):
        return False
    if len(chapters) < 4:
        return False

    starts = [int(ch.get("start_page", 0)) for ch in chapters if "start_page" in ch]
    if len(starts) < 4:
        return False

    spread = max(starts) - min(starts)
    if total_pages >= 120 and spread <= 25:
        return True

    numbered = []
    for ch in chapters:
        num = _extract_chapter_number(ch.get("title", ""))
        if num is not None:
            numbered.append((num, int(ch.get("start_page", 0))))

    if len(numbered) >= 4:
        numbered.sort(key=lambda x: x[0])
        for i in range(1, len(numbered)):
            if numbered[i][1] <= numbered[i - 1][1]:
                return True

    return False


def _extract_chapter_number(title: str) -> Optional[int]:
    m = re.match(r"^第\s*([一二三四五六七八九十百零〇\d]+)\s*章", (title or "").strip())
    if not m:
        return None
    raw = m.group(1)
    normalized = raw.translate(FULLWIDTH_DIGIT_TRANS)
    if normalized.isdigit():
        return int(normalized)
    return _chinese_number_to_int(normalized)


def _chinese_number_to_int(text: str) -> Optional[int]:
    digits = {
        "零": 0,
        "〇": 0,
        "一": 1,
        "二": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
    }
    if not text:
        return None
    if text == "十":
        return 10
    if "十" in text:
        left, right = text.split("十", 1)
        if left == "":
            tens = 1
        elif left in digits:
            tens = digits[left]
        else:
            return None
        if right == "":
            ones = 0
        elif right in digits:
            ones = digits[right]
        else:
            return None
        return tens * 10 + ones
    if text in digits:
        return digits[text]
    return None


def _normalize_title(title: str) -> str:
    title = title.replace("…", "")
    title = title.replace("...", "")
    title = title.replace("．", "")
    title = title.replace("·", "")
    title = re.sub(r"\s+", " ", title)
    return title.strip()


def _sanitize_top_level_title(title: str) -> str:
    title = title.strip()
    m = re.match(
        r"^((?:第\s*[一二三四五六七八九十百零〇\d]+\s*(?:章|单\s*元|课)|绪\s*论)\s*[^0-9０-９]*)",
        title,
    )
    if m:
        cleaned = m.group(1).strip()
        if cleaned:
            return cleaned
    return title


def _should_reject_bookmarks(chapters: List[Dict], total_pages: int, source_name: str) -> bool:
    if not _is_math_source(source_name):
        return False
    if len(chapters) < 4:
        return False

    starts = [int(ch.get("start_page", 0)) for ch in chapters if "start_page" in ch]
    if len(starts) < 4:
        return False

    spread = max(starts) - min(starts)
    unique_ratio = len(set(starts)) / max(len(starts), 1)

    log.debug(
        "Bookmark quality check: "
        f"source={source_name}, chapter_count={len(chapters)}, "
        f"max_start={max(starts)}, spread={spread}, unique_ratio={unique_ratio:.2f}"
    )

    if max(starts) < 30 and spread <= 20:
        return True
    if unique_ratio < 0.7 and total_pages >= 80:
        return True
    return False


def _parse_catalog_page_number(page_text: str) -> Optional[int]:
    normalized = page_text.translate(FULLWIDTH_DIGIT_TRANS)
    normalized = re.sub(r"[\s\u3000]+", "", normalized)
    if not normalized or not normalized.isdigit():
        return None
    return int(normalized)


def _dedupe_chapters(chapters: List[Dict]) -> List[Dict]:
    seen = {}
    for ch in chapters:
        key = _normalize_title(ch["title"])
        if key not in seen:
            seen[key] = ch
        elif ch["start_page"] < seen[key]["start_page"]:
            seen[key] = ch
    return sorted(seen.values(), key=lambda x: x["start_page"])


def _compute_end_pages(chapters: List[Dict], total_pages: int) -> List[Dict]:
    for i in range(len(chapters)):
        if i < len(chapters) - 1:
            end = chapters[i + 1]["start_page"] - 1
        else:
            end = total_pages - 1
        chapters[i]["end_page"] = max(end, chapters[i]["start_page"])
    return chapters


def get_pdf_total_pages(pdf_path: str) -> int:
    from pypdf import PdfReader
    try:
        reader = PdfReader(pdf_path)
        return len(reader.pages)
    except Exception as e:
        log.error(f"Failed to get PDF page count: {e}")
        return 0


def extract_pdf_page_range_text(pdf_path: str, start_page: int, end_page: int) -> str:
    from pypdf import PdfReader
    try:
        reader = PdfReader(pdf_path)
    except Exception as e:
        log.error(f"Failed to open PDF: {e}")
        return ""

    total_pages = len(reader.pages)
    start_page = max(0, start_page)
    end_page = min(end_page, total_pages - 1)
    if start_page > end_page:
        return ""

    page_texts = []
    for page_idx in range(start_page, end_page + 1):
        try:
            text = reader.pages[page_idx].extract_text() or ""
            if text.strip():
                page_texts.append(text.strip())
        except Exception:
            continue

    return "\n\n".join(page_texts)


def extract_text_sections(content: str) -> List[Dict]:
    if not content or not content.strip():
        return []

    raw_paragraphs = re.split(r"\n\s*\n", content)
    paragraphs = [p.strip() for p in raw_paragraphs if p.strip()]
    if not paragraphs:
        return []

    merged = []
    for p in paragraphs:
        if merged and len(p) < 50:
            merged[-1] += "\n\n" + p
        else:
            merged.append(p)

    sections = []
    for i, text in enumerate(merged):
        sections.append({"title": f"段落 {i + 1}", "content": text, "order_index": i})

    log.info(f"Extracted {len(sections)} text sections")
    return sections
