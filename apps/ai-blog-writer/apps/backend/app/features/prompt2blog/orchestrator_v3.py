"""Prompt2Blog v3 run entrypoint.

Thin by design: commission, evidence, and stage contexts are assembled before
a run starts, so the orchestrator only has to build the
initial state and execute the v3 graph.

Two entrypoints, one graph. `run_pipeline_v3` starts at the outline with a
fresh state; `resume_pipeline_v3` restores the state a failed run had already
paid for and enters the same graph at the node the failure interrupted. See
`resume_v3.py` for why the state comes from the run's own stage row.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from functools import partial
from typing import Any

from .config import (
    DEFAULT_MODEL,
    P2B_AUDIT_MODEL,
    P2B_COMPOSE_MODEL,
    P2B_V3_GROUNDEDNESS_MODEL,
    P2B_V3_OUTLINE_MODEL,
    P2B_V3_TITLE_MODEL,
    PROMPT2BLOG_CREATIVITY_TEMPERATURES,
    PROMPT2BLOG_DEFAULT_COMPOSE_TEMPERATURE,
)
from .dependencies import DefaultPrompt2BlogLLM, PipelineDependencies
from .graph.runner import GraphNode, run_prompt2blog_stage_graph
from .graph.state import Prompt2BlogV3GraphState
from .graph.topology_v3 import (
    V3_GENERATION_NODES,
    V3_NODE_STAGE_NAMES,
    build_prompt2blog_v3_graph,
)
from .models import PipelineV3RuntimeRequest
from .pricing import Prompt2BlogTokenUsageTracker
from .resume_v3 import (
    RESUME_HISTORY_STAGE,
    ResumePlan,
    discard_resume_snapshot,
    plan_resume,
    restore_v3_state,
    resume_thread_id,
    stored_ledger,
    write_resume_snapshot,
)
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

V3_TRACE_NAME = "prompt2blog.pipeline_v3"

# Every node except the last writes a resume snapshot. Finalize is excluded
# because a snapshot taken after it could never be used: the run has its
# article by then, and the row is deleted on the way out anyway.
SNAPSHOTTED_V3_NODES = frozenset(
    node for node in V3_GENERATION_NODES if node != "finalize"
)


class Prompt2BlogResumeRefused(RuntimeError):
    """A resume that was refused before anything was spent.

    Carries the plan so the caller can report which check failed rather than
    just that one did.
    """

    def __init__(self, plan: ResumePlan) -> None:
        super().__init__(f"Run {plan.run_id} cannot be resumed: {plan.reason}")
        self.plan = plan


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
        "stage_contexts": _safe_dict(instructions.get("stage_contexts")),
        "option_context": _safe_dict(request.option_context),
        "model_name": request.model_name or DEFAULT_MODEL,
        "outline_model": dependencies.resolve_writer_model(P2B_V3_OUTLINE_MODEL),
        "writing_model": dependencies.resolve_writer_model(
            request.writing_model,
            default=P2B_COMPOSE_MODEL,
        ),
        "audit_model": dependencies.resolve_writer_model(
            request.audit_model,
            default=P2B_AUDIT_MODEL,
        ),
        "groundedness_model": dependencies.resolve_writer_model(
            P2B_V3_GROUNDEDNESS_MODEL
        ),
        "title_model": dependencies.resolve_writer_model(P2B_V3_TITLE_MODEL),
        "model_stack_id": request.model_stack_id,
        "compose_temperature": PROMPT2BLOG_CREATIVITY_TEMPERATURES.get(
            creativity_level,
            PROMPT2BLOG_DEFAULT_COMPOSE_TEMPERATURE,
        ),
        "include_debug": request.include_debug,
        "enable_editorial_augmentation": request.enable_editorial_augmentation,
        "current_stage": "stage_v3_outline",
        "resume_count": 0,
        "repair_attempts": 0,
        "repair_applied": False,
        "outline_accepted": False,
        "outline_text": "",
        "trace": [],
    }


def _node(
    name: str,
    stage: V3StageFunction,
    dependencies: PipelineDependencies,
) -> GraphNode:
    def run(state: Prompt2BlogV3GraphState) -> dict[str, Any]:
        updates = stage(state, dependencies)
        updates["trace"] = state["trace"]
        # After the stage has recorded its own payload, so a snapshot never
        # claims work the run cannot show. This is the single point where the
        # run's resumable state is written; adding a stage to the graph gets
        # it for free.
        if name in SNAPSHOTTED_V3_NODES:
            write_resume_snapshot(
                dependencies.recorder,
                {**state, **updates},
                completed_node=name,
            )
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
    return [(name, _node(name, stage, dependencies)) for name, stage in stages]


def _execute_v3_graph(
    *,
    run_id: str,
    request: PipelineV3RuntimeRequest,
    dependencies: PipelineDependencies,
    initial_state: Prompt2BlogV3GraphState,
    entry_node: str,
    thread_id: str | None,
) -> Prompt2BlogV3GraphState:
    """Run the v3 graph from one entry point, recording whatever happens.

    The failure path is why both entrypoints share this: a resumed leg has to
    record its failure the same way a first attempt does, or the next resume
    would read a stale `pipeline_failure` row.
    """
    try:
        result = run_prompt2blog_stage_graph(
            run_id=run_id,
            trace_name=V3_TRACE_NAME,
            initial_state=initial_state,
            nodes=_v3_nodes(dependencies),
            recorder=dependencies.recorder,
            build_graph=partial(
                build_prompt2blog_v3_graph, entry_node=entry_node
            ),
            thread_id=thread_id,
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
    # The run has its article, so the state it could have been resumed from has
    # no reader left.
    discard_resume_snapshot(dependencies.recorder, run_id)
    return result


def run_pipeline_v3(
    run_id: str,
    request: PipelineV3RuntimeRequest,
    dependencies: PipelineDependencies | None = None,
) -> Prompt2BlogV3GraphState:
    dependencies = dependencies or PipelineDependencies()
    return _execute_v3_graph(
        run_id=run_id,
        request=request,
        dependencies=dependencies,
        initial_state=_initial_v3_state(run_id, request, dependencies),
        entry_node="outline",
        thread_id=None,
    )


def _resume_dependencies(run_id: str) -> PipelineDependencies:
    """Dependencies whose token tracker continues this run's ledger.

    A resumed leg with a fresh tracker would report the tail as the whole cost
    of the article and would hand the repair gate a budget the run had already
    spent. The ledger the earlier legs wrote is the run's accounting, so the
    resumed leg starts from it.
    """
    tracker = Prompt2BlogTokenUsageTracker.from_ledger(stored_ledger(run_id))
    return PipelineDependencies(llm=DefaultPrompt2BlogLLM(usage_tracker=tracker))


def _record_resume_attempt(
    dependencies: PipelineDependencies,
    plan: ResumePlan,
    *,
    resume_count: int,
    entry_node: str,
) -> None:
    """Append this attempt to the run's resume history.

    Appended rather than overwritten: the stage row is keyed `(run_id, stage)`,
    so a second resume writing its own row would erase the evidence that a
    first one happened.
    """
    from app.core import read_stage_result

    previous = read_stage_result(plan.run_id, RESUME_HISTORY_STAGE) or {}
    attempts = previous.get("data", {}).get("attempts")
    attempts = list(attempts) if isinstance(attempts, list) else []
    attempts.append(
        {
            "resume_count": resume_count,
            "resumed_from_stage": V3_NODE_STAGE_NAMES[entry_node],
            "failed_stage": plan.failed_stage,
            "failure_kind": plan.failure_kind,
            "completed_stages": list(plan.completed_stages),
            "tokens_already_spent": plan.tokens_already_spent,
        }
    )
    dependencies.recorder.record_stage(
        plan.run_id, RESUME_HISTORY_STAGE, {"attempts": attempts}
    )


def resume_pipeline_v3(
    run_id: str,
    dependencies: PipelineDependencies | None = None,
) -> Prompt2BlogV3GraphState:
    """Continue a failed run from the last stage it completed.

    Refuses before spending anything if the run is not in a state a resume can
    be trusted from; see `plan_resume`. Nothing already written is regenerated,
    and the run keeps its `run_id`, so the article, the stage rows, the ledger
    and any link an operator already has all stay pointed at one run.
    """
    plan = plan_resume(run_id)
    if not plan.resumable:
        raise Prompt2BlogResumeRefused(plan)

    state, request, entry_node, resume_count = restore_v3_state(run_id)
    dependencies = dependencies or _resume_dependencies(run_id)

    dependencies.recorder.queue(run_id)
    _record_resume_attempt(
        dependencies,
        plan,
        resume_count=resume_count,
        entry_node=entry_node,
    )
    logger.info(
        "Prompt2Blog v3 run %s resuming at %s (attempt %s)",
        run_id,
        entry_node,
        resume_count,
    )
    return _execute_v3_graph(
        run_id=run_id,
        request=request,
        dependencies=dependencies,
        initial_state=state,
        entry_node=entry_node,
        thread_id=resume_thread_id(run_id, resume_count),
    )
