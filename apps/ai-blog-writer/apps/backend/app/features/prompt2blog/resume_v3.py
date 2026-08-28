"""Resuming a v3 run that failed part-way through.

A v3 run can spend a couple of hundred thousand tokens before it reaches the
title stage. When the last call of a long run failed -- an exhausted Claude
account, a provider blip -- everything the run had already produced was still
correct and still stored, and the only way forward was to start again from the
outline and buy all of it a second time.

So each completed node writes the whole graph state to the run's own
`resume_snapshot` stage row, and a resume restores that state and re-enters
the graph at the node the failure interrupted. Nothing is regenerated: the
outline, the draft, the grounding verdict, the audit scores, the repair count
and the best-draft record all come back exactly as they were written.

Why the stage row and not LangGraph's checkpoints
-------------------------------------------------
The graph already writes checkpoints, and they are already thrown away on the
way out of every run (see `app/ai_graph/runtime.py`). Reusing them would mean
keeping a shared, opaque, run-sized store that nobody can read, and it would
still be empty in the case that matters most -- a process that died hard, which
is when the cleanup never ran either. The stage row is this run's own durable
record, it survives a restart, and an operator can read it.

Correctness before saving money
-------------------------------
A resume that restored the wrong state would publish an article whose prose,
scores and evidence do not describe each other. Every check here fails closed:
an unreadable snapshot, a snapshot written by a different version of this code,
a snapshot whose commission is not the commission the run started with, or a
run that is not actually in a failed state, all refuse the resume and cost
nothing. Refusing means starting a fresh run, which is exactly what happens
today.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from app.core import read_stage_result, read_status

from .config import FEATURE_NAME, P2B_RESUME_MAX_ATTEMPTS
from .graph.state import Prompt2BlogV3GraphState
from .graph.topology_v3 import (
    V3_GENERATION_NODES,
    V3_NODE_STAGE_NAMES,
    next_v3_node,
)
from .intake_v3 import RUN_INPUT_STAGE
from .models import PipelineV3RuntimeRequest
from .observability import _now_iso
from .run_recorder import USAGE_LEDGER_STAGE
from .support import _safe_dict, _safe_int, _safe_str

logger = logging.getLogger(__name__)

RESUME_SNAPSHOT_STAGE = "resume_snapshot"

# The append-only record of every resume attempt, written by the orchestrator
# before a resumed leg starts. Named here because the allowance is counted off
# it and the two must not drift.
RESUME_HISTORY_STAGE = "pipeline_resume_v3"

# Bumped whenever the stored shape stops meaning what this code reads. An
# older snapshot is refused rather than reinterpreted: guessing at a state
# written by different code is how a resume publishes mismatched work.
RESUME_SNAPSHOT_VERSION = 2

# State entries rebuilt on the way back in rather than stored. `request` is a
# pydantic model and is written out under its own key; `completed` belongs to
# the leg that is running, not to the one that stopped.
_UNSNAPSHOTTED_STATE_KEYS = frozenset({"request", "completed"})


@dataclass(frozen=True)
class ResumePlan:
    """What resuming one run would do, decided without spending anything.

    Answers the operator's question before the money question: what is already
    written, what the next call would be, and what the failed leg cost. A plan
    that is not resumable says why in `reason`, which is the same string the
    resume endpoint refuses with.
    """

    run_id: str
    resumable: bool
    reason: str
    resume_from_stage: str | None = None
    failed_stage: str | None = None
    failure_kind: str | None = None
    completed_stages: tuple[str, ...] = ()
    tokens_already_spent: int | None = None
    resume_count: int = 0
    resume_attempts_allowed: int = P2B_RESUME_MAX_ATTEMPTS

    def as_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "resumable": self.resumable,
            "reason": self.reason,
            "resume_from_stage": self.resume_from_stage,
            "failed_stage": self.failed_stage,
            "failure_kind": self.failure_kind,
            "completed_stages": list(self.completed_stages),
            "tokens_already_spent": self.tokens_already_spent,
            "resume_count": self.resume_count,
            "resume_attempts_allowed": self.resume_attempts_allowed,
        }


def _stage_data(run_id: str, stage: str) -> dict[str, Any]:
    """The payload half of one stage row, or an empty dict."""
    row = read_stage_result(run_id, stage)
    return _safe_dict(_safe_dict(row).get("data"))


def snapshot_payload(
    state: Prompt2BlogV3GraphState,
    *,
    completed_node: str,
) -> dict[str, Any]:
    """The durable record of one finished node, ready to be stored.

    `next_node` is decided here rather than at resume time, using the same
    `route_quality_gate` the compiled graph would have used on this state. The
    branch a run would have taken is therefore a fact recorded at the moment it
    was true, not a re-derivation from a state that has since been reloaded.
    """
    request = state["request"]
    stored_state = {
        key: value
        for key, value in state.items()
        if key not in _UNSNAPSHOTTED_STATE_KEYS
    }
    return {
        "snapshot_version": RESUME_SNAPSHOT_VERSION,
        "run_id": state["run_id"],
        "schema_version": request.schema_version,
        "commission_fingerprint": _safe_str(
            _safe_dict(state.get("commission")).get("commission_fingerprint")
        ),
        "completed_node": completed_node,
        "completed_stage": V3_NODE_STAGE_NAMES[completed_node],
        "next_node": next_v3_node(completed_node, dict(state)),
        "resume_count": _safe_int(state.get("resume_count"), default=0),
        "created_at": _now_iso(),
        "request": request.model_dump(mode="json"),
        "state": stored_state,
    }


def write_resume_snapshot(
    recorder: Any,
    state: Prompt2BlogV3GraphState,
    *,
    completed_node: str,
) -> None:
    """Store the state after one node, or store nothing.

    Serialization is strict on purpose. `write_stage_result` stringifies
    anything it cannot encode, which would leave a snapshot that loads without
    complaint and restores a state made of `repr` strings. A snapshot that
    cannot be written exactly is not written at all: the run continues, and the
    worst case is the behaviour that existed before resume did.
    """
    try:
        payload = snapshot_payload(state, completed_node=completed_node)
        json.dumps(payload, allow_nan=False)
    except Exception as exc:  # noqa: BLE001 -- never break a healthy run
        logger.warning(
            "Prompt2Blog v3 resume snapshot skipped after %s: %s: %s",
            completed_node,
            type(exc).__name__,
            exc,
        )
        return
    try:
        recorder.record_stage(state["run_id"], RESUME_SNAPSHOT_STAGE, payload)
    except Exception as exc:  # noqa: BLE001 -- never break a healthy run
        logger.warning("Prompt2Blog v3 resume snapshot write failed: %s", exc)


def discard_resume_snapshot(recorder: Any, run_id: str) -> None:
    """Drop the snapshot once the run has an article instead.

    A finished run is not resumable, and its state is a whole graph state --
    draft, trace and all -- with no reader left. The status guard would refuse
    a resume anyway; this keeps the row from outliving its purpose.
    """
    discard = getattr(recorder, "discard_stage", None)
    if callable(discard):
        discard(run_id, RESUME_SNAPSHOT_STAGE)


def resume_attempts_used(run_id: str) -> int:
    """How many times this run has already been resumed.

    Counted from the append-only attempt history rather than from the
    snapshot, because a resume that dies before finishing a single node writes
    no new snapshot. Counting there would leave the allowance untouched by
    exactly the failure it exists to bound, and an operator could re-buy the
    same failing tail forever.
    """
    attempts = _stage_data(run_id, RESUME_HISTORY_STAGE).get("attempts")
    return len(attempts) if isinstance(attempts, list) else 0


def stored_ledger(run_id: str) -> dict[str, Any]:
    """The token ledger the earlier legs of this run wrote."""
    return _stage_data(run_id, USAGE_LEDGER_STAGE)


def tokens_already_spent(run_id: str) -> int | None:
    ledger = stored_ledger(run_id)
    totals = ledger.get("totals")
    if not isinstance(totals, dict):
        return None
    return _safe_int(totals.get("total_tokens"), default=0)


def completed_stages(run_id: str) -> tuple[str, ...]:
    """Which v3 stages already have a recorded payload for this run."""
    return tuple(
        V3_NODE_STAGE_NAMES[node]
        for node in V3_GENERATION_NODES
        if read_stage_result(run_id, V3_NODE_STAGE_NAMES[node])
    )


def _commission_agrees(run_id: str, snapshot: dict[str, Any]) -> bool:
    """Do every record of which commission this run is for say the same thing?

    Three witnesses, of which at least two always exist: the snapshot header,
    the request stored inside it, and the state's own commission. A run started
    through the API adds a fourth -- the `pipeline_input_v3` row, written
    before the first node and never rewritten. They are compared rather than
    trusted individually, because the failure this guards against is a state
    that belongs to a different article, and one corrupted half is enough to
    publish prose whose scores and evidence describe something else.
    """
    snapshot_state = _safe_dict(snapshot.get("state"))
    request_payload = _safe_dict(snapshot.get("request"))
    fingerprints = {
        _safe_str(snapshot.get("commission_fingerprint")),
        _safe_str(
            _safe_dict(snapshot_state.get("commission")).get("commission_fingerprint")
        ),
        _safe_str(
            _safe_dict(request_payload.get("commission")).get(
                "commission_fingerprint"
            )
        ),
        _safe_str(_stage_data(run_id, RUN_INPUT_STAGE).get("commission_fingerprint")),
    }
    # An absent witness is silence, not disagreement; a run recorded without a
    # fingerprint anywhere is caught by the empty set left behind.
    fingerprints.discard("")
    return len(fingerprints) == 1


def plan_resume(run_id: str) -> ResumePlan:
    """Decide whether one run may be resumed, and from where.

    Reads only. Every refusal is named, because "not resumable" with no reason
    leaves an operator guessing whether to wait, reconnect an account, or pay
    for a whole new run.
    """
    status = read_status(run_id)
    if not status:
        return ResumePlan(run_id=run_id, resumable=False, reason="run_not_found")
    if status.get("feature") != FEATURE_NAME:
        return ResumePlan(run_id=run_id, resumable=False, reason="not_prompt2blog")

    failed_stage = _safe_str(status.get("stage")) or None
    failure_kind = _safe_str(status.get("failure_kind")) or None
    done = completed_stages(run_id)
    spent = tokens_already_spent(run_id)
    snapshot = _stage_data(run_id, RESUME_SNAPSHOT_STAGE)
    resume_count = resume_attempts_used(run_id)

    def refuse(reason: str) -> ResumePlan:
        return ResumePlan(
            run_id=run_id,
            resumable=False,
            reason=reason,
            failed_stage=failed_stage,
            failure_kind=failure_kind,
            completed_stages=done,
            tokens_already_spent=spent,
            resume_count=resume_count,
        )

    if status.get("state") != "failed":
        return refuse("run_not_failed")
    if not snapshot:
        # Nothing finished before the failure, so there is nothing to protect.
        return refuse("no_snapshot")
    if snapshot.get("snapshot_version") != RESUME_SNAPSHOT_VERSION:
        return refuse("snapshot_version_unsupported")

    request_payload = _safe_dict(snapshot.get("request"))
    if _safe_int(request_payload.get("schema_version"), default=0) != 3:
        return refuse("schema_version_unsupported")

    if not _commission_agrees(run_id, snapshot):
        return refuse("commission_mismatch")

    next_node = snapshot.get("next_node")
    if next_node is None:
        # The last node the run completed was finalize. Whatever failed after
        # that did not owe the operator another writing call.
        return refuse("run_already_finished")
    if next_node not in V3_GENERATION_NODES:
        return refuse("snapshot_unreadable")
    if resume_count >= P2B_RESUME_MAX_ATTEMPTS:
        return refuse("resume_limit_reached")

    return ResumePlan(
        run_id=run_id,
        resumable=True,
        reason="resumable",
        resume_from_stage=V3_NODE_STAGE_NAMES[next_node],
        failed_stage=failed_stage,
        failure_kind=failure_kind,
        completed_stages=done,
        tokens_already_spent=spent,
        resume_count=resume_count,
    )


def restore_v3_state(
    run_id: str,
) -> tuple[Prompt2BlogV3GraphState, PipelineV3RuntimeRequest, str, int]:
    """Rebuild the state, the request, the entry node and the resume count.

    Call only behind a `plan_resume` that said yes; this raises rather than
    guessing, so a caller that skipped the checks fails loudly instead of
    running a half-restored article.
    """
    snapshot = _stage_data(run_id, RESUME_SNAPSHOT_STAGE)
    if not snapshot:
        raise ValueError(f"Run {run_id} has no resume snapshot")
    if snapshot.get("snapshot_version") != RESUME_SNAPSHOT_VERSION:
        raise ValueError(f"Run {run_id} snapshot version is not supported")

    entry_node = snapshot.get("next_node")
    if entry_node not in V3_GENERATION_NODES:
        raise ValueError(f"Run {run_id} snapshot names no runnable next stage")

    request = PipelineV3RuntimeRequest.model_validate(_safe_dict(snapshot["request"]))
    resume_count = resume_attempts_used(run_id) + 1

    state: Prompt2BlogV3GraphState = dict(  # type: ignore[assignment]
        _safe_dict(snapshot.get("state"))
    )
    state["run_id"] = run_id
    state["request"] = request
    state["resume_count"] = resume_count
    # The trace is the run's debug record, not its state. It is restored so a
    # resumed run's debug payload still shows the stages that ran before the
    # failure rather than starting from the middle of the article.
    state.setdefault("trace", [])
    return state, request, entry_node, resume_count


def resume_thread_id(run_id: str, resume_count: int) -> str:
    """A LangGraph thread id no earlier leg of this run has used."""
    return f"{run_id}#resume{resume_count}"
