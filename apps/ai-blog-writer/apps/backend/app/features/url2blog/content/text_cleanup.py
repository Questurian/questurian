"""Pasted article text cleanup for URL2Blog stage 1."""

import logging
import re
from typing import Any

from ..config import (
    URL2BLOG_TEXT_CLEANUP_CHUNKING_CHAR_THRESHOLD,
    URL2BLOG_TEXT_CLEANUP_CHUNK_TARGET_CHARS,
    URL2BLOG_TEXT_CLEANUP_MAX_OUTPUT_TOKENS,
    URL2BLOG_TEXT_CLEANUP_MAX_REMOVED_BLOCKS,
    URL2BLOG_TEXT_CLEANUP_REMOVED_EXCERPT_CHARS,
)
from ..llm.coerce import _safe_str
from ..prompts import (
    URL2BLOG_TEXT_CLEANUP_CHUNK_PROMPT,
    URL2BLOG_TEXT_CLEANUP_PROMPT,
)

logger = logging.getLogger(__name__)


def _strip_html(html: str) -> str:
    """Strip HTML tags and decode entities to get raw text."""
    # Remove script and style blocks entirely
    text = re.sub(
        r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE
    )
    text = re.sub(
        r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE
    )
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode common HTML entities
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")
    text = text.replace("&nbsp;", " ")
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    # Restore some paragraph breaks at block boundaries
    text = re.sub(r"\s{2,}", "\n\n", text)
    return text.strip()


