"""YouTube2Blog LangGraph execution with explicit node modules."""

from __future__ import annotations

import logging

from shared import PipelineMeta, RawVideoRecord

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint,
    langgraph_trace,
    langsmith_trace_payload,
)
from app.shared.tone_profiles import build_tone_guidance, resolve_tone_profile

from ..dependencies import YouTube2BlogDependencies
from .context import YouTube2BlogNodeContext
from .nodes.classification import build_classification_nodes
from .nodes.composition import build_composition_nodes
from .nodes.editorial import build_editorial_nodes
from .nodes.finalize import build_finalize_nodes
from .nodes.seo import build_seo_nodes
from .nodes.title import build_title_nodes
from .nodes.transcript import build_transcript_nodes
from .state import GraphNode
from .topology import build_youtube2blog_graph

logger = logging.getLogger(__name__)


def _build_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    nodes: dict[str, GraphNode] = {}
    for node_family in (
        build_transcript_nodes,
        build_classification_nodes,
        build_composition_nodes,
        build_seo_nodes,
        build_editorial_nodes,
        build_title_nodes,
        build_finalize_nodes,
    ):
        nodes.update(node_family(context))
    return nodes


def run_youtube2blog_graph(
    record: RawVideoRecord,
    meta: PipelineMeta,
    model_name: str | None = None,
    forced_article_type: str | None = None,
    tone_id: str | None = None,
    writing_model: str | None = None,
    dependencies: YouTube2BlogDependencies | None = None,
) -> str:
    """Compile and run the gated YouTube2Blog stage graph."""
    from app.features.youtube2blog.config import (
        Y2B_COMPOSE_MODEL as default_writing_model,
        Y2B_PRIMARY_MODEL as default_model,
    )

    dependencies = dependencies or YouTube2BlogDependencies()
    tone_profile = resolve_tone_profile(tone_id)
    context = YouTube2BlogNodeContext(
        record=record,
        meta=meta,
        active_model=model_name or default_model,
        writing_model=writing_model or default_writing_model,
        tone_guidance=build_tone_guidance(str(tone_profile.get("id") or "")),
        dependencies=dependencies,
    )
    builder = build_youtube2blog_graph(_build_nodes(context))
    run_id = meta.run_id
    trace_payload: dict[str, str] = {}

    try:
        with langgraph_trace(
            trace_name="youtube2blog.pipeline",
            feature="youtube2blog",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline"],
            metadata={"entrypoint": "youtube2blog/process"},
            inputs={"run_id": run_id, "video_id": record.video_id},
        ) as (trace_run, trace_metadata):
            with langgraph_checkpoint() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                final_state = graph.invoke(
                    {
                        "run_id": run_id,
                        "forced_article_type": forced_article_type or None,
                        "stage1_retry_count": 0,
                        "stage2_retry_count": 0,
                        "stage3_quality_retry_count": 0,
                        "stage_seo_retry_count": 0,
                        "stage5_retry_count": 0,
                        "stage_results": {},
                    },
                    config={
                        "configurable": {"thread_id": run_id},
                        "tags": ["langgraph", "youtube2blog"],
                        "metadata": {"feature": "youtube2blog", "run_id": run_id},
                        "run_name": "youtube2blog_pipeline_graph",
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )

        if trace_payload:
            dependencies.recorder.record_trace(run_id, trace_payload)
        return str(final_state.get("markdown", "")).strip()
    except Exception as exc:
        dependencies.recorder.fail(run_id, exc)
        logger.exception("LangGraph YouTube2Blog pipeline failed")
        raise
