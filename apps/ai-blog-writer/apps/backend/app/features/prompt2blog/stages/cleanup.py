from __future__ import annotations

import logging
from typing import Any

from app.shared.provider_faults import is_fatal_provider_fault

from ..config import (
    PROMPT2BLOG_CLEANUP_CHUNKING_CHAR_THRESHOLD,
    PROMPT2BLOG_CLEANUP_CHUNK_TARGET_CHARS,
    PROMPT2BLOG_CLEANUP_MAX_OUTPUT_TOKENS,
    PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS,
)
from ..content.source_text import (
    _chunk_source_text,
    _merge_chunked_cleanup_text,
    _preclean_source_text,
    _sanitize_cleanup_payload,
    _sanitize_cleanup_text,
)
from ..dependencies import Prompt2BlogLLM
from ..prompts.preparation import (
    P2B_SOURCE_CLEANUP_CHUNK_PROMPT,
    P2B_SOURCE_CLEANUP_PROMPT,
)
from ..support import _safe_str

logger = logging.getLogger(__name__)


def cleanup_source(
    *,
    raw_text: str,
    source_index: int,
    model_name: str,
    llm: Prompt2BlogLLM,
) -> dict[str, Any]:
    """Clean one source, retaining the deterministic fallback contract."""
    precleaned_text, preclean_stats = _preclean_source_text(raw_text)
    fallback_payload = {
        "source_index": source_index,
        "input_chars": len(raw_text or ""),
        "preclean_chars": len(precleaned_text),
        "cleaned_chars": len(precleaned_text),
        "fallback_used": True,
        "title": "",
        "published_at": "",
        "cleaned_text": precleaned_text,
        "removed_blocks": [],
    }

    if not precleaned_text:
        return fallback_payload

    chunks = (
        _chunk_source_text(
            precleaned_text,
            max_chars=PROMPT2BLOG_CLEANUP_CHUNK_TARGET_CHARS,
        )
        if len(precleaned_text) >= PROMPT2BLOG_CLEANUP_CHUNKING_CHAR_THRESHOLD
        else [precleaned_text]
    )
    if not chunks:
        return fallback_payload

    try:
        cleaned_chunks: list[str] = []
        removed_blocks: list[dict[str, str]] = []
        title = ""
        published_at = ""

        for chunk_index, chunk in enumerate(chunks, start=1):
            prompt_template = (
                P2B_SOURCE_CLEANUP_CHUNK_PROMPT
                if len(chunks) > 1
                else P2B_SOURCE_CLEANUP_PROMPT
            )
            prompt = prompt_template.format(
                chunk_index=chunk_index,
                chunk_count=len(chunks),
                source_text=chunk,
            )
            parsed, _ = llm.invoke_json(
                prompt=prompt,
                max_tokens=PROMPT2BLOG_CLEANUP_MAX_OUTPUT_TOKENS,
                temperature=0.1,
                model_name=model_name,
            )
            cleanup_payload = _sanitize_cleanup_payload(parsed)
            cleaned_text = _safe_str(cleanup_payload.get("cleaned_text"))
            if not cleaned_text:
                raise RuntimeError("AI cleanup returned empty cleaned_text")
            cleaned_chunks.append(cleaned_text)
            if not title:
                title = _safe_str(cleanup_payload.get("title"))
            if not published_at:
                published_at = _safe_str(cleanup_payload.get("published_at"))

            remaining_slots = PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS - len(
                removed_blocks
            )
            if remaining_slots > 0:
                removed_blocks.extend(
                    cleanup_payload["removed_blocks"][:remaining_slots]
                )

        cleaned_text = (
            _merge_chunked_cleanup_text(cleaned_chunks)
            if len(cleaned_chunks) > 1
            else cleaned_chunks[0]
        )
        cleaned_text = _sanitize_cleanup_text(cleaned_text)
        if not cleaned_text:
            raise RuntimeError("Merged AI cleanup output was empty")

        return {
            "source_index": source_index,
            "input_chars": len(raw_text or ""),
            "preclean_chars": preclean_stats["output_chars"],
            "cleaned_chars": len(cleaned_text),
            "fallback_used": False,
            "title": title,
            "published_at": published_at,
            "cleaned_text": cleaned_text,
            "removed_blocks": removed_blocks,
        }
    except Exception as exc:  # noqa: BLE001
        if is_fatal_provider_fault(exc):
            raise
        logger.warning(
            "Prompt2Blog AI cleanup failed for source %d: %s",
            source_index,
            exc,
        )
        return fallback_payload