def _preclean_pasted_text(raw_text: str) -> str:
    """Basic normalization of pasted webpage text before AI cleanup."""
    text = _strip_html(raw_text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        normalized = re.sub(r"\s+", " ", line).strip()
        if re.fullmatch(r"https?://\S+", normalized):
            continue
        cleaned_lines.append(normalized)
    text = "\n".join(cleaned_lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _chunk_text_for_cleanup(text: str, max_chars: int) -> list[str]:
    """Split text into chunks of at most max_chars by paragraph boundaries."""
    segments = [s.strip() for s in re.split(r"\n\s*\n", text) if s.strip()]
    if not segments:
        stripped = text.strip()
        return [stripped] if stripped else []

    chunks: list[str] = []
    current = ""

    def _split_long(segment: str) -> None:
        words = segment.split()
        buf = ""
        for word in words:
            candidate = f"{buf} {word}".strip()
            if buf and len(candidate) > max_chars:
                chunks.append(buf)
                buf = word
            else:
                buf = candidate
        if buf:
            chunks.append(buf)

    for segment in segments:
        if len(segment) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            _split_long(segment)
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


def _merge_cleanup_text_chunks(chunks: list[str]) -> str:
    """Merge cleaned chunks, deduplicating repeated paragraphs at boundaries."""
    merged: list[str] = []
    for chunk in chunks:
        paragraphs = [s.strip() for s in re.split(r"\n\s*\n", chunk) if s.strip()]
        for paragraph in paragraphs:
            normalized = re.sub(r"\s+", " ", paragraph).lower()
            if not normalized:
                continue
            if merged:
                last_normalized = re.sub(r"\s+", " ", merged[-1]).lower()
                if normalized == last_normalized:
                    continue
                if len(normalized) > 80 and normalized in last_normalized:
                    continue
                if len(last_normalized) > 80 and last_normalized in normalized:
                    merged[-1] = paragraph
                    continue
            merged.append(paragraph)
    return "\n\n".join(merged).strip()


def _cleanup_pasted_article_text(
    *,
    raw_text: str,
    model_name: str,
) -> dict[str, Any]:
    """
    Clean messy pasted article text using AI chunked cleanup.

    Returns a stage1-compatible payload dict matching the extract_article response shape.
    """
    precleaned = _preclean_pasted_text(raw_text)

    fallback_parsed = {
        "title": "",
        "content": precleaned,
        "language": "English",
    }
    fallback_payload: dict[str, Any] = {
        "message": "URL2Blog text cleanup completed (fallback)",
        "source_url": "",
        "raw_text_length": len(raw_text or ""),
        "raw_response": "",
        "parsed": fallback_parsed,
        "parse_error": None,
        "translated": None,
        "translation_skipped": True,
        "translation_error": None,
        "text_cleanup_applied": True,
        "text_cleanup_fallback": True,
        "removed_blocks": [],
    }

    if not precleaned:
        return fallback_payload

    chunks = (
        _chunk_text_for_cleanup(
            precleaned, max_chars=URL2BLOG_TEXT_CLEANUP_CHUNK_TARGET_CHARS
        )
        if len(precleaned) >= URL2BLOG_TEXT_CLEANUP_CHUNKING_CHAR_THRESHOLD
        else [precleaned]
    )
    if not chunks:
        return fallback_payload

    try:
        cleaned_chunks: list[str] = []
        title = ""
        language = ""
        removed_blocks: list[dict[str, str]] = []

        for chunk_index, chunk in enumerate(chunks, start=1):
            prompt_template = (
                URL2BLOG_TEXT_CLEANUP_CHUNK_PROMPT
                if len(chunks) > 1
                else URL2BLOG_TEXT_CLEANUP_PROMPT
            )
            prompt = prompt_template.format(
                chunk_index=chunk_index,
                chunk_count=len(chunks),
                source_text=chunk,
            )
            from .. import routes

            parsed, raw_response = routes._invoke_json_llm(
                prompt=prompt,
                max_tokens=URL2BLOG_TEXT_CLEANUP_MAX_OUTPUT_TOKENS,
                temperature=0.1,
                model_name=model_name,
            )
            cleaned_text_chunk = _safe_str(parsed.get("cleaned_text"))
            if not cleaned_text_chunk:
                raise RuntimeError("AI text cleanup returned empty cleaned_text")
            cleaned_chunks.append(cleaned_text_chunk)
            if not title:
                title = _safe_str(parsed.get("title"))
            if not language:
                language = _safe_str(parsed.get("language"))

            remaining = URL2BLOG_TEXT_CLEANUP_MAX_REMOVED_BLOCKS - len(removed_blocks)
            if remaining > 0:
                for block in (parsed.get("removed_blocks") or [])[:remaining]:
                    if isinstance(block, dict):
                        excerpt = _safe_str(block.get("excerpt"))
                        if len(excerpt) > URL2BLOG_TEXT_CLEANUP_REMOVED_EXCERPT_CHARS:
                            excerpt = (
                                excerpt[
                                    : URL2BLOG_TEXT_CLEANUP_REMOVED_EXCERPT_CHARS - 1
                                ]
                                + "…"
                            )
                        removed_blocks.append(
                            {
                                "label": _safe_str(block.get("label"))
                                or "Removed block",
                                "reason": (
                                    _safe_str(block.get("reason"))
                                    or "Noise or promotional content"
                                ),
                                "excerpt": excerpt,
                            }
                        )

        cleaned_text = (
            _merge_cleanup_text_chunks(cleaned_chunks)
            if len(cleaned_chunks) > 1
            else cleaned_chunks[0]
        )
        cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text)
        cleaned_text = re.sub(r"[ \t]{2,}", " ", cleaned_text).strip()

        if not cleaned_text:
            raise RuntimeError("Merged text cleanup output was empty")

        return {
            "message": "URL2Blog text cleanup completed",
            "source_url": "",
            "raw_text_length": len(raw_text or ""),
            "raw_response": "",
            "parsed": {
                "title": title,
                "content": cleaned_text,
                "language": language or "English",
            },
            "parse_error": None,
            "translated": None,
            "translation_skipped": True,
            "translation_error": None,
            "text_cleanup_applied": True,
            "text_cleanup_fallback": False,
            "removed_blocks": removed_blocks,
        }

    except Exception as exc:  # noqa: BLE001
        logger.warning("URL2Blog pasted text cleanup failed: %s", exc)
        return fallback_payload
