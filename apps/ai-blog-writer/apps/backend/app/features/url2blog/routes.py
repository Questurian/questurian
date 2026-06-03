"""
URL2Blog API routes.

All routes are prefixed with /url2blog in the main router.
"""

import json
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core import (
    cleanup_run,
    get_all_runs,
    read_output,
    read_stage_result,
    read_status,
    get_article_type_by_id,
    get_article_type_by_name,
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
from .content.text_cleanup import _cleanup_pasted_article_text, _strip_html
from .stages import classify_article_type, extract_article

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

    return JSONResponse(response_payload)


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


from .llm import invocation as _llm_invocation


def _invoke_google_grounded_json(
    *args: Any, **kwargs: Any
) -> tuple[dict[str, Any], str, list[str]]:
    return _llm_invocation._invoke_google_grounded_json(*args, **kwargs)


def _build_excerpt(*args: Any, **kwargs: Any) -> str:
    return _llm_invocation._build_excerpt(*args, **kwargs)


def _build_markdown(*args: Any, **kwargs: Any) -> str:
    return _llm_invocation._build_markdown(*args, **kwargs)


def _sanitize_generated_title(*args: Any, **kwargs: Any) -> str:
    return _llm_invocation._sanitize_generated_title(*args, **kwargs)


def _invoke_markdown_long_output(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return _llm_invocation._invoke_markdown_long_output(*args, **kwargs)


def _invoke_title_generation(*args: Any, **kwargs: Any) -> tuple[str, str]:
    return _llm_invocation._invoke_title_generation(*args, **kwargs)


def _build_v2_rewrite_from_markdown(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return _llm_invocation._build_v2_rewrite_from_markdown(*args, **kwargs)


def _invoke_json_llm_tracked(*args: Any, **kwargs: Any) -> tuple[dict[str, Any], str]:
    return _llm_invocation._invoke_json_llm_tracked(*args, **kwargs)


def _invoke_json_llm(*args: Any, **kwargs: Any) -> tuple[dict[str, Any], str]:
    return _llm_invocation._invoke_json_llm(*args, **kwargs)


def _invoke_json_llm_best_effort(
    *args: Any, **kwargs: Any
) -> tuple[dict[str, Any] | None, str, str | None]:
    return _llm_invocation._invoke_json_llm_best_effort(*args, **kwargs)


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
