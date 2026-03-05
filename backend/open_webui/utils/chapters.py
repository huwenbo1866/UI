"""
教材增强版章节识别引擎 (Enhanced Chapter Detection Engine)

3-layer detection pipeline:
  1. PDF 书签/大纲提取 (最可靠)
  2. 目录页解析 (dot-leader 格式)
  3. 正文标题扫描 (正则匹配)

适配学科：
  - 数学/物理/化学/地理：第X章
  - 生物：单元→章→节 → 保留单元
  - 语文：单元 → 保留单元
  - 历史/道法：单元→课 → 保留单元

输出：一级章节列表，0-indexed 页码
不使用 OCR。
"""

import re
import logging
from typing import List, Dict, Optional

log = logging.getLogger(__name__)

# ============================================================
# 一级章节标题正则
# ============================================================

CHAPTER_PATTERNS = [
    r"第\s*[一二三四五六七八九十百零〇\d]+\s*章",
    r"第\s*[一二三四五六七八九十百零〇\d]+\s*单\s*元",
    r"第\s*[一二三四五六七八九十百零〇\d]+\s*课",
    r"绪\s*论",
]

CHAPTER_RE = re.compile("|".join(CHAPTER_PATTERNS))

# 用于区分不同层级的精确匹配
_RE_ZHANG = re.compile(r"第\s*[一二三四五六七八九十百零〇\d]+\s*章")
_RE_UNIT  = re.compile(r"第\s*[一二三四五六七八九十百零〇\d]+\s*单\s*元")
_RE_KE    = re.compile(r"第\s*[一二三四五六七八九十百零〇\d]+\s*课")

# 目录行正则：标题 + 连续点号/省略号 + 页码
# e.g. "第一章 力 .......... 3"
CATALOG_LINE_RE = re.compile(r"(.+?)\s*[\.．…·•]{2,}\s*(\d+)")

# 正文扫描最大行长度（避免误匹配正文段落）
MAX_TITLE_LENGTH = 40


# ============================================================
# 主入口
# ============================================================

def extract_chapters_from_pdf(pdf_path: str) -> List[Dict]:
    """
    3-layer chapter detection pipeline.

    Returns:
        [{"title": str, "start_page": int, "end_page": int}, ...]
        页码为 0-indexed。
    """
    from pypdf import PdfReader

    try:
        reader = PdfReader(pdf_path)
    except Exception as e:
        log.warning(f"Failed to read PDF: {e}")
        return []

    total_pages = len(reader.pages)
    if total_pages == 0:
        return []

    # 预先检测目录页（各层共用）
    catalog_pages = set(_detect_catalog_pages(reader))

    # Layer 1: 书签提取（最可靠）
    chapters = _extract_from_bookmarks(reader)
    log.debug(f"Layer 1 (bookmarks): found {len(chapters)} chapters")

    # Layer 2: 目录页解析
    if not chapters:
        chapters = _extract_from_catalog_with_pages(reader, catalog_pages)
        log.debug(f"Layer 2 (catalog): found {len(chapters)} chapters")

    # Layer 3: 正文标题扫描（跳过目录页）
    if not chapters:
        chapters = _extract_from_text_scan(reader, skip_pages=catalog_pages)
        log.debug(f"Layer 3 (text scan): found {len(chapters)} chapters")

    if not chapters:
        return []

    # 智能层级过滤：单元 > 章 > 课
    # 生物（单元+章）→保留单元；历史/道法（单元+课）→保留单元
    chapters = _filter_mixed_levels(chapters)

    # 后处理：去重 + 排序 + 计算 end_page
    chapters = _dedupe_chapters(chapters)
    chapters = _compute_end_pages(chapters, total_pages)

    log.info(
        f"Extracted {len(chapters)} chapters from PDF "
        f"({total_pages} pages) via 3-layer pipeline"
    )
    return chapters


# 向后兼容别名
def extract_primary_chapters(pdf_path: str) -> List[Dict]:
    """Backward-compatible wrapper."""
    return extract_chapters_from_pdf(pdf_path)


# ============================================================
# Layer 1: 书签/大纲提取
# ============================================================

