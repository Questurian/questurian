"""
URL2Blog API routes.

All routes are prefixed with /url2blog in the main router.
"""

import json
import logging
import math
import os
import re
import contextvars
from datetime import datetime
from contextlib import contextmanager
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, model_validator

from app.core import (
    cleanup_run,
    get_all_runs,
    read_output,
    read_stage_result,
    read_status,
    get_article_type_by_id,
    get_article_type_by_name,
    read_article_type_name_definitions,
    resolve_httpx_verify,
    write_artifact,
    write_stage_result,
    write_status,
)
from utils import get_vertex_llm
from .graph import run_url2blog_pipeline_graph
from .storage import (
    get_all_completed_articles,
    get_article_sync_status,
    mark_article_synced,
)

router = APIRouter(prefix="/url2blog", tags=["url2blog"])
logger = logging.getLogger(__name__)

# Config constants + resolvers, request models, and coercion helpers now live
# in dedicated modules. Re-exported so url2blog_routes.<name> keeps resolving.
from .llm.coerce import *  # noqa: F401,F403
from .config import *  # noqa: F401,F403
from .config import FEATURE_NAME  # noqa: F401  (underscore-free name)
from .models import (  # noqa: F401
    ExtractRequest,
    Stage2ClassifyRequest,
    PipelineV2Request,
)

from .llm.parsing import *  # noqa: F401,F403  (JSON parse + parse-tracking)


def invoke_google_grounded_text(*args: Any, **kwargs: Any) -> Any:
    """Import grounding lazily so route modules stay importable under light test stubs."""
    from utils import invoke_google_grounded_text as _invoke_google_grounded_text

    return _invoke_google_grounded_text(*args, **kwargs)


# Prompt templates live in the prompts/ package, grouped by domain.
# Re-exported here so url2blog_routes.<PROMPT> keeps resolving for callers/tests.
from .prompts import (
    EXTRACT_PROMPT,
    TRANSLATE_PROMPT,
    CLASSIFY_ARTICLE_TYPE_PROMPT,
    URL2BLOG_TEXT_CLEANUP_PROMPT,
    URL2BLOG_TEXT_CLEANUP_CHUNK_PROMPT,
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    V2_GUIDELINE_REWRITE_PROMPT,
    V2_REWRITE_RETRY_FEEDBACK_SUFFIX,
    V2_REWRITE_REPAIR_PROMPT,
    V2_GUIDELINE_REWRITE_MARKDOWN_PROMPT,
    V2_REWRITE_REPAIR_MARKDOWN_PROMPT,
    V2_QUALITY_AUDIT_PROMPT,
    V2_TITLE_GENERATION_PROMPT,
    V2_SOURCE_FACTS_EXTRACTION_PROMPT,
    V2_FACT_COVERAGE_AUDIT_PROMPT,
    V2_FACT_REPAIR_PROMPT,
    V2_FACT_REPAIR_MARKDOWN_PROMPT,
    V2_LENGTH_EXPANSION_PROMPT,
    V2_LENGTH_EXPANSION_MARKDOWN_PROMPT,
    EDITORIAL_COMPONENT_LABELS,
    V2_EDITORIAL_BLUEPRINT_PROMPT,
    V2_SHORT_ARTICLE_ENRICHMENT_PROMPT,
    V2_EDITORIAL_AUGMENTATION_PROMPT,
)


def _now_iso() -> str:
    """Return a UTC ISO timestamp for run/state writes."""
    return datetime.utcnow().isoformat()


def _read_langgraph_trace(run_id: str) -> dict[str, str]:
    stage_payload = read_stage_result(run_id, "langgraph_trace")
    if not isinstance(stage_payload, dict):
        return {}
    data = stage_payload.get("data")
    if not isinstance(data, dict):
        return {}

    trace_payload: dict[str, str] = {}
    trace_url = data.get("langsmith_trace_url")
    if isinstance(trace_url, str) and trace_url.strip():
        trace_payload["langsmith_trace_url"] = trace_url.strip()
    trace_run_id = data.get("langsmith_trace_run_id")
    if isinstance(trace_run_id, str) and trace_run_id.strip():
        trace_payload["langsmith_trace_run_id"] = trace_run_id.strip()
    return trace_payload


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get the status of a URL2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/status-latest")
async def get_latest_status() -> JSONResponse:
    """Get latest URL2Blog run status row (helps recover run-id mismatches)."""
    runs = get_all_runs(feature=FEATURE_NAME)
    if not runs:
        raise HTTPException(status_code=404, detail="No URL2Blog runs found.")
    latest = runs[0]
    return JSONResponse(
        {
            "run_id": latest.get("run_id"),
            "feature": FEATURE_NAME,
            "state": latest.get("status"),
            "stage": latest.get("stage"),
            "updated_at": latest.get("updated_at"),
        }
    )


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    """Get the result of a completed URL2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    trace_payload = _read_langgraph_trace(run_id)
    artifact = output["artifact"]
    if trace_payload and isinstance(artifact, dict):
        pipeline_payload = artifact.get("pipeline_v2")
        if isinstance(pipeline_payload, dict):
            pipeline_payload.update(trace_payload)

    response_payload: dict[str, Any] = {
        "run_id": run_id,
        "markdown": output["markdown"],
        "artifact": artifact,
    }
    response_payload.update(trace_payload)

    return JSONResponse(
        response_payload
    )


@router.get("/debug/{run_id}")
async def debug_run(run_id: str) -> JSONResponse:
    """Debug endpoint for URL2Blog run metadata/stages."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    stages = {}
    for stage_name in ["stage_1", "stage_2", "pipeline_v2", "langgraph_trace"]:
        stage_data = read_stage_result(run_id, stage_name)
        if stage_data:
            stages[stage_name] = stage_data

    output = read_output(run_id)

    return JSONResponse(
        {
            "run_id": run_id,
            "status": status,
            "stages": stages,
            "output": output,
        }
    )


