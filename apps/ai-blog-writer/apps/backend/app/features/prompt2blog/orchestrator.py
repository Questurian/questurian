from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from .config import DEFAULT_MODEL, P2B_AUDIT_MODEL, P2B_COMPOSE_MODEL
from .dependencies import PipelineDependencies
from .graph.runner import GraphNode, run_prompt2blog_stage_graph
from .graph.state import Prompt2BlogGraphState
from .models import PipelineV2RuntimeRequest, Prompt2BlogInputRequest
from .quality import _extract_narrative_focus
from .stages.audit_repair import run_quality_audit_stage, run_repair_stage
from .stages.augmentation import run_augmentation_stage
from .stages.finalize import run_finalize_stage
from .stages.guideline_coverage import run_coverage_stage, run_guideline_stage
from .stages.preparation import prepare_full_pipeline_request
from .stages.supplement_compose import run_compose_stage, run_supplement_stage
from .stages.title import run_title_stage
from .support import _format_raw_sources, _safe_dict, _safe_str

logger = logging.getLogger(__name__)

StageFunction = Callable[
    [Prompt2BlogGraphState, PipelineDependencies],
    dict[str, Any],
]


def _initial_generation_state(
    run_id: str,
    request: PipelineV2RuntimeRequest,
    dependencies: PipelineDependencies,
    *,
    trace: list[dict[str, Any]] | None = None,
) -> Prompt2BlogGraphState:
    model_name = request.model_name or DEFAULT_MODEL
    raw_sources = [
        _safe_str(source) for source in request.raw_sources if _safe_str(source)
    ]
    writing_brief = _safe_dict(request.writing_brief)
    return {
        "run_id": run_id,
        "request": request,
        "model_name": model_name,
        "writing_model": dependencies.resolve_writer_model(
            request.writing_model,
            default=P2B_COMPOSE_MODEL,
        ),
        "audit_model": P2B_AUDIT_MODEL,
        "cleaned_data": _safe_str(request.cleaned_data),
        "raw_sources": raw_sources,
        "raw_sources_text": _format_raw_sources(raw_sources),
        "writing_brief": writing_brief,
        "option_context": _safe_dict(request.option_context),
        "narrative_focus": _extract_narrative_focus(writing_brief),
        "include_debug": request.include_debug,
        "enable_editorial_augmentation": request.enable_editorial_augmentation,
        "current_stage": "stage_guideline_fetch",
        "trace": trace if trace is not None else [],
    }


def _node(
    stage: StageFunction,
    dependencies: PipelineDependencies,
) -> GraphNode:
    def run(state: Prompt2BlogGraphState) -> dict[str, Any]:
        updates = stage(state, dependencies)
        updates["trace"] = state["trace"]
        return updates

    return run


def _generation_nodes(
    dependencies: PipelineDependencies,
) -> list[tuple[str, GraphNode]]:
    stages: list[tuple[str, StageFunction]] = [
        ("guideline", run_guideline_stage),
        ("coverage", run_coverage_stage),
        ("supplement", run_supplement_stage),
        ("compose", run_compose_stage),
        ("quality_audit", run_quality_audit_stage),
        ("repair", run_repair_stage),
        ("editorial_augmentation", run_augmentation_stage),
        ("title", run_title_stage),
        ("finalize", run_finalize_stage),
    ]
    return [(name, _node(stage, dependencies)) for name, stage in stages]


def run_pipeline_v2(
    run_id: str,
    request: PipelineV2RuntimeRequest,
    dependencies: PipelineDependencies | None = None,
) -> Prompt2BlogGraphState:
    dependencies = dependencies or PipelineDependencies()
    initial_state = _initial_generation_state(run_id, request, dependencies)
    try:
        return run_prompt2blog_stage_graph(
            run_id=run_id,
            trace_name="prompt2blog.pipeline_v2",
            initial_state=initial_state,
            nodes=_generation_nodes(dependencies),
            recorder=dependencies.recorder,
        )
    except Exception as exc:
        logger.exception("Prompt2Blog pipeline-v2 failed", extra={"run_id": run_id})
        dependencies.recorder.fail(
            run_id,
            dependencies.recorder.active_stage(run_id),
            exc,
            debug_data=(
                {"pipeline_trace": initial_state["trace"]}
                if request.include_debug
                else None
            ),
        )
        raise


def run_full_pipeline(
    run_id: str,
    request: Prompt2BlogInputRequest,
    dependencies: PipelineDependencies | None = None,
) -> Prompt2BlogGraphState:
    dependencies = dependencies or PipelineDependencies()
    trace: list[dict[str, Any]] = []

    def prepare_node(_state: Prompt2BlogGraphState) -> dict[str, Any]:
        runtime_request = prepare_full_pipeline_request(
            run_id,
            request,
            dependencies,
        )
        return _initial_generation_state(
            run_id,
            runtime_request,
            dependencies,
            trace=trace,
        )

    try:
        return run_prompt2blog_stage_graph(
            run_id=run_id,
            trace_name="prompt2blog.full_run",
            initial_state={"run_id": run_id, "input_request": request, "trace": []},
            nodes=[
                ("prepare", prepare_node),
                *_generation_nodes(dependencies),
            ],
            recorder=dependencies.recorder,
        )
    except Exception as exc:
        logger.exception("Prompt2Blog full run failed", extra={"run_id": run_id})
        dependencies.recorder.fail(
            run_id,
            dependencies.recorder.active_stage(run_id),
            exc,
            debug_data={"pipeline_trace": trace} if request.include_debug else None,
        )
        raise