def _extract_from_bookmarks(reader) -> List[Dict]:
    """从 PDF 书签 (outline/bookmarks) 中提取一级章节。"""
    try:
        outline = reader.outline
    except Exception:
        return []

    if not outline:
        return []

    chapters = []

    for item in outline:
        # 跳过嵌套列表（子级书签），只取一级
        if isinstance(item, list):
            continue

        try:
            title = str(item.title).strip()
            page_num = reader.get_destination_page_number(item)

            if not title or page_num is None:
                continue

            # 只保留匹配章节正则的书签
            if CHAPTER_RE.match(title):
                chapters.append({
                    "title": _normalize_title(title),
                    "start_page": page_num,  # 0-indexed
                })
        except Exception as e:
            log.debug(f"Skipping bookmark: {e}")
            continue

    return chapters


# ============================================================
# Layer 2: 目录页解析
# ============================================================

def _detect_catalog_pages(reader, max_scan: int = 15) -> List[int]:
    """检测哪些页面是目录页。"""
    pages = []
    scan_limit = min(max_scan, len(reader.pages))

    for i in range(scan_limit):
        try:
            text = reader.pages[i].extract_text() or ""
        except Exception:
            continue

        score = 0

        # 目录关键词
        if "目录" in text or "目 录" in text or "CONTENTS" in text.upper():
            score += 2

        # 连续点号（目录的 dot leader 特征）
        dot_count = (
            text.count("...")
            + text.count("……")
            + text.count("．．")
            + text.count("···")
        )
        if dot_count >= 3:
            score += 2
        elif dot_count >= 1:
            score += 1

        # 包含多个章节条目
        chapter_matches = len(CHAPTER_RE.findall(text))
        if chapter_matches >= 2:
            score += 1

        if score >= 2:
            pages.append(i)

    return pages


def _extract_from_catalog_with_pages(reader, catalog_pages: set) -> List[Dict]:
    """解析目录页提取章节列表（接收已检测的目录页集合）。"""
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

            result = _parse_catalog_line(line)
            if result:
                chapters.append(result)

    if not chapters:
        return []

    # 检测页码偏移：目录印刷页码 vs PDF 实际页码
    offset = _detect_page_offset(reader, chapters, skip_pages=catalog_pages)

    # 应用偏移，转换为 0-indexed
    for ch in chapters:
        ch["start_page"] = ch["start_page"] - 1 + offset
        ch["start_page"] = max(0, min(ch["start_page"], len(reader.pages) - 1))

    return chapters


def _parse_catalog_line(line: str) -> Optional[Dict]:
    """
    解析单行目录条目。
    e.g. "第一章 力 .......... 3" → {"title": "第一章 力", "start_page": 3}
    """
    m = CATALOG_LINE_RE.search(line)
    if not m:
        return None

    title = m.group(1).strip()
    page = int(m.group(2))

    if not CHAPTER_RE.match(title):
        return None

    return {
        "title": _normalize_title(title),
        "start_page": page,  # 1-indexed 印刷页码，后续调整
    }


def _detect_page_offset(reader, catalog_entries: List[Dict], skip_pages: set = None) -> int:
    """
    检测印刷页码与 PDF 页码之间的偏移。
    取第一个章节条目，在 PDF 中搜索其标题出现的实际页面。
    skip_pages: 需要跳过的页面集合（如目录页），避免在目录页上误匹配。
    """
    if not catalog_entries:
        return 0

    if skip_pages is None:
        skip_pages = set()

    first = catalog_entries[0]
    search_key = re.sub(r"\s+", "", first["title"])
    printed_page = first["start_page"]  # 1-indexed

    # 在预期位置附近搜索（偏移 -5 ~ +25）
    for delta in range(0, 25):
        for sign in [0, 1, -1]:
            candidate = (printed_page - 1) + (sign * delta)
            if candidate in skip_pages:
                continue  # 跳过目录页，避免误匹配
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


# ============================================================
# Layer 3: 正文标题扫描
# ============================================================

def _extract_from_text_scan(reader, max_pages: int = 200, skip_pages: set = None) -> List[Dict]:
    """
    逐页扫描正文，用正则匹配章节标题行。
    要求：行匹配章节正则 + 行长度 ≤ MAX_TITLE_LENGTH。
    skip_pages: 跳过目录页，避免在目录页上误匹配章节标题。
    """
    if skip_pages is None:
        skip_pages = set()

    chapters = []
    scan_limit = min(max_pages, len(reader.pages))

    for i in range(scan_limit):
        if i in skip_pages:
            continue  # 跳过目录页

        try:
            text = reader.pages[i].extract_text() or ""
        except Exception:
            continue

        for line in text.split("\n"):
            line = line.strip()

            if not line or len(line) > MAX_TITLE_LENGTH:
                continue

            if CHAPTER_RE.match(line):
                chapters.append({
                    "title": _normalize_title(line),
                    "start_page": i,  # 0-indexed
                })

    return chapters