@router.get("/articles")
async def get_articles() -> JSONResponse:
    """Get all completed URL2Blog articles."""
    return JSONResponse(get_all_completed_articles())


@router.delete("/articles/{run_id}")
async def delete_article(run_id: str) -> JSONResponse:
    """Delete a URL2Blog run and all of its stored data."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    cleanup_run(run_id)
    return JSONResponse(
        {
            "message": "Article deleted",
            "run_id": run_id,
        }
    )


@router.post("/articles/{run_id}/sync")
async def mark_article_as_synced(run_id: str, request: dict) -> JSONResponse:
    """Mark a URL2Blog article as synced to Payload CMS."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    payload_article_id = request.get("payload_article_id")
    if not payload_article_id:
        raise HTTPException(status_code=400, detail="payload_article_id is required")

    success = mark_article_synced(run_id, payload_article_id)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")

    return JSONResponse(
        {
            "message": "Article marked as synced",
            "run_id": run_id,
            "payload_article_id": payload_article_id,
        }
    )


@router.get("/articles/{run_id}/sync")
async def get_sync_status(run_id: str) -> JSONResponse:
    """Get URL2Blog article sync status."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    status = get_article_sync_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Article not found")
    return JSONResponse(status)


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
        _chunk_text_for_cleanup(precleaned, max_chars=URL2BLOG_TEXT_CLEANUP_CHUNK_TARGET_CHARS)
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
            parsed, raw_response = _invoke_json_llm(
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
                                excerpt[: URL2BLOG_TEXT_CLEANUP_REMOVED_EXCERPT_CHARS - 1] + "…"
                            )
                        removed_blocks.append(
                            {
                                "label": _safe_str(block.get("label")) or "Removed block",
                                "reason": (
                                    _safe_str(block.get("reason")) or "Noise or promotional content"
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


def _invoke_google_grounded_json(
    prompt: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.05,
    model_name: str | None = None,
) -> tuple[dict[str, Any], str, list[str]]:
    """Invoke Gemini with Google Search grounding and parse JSON output."""
    grounded_model_name = _resolve_grounded_model(model_name)
    grounded = invoke_google_grounded_text(
        (
            f"{prompt}\n\n"
            "CRITICAL OUTPUT RULE:\n"
            "Return ONLY one valid JSON object.\n"
            "No prose, no markdown, no code fences."
        ),
        model_name=grounded_model_name,
        fallback_model_name=DEFAULT_GROUNDED_MODEL,
        max_tokens=_resolve_max_tokens(max_tokens),
        temperature=temperature,
    )
    if grounded is None:
        return {}, "", []

    raw_response = _safe_str(grounded.text)
    parsed, parse_error = _extract_json_from_response(raw_response)
    if parse_error or not parsed:
        logger.warning(
            "URL2Blog pipeline v2: grounded enrichment JSON parse failed: %s",
            parse_error or "unknown",
        )
        parsed = {}

    return parsed, raw_response, grounded.source_urls


def _build_excerpt(text: str, limit: int = 320) -> str:
    """Return a compact single-line excerpt."""
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3].rstrip()}..."


def _build_markdown(title: str, content: str) -> str:
    """Return clean markdown output for the rewritten article."""
    cleaned_title = _safe_str(title)
    cleaned_content = _ensure_markdown_section_headers(content)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{cleaned_content}".strip()
    return cleaned_content


def _sanitize_generated_title(raw_title: str, *, fallback_title: str) -> str:
    """Normalize generated title text into a single clean line."""
    candidate = _safe_str(raw_title)
    if not candidate:
        return fallback_title

    if candidate.startswith("```"):
        candidate = re.sub(
            r"^```(?:markdown|md|text)?\s*",
            "",
            candidate,
            flags=re.IGNORECASE,
        )
        candidate = re.sub(r"\s*```$", "", candidate).strip()

    first_non_empty = next(
        (line.strip() for line in candidate.splitlines() if line.strip()),
        "",
    )
    if not first_non_empty:
        return fallback_title

    cleaned = re.sub(r"^\s*#+\s*", "", first_non_empty)
    cleaned = cleaned.strip().strip('"').strip("'")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if len(cleaned) < 8:
        return fallback_title
    if len(cleaned) > 140:
        cleaned = cleaned[:140].rstrip(" .,:;-")

    return cleaned or fallback_title


def _invoke_markdown_long_output(
    *,
    prompt: str,
    stage_name: str,
    model_name: str,
    temperature: float,
    max_tokens: int,
    fallback_content: str,
    parse_metrics: dict[str, Any],
    legacy_json_prompt: str | None = None,
    legacy_json_stage_name: str | None = None,
    legacy_content_key: str | None = None,
    legacy_title_key: str | None = None,
) -> dict[str, Any]:
    """Invoke long-form stage expecting markdown output, with legacy JSON fallback."""
    current_prompt = prompt.strip()
    last_error = ""
    last_response = ""
    effective_max_tokens = _resolve_max_tokens(max_tokens)

    for attempt in range(1, URL2BLOG_LONG_OUTPUT_MAX_RETRIES + 1):
        llm = get_vertex_llm(
            temperature=temperature if attempt == 1 else min(0.25, temperature + 0.05),
            max_tokens=effective_max_tokens,
            model_name=model_name,
        )
        invoke = getattr(llm, "invoke", None)
        if not callable(invoke):
            last_error = "LLM client unavailable for markdown invocation."
            break

        try:
            raw_response = _safe_str(invoke(current_prompt)).strip()
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            raw_response = ""

        if raw_response:
            normalized = _remove_academic_conclusion_phrases(raw_response)
            normalized = _ensure_markdown_section_headers(normalized)
            if normalized.strip():
                return {
                    "content": normalized,
                    "raw_response": raw_response,
                    "transport": "markdown",
                    "fallback_title": "",
                }

        last_response = raw_response[:2000] if raw_response else ""
        current_prompt = (
            "Your previous output did not follow requirements.\n"
            "Return ONLY markdown article body text.\n"
            "No JSON, no markdown fences, no explanations.\n"
            "Include clear section headers and complete prose paragraphs.\n\n"
            f"Previous invalid output:\n{raw_response[:4000]}\n"
        )

    if (
        legacy_json_prompt
        and legacy_json_stage_name
        and legacy_content_key
    ):
        logger.warning(
            "URL2Blog markdown long-output failed for %s; falling back to JSON path. error=%s",
            stage_name,
            last_error or "empty response",
        )
        parsed, raw_response = _invoke_json_llm_tracked(
            prompt=legacy_json_prompt,
            stage_name=legacy_json_stage_name,
            parse_metrics=parse_metrics,
            max_tokens=effective_max_tokens,
            temperature=temperature,
            model_name=model_name,
        )
        fallback_value = _safe_str(parsed.get(legacy_content_key))
        if not fallback_value:
            if _allow_long_output_source_fallback():
                fallback_value = fallback_content
                logger.warning(
                    "URL2Blog %s JSON fallback returned empty '%s'; using source fallback due to %s=1",
                    stage_name,
                    legacy_content_key,
                    URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK_ENV,
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Failed to generate {stage_name}: legacy JSON fallback "
                        f"did not return '{legacy_content_key}'."
                    ),
                )
        fallback_value = _ensure_markdown_section_headers(
            _remove_academic_conclusion_phrases(fallback_value)
        )
        return {
            "content": fallback_value,
            "raw_response": raw_response,
            "transport": "json_fallback",
            "fallback_title": (
                _safe_str(parsed.get(legacy_title_key)) if legacy_title_key else ""
            ),
        }

    raise HTTPException(
        status_code=500,
        detail=(
            f"Failed to generate markdown output for {stage_name}: "
            f"{last_error or 'empty response'} | preview={last_response[:240]}"
        ),
    )


def _invoke_title_generation(
    *,
    prompt: str,
    model_name: str,
    fallback_title: str,
    temperature: float = 0.1,
    max_tokens: int = 256,
) -> tuple[str, str]:
    """Generate a single-line title with graceful fallback."""
    current_prompt = prompt.strip()
    last_raw_response = ""

    for attempt in range(1, URL2BLOG_LONG_OUTPUT_MAX_RETRIES + 1):
        llm = get_vertex_llm(
            temperature=temperature if attempt == 1 else 0.0,
            max_tokens=max_tokens,
            model_name=model_name,
        )
        invoke = getattr(llm, "invoke", None)
        if not callable(invoke):
            return fallback_title, ""

        try:
            raw_response = _safe_str(invoke(current_prompt)).strip()
        except Exception:  # noqa: BLE001
            raw_response = ""
        last_raw_response = raw_response

        generated = _sanitize_generated_title(
            raw_response,
            fallback_title=fallback_title,
        )
        if generated and generated != fallback_title:
            return generated, raw_response

        current_prompt = (
            "Your previous output was invalid.\n"
            "Return ONLY a single-line title.\n"
            "No quotes, no markdown, no JSON, no commentary.\n\n"
            f"Previous invalid output:\n{raw_response[:1000]}"
        )

    return fallback_title, last_raw_response


def _build_v2_rewrite_from_markdown(
    *,
    improved_title: str,
    improved_content: str,
    previous_rewrite: dict[str, Any] | None = None,
    guideline_alignment_summary: str | None = None,
    improvements_applied: list[str] | None = None,
    remaining_gaps: list[str] | None = None,
) -> dict[str, Any]:
    """Build canonical rewrite payload from markdown stage output."""
    previous_payload = _safe_dict(previous_rewrite)
    cleaned_content = _safe_str(improved_content) or _safe_str(
        previous_payload.get("improved_content")
    )
    cleaned_content = _ensure_markdown_section_headers(
        _remove_academic_conclusion_phrases(cleaned_content)
    )

    cleaned_title = _safe_str(improved_title) or _safe_str(
        previous_payload.get("improved_title")
    )

    summary = _safe_str(guideline_alignment_summary) or _safe_str(
        previous_payload.get("guideline_alignment_summary")
    )
    if not summary:
        summary = (
            "Article was revised for stronger guideline alignment, clearer flow, and "
            "more consistent editorial tone."
        )

    applied = (
        _safe_string_list(improvements_applied)
        or _safe_string_list(previous_payload.get("improvements_applied"))
        or [
            "Tightened structure and transitions between sections.",
            "Improved editorial clarity and consistency.",
            "Adjusted wording to better match article-type guidance.",
        ]
    )

    gaps = _safe_string_list(remaining_gaps)
    if not gaps:
        gaps = _safe_string_list(previous_payload.get("remaining_gaps"))

    return {
        "improved_title": cleaned_title,
        "improved_content": cleaned_content,
        "guideline_alignment_summary": _remove_academic_conclusion_phrases(summary),
        "improvements_applied": applied,
        "remaining_gaps": gaps,
    }


def _invoke_json_llm_tracked(
    *,
    prompt: str,
    stage_name: str,
    parse_metrics: dict[str, Any] | None,
    max_tokens: int = 4096,
    temperature: float = 0.05,
    model_name: str | None = None,
    allow_truncated_repair: bool = True,
) -> tuple[dict[str, Any], str]:
    """Invoke JSON LLM with parse-retry tracking for a named stage."""
    with _json_parse_tracking_scope(parse_metrics, stage_name):
        if allow_truncated_repair:
            return _invoke_json_llm(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                model_name=model_name,
                allow_truncated_repair=True,
            )
        return _invoke_json_llm(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            model_name=model_name,
        )


# Pure pipeline-support helpers now live in dedicated domain packages.
from .content.markdown import *  # noqa: F401,F403
from .content.editorial_blocks import *  # noqa: F401,F403
from .pipeline_v2.gating import *  # noqa: F401,F403
from .content.sanitizers import *  # noqa: F401,F403


def _invoke_json_llm(
    prompt: str,
    max_tokens: int = 4096,
    temperature: float = 0.05,
    model_name: str | None = None,
    allow_truncated_repair: bool = True,
) -> tuple[dict[str, Any], str]:
    """Invoke LLM and parse strict JSON response."""
    parsed, raw_response, parse_error = _invoke_json_llm_best_effort(
        prompt=prompt,
        max_tokens=max_tokens,
        temperature=temperature,
        model_name=model_name,
        allow_truncated_repair=allow_truncated_repair,
    )
    if parsed:
        return parsed, raw_response

    raise HTTPException(
        status_code=500,
        detail=f"Failed to parse LLM response: {parse_error or 'Unknown parse failure'}",
    )


def _invoke_json_llm_best_effort(
    prompt: str,
    max_tokens: int = 4096,
    temperature: float = 0.05,
    model_name: str | None = None,
    allow_truncated_repair: bool = True,
) -> tuple[dict[str, Any] | None, str, str | None]:
    """Invoke LLM with JSON-recovery retries without raising on parse failure."""
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    last_error = "Unknown parse failure"
    last_response = ""
    current_prompt = strict_prompt

    selected_model_name = _resolve_url2blog_model(model_name)
    effective_max_tokens = _resolve_max_tokens(max_tokens)
    for resolved_model_name in (selected_model_name,):
        current_prompt = strict_prompt
        parse_failures_this_call = 0

        for attempt in range(1, 4):
            llm = get_vertex_llm(
                temperature=temperature if attempt == 1 else 0.0,
                max_tokens=effective_max_tokens,
                model_name=resolved_model_name,
            )
            result = llm.invoke(current_prompt)
            if not result or not result.strip():
                last_error = f"{resolved_model_name} returned an empty response."
                parse_failures_this_call += 1
                _record_json_parse_failure()
                continue

            raw_response = result.strip()
            parsed, parse_error = _extract_json_from_response(
                raw_response,
                allow_truncated_repair=allow_truncated_repair,
            )
            if not parse_error and parsed:
                _record_json_parse_recovery(parse_failures_this_call)
                if resolved_model_name != selected_model_name:
                    logger.warning(
                        "URL2Blog JSON recovered using fallback model %s",
                        resolved_model_name,
                    )
                return parsed, raw_response, None

            last_error = parse_error or "Invalid JSON"
            last_response = raw_response[:2000]
            parse_failures_this_call += 1
            _record_json_parse_failure()

            log_message = (
                "URL2Blog JSON parse failed (%s attempt %d): %s | preview=%s"
            )
            log_args = (
                resolved_model_name,
                attempt,
                last_error,
                last_response.replace("\n", " ")[:240],
            )
            if attempt < 3:
                logger.info(log_message, *log_args)
            else:
                logger.warning(log_message, *log_args)

            current_prompt = (
                "Your previous output was invalid JSON.\n"
                "Return ONLY one strict JSON object.\n"
                "Do not add commentary. Do not use markdown fences. Do not add trailing commas.\n"
                "Ensure all property names and string values use double quotes.\n"
                "If previous output was truncated, complete it as valid JSON.\n"
                "Output must start with '{' and end with '}'.\n\n"
                f"Previous invalid output:\n{raw_response[:4000]}\n"
            )

    return None, last_response, last_error


async def extract_article(request: ExtractRequest) -> JSONResponse:
    """
    Fetch an article URL and extract title + content using Gemini.

    Accepts: { "url": "https://example.com/article" }
    Returns: { "title": "...", "content": "...", "raw_response": "...", "source_url": "..." }
    """
    url = request.url.strip()
    selected_model_name = _resolve_url2blog_model(request.model_name)
    include_debug = request.include_debug
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400, detail="URL must start with http:// or https://"
        )

    # Fetch the page
    logger.info("URL2Blog: fetching %s", url)
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30.0,
            verify=resolve_httpx_verify(),
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; Questurian/1.0)",
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch URL (HTTP {exc.response.status_code})",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch URL: {exc}",
        ) from exc

    raw_html = resp.text
    raw_text = _strip_html(raw_html)

    if not raw_text or len(raw_text) < 50:
        raise HTTPException(
            status_code=422,
            detail="Page returned too little text content to extract an article.",
        )

    max_chars = _read_int_env(
        URL2BLOG_INPUT_CHAR_LIMIT_ENV,
        default=URL2BLOG_INPUT_CHAR_LIMIT_DEFAULT,
        min_value=0,
        max_value=1_000_000,
    )
    if max_chars > 0 and len(raw_text) > max_chars:
        raw_text = raw_text[:max_chars]

    # Send to Gemini for extraction
    prompt = EXTRACT_PROMPT + raw_text

    logger.info("URL2Blog Stage 1: sending prompt to Gemini (%d chars)", len(raw_text))
    parsed, raw_response, parse_error = _invoke_json_llm_best_effort(
        prompt=prompt,
        max_tokens=8192,
        temperature=0.1,
        model_name=selected_model_name,
        allow_truncated_repair=True,
    )
    if not raw_response and parse_error:
        logger.warning("URL2Blog Stage 1 extraction failed: %s", parse_error)

    stage_trace: list[dict[str, Any]] = []
    if include_debug:
        stage_trace.append(
            {
                "stage": "stage1_extract_article",
                "model_name": selected_model_name,
                "max_tokens": 8192,
                "temperature": 0.1,
                "input": {
                    "url": url,
                    "raw_text": raw_text,
                    "raw_text_length": len(raw_text),
                },
                "prompt": prompt,
                "raw_response": raw_response,
                "parsed": parsed,
                "parse_error": parse_error,
            }
        )

    # Phase 2: Translate if not English
    translated = None
    translation_skipped = False
    translation_error = None
    translation_prompt = ""
    translation_raw_response = ""

    if parsed and not parse_error:
        language = (parsed.get("language") or "").strip()
        is_english = language.lower() in ("english", "en", "")

        if is_english:
            translation_skipped = True
            logger.info("URL2Blog: article already in English, skipping translation")
            if include_debug:
                stage_trace.append(
                    {
                        "stage": "stage1_translate_article",
                        "model_name": selected_model_name,
                        "max_tokens": 8192,
                        "temperature": 0.1,
                        "input": {
                            "source_language": language or "English",
                            "title": parsed.get("title", ""),
                            "content": parsed.get("content", ""),
                        },
                        "prompt": None,
                        "raw_response": "",
                        "parsed": None,
                        "parse_error": None,
                        "skipped": True,
                        "skip_reason": "Source language already English.",
                    }
                )
        else:
            logger.info("URL2Blog: translating from %s to English", language)
            translation_prompt = TRANSLATE_PROMPT.format(
                source_language=language,
                title=parsed.get("title", ""),
                content=parsed.get("content", ""),
            )
            translated, translation_raw_response, translation_error = (
                _invoke_json_llm_best_effort(
                    prompt=translation_prompt,
                    max_tokens=8192,
                    temperature=0.1,
                    model_name=selected_model_name,
                    allow_truncated_repair=True,
                )
            )
            if include_debug:
                stage_trace.append(
                    {
                        "stage": "stage1_translate_article",
                        "model_name": selected_model_name,
                        "max_tokens": 8192,
                        "temperature": 0.1,
                        "input": {
                            "source_language": language,
                            "title": parsed.get("title", ""),
                            "content": parsed.get("content", ""),
                        },
                        "prompt": translation_prompt,
                        "raw_response": translation_raw_response,
                        "parsed": translated,
                        "parse_error": translation_error,
                        "skipped": False,
                    }
                )
            if translation_error and not translated:
                logger.warning(
                    "URL2Blog translation failed to parse JSON: %s", translation_error
                )

    payload: dict[str, Any] = {
        "message": "URL2Blog stage 1 completed",
        "source_url": url,
        "raw_text_length": len(raw_text),
        "raw_response": raw_response,
        "parsed": parsed,
        "parse_error": parse_error,
        "translated": translated,
        "translation_skipped": translation_skipped,
        "translation_error": translation_error,
    }
    if include_debug:
        payload["debug"] = {"trace": stage_trace}

    return JSONResponse(payload)


async def classify_article_type(request: Stage2ClassifyRequest) -> JSONResponse:
    """
    Classify Stage 1 article output into one article type.

    Uses article type name/definition reference data from shared storage and
    returns the selected article type id/name for guideline lookup.
    """
    title = request.title.strip()
    content = request.content.strip()
    selected_model_name = _resolve_url2blog_model(request.model_name)
    include_debug = request.include_debug
    if not title and not content:
        raise HTTPException(status_code=400, detail="Title or content is required")
    if len(content) < 50:
        raise HTTPException(
            status_code=422, detail="Content too short for reliable classification"
        )

    article_types = read_article_type_name_definitions()
    if not article_types:
        raise HTTPException(
            status_code=500, detail="No article types available for classification"
        )

    article_types_for_prompt = "\n".join(
        f"- {item['name']}: {item['definition']}" for item in article_types
    )
    content_for_prompt = _llm_context_text(content)

    prompt = CLASSIFY_ARTICLE_TYPE_PROMPT.format(
        article_types=article_types_for_prompt,
        title=title,
        content=content_for_prompt,
    )

    logger.info(
        "URL2Blog Stage 2: classifying article type (%d chars, %d types)",
        len(content_for_prompt),
        len(article_types),
    )
    parsed, raw_response = _invoke_json_llm(
        prompt=prompt,
        max_tokens=1024,
        temperature=0.1,
        model_name=selected_model_name,
    )

    selected_name = str(parsed.get("classification", "")).strip()
    if not selected_name:
        raise HTTPException(
            status_code=500,
            detail="Classification response missing required 'classification' field.",
        )

    selected_type = next(
        (item for item in article_types if item["name"] == selected_name),
        None,
    )
    if not selected_type:
        normalized_selected = _normalize_article_type_name(selected_name)
        selected_type = next(
            (
                item
                for item in article_types
                if _normalize_article_type_name(item["name"]) == normalized_selected
            ),
            None,
        )

    if not selected_type:
        raise HTTPException(
            status_code=500,
            detail=f"LLM selected unsupported article type: '{selected_name}'",
        )

    article_type_row = get_article_type_by_name(selected_type["name"])
    if not article_type_row:
        raise HTTPException(status_code=404, detail="Selected article type not found")

    try:
        confidence = float(parsed.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0

    reasoning = _enforce_editorial_reasoning(
        str(parsed.get("reasoning", "")).strip(),
        article_type_row["name"],
    )

    payload: dict[str, Any] = {
        "message": "URL2Blog stage 2 classification completed",
        "classification": {
            "id": article_type_row["id"],
            "name": article_type_row["name"],
            "definition": article_type_row["definition"],
            "confidence": confidence,
            "reasoning": reasoning,
        },
        "article_types_considered": len(article_types),
        "raw_response": raw_response,
    }
    if include_debug:
        payload["debug"] = {
            "trace": [
                {
                    "stage": "stage2_classification",
                    "model_name": selected_model_name,
                    "max_tokens": 1024,
                    "temperature": 0.1,
                    "input": {
                        "title": title,
                        "content": content_for_prompt,
                        "source_url": request.source_url,
                        "language": request.language,
                        "article_types": article_types,
                    },
                    "prompt": prompt,
                    "raw_response": raw_response,
                    "parsed": parsed,
                    "output": {
                        "id": article_type_row["id"],
                        "name": article_type_row["name"],
                        "definition": article_type_row["definition"],
                        "confidence": confidence,
                        "reasoning": reasoning,
                    },
                }
            ]
        }

    return JSONResponse(payload)


@router.post("/pipeline-v2")
async def pipeline_v2(request: PipelineV2Request) -> JSONResponse:
    """
    URL2Blog pipeline-v2 entrypoint.

    Internals run through the LangGraph runner; request/response contract remains stable.
    """
    try:
        return await run_url2blog_pipeline_graph(request=request)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("URL2Blog pipeline-v2 request failed")
        raise HTTPException(
            status_code=500,
            detail=f"URL2Blog pipeline failed: {exc}",
        )


async def _pipeline_v2_run_stage1(
    *,
    request: PipelineV2Request,
    run_id: str,
    selected_model_name: str,
    include_debug: bool,
    stage_trace: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Execute URL2Blog stage 1 extraction and normalization."""
    pasted_text = _safe_str(request.pasted_text or "")
    url = _safe_str(request.url or "")

    trace = list(stage_trace or [])
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "stage_1",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    if pasted_text:
        # Text mode: run AI cleanup pipeline on the pasted article
        stage1_payload = _cleanup_pasted_article_text(
            raw_text=pasted_text,
            model_name=selected_model_name,
        )
        if include_debug:
            trace.append(
                {
                    "stage": "stage1_cleanup_pasted_text",
                    "model_name": selected_model_name,
                    "max_tokens": URL2BLOG_TEXT_CLEANUP_MAX_OUTPUT_TOKENS,
                    "temperature": 0.1,
                    "input": {"raw_text_length": len(pasted_text)},
                    "output": {
                        "title": _safe_dict(stage1_payload.get("parsed")).get("title", ""),
                        "language": _safe_dict(stage1_payload.get("parsed")).get("language", ""),
                        "cleaned_chars": len(
                            _safe_dict(stage1_payload.get("parsed")).get("content", "")
                        ),
                        "removed_blocks_count": len(
                            stage1_payload.get("removed_blocks") or []
                        ),
                        "fallback_used": stage1_payload.get("text_cleanup_fallback", False),
                    },
                }
            )
    elif url.startswith(("http://", "https://")):
        # URL mode: fetch and extract article
        stage1_response = await extract_article(
            ExtractRequest(
                url=url,
                model_name=selected_model_name,
                include_debug=include_debug,
            )
        )
        stage1_payload = json.loads(stage1_response.body.decode("utf-8"))
        if include_debug:
            stage1_debug = _safe_dict(stage1_payload.get("debug"))
            stage1_trace = stage1_debug.get("trace")
            if isinstance(stage1_trace, list):
                for entry in stage1_trace:
                    if isinstance(entry, dict):
                        trace.append(entry)
    else:
        raise HTTPException(
            status_code=400,
            detail="Either a valid URL (http:// or https://) or pasted_text must be provided.",
        )

    write_stage_result(
        run_id,
        "stage_1",
        {"created_at": _now_iso(), "data": stage1_payload},
    )

    parsed_article = _safe_dict(stage1_payload.get("parsed"))
    if not parsed_article:
        raise HTTPException(
            status_code=500,
            detail=stage1_payload.get("parse_error")
            or "Stage 1 returned no parsed article content.",
        )

    translated_article = _safe_dict(stage1_payload.get("translated"))
    translation_skipped = _safe_bool(
        stage1_payload.get("translation_skipped"), default=False
    )
    was_translated = not translation_skipped and bool(translated_article)

    normalized_title = (
        _safe_str(translated_article.get("title"))
        if was_translated
        else _safe_str(parsed_article.get("title"))
    )
    normalized_content = (
        _safe_str(translated_article.get("content"))
        if was_translated
        else _safe_str(parsed_article.get("content"))
    )
    if not normalized_content:
        raise HTTPException(
            status_code=422, detail="No article content available after extraction."
        )

    source_word_count = len(_tokenize_similarity_words(normalized_content))
    min_expanded_word_target = _resolve_min_expanded_word_target(source_word_count)
    normalized_language = (
        "English"
        if was_translated
        else _normalize_language_name(
            _safe_str(parsed_article.get("language")) or "English"
        )
    )

    return {
        "stage1_payload": stage1_payload,
        "trace": trace,
        "normalized_title": normalized_title,
        "normalized_content": normalized_content,
        "normalized_language": normalized_language,
        "source_word_count": source_word_count,
        "min_expanded_word_target": min_expanded_word_target,
    }


