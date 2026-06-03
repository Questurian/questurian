"""URL2Blog pipeline-v2 orchestration helpers.

Keeps FastAPI route module small while preserving `url2blog.routes` as public
facade for tests, graph runner, and monkeypatch hooks.
"""

import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.core import write_stage_result, write_status

from ..config import *  # noqa: F401,F403
from ..content.markdown import *  # noqa: F401,F403
from ..content.sanitizers import *  # noqa: F401,F403
from ..llm.coerce import *  # noqa: F401,F403
from ..llm.parsing import *  # noqa: F401,F403
from ..models import ExtractRequest, PipelineV2Request, Stage2ClassifyRequest
from .gating import *  # noqa: F401,F403


def _routes_module() -> Any:
    from app.features.url2blog import routes

    return routes


def _now_iso() -> str:
    """Return a UTC ISO timestamp for run/state writes."""
    return datetime.utcnow().isoformat()


async def _pipeline_v2_run_stage1(
    *,
    request: PipelineV2Request,
    run_id: str,
    selected_model_name: str,
    include_debug: bool,
    stage_trace: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Execute URL2Blog stage 1 extraction and normalization."""
    routes = _routes_module()
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
        stage1_payload = routes._cleanup_pasted_article_text(
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
                        "title": _safe_dict(stage1_payload.get("parsed")).get(
                            "title", ""
                        ),
                        "language": _safe_dict(stage1_payload.get("parsed")).get(
                            "language", ""
                        ),
                        "cleaned_chars": len(
                            _safe_dict(stage1_payload.get("parsed")).get("content", "")
                        ),
                        "removed_blocks_count": len(
                            stage1_payload.get("removed_blocks") or []
                        ),
                        "fallback_used": stage1_payload.get(
                            "text_cleanup_fallback", False
                        ),
                    },
                }
            )
    elif url.startswith(("http://", "https://")):
        stage1_response = await routes.extract_article(
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
    routes = _routes_module()
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
        stage2_response = await routes.classify_article_type(
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
    routes = _routes_module()
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
    max_length_expansion_passes = 1 if is_lean_profile else MAX_LENGTH_EXPANSION_PASSES

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
        article_type_row = routes.get_article_type_by_id(article_type_id)
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
    routes = _routes_module()
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
    context = routes._pipeline_v2_run_rewrite_quality_phase(context)
    context = routes._pipeline_v2_run_fact_length_phase(context)
    context = routes._pipeline_v2_run_editorial_phase(context)
    context = routes._pipeline_v2_run_editorial_post_recheck_phase(context)

    return routes._pipeline_v2_finalize_response(context)
