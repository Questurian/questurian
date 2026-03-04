"""URL2Blog LangGraph runner."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Awaitable, Callable, TypedDict
from uuid import uuid4

from fastapi.responses import JSONResponse

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint_async,
    langgraph_trace,
    langsmith_trace_payload,
)
from app.core import write_stage_result

logger = logging.getLogger(__name__)


class Url2BlogGraphState(TypedDict, total=False):
    thread_id: str
    completed: bool


def _attach_trace_payload(
    response: JSONResponse,
    trace_payload: dict[str, str],
) -> tuple[JSONResponse, str | None]:
    if not trace_payload:
        return response, None

    try:
        decoded = response.body.decode("utf-8")
        payload = json.loads(decoded)
    except Exception:  # noqa: BLE001
        return response, None

    if not isinstance(payload, dict):
        return response, None

    payload.update({k: v for k, v in trace_payload.items() if v})
    run_id_value = payload.get("run_id")
    run_id = run_id_value if isinstance(run_id_value, str) and run_id_value else None

    return (
        JSONResponse(
            payload,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
            background=response.background,
        ),
        run_id,
    )


async def run_url2blog_pipeline_graph(
    *,
    pipeline_runner: Callable[[], Awaitable[JSONResponse]],
) -> JSONResponse:
    from langgraph.graph import END, START, StateGraph

    thread_id = str(uuid4())
    response_holder: dict[str, JSONResponse | None] = {"response": None}

    async def pipeline_node(_state: Url2BlogGraphState) -> Url2BlogGraphState:
        response_holder["response"] = await pipeline_runner()
        return {"completed": True}

    builder = StateGraph(Url2BlogGraphState)
    builder.add_node("pipeline_v2", pipeline_node)
    builder.add_edge(START, "pipeline_v2")
    builder.add_edge("pipeline_v2", END)

    trace_payload: dict[str, str] = {}
    try:
        with langgraph_trace(
            trace_name="url2blog.pipeline_v2",
            feature="url2blog",
            thread_id=thread_id,
            tags=["pipeline_v2"],
            metadata={"entrypoint": "url2blog/pipeline-v2"},
            inputs={"thread_id": thread_id},
        ) as (trace_run, trace_metadata):
            async with langgraph_checkpoint_async() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                await graph.ainvoke(
                    {"thread_id": thread_id, "completed": False},
                    config={
                        "configurable": {"thread_id": thread_id},
                        "tags": ["langgraph", "url2blog", "pipeline_v2"],
                        "metadata": {"feature": "url2blog", "thread_id": thread_id},
                        "run_name": "url2blog_pipeline_v2_graph",
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
    except Exception:
        logger.exception("URL2Blog LangGraph pipeline failed")
        raise

    response = response_holder.get("response")
    if response is None:
        logger.error("URL2Blog LangGraph finished without a response")
        raise RuntimeError("URL2Blog LangGraph returned no response")

    response_with_trace, app_run_id = _attach_trace_payload(response, trace_payload)
    if app_run_id and trace_payload:
        write_stage_result(
            app_run_id,
            "langgraph_trace",
            {
                "created_at": datetime.utcnow().isoformat(),
                "data": trace_payload,
            },
        )

    return response_with_trace