async def _pipeline_v2_run_stage2(
    *,
    request: PipelineV2Request,
    run_id: str,
    selected_model_name: str,
    include_debug: bool,
    json_parse_metrics: dict[str, Any],
    stage_trace: list[dict[str, Any]],
    normalized_title: str,
    normalized_content: str,
    normalized_language: str,
) -> dict[str, Any]:
    """Execute URL2Blog stage 2 classification."""
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "stage_2",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    with _json_parse_tracking_scope(json_parse_metrics, "stage2_classification"):
        stage2_response = await classify_article_type(
            Stage2ClassifyRequest(
                title=normalized_title,
                content=normalized_content,
                source_url=_safe_str(request.url or ""),
                language=normalized_language,
                model_name=selected_model_name,
                include_debug=include_debug,
            )
        )
    stage2_payload = json.loads(stage2_response.body.decode("utf-8"))
    write_stage_result(
        run_id,
        "stage_2",
        {"created_at": _now_iso(), "data": stage2_payload},
    )
    next_stage = "rewrite_quality"
    if (
        request.enable_editorial_augmentation
        and _use_editorial_blueprint()
        and _resolve_execution_profile(request.execution_profile) != "lean"
    ):
        next_stage = "editorial_blueprint"

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": next_stage,
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    trace = list(stage_trace)
    if include_debug:
        stage2_debug = _safe_dict(stage2_payload.get("debug"))
        stage2_trace = stage2_debug.get("trace")
        if isinstance(stage2_trace, list):
            for entry in stage2_trace:
                if isinstance(entry, dict):
                    trace.append(entry)

    return {
        "stage2_payload": stage2_payload,
        "trace": trace,
        "classification": _safe_dict(stage2_payload.get("classification")),
    }


