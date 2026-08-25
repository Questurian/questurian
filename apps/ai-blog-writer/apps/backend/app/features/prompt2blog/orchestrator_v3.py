"""Prompt2Blog v3 run entrypoint.

Thin by design: the commission, the evidence, and the instruction stack are all
assembled before a run starts, so the orchestrator only has to build the
initial state and execute the v3 graph.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from .config import (
    DEFAULT_MODEL,
    P2B_AUDIT_MODEL,
    P2B_COMPOSE_MODEL,
    PROMPT2BLOG_CREATIVITY_TEMPERATURES,
    PROMPT2BLOG_DEFAULT_COMPOSE_TEMPERATURE,
)
from .dependencies import PipelineDependencies
from .graph.runner import GraphNode, run_prompt2blog_stage_graph
from .graph.state import Prompt2BlogV3GraphState
from .graph.topology_v3 import build_prompt2blog_v3_graph
from .models import PipelineV3RuntimeRequest
from .stages.v3.audit_repair import (
    run_v3_quality_audit_stage,
    run_v3_quality_settle_stage,
    run_v3_repair_stage,
)
from .stages.v3.compose import run_v3_compose_stage
from .stages.v3.finalize import run_v3_finalize_stage
from .stages.v3.groundedness import run_v3_groundedness_stage
from .stages.v3.outline import run_v3_outline_stage
from .stages.v3.title import run_v3_title_stage
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

V3StageFunction = Callable[
    [Prompt2BlogV3GraphState, PipelineDependencies],
    dict[str, Any],
]


def _initial_v3_state(
    run_id: str,
    request: PipelineV3RuntimeRequest,
    dependencies: PipelineDependencies,
) -> Prompt2BlogV3GraphState:
    instructions = _safe_dict(request.instructions)
    creativity_level = _safe_str(
        _safe_dict(request.option_context).get("creativity_level")
    ).lower()
    return {
        "run_id": run_id,
        "request": request,
        "commission": request.commission,
        "evidence": request.evidence,
        "instructions": instructions,
        "instruction_text": _safe_str(instructions.get("instruction_text")),
        "headline_instructions": _safe_str(instructions.get("headline_instructions")),
        "option_context": _safe_dict(request.option_context),
        "model_name": request.model_name or DEFAULT_MODEL,
        "writing_model": dependencies.resolve_writer_model(
            request.writing_model,
            default=P2B_COMPOSE_MODEL,
        ),
        "audit_model": dependencies.resolve_writer_model(
            request.audit_model,
            default=P2B_AUDIT_MODEL,
        ),
        "model_stack_id": request.model_stack_id,
        "compose_temperature": PROMPT2BLOG_CREATIVITY_TEMPERATURES.get(
            creativity_level,
            PROMPT2BLOG_DEFAULT_COMPOSE_TEMPERATURE,
        ),
        "include_debug": request.include_debug,
        "enable_editorial_augmentation": request.enable_editorial_augmentation,
        "current_stage": "stage_v3_outline",
        "repair_attempts": 0,
        "repair_applied": False,
        "outline_accepted": False,
        "outline_text": "",
        "trace": [],
    }


def _node(
    stage: V3StageFunction,
    dependencies: PipelineDependencies,
) -> GraphNode:
    def run(state: Prompt2BlogV3GraphState) -> dict[str, Any]:
        updates = stage(state, dependencies)
        updates["trace"] = state["trace"]
        return updates

    return run


def _v3_nodes(
    dependencies: PipelineDependencies,
) -> list[tuple[str, GraphNode]]:
    stages: list[tuple[str, V3StageFunction]] = [
        ("outline", run_v3_outline_stage),
        ("compose", run_v3_compose_stage),
        ("groundedness", run_v3_groundedness_stage),
        ("quality_audit", run_v3_quality_audit_stage),
        ("repair", run_v3_repair_stage),
        ("quality_settle", run_v3_quality_settle_stage),
        ("title", run_v3_title_stage),
        ("finalize", run_v3_finalize_stage),
    ]
    return [(name, _node(stage, dependencies)) for name, stage in stages]


def run_pipeline_v3(
    run_id: str,
    request: PipelineV3RuntimeRequest,
    dependencies: PipelineDependencies | None = None,
) -> Prompt2BlogV3GraphState:
    dependencies = dependencies or PipelineDependencies()
    initial_state = _initial_v3_state(run_id, request, dependencies)
    try:
        return run_prompt2blog_stage_graph(
            run_id=run_id,
            trace_name="prompt2blog.pipeline_v3",
            initial_state=initial_state,
            nodes=_v3_nodes(dependencies),
            recorder=dependencies.recorder,
            build_graph=build_prompt2blog_v3_graph,
        )
    except Exception as exc:
        logger.exception("Prompt2Blog pipeline-v3 failed", extra={"run_id": run_id})
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