# ============================================================
# 后处理工具
# ============================================================

def _filter_mixed_levels(chapters: List[Dict]) -> List[Dict]:
    """
    智能层级过滤：当多个层级共存时，保留最高层级。

    层级优先级：单元 > 章 > 课

    场景：
    - 生物：单元+章 → 保留单元
    - 历史/道法：单元+课 → 保留单元
    - 语文：只有单元 → 全保留
    - 数学/物理/化学/地理：只有章 → 全保留
    """
    has_unit  = any(_RE_UNIT.match(ch["title"]) for ch in chapters)
    has_zhang = any(_RE_ZHANG.match(ch["title"]) for ch in chapters)
    has_ke    = any(_RE_KE.match(ch["title"]) for ch in chapters)

    if has_unit and (has_zhang or has_ke):
        # 单元与章/课共存 → 只保留单元（和绪论等非章/课条目）
        filtered = [
            ch for ch in chapters
            if not _RE_ZHANG.match(ch["title"]) and not _RE_KE.match(ch["title"])
        ]
        log.info(
            f"Mixed levels detected: {len(chapters)} → {len(filtered)} "
            f"(kept 单元, removed 章/课)"
        )
        return filtered

    return chapters


def _normalize_title(title: str) -> str:
    """归一化章节标题（去除点号、多余空白）。"""
    title = title.replace("…", "")
    title = title.replace("...", "")
    title = title.replace("．", "")
    title = title.replace("·", "")
    title = re.sub(r"\s+", " ", title)
    return title.strip()


def _dedupe_chapters(chapters: List[Dict]) -> List[Dict]:
    """去重：同标题保留最小页码的条目。"""
    seen = {}

    for ch in chapters:
        key = _normalize_title(ch["title"])
        if key not in seen:
            seen[key] = ch
        else:
            if ch["start_page"] < seen[key]["start_page"]:
                seen[key] = ch

    return sorted(seen.values(), key=lambda x: x["start_page"])


def _compute_end_pages(chapters: List[Dict], total_pages: int) -> List[Dict]:
    """计算 end_page：下一章的 start_page - 1。"""
    for i in range(len(chapters)):
        if i < len(chapters) - 1:
            end = chapters[i + 1]["start_page"] - 1
        else:
            end = total_pages - 1

        # end_page 至少 == start_page
        chapters[i]["end_page"] = max(end, chapters[i]["start_page"])

    return chapters


# ============================================================
# 工具函数（保持向后兼容）
# ============================================================

def get_pdf_total_pages(pdf_path: str) -> int:
    """获取 PDF 总页数。"""
    from pypdf import PdfReader
    try:
        reader = PdfReader(pdf_path)
        return len(reader.pages)
    except Exception as e:
        log.error(f"Failed to get PDF page count: {e}")
        return 0


def extract_pdf_page_range_text(pdf_path: str, start_page: int, end_page: int) -> str:
    """
    提取 PDF 指定页码范围的文本（0-indexed, inclusive）。
    """
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
    """
    将纯文本按空行/段落分段（用于 txt/docx 文件）。

    规则：
    - 按连续空行分割
    - 过滤空段落
    - 合并过短段落（< 50 字合并到上一段）
    - 自动命名 "段落 1"、"段落 2"...
    """
    if not content or not content.strip():
        return []

    # 按两个或更多连续换行分割
    raw_paragraphs = re.split(r"\n\s*\n", content)

    # 过滤空段落
    paragraphs = [p.strip() for p in raw_paragraphs if p.strip()]

    if not paragraphs:
        return []

    # 合并过短段落（< 50 字合并到上一段）
    merged = []
    for p in paragraphs:
        if merged and len(p) < 50:
            merged[-1] += "\n\n" + p
        else:
            merged.append(p)

    # 构建结果
    sections = []
    for i, text in enumerate(merged):
        sections.append({
            "title": f"段落 {i + 1}",
            "content": text,
            "order_index": i,
        })

    log.info(f"Extracted {len(sections)} text sections")
    return sections