def _pipeline_v2_append_stage_trace(
    *,
    stage_trace: list[dict[str, Any]],
    include_debug: bool,
    stage: str,
    model_name: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    input_payload: Any | None = None,
    prompt: str | None = None,
    raw_response: str | None = None,
    parsed: Any | None = None,
    output: Any | None = None,
    grounded_urls: list[str] | None = None,
    error: str | None = None,
) -> list[dict[str, Any]]:
    if not include_debug:
        return stage_trace

    entry: dict[str, Any] = {"stage": stage}
    if model_name is not None:
        entry["model_name"] = model_name
    if max_tokens is not None:
        entry["max_tokens"] = max_tokens
    if temperature is not None:
        entry["temperature"] = temperature
    if input_payload is not None:
        entry["input"] = input_payload
    if prompt is not None:
        entry["prompt"] = prompt
    if raw_response is not None:
        entry["raw_response"] = raw_response
    if parsed is not None:
        entry["parsed"] = parsed
    if output is not None:
        entry["output"] = output
    if grounded_urls is not None:
        entry["grounded_urls"] = grounded_urls
    if error:
        entry["error"] = error

    stage_trace.append(entry)
    return stage_trace


def _pipeline_v2_prepare_context(
    *,
    request: PipelineV2Request,
    run_id: str,
    selected_model_name: str,
    execution_profile: str,
    stage1_payload: dict[str, Any],
    stage2_payload: dict[str, Any],
    stage_trace: list[dict[str, Any]] | None,
    json_parse_metrics: dict[str, Any] | None,
) -> dict[str, Any]:
    url = _safe_str(request.url or "")

    include_debug = request.include_debug
    is_lean_profile = execution_profile == "lean"
    narrative_focus = _safe_str(request.narrative_focus)
    use_markdown_long_stages = _use_markdown_long_stages()
    use_editorial_blueprint = _use_editorial_blueprint()
    use_editorial_insert_only_post = _use_editorial_insert_only_post()
    use_editorial_post_recheck = _use_editorial_post_recheck()
    enable_web_enrichment = request.enable_web_enrichment and not is_lean_profile
    enable_editorial_augmentation = (
        request.enable_editorial_augmentation and not is_lean_profile
    )

    parse_metrics = (
        json_parse_metrics
        if isinstance(json_parse_metrics, dict)
        else {
            "total_parse_failures": 0,
            "recovered_calls": 0,
            "recovered_parse_failures": 0,
            "failures_by_stage": {},
        }
    )

    max_external_context_items = _safe_int(
        request.max_external_context_items,
        default=DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
        min_value=1,
        max_value=5,
    )
    max_length_expansion_passes = (
        1 if is_lean_profile else MAX_LENGTH_EXPANSION_PASSES
    )

    parsed_article = _safe_dict(stage1_payload.get("parsed"))
    if not parsed_article:
        raise HTTPException(
            status_code=500,
            detail=stage1_payload.get("parse_error")
            or "Stage 1 returned no parsed article content.",
        )

    translated_article = _safe_dict(stage1_payload.get("translated"))
    translation_skipped = _safe_bool(
        stage1_payload.get("translation_skipped"), default=False
    )
    was_translated = not translation_skipped and bool(translated_article)

    normalized_title = (
        _safe_str(translated_article.get("title"))
        if was_translated
        else _safe_str(parsed_article.get("title"))
    )
    normalized_content = (
        _safe_str(translated_article.get("content"))
        if was_translated
        else _safe_str(parsed_article.get("content"))
    )
    if not normalized_content:
        raise HTTPException(
            status_code=422, detail="No article content available after extraction."
        )

    source_word_count = len(_tokenize_similarity_words(normalized_content))
    min_expanded_word_target = _resolve_min_expanded_word_target(source_word_count)
    normalized_language = (
        "English"
        if was_translated
        else _normalize_language_name(
            _safe_str(parsed_article.get("language")) or "English"
        )
    )

    classification = _safe_dict(stage2_payload.get("classification"))
    article_type_id: int | None = None
    raw_type_id = classification.get("id")
    if isinstance(raw_type_id, int):
        article_type_id = raw_type_id
    elif isinstance(raw_type_id, str) and raw_type_id.strip().isdigit():
        article_type_id = int(raw_type_id.strip())

    guideline_payload = {
        "id": article_type_id or 0,
        "name": _safe_str(classification.get("name")),
        "guideline": "",
        "title_guideline": "",
    }

    if article_type_id is not None:
        article_type_row = get_article_type_by_id(article_type_id)
        if article_type_row:
            guideline_payload = {
                "id": article_type_row["id"],
                "name": article_type_row["name"],
                "guideline": article_type_row.get("guideline") or "",
                "title_guideline": article_type_row.get("title_guideline") or "",
            }

    return {
        "run_id": run_id,
        "url": url,
        "selected_model_name": selected_model_name,
        "execution_profile": execution_profile,
        "is_lean_profile": is_lean_profile,
        "include_debug": include_debug,
        "narrative_focus": narrative_focus,
        "use_markdown_long_stages": use_markdown_long_stages,
        "use_editorial_blueprint": use_editorial_blueprint,
        "use_editorial_insert_only_post": use_editorial_insert_only_post,
        "use_editorial_post_recheck": use_editorial_post_recheck,
        "enable_web_enrichment": enable_web_enrichment,
        "enable_editorial_augmentation": enable_editorial_augmentation,
        "json_parse_metrics": parse_metrics,
        "max_external_context_items": max_external_context_items,
        "max_length_expansion_passes": max_length_expansion_passes,
        "stage_trace": list(stage_trace or []),
        "stage1_payload": _safe_dict(stage1_payload),
        "stage2_payload": _safe_dict(stage2_payload),
        "parsed_article": parsed_article,
        "was_translated": was_translated,
        "normalized_title": normalized_title,
        "normalized_content": normalized_content,
        "normalized_language": normalized_language,
        "source_word_count": source_word_count,
        "min_expanded_word_target": min_expanded_word_target,
        "classification": classification,
        "guideline_payload": guideline_payload,
    }


