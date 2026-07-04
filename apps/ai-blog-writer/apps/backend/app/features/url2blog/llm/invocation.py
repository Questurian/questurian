"""URL2Blog LLM invocation and output-shaping helpers."""

import logging
import re
from typing import Any

from fastapi import HTTPException
from app.shared.text import enforce_anti_ai_tells_markdown

from ..config import *  # noqa: F401,F403
from ..llm.coerce import *  # noqa: F401,F403
from ..llm.parsing import (
    _json_parse_tracking_scope,
    _record_json_parse_failure,
    _record_json_parse_recovery,
)
from ..content.markdown import *  # noqa: F401,F403
from ..content.sanitizers import *  # noqa: F401,F403

logger = logging.getLogger(__name__)


from .. import routes  # noqa: E402


def _invoke_google_grounded_json(
    prompt: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.05,
    model_name: str | None = None,
) -> tuple[dict[str, Any], str, list[str]]:
    """Invoke Gemini with Google Search grounding and parse JSON output."""
    grounded_model_name = _resolve_grounded_model(model_name)
    grounded = routes.invoke_google_grounded_text(
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
    parsed, parse_error = routes._extract_json_from_response(raw_response)
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
        llm = routes.get_vertex_llm(
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
                normalized = enforce_anti_ai_tells_markdown(
                    normalized,
                    repair=lambda repair_prompt: _safe_str(invoke(repair_prompt)),
                    context=f"url2blog {stage_name}",
                )
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

    if legacy_json_prompt and legacy_json_stage_name and legacy_content_key:
        logger.warning(
            "URL2Blog markdown long-output failed for %s; falling back to JSON path. error=%s",
            stage_name,
            last_error or "empty response",
        )
        parsed, raw_response = routes._invoke_json_llm_tracked(
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
        fallback_value = enforce_anti_ai_tells_markdown(
            fallback_value,
            repair=lambda repair_prompt: _safe_str(
                routes.get_vertex_llm(
                    temperature=0.1,
                    max_tokens=effective_max_tokens,
                    model_name=model_name,
                ).invoke(repair_prompt)
            ),
            context=f"url2blog {stage_name} json fallback",
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
        llm = routes.get_vertex_llm(
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
            return routes._invoke_json_llm(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                model_name=model_name,
                allow_truncated_repair=True,
            )
        return routes._invoke_json_llm(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            model_name=model_name,
        )


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
            llm = routes.get_vertex_llm(
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
            parsed, parse_error = routes._extract_json_from_response(
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

            log_message = "URL2Blog JSON parse failed (%s attempt %d): %s | preview=%s"
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
