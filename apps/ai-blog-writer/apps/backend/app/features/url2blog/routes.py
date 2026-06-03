"""
URL2Blog API routes.

All routes are prefixed with /url2blog in the main router.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core import (
    cleanup_run,
    get_all_runs,
    get_article_type_by_id,
    read_output,
    read_stage_result,
    read_status,
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

# ---------------------------------------------------------------------------
# pipeline v2 orchestration/heavy phases live under pipeline_v2/. They are
# re-exported here so graph runner/tests keep calling url2blog_routes._pipeline_*
# and monkeypatches against this module continue to work.
from .pipeline_v2.orchestration import (  # noqa: E402,F401
    _now_iso,
    _pipeline_v2_append_stage_trace,
    _pipeline_v2_core,
    _pipeline_v2_prepare_context,
    _pipeline_v2_run_stage1,
    _pipeline_v2_run_stage2,
)
from .pipeline_v2.phases import (  # noqa: E402,F401
    _pipeline_v2_run_rewrite_quality_phase,
    _pipeline_v2_run_fact_length_phase,
    _pipeline_v2_run_editorial_phase,
    _pipeline_v2_run_editorial_post_recheck_phase,
    _pipeline_v2_finalize_response,
)