async def _pipeline_v2_core(
    request: PipelineV2Request,
    *,
    run_id_override: str | None = None,
    stage1_payload_override: dict[str, Any] | None = None,
    stage2_payload_override: dict[str, Any] | None = None,
    stage_trace_override: list[dict[str, Any]] | None = None,
    json_parse_metrics_override: dict[str, Any] | None = None,
    selected_model_name_override: str | None = None,
    execution_profile_override: str | None = None,
) -> JSONResponse:
    """Core URL2Blog rewrite/finalization path (optionally with precomputed stage outputs)."""
    selected_model_name = selected_model_name_override or _resolve_url2blog_model(
        request.model_name
    )
    execution_profile = execution_profile_override or _resolve_execution_profile(
        request.execution_profile
    )

    json_parse_metrics: dict[str, Any] = (
        json_parse_metrics_override
        if isinstance(json_parse_metrics_override, dict)
        else {
            "total_parse_failures": 0,
            "recovered_calls": 0,
            "recovered_parse_failures": 0,
            "failures_by_stage": {},
        }
    )
    stage_trace: list[dict[str, Any]] = list(stage_trace_override or [])
    include_debug = request.include_debug

    run_id = run_id_override or str(uuid4())

    if stage1_payload_override is None:
        stage1_result = await _pipeline_v2_run_stage1(
            request=request,
            run_id=run_id,
            selected_model_name=selected_model_name,
            include_debug=include_debug,
            stage_trace=stage_trace,
        )
        stage1_payload = _safe_dict(stage1_result.get("stage1_payload"))
        stage_trace = list(stage1_result.get("trace") or [])
    else:
        stage1_payload = _safe_dict(stage1_payload_override)

    if stage2_payload_override is None:
        parsed_article = _safe_dict(stage1_payload.get("parsed"))
        translated_article = _safe_dict(stage1_payload.get("translated"))
        translation_skipped = _safe_bool(
            stage1_payload.get("translation_skipped"), default=False
        )
        was_translated = not translation_skipped and bool(translated_article)
        normalized_title = (
            _safe_str(translated_article.get("title"))
            if was_translated
            else _safe_str(parsed_article.get("title"))
        )
        normalized_content = (
            _safe_str(translated_article.get("content"))
            if was_translated
            else _safe_str(parsed_article.get("content"))
        )
        normalized_language = (
            "English"
            if was_translated
            else _normalize_language_name(
                _safe_str(parsed_article.get("language")) or "English"
            )
        )

        stage2_result = await _pipeline_v2_run_stage2(
            request=request,
            run_id=run_id,
            selected_model_name=selected_model_name,
            include_debug=include_debug,
            json_parse_metrics=json_parse_metrics,
            stage_trace=stage_trace,
            normalized_title=normalized_title,
            normalized_content=normalized_content,
            normalized_language=normalized_language,
        )
        stage2_payload = _safe_dict(stage2_result.get("stage2_payload"))
        stage_trace = list(stage2_result.get("trace") or [])
    else:
        stage2_payload = _safe_dict(stage2_payload_override)

    context = _pipeline_v2_prepare_context(
        request=request,
        run_id=run_id,
        selected_model_name=selected_model_name,
        execution_profile=execution_profile,
        stage1_payload=stage1_payload,
        stage2_payload=stage2_payload,
        stage_trace=stage_trace,
        json_parse_metrics=json_parse_metrics,
    )
    context = _pipeline_v2_run_rewrite_quality_phase(context)
    context = _pipeline_v2_run_fact_length_phase(context)
    context = _pipeline_v2_run_editorial_phase(context)
    context = _pipeline_v2_run_editorial_post_recheck_phase(context)

    return _pipeline_v2_finalize_response(context)


# ---------------------------------------------------------------------------
# pipeline v2 heavy phases live in pipeline_v2/phases.py. They are imported here
# (at the bottom, after the invoke/build helpers they depend on are defined) so
# the graph runner can keep calling url2blog_routes._pipeline_v2_run_* and so the
# circular dependency (phases import routes' Vertex wrappers) resolves cleanly.
from .pipeline_v2.phases import (  # noqa: E402,F401
    _pipeline_v2_run_rewrite_quality_phase,
    _pipeline_v2_run_fact_length_phase,
    _pipeline_v2_run_editorial_phase,
    _pipeline_v2_run_editorial_post_recheck_phase,
    _pipeline_v2_finalize_response,
)
