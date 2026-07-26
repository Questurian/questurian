from __future__ import annotations

import re
from html import unescape
from typing import Any

from ..config import (
    PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS,
    PROMPT2BLOG_CLEANUP_REMOVED_EXCERPT_CHARS,
)
from ..support import _normalize_text, _safe_dict, _safe_str


def _preclean_source_text(raw_text: str) -> tuple[str, dict[str, int]]:
    text = unescape(raw_text or "")
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    removed_lines = 0
    cleaned_lines: list[str] = []
    for line in text.split("\n"):
        normalized = re.sub(r"\s+", " ", line).strip()
        if not normalized:
            cleaned_lines.append("")
            continue
        if re.fullmatch(r"https?://\S+", normalized):
            removed_lines += 1
            continue
        cleaned_lines.append(normalized)

    cleaned = "\n".join(cleaned_lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()

    stats = {
        "input_chars": len(raw_text or ""),
        "output_chars": len(cleaned),
        "removed_lines": removed_lines,
    }
    return cleaned, stats


def _truncate_cleanup_excerpt(value: str) -> str:
    excerpt = _safe_str(value)
    if len(excerpt) <= PROMPT2BLOG_CLEANUP_REMOVED_EXCERPT_CHARS:
        return excerpt
    return excerpt[: PROMPT2BLOG_CLEANUP_REMOVED_EXCERPT_CHARS - 1].rstrip() + "…"


def _sanitize_cleanup_text(value: Any) -> str:
    text = _safe_str(value)
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _sanitize_removed_blocks(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    removed_blocks: list[dict[str, str]] = []
    for item in value:
        if len(removed_blocks) >= PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS:
            break
        record = _safe_dict(item)
        label = _safe_str(record.get("label")) or "Removed block"
        reason = _safe_str(record.get("reason")) or "Noise or promotional content"
        excerpt = _truncate_cleanup_excerpt(_safe_str(record.get("excerpt")))
        if not excerpt:
            continue
        removed_blocks.append(
            {
                "label": label,
                "reason": reason,
                "excerpt": excerpt,
            }
        )
    return removed_blocks


def _sanitize_cleanup_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": _safe_str(parsed.get("title")),
        "published_at": _safe_str(parsed.get("published_at")),
        "cleaned_text": _sanitize_cleanup_text(parsed.get("cleaned_text")),
        "removed_blocks": _sanitize_removed_blocks(parsed.get("removed_blocks")),
    }


def _chunk_source_text(text: str, max_chars: int) -> list[str]:
    segments = [
        segment.strip() for segment in re.split(r"\n\s*\n", text) if segment.strip()
    ]
    if not segments:
        stripped = text.strip()
        return [stripped] if stripped else []

    chunks: list[str] = []
    current = ""

    def _append_long_segment(segment: str) -> None:
        words = segment.split()
        if not words:
            return
        current_words = ""
        for word in words:
            candidate = f"{current_words} {word}".strip()
            if current_words and len(candidate) > max_chars:
                chunks.append(current_words)
                current_words = word
            else:
                current_words = candidate
        if current_words:
            chunks.append(current_words)

    for segment in segments:
        if len(segment) > int(max_chars * 1.1):
            if current:
                chunks.append(current)
                current = ""
            _append_long_segment(segment)
            continue

        candidate = f"{current}\n\n{segment}".strip() if current else segment
        if current and len(candidate) > max_chars:
            chunks.append(current)
            current = segment
        else:
            current = candidate

    if current:
        chunks.append(current)

    return chunks


def _merge_chunked_cleanup_text(cleaned_chunks: list[str]) -> str:
    merged_paragraphs: list[str] = []
    seen_paragraphs: set[str] = set()

    for chunk in cleaned_chunks:
        paragraphs = [
            segment.strip()
            for segment in re.split(r"\n\s*\n", chunk)
            if segment.strip()
        ]
        for paragraph in paragraphs:
            normalized = _normalize_text(paragraph)
            if not normalized:
                continue
            if normalized in seen_paragraphs:
                continue
            if merged_paragraphs:
                last_normalized = _normalize_text(merged_paragraphs[-1])
                if normalized == last_normalized:
                    continue
                if len(normalized) > 80 and normalized in last_normalized:
                    continue
                if len(last_normalized) > 80 and last_normalized in normalized:
                    merged_paragraphs[-1] = paragraph
                    continue
            merged_paragraphs.append(paragraph)
            seen_paragraphs.add(normalized)

    return "\n\n".join(merged_paragraphs).strip()
