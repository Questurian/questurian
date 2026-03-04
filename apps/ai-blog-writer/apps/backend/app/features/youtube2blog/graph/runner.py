"""YouTube2Blog LangGraph runner."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, TypedDict

from shared import (
    PipelineArtifact,
    PipelineMeta,
    RawVideoRecord,
    Stage1Output,
    Stage2Output,
    Stage3Output,
    Stage4Output,
    StageResult,
)

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint,
    langgraph_trace,
    langsmith_trace_payload,
)
from app.core import read_stage_result, write_artifact, write_stage_result, write_status
from app.features.youtube2blog.stages import (
    stage_1_clean_transcript,
    stage_2_classify_article_type,
    stage_3_compose_article,
    stage_4_generate_title,
    stage_editorial_augmentation,
)
from app.features.youtube2blog.storage import read_article_type_names

logger = logging.getLogger(__name__)
FEATURE_NAME = "youtube2blog"


def _now() -> datetime:
    return datetime.utcnow()


def _stage_ref(run_id: str, stage: str) -> str:
    return f"data/runs/{run_id}/{stage}.json"


def _clean_title(title: str) -> str:
    cleaned = title.strip().strip("\"'")
    cleaned = cleaned.lstrip("#").strip()
    return cleaned


def _normalize_markdown_body(content: str) -> str:
    cleaned = content.strip()
    if not cleaned:
        return ""
    return re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()


def _build_final_markdown(title: str, content: str) -> str:
    body = _normalize_markdown_body(content)
    cleaned_title = _clean_title(title)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{body}".strip()
    return body


class YouTube2BlogGraphState(TypedDict, total=False):
    run_id: str
    stage1: dict[str, Any]
    stage2: dict[str, Any]
    stage3: dict[str, Any]
    stage_editorial: dict[str, Any]
    stage3_for_title: dict[str, Any]
    stage4: dict[str, Any]
    stage_results: dict[str, dict[str, Any]]
    markdown: str


def run_youtube2blog_graph(
    record: RawVideoRecord,
    meta: PipelineMeta,
) -> str:
    """Run YouTube2Blog as a multi-node LangGraph workflow."""
    from langgraph.graph import END, START, StateGraph

    run_id = meta.run_id
    current_stage = "stage_1"

    def _write_running_status(stage: str) -> None:
        nonlocal current_stage
        current_stage = stage
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": stage,
                "state": "running",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

    def stage_1_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_1")
        stage1 = stage_1_clean_transcript(record)
        result1 = StageResult(
            run_id=run_id,
            stage="stage_1",
            created_at=_now(),
            input_refs={"stage_0": _stage_ref(run_id, "stage_0")},
            data=stage1.model_dump(),
        )
        write_stage_result(run_id, "stage_1", result1.model_dump())
        stage_results = dict(state.get("stage_results") or {})
        stage_results["stage_1"] = result1.model_dump(mode="json")
        return {
            "stage1": stage1.model_dump(),
            "stage_results": stage_results,
        }

    def stage_2_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_2")
        stage1 = Stage1Output.model_validate(state["stage1"])
        allowed_types = read_article_type_names()
        stage2 = stage_2_classify_article_type(stage1, allowed_types)
        result2 = StageResult(
            run_id=run_id,
            stage="stage_2",
            created_at=_now(),
            input_refs={"stage_1": _stage_ref(run_id, "stage_1")},
            data=stage2.model_dump(),
        )
        write_stage_result(run_id, "stage_2", result2.model_dump())
        stage_results = dict(state.get("stage_results") or {})
        stage_results["stage_2"] = result2.model_dump(mode="json")
        return {
            "stage2": stage2.model_dump(),
            "stage_results": stage_results,
        }

    def stage_3_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3")
        stage1 = Stage1Output.model_validate(state["stage1"])
        stage2 = Stage2Output.model_validate(state["stage2"])
        stage3 = stage_3_compose_article(stage1, stage2)
        result3 = StageResult(
            run_id=run_id,
            stage="stage_3",
            created_at=_now(),
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_2": _stage_ref(run_id, "stage_2"),
            },
            data=stage3.model_dump(),
        )
        write_stage_result(run_id, "stage_3", result3.model_dump())
        stage_results = dict(state.get("stage_results") or {})
        stage_results["stage_3"] = result3.model_dump(mode="json")
        return {
            "stage3": stage3.model_dump(),
            "stage_results": stage_results,
        }

    def stage_editorial_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_editorial_augmentation")
        stage3 = Stage3Output.model_validate(state["stage3"])
        stage_editorial = stage_editorial_augmentation(stage3)
        result_editorial = StageResult(
            run_id=run_id,
            stage="stage_editorial_augmentation",
            created_at=_now(),
            input_refs={"stage_3": _stage_ref(run_id, "stage_3")},
            data=stage_editorial.model_dump(),
        )
        write_stage_result(
            run_id,
            "stage_editorial_augmentation",
            result_editorial.model_dump(),
        )
        stage_results = dict(state.get("stage_results") or {})
        stage_results["stage_editorial_augmentation"] = result_editorial.model_dump(
            mode="json"
        )

        stage3_for_title = stage3.model_copy(
            update={"final_article": stage_editorial.augmented_content}
        )
        return {
            "stage_editorial": stage_editorial.model_dump(),
            "stage3_for_title": stage3_for_title.model_dump(),
            "stage_results": stage_results,
        }

    def stage_4_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_4")
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])
        stage4 = stage_4_generate_title(stage3_for_title)
        result4 = StageResult(
            run_id=run_id,
            stage="stage_4",
            created_at=_now(),
            input_refs={
                "stage_3": _stage_ref(run_id, "stage_3"),
                "stage_editorial_augmentation": _stage_ref(
                    run_id,
                    "stage_editorial_augmentation",
                ),
            },
            data=stage4.model_dump(),
        )
        write_stage_result(run_id, "stage_4", result4.model_dump())
        stage_results = dict(state.get("stage_results") or {})
        stage_results["stage_4"] = result4.model_dump(mode="json")
        return {
            "stage4": stage4.model_dump(),
            "stage_results": stage_results,
        }

    def finalize_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        stage4 = Stage4Output.model_validate(state["stage4"])
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])

        markdown = _build_final_markdown(stage4.title, stage3_for_title.final_article)
        stage_results_payload = dict(state.get("stage_results") or {})
        stage0_result = read_stage_result(run_id, "stage_0")
        if stage0_result:
            stage_results_payload["stage_0"] = stage0_result

        stage_results = {
            key: StageResult.model_validate(value)
            for key, value in stage_results_payload.items()
        }
        artifact = PipelineArtifact(
            run_id=run_id,
            meta=meta,
            stages=stage_results,
            markdown_path=f"db:outputs:{run_id}",
        )
        artifact_dict = artifact.model_dump()
        artifact_dict["markdown"] = markdown
        write_artifact(run_id, artifact_dict)

        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "complete",
                "state": "completed",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )
        return {"markdown": markdown}

    builder = StateGraph(YouTube2BlogGraphState)
    builder.add_node("stage_1", stage_1_node)
    builder.add_node("stage_2", stage_2_node)
    builder.add_node("stage_3", stage_3_node)
    builder.add_node("stage_editorial_augmentation", stage_editorial_node)
    builder.add_node("stage_4", stage_4_node)
    builder.add_node("finalize", finalize_node)

    builder.add_edge(START, "stage_1")
    builder.add_edge("stage_1", "stage_2")
    builder.add_edge("stage_2", "stage_3")
    builder.add_edge("stage_3", "stage_editorial_augmentation")
    builder.add_edge("stage_editorial_augmentation", "stage_4")
    builder.add_edge("stage_4", "finalize")
    builder.add_edge("finalize", END)

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
            write_stage_result(
                run_id,
                "langgraph_trace",
                {
                    "created_at": _now().isoformat(),
                    "data": trace_payload,
                },
            )

        return str(final_state.get("markdown", "")).strip()
    except Exception:
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": current_stage,
                "state": "failed",
                "updated_at": _now().isoformat(),
                "error": "LangGraph execution failed.",
            },
            feature=FEATURE_NAME,
        )
        logger.exception("LangGraph YouTube2Blog pipeline failed")
        raise
