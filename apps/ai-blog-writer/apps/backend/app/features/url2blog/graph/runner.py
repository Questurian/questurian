"""URL2Blog LangGraph execution, checkpointing, and tracing."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from uuid import uuid4

from fastapi.responses import JSONResponse

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint_async,
    langgraph_trace,
    langsmith_trace_payload,
)

from ..config import _resolve_execution_profile, _resolve_url2blog_model
from ..dependencies import PipelineDependencies
from .nodes import Url2BlogNodeContext, build_url2blog_nodes
from .topology import build_url2blog_graph

logger = logging.getLogger(__name__)
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def _attach_trace_payload(
    response: JSONResponse,
    trace_payload: dict[str, str],
) -> tuple[JSONResponse, str | None]:
    if not trace_payload:
        return response, None
    try:
        payload = json.loads(response.body.decode("utf-8"))
    except Exception:  # noqa: BLE001
        return response, None
    if not isinstance(payload, dict):
        return response, None

    payload.update({key: value for key, value in trace_payload.items() if value})
    run_id_value = payload.get("run_id")
    run_id = run_id_value if isinstance(run_id_value, str) and run_id_value else None
    safe_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "transfer-encoding"}
    }
    return (
        JSONResponse(
            payload,
            status_code=response.status_code,
            headers=safe_headers,
            media_type=response.media_type,
            background=response.background,
        ),
        run_id,
    )


def _resolve_run_id(request: Any) -> str:
    requested_run_id = getattr(request, "run_id", None)
    if not isinstance(requested_run_id, str) or not requested_run_id.strip():
        return str(uuid4())
    candidate = requested_run_id.strip()
    if RUN_ID_PATTERN.match(candidate):
        return candidate
    logger.warning(
        "URL2Blog pipeline received invalid run_id override; using generated run_id",
        extra={"requested_run_id": requested_run_id},
    )
    return str(uuid4())


async def run_url2blog_pipeline_graph(
    *,
    request: Any,
    dependencies: PipelineDependencies | None = None,
    owner_staff_id: str | None = None,
) -> JSONResponse:
    dependencies = dependencies or PipelineDependencies()
    run_id = _resolve_run_id(request)
    selected_model_name = _resolve_url2blog_model(getattr(request, "model_name", None))
    execution_profile = _resolve_execution_profile(
        getattr(request, "execution_profile", None)
    )
    include_debug = bool(getattr(request, "include_debug", False))
    json_parse_metrics: dict[str, Any] = {
        "total_parse_failures": 0,
        "recovered_calls": 0,
        "recovered_parse_failures": 0,
        "failures_by_stage": {},
    }
    if owner_staff_id is None:
        dependencies.recorder.mark_running(run_id, "queued")
    else:
        dependencies.recorder.mark_running(
            run_id,
            "queued",
            owner_staff_id=owner_staff_id,
        )

    response_holder: dict[str, JSONResponse | None] = {"response": None}
    node_context = Url2BlogNodeContext(
        request=request,
        dependencies=dependencies,
        response_holder=response_holder,
    )
    builder = build_url2blog_graph(build_url2blog_nodes(node_context))
    trace_payload: dict[str, str] = {}

    try:
        with langgraph_trace(
            trace_name="url2blog.pipeline_v2",
            feature="url2blog",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline_v2"],
            metadata={"entrypoint": "url2blog/pipeline-v2"},
            inputs={"run_id": run_id},
        ) as (trace_run, trace_metadata):
            async with langgraph_checkpoint_async() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                await graph.ainvoke(
                    {
                        "run_id": run_id,
                        "selected_model_name": selected_model_name,
                        "execution_profile": execution_profile,
                        "include_debug": include_debug,
                        "rewrite_quality_retry_count": 0,
                        "fact_retry_count": 0,
                        "stage_trace": [],
                        "json_parse_metrics": json_parse_metrics,
                        "completed": False,
                    },
                    config={
                        "configurable": {"thread_id": run_id},
                        "tags": ["langgraph", "url2blog", "pipeline_v2"],
                        "metadata": {"feature": "url2blog", "run_id": run_id},
                        "run_name": "url2blog_pipeline_v2_graph",
                        "recursion_limit": 64,
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
    except Exception as exc:
        dependencies.recorder.mark_failed(run_id, exc)
        logger.exception("URL2Blog LangGraph pipeline failed")
        raise

    response = response_holder.get("response")
    if response is None:
        raise RuntimeError("URL2Blog LangGraph returned no response")
    response_with_trace, app_run_id = _attach_trace_payload(response, trace_payload)
    if app_run_id and trace_payload:
        dependencies.recorder.record_stage(app_run_id, "langgraph_trace", trace_payload)
    return response_with_trace
