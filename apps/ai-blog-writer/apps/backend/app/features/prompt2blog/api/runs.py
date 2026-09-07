"""
Handlers here are `def`, never `async def`. FastAPI runs an `async def` handler
on the event loop and a `def` handler in a threadpool, and everything below
blocks: SQLite reads, model calls, pipeline preparation. Declaring them async
handed the loop to one request and froze the whole server while it ran, which
is what made a research pass look like an outage.
"""

import logging
from contextlib import nullcontext
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from fastapi.responses import HTMLResponse, JSONResponse

from app.core import (
    get_all_runs,
    read_all_stage_results,
    read_output,
    read_stage_result,
    read_status,
)
from app.core.staff_auth import require_staff, staff_user_id
from app.features.claude_connection.cli_writer import (
    prompt2blog_credential_scope,
    quota_breaker_scope,
)
from app.features.claude_connection.prompt2blog_credential import (
    Prompt2BlogCredential,
    Prompt2BlogCredentialError,
    load_credential,
)
from app.shared.writer_models import resolve_writer_model
from utils.llm_model_policy import (
    CLAUDE_PROVIDER_SUBSCRIPTION_CLI,
    claude_provider,
)

from ..article_edits import (
    ArticleMissing,
    EditRefused,
    RevisionConflict,
    commit_article_edit,
    read_article,
)
from ..config import FEATURE_NAME
from ..edit_review import SUPPORTED, binding_failure, review_section_edit
from ..pricing import Prompt2BlogTokenUsageTracker
from ..run_recorder import USAGE_LEDGER_STAGE
from ..editor_spend import (
    EditorAttempt,
    attempt_from_tracker,
    read_editor_spend,
    record_editor_attempt,
)
from ..contracts_v4 import Prompt2BlogV4Request
from ..drafts_view import build_drafts_report, render_drafts_page
from ..intake_v3 import (
    prepare_v3_runtime_request,
    v3_intake_result,
    v3_run_input_artifact,
)
from ..observability import _now_iso, _read_langgraph_trace
from ..models import PipelineV4RuntimeRequest
from ..options import default_target_word_count
from ..orchestrator_v3 import resume_pipeline_v3, run_pipeline_v3
from ..provenance import (
    Confirmation,
    ConfirmationRecord,
    PacketNotStored,
    PROVENANCE_STAGE,
    build_provenance,
    frozen_packet,
    prune_confirmations,
    segment_passages,
    stored_confirmations,
)
from ..resume_v3 import plan_resume
from ..edit_patterns import (
    EDIT_PATTERN_RUN,
    EDIT_PATTERN_STAGE,
    PatternDecision,
    outstanding,
    review,
)
from ..section_edit_v4 import (
    EDIT_ACTIONS,
    SECTION_EDIT_STAGE,
    EditHistory,
    EditProposal,
    apply_proposal,
    propose_section_edit,
    undo_last,
)
from ..run_recorder import RunRecorder
from ..dependencies import DefaultPrompt2BlogLLM, PipelineDependencies
from ..selection_v4 import selection_from_flags
from ..support import _clean_string_list, _safe_dict, _safe_str

router = APIRouter()


logger = logging.getLogger(__name__)

# One sentence per refusal, written for the operator rather than the log. Every
# key is a `ResumePlan.reason`; a reason with no entry falls back to the generic
# line, which is why the table can never make a refusal disappear.
RESUME_REFUSAL_MESSAGES = {
    "run_not_failed": (
        "This run has not failed, so there is nothing to resume."
    ),
    "no_snapshot": (
        "This run failed before it finished a single stage, so there is no "
        "saved work to continue from. Start a new run."
    ),
    "snapshot_version_unsupported": (
        "This run's saved state was written by an older version of the "
        "pipeline and cannot be trusted. Start a new run."
    ),
    "schema_version_unsupported": (
        "Only v3 runs can be resumed."
    ),
    "commission_mismatch": (
        "The saved state does not match the commission this run started "
        "with, so resuming it could publish mismatched work. Start a new run."
    ),
    "snapshot_unreadable": (
        "This run's saved state does not name a stage to continue from. "
        "Start a new run."
    ),
    "run_already_finished": (
        "This run had already finished its article; there is nothing left to "
        "resume."
    ),
    "resume_limit_reached": (
        "This run has already been resumed the maximum number of times. "
        "Whatever is failing is not something resuming can fix."
    ),
}


def _run_pipeline_v3_background(
    run_id: str,
    request: PipelineV4RuntimeRequest,
    credential: Prompt2BlogCredential | None,
) -> None:
    """Keep background-task failures contained after the graph records them."""
    try:
        scope = (
            prompt2blog_credential_scope(credential.token)
            if credential is not None
            else nullcontext()
        )
        with quota_breaker_scope(), scope:
            run_pipeline_v3(run_id, request)
    except Exception:  # noqa: BLE001
        return


def _resume_pipeline_v3_background(
    run_id: str,
    credential: Prompt2BlogCredential | None,
) -> None:
    """Keep background-task failures contained after the graph records them."""
    try:
        scope = (
            prompt2blog_credential_scope(credential.token)
            if credential is not None
            else nullcontext()
        )
        with quota_breaker_scope(), scope:
            resume_pipeline_v3(run_id)
    except Exception:  # noqa: BLE001
        return


def _prompt2blog_credential_for_run() -> Prompt2BlogCredential | None:
    if claude_provider() != CLAUDE_PROVIDER_SUBSCRIPTION_CLI:
        return None
    try:
        return load_credential()
    except Prompt2BlogCredentialError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/pipeline-v3")
def start_pipeline_v3(
    request: Prompt2BlogV4Request,
    background_tasks: BackgroundTasks,
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Start a v3 run, or stop at the research gate without starting one.

    `needs_research` is returned synchronously and queues nothing: a commission
    whose evidence cannot support it has no run to make.
    """
    # This route receives a whole request and no run, so there is no operator
    # selection to read. Keeping every fact is a legitimate answer to that and
    # a terrible default, so it is stated rather than assumed: the run's record
    # says a person did not choose here, and the intake path -- which is what
    # the interface uses -- carries a real one.
    selection = selection_from_flags(
        request.brief,
        request.work_order,
        request.evidence_package,
        target_word_count=default_target_word_count(),
        note=(
            "Submitted directly to /pipeline-v3, which carries no editorial "
            "record. The claims this request marked as selected were kept."
        ),
    )
    try:
        readiness_result = v3_intake_result(request, selection)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if readiness_result["status"] != "ready":
        return JSONResponse(
            {
                "message": "Prompt2Blog v3 commission needs more research",
                **readiness_result,
            }
        )

    if request.enable_editorial_augmentation:
        raise HTTPException(
            status_code=400,
            detail=("Editorial augmentation is not available on the v3 pipeline yet."),
        )

    credential = _prompt2blog_credential_for_run()
    try:
        runtime = prepare_v3_runtime_request(request, selection)
    except (RuntimeError, ValueError) as exc:
        # `PacketRefused` is a ValueError and its message is written for a
        # person. Without this it left the route as a traceback.
        raise HTTPException(status_code=400, detail=str(exc))
    run_id = str(uuid4())
    recorder = RunRecorder()
    recorder.queue(run_id, staff_user_id(staff_user))
    input_artifact = v3_run_input_artifact(runtime)
    input_artifact["claude_account_label"] = (
        credential.label if credential else None
    )
    recorder.record_stage(run_id, "pipeline_input_v3", input_artifact)
    background_tasks.add_task(
        _run_pipeline_v3_background,
        run_id,
        runtime,
        credential,
    )
    return JSONResponse(
        {
            "message": "Prompt2Blog pipeline v3 queued",
            "status": "queued",
            "run_id": run_id,
        }
    )


@router.get("/resume/{run_id}", dependencies=[Depends(require_staff)])
def preview_resume(run_id: str) -> JSONResponse:
    """Report whether a failed run can be picked up, and from where.

    Read-only and free. An operator deciding whether to reconnect an account,
    resume, or start over needs to see what the failed run already produced
    and what it already cost before spending anything on the answer.
    """
    plan = plan_resume(run_id)
    if plan.reason == "run_not_found":
        raise HTTPException(status_code=404, detail="Run not found.")
    if plan.reason == "not_prompt2blog":
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(plan.as_dict())


@router.post("/resume/{run_id}")
def resume_run(
    run_id: str,
    background_tasks: BackgroundTasks,
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Continue a failed v3 run from the last stage it finished.

    The run keeps its `run_id`, so the status the client is already polling,
    the stage rows, the token ledger and the finished article all stay on one
    run. A refusal costs nothing and names the check that failed.
    """
    plan = plan_resume(run_id)
    if plan.reason in {"run_not_found", "not_prompt2blog"}:
        raise HTTPException(status_code=404, detail="Run not found.")
    if not plan.resumable:
        raise HTTPException(
            status_code=409,
            detail=RESUME_REFUSAL_MESSAGES.get(
                plan.reason, "This run cannot be resumed."
            ),
        )

    credential = _prompt2blog_credential_for_run()
    background_tasks.add_task(_resume_pipeline_v3_background, run_id, credential)
    return JSONResponse(
        {
            "message": "Prompt2Blog pipeline v3 resumed",
            "status": "queued",
            **plan.as_dict(),
        }
    )


@router.get("/status/{run_id}")
def get_status(run_id: str) -> JSONResponse:
    """Get status for a Prompt2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/result/{run_id}")
def get_result(run_id: str) -> JSONResponse:
    """Get final result for a completed Prompt2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    trace_payload = _read_langgraph_trace(run_id)
    artifact = output["artifact"]
    if trace_payload and isinstance(artifact, dict):
        # A run records exactly one of these keys, named for the pipeline
        # version that produced it.
        pipeline_payload = artifact.get("pipeline_v3")
        if isinstance(pipeline_payload, dict):
            pipeline_payload.update(trace_payload)

    response_payload: dict[str, Any] = {
        "run_id": run_id,
        "markdown": output["markdown"],
        "artifact": artifact,
    }
    response_payload.update(trace_payload)
    return JSONResponse(response_payload)


@router.get("/provenance/{run_id}", dependencies=[Depends(require_staff)])
def get_provenance(run_id: str) -> JSONResponse:
    """Where each passage of the finished article came from.

    Internal, and staff-only for the same reason it is internal: it is the
    working material behind the prose, and the article itself carries no
    attribution on purpose.

    Derived on every request rather than stored, so it can never describe prose
    that has since changed.
    """
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(
            status_code=404, detail="This run has not produced an article yet."
        )

    try:
        packet = frozen_packet(run_id)
    except PacketNotStored as exc:
        # 409 rather than 404: the run exists and the article exists, and what
        # is missing is a record older runs never kept. A 404 would read as
        # "no such run" and send somebody looking for the wrong problem.
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    markdown = output["markdown"]
    # Confirmations against passages that have since been edited are dropped
    # here rather than shown as stale. A confirmation beside changed prose is
    # worse than none: it is the one thing on the screen that says a person
    # checked.
    live = prune_confirmations(stored_confirmations(run_id), markdown)
    report = build_provenance(
        run_id, markdown, packet, live.model_dump(mode="json")
    )
    return JSONResponse(report.model_dump(mode="json"))


@router.post("/provenance/{run_id}/confirm", dependencies=[Depends(require_staff)])
def confirm_provenance(
    run_id: str,
    confirmation: Confirmation,
    staff_id: str = Depends(staff_user_id),
) -> JSONResponse:
    """Record that a person read this passage against this material and agreed.

    The only thing that can make a link anything other than provisional. An
    automatic match says two pieces of text share a figure; whether the
    sentence means what the fact means is a judgement, and this is where a
    person makes it.
    """
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(
            status_code=404, detail="This run has not produced an article yet."
        )

    markdown = output["markdown"]
    existing = prune_confirmations(stored_confirmations(run_id), markdown)
    if confirmation.passage_hash not in {
        passage.text_hash for passage in segment_passages(markdown)
    }:
        raise HTTPException(
            status_code=409,
            detail=(
                "That passage is not in the current article. It has been "
                "edited since you read it, so re-read it before confirming."
            ),
        )

    recorded = Confirmation(
        passage_hash=confirmation.passage_hash,
        source_kind=confirmation.source_kind,
        source_id=confirmation.source_id,
        reviewer=staff_id or confirmation.reviewer,
        confirmed_at=_now_iso(),
        note=confirmation.note,
    )
    kept = [
        item
        for item in existing.confirmations
        if (item.passage_hash, item.source_kind, item.source_id)
        != (recorded.passage_hash, recorded.source_kind, recorded.source_id)
    ]
    updated = ConfirmationRecord(confirmations=[*kept, recorded])
    RunRecorder().record_stage(
        run_id, PROVENANCE_STAGE, updated.model_dump(mode="json")
    )
    return JSONResponse(updated.model_dump(mode="json"))


class SectionEditRequest(BaseModel):
    """Which section, and which of the offered improvements."""

    section_id: str = Field(min_length=1)
    action_id: str = Field(min_length=1)


class ApplyEditRequest(BaseModel):
    """An accepted proposal, and optionally why the editor wanted it.

    The reason is optional and nothing is inferred from its absence. It is the
    difference between "this one was wrong" and "we always want this", and only
    a person knows which they meant.
    """

    proposal: EditProposal
    reason: str = ""
    # A person saying "I have read what the checker said and I want this
    # anyway". Required for anything the checker did not pass, including an
    # edit it never managed to read, and recorded on the edit itself.
    #
    # Not a way around the check. The findings are shown first, the decision is
    # a separate press, and the history afterwards says which claims were
    # accepted over.
    accept_findings: bool = False


class UndoEditRequest(BaseModel):
    """Which version of the article the undo was pressed against.

    Undo is a write like any other. Pressed on a screen showing revision 10
    while a colleague saved revision 11, an unguarded undo restores the
    markdown from before *this tab's* last edit -- erasing their work as a
    side effect of taking back one's own.
    """

    base_revision: int = -1


class PatternDecisionRequest(BaseModel):
    pattern_id: str = Field(min_length=1)
    # `adopted` means a person changed the voice file. `declined` means they
    # read it and disagreed.
    verdict: Literal["adopted", "declined"]
    note: str = ""


def _finished_run(run_id: str) -> dict[str, Any]:
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    output = read_output(run_id)
    if not output:
        raise HTTPException(
            status_code=404, detail="This run has not produced an article yet."
        )
    return output


# What each refusal means to the person who pressed the button. Keyed on the
# reason the apply returned, so a refusal nobody wrote a sentence for still
# falls through to the staleness message rather than to a blank one.
_APPLY_REFUSALS = {
    "this proposal says it could not make the change and changes the text as "
    "well": (
        "This proposal says it could not make the change, and offers changed "
        "text anyway. That is not an edit anyone asked for. Ask again, or ask "
        "for something the evidence supports."
    ),
    "this proposal does not change the section": (
        "This proposal leaves the section exactly as it is, so there is "
        "nothing to apply."
    ),
}


# Article markdown is written in exactly one place now: `commit_article_edit`,
# which holds the write lock, checks the revision, and writes the article and
# its history together. The two helpers that used to live here -- one reading
# the history on its own, one saving the article on its own -- were the two
# halves of the lost update, and a route that reaches for either of them again
# has left the transaction.


@router.get("/section-edit/actions", dependencies=[Depends(require_staff)])
def section_edit_actions() -> JSONResponse:
    """The improvements an editor may ask for.

    A closed list rather than a free-text box. "Make this better" is a request
    only a model with an opinion can satisfy, and the opinion it reaches for is
    the house style of the internet; each of these names a specific defect.
    """
    return JSONResponse(
        {
            "actions": [
                {"action_id": action.action_id, "label": action.label}
                for action in EDIT_ACTIONS
            ]
        }
    )


@router.post("/section-edit/{run_id}", dependencies=[Depends(require_staff)])
def propose_edit(run_id: str, request: SectionEditRequest) -> JSONResponse:
    """Ask for one change to one section. Nothing is written.

    This is the one route here that spends money -- one model call per request
    -- and it spends it on a section rather than an article.

    Every attempt is recorded, whatever it produced. Five proposals an editor
    read and threw away cost exactly as much as five they kept, and this route
    used to leave no trace of any of them on the article's receipt.
    """
    output = _finished_run(run_id)
    try:
        packet = frozen_packet(run_id)
    except PacketNotStored as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    artifact = _safe_dict(output["artifact"]).get("pipeline_v3") or {}
    attempt_id = uuid4().hex
    # Deliberately not `dependencies_for_run`, which restores the run's whole
    # ledger. The tracker here should hold this one call and nothing else, so
    # what is written afterwards cannot be an earlier leg's rows appearing
    # again under a new id.
    dependencies = PipelineDependencies(
        llm=DefaultPrompt2BlogLLM(
            usage_tracker=Prompt2BlogTokenUsageTracker(run_id=run_id),
            run_id=run_id,
        )
    )
    tracker = dependencies.llm.usage_tracker
    try:
        proposal = propose_section_edit(
            run_id=run_id,
            content=output["markdown"],
            # Stamped on the proposal so the apply can refuse a write against
            # a document that has moved, not just against a section that has.
            base_revision=int(output.get("article_revision") or 0),
            section_id=request.section_id,
            action_id=request.action_id,
            brief=_safe_dict(_safe_dict(artifact).get("brief")),
            packet=packet,
            dependencies=dependencies,
            # The plan, for the section purposes the memory reads off it. A run
            # whose outline was rejected has none, and the memory then rests on
            # the excerpts alone rather than refusing.
            outline=_safe_dict(
                _safe_dict(read_stage_result(run_id, "stage_v3_outline")).get("data")
            ).get("outline"),
        )
    except ValueError as exc:
        # A bad section or action id, caught before the call. Nothing was
        # spent, so nothing is recorded.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 -- recorded, then re-raised
        # A call that failed after the provider had already charged for it is
        # the case worth being careful about. Whatever the tracker got hold of
        # is written; a tracker holding nothing is recorded as unmeasured
        # rather than as zero.
        record_editor_attempt(
            run_id,
            attempt_from_tracker(
                tracker,
                attempt_id=attempt_id,
                kind="propose",
                section_id=request.section_id,
                action_id=request.action_id,
                outcome="failed",
                error=str(exc),
            ),
        )
        raise

    record_editor_attempt(
        run_id,
        attempt_from_tracker(
            tracker,
            attempt_id=attempt_id,
            kind="propose",
            section_id=request.section_id,
            action_id=request.action_id,
            outcome="refused" if proposal.could_not_do else "proposed",
        ),
    )

    if proposal.changed:
        # A second call, and it is worth saying why rather than letting it look
        # like an oversight. The cheap check compares sets of figures, so
        # swapping two prices the packet already holds is invisible to it: every
        # number is present and both claims are false. Nothing short of reading
        # what the sentence asserts catches that.
        #
        # Only on a proposal that changed something. A refusal and a no-op have
        # no new prose to judge, and paying to be told that unchanged text is
        # still grounded is paying for nothing.
        review_attempt_id = uuid4().hex
        review_tracker = Prompt2BlogTokenUsageTracker(run_id=run_id)
        review_llm = DefaultPrompt2BlogLLM(
            usage_tracker=review_tracker, run_id=run_id
        )
        try:
            proposal = proposal.model_copy(
                update={
                    "review": review_section_edit(
                        llm=review_llm,
                        run_id=run_id,
                        section_id=request.section_id,
                        content=output["markdown"],
                        original=proposal.original,
                        candidate=proposal.revised,
                        packet=packet,
                        base_revision=proposal.base_revision,
                    )
                }
            )
            review_outcome = proposal.review.status
        except Exception as exc:  # noqa: BLE001 -- degrades, never blocks
            # A checker outage does not cost an editor the proposal they have
            # already paid for. It comes back unreviewed, which the apply
            # treats as a decision for a person rather than as a pass.
            logger.warning("Prompt2Blog edit review failed: %s", exc)
            review_outcome = "failed"
        record_editor_attempt(
            run_id,
            attempt_from_tracker(
                review_tracker,
                attempt_id=review_attempt_id,
                kind="review",
                section_id=request.section_id,
                action_id=request.action_id,
                outcome=review_outcome,
            ),
        )

    return JSONResponse(proposal.model_dump(mode="json"))


@router.get("/section-edit/{run_id}/spend", dependencies=[Depends(require_staff)])
def read_edit_spend(run_id: str) -> JSONResponse:
    """What has been spent on this article since the pipeline finished.

    Beside the pipeline's own total rather than merged into it. "What the
    article cost to make" and "what has been spent on it since" are different
    questions, and the combined figure is computed here from the two durable
    records instead of being stored as a third one that can disagree with
    both.
    """
    _finished_run(run_id)
    spend = read_editor_spend(run_id)
    ledger = _safe_dict(
        _safe_dict(read_stage_result(run_id, USAGE_LEDGER_STAGE)).get("data")
    )
    pipeline_cost = _safe_dict(ledger.get("totals")).get("estimated_cost_usd")
    editor_totals = spend.totals()
    return JSONResponse(
        {
            "run_id": run_id,
            "pipeline": ledger.get("totals") or {},
            "editor": editor_totals,
            "attempts": [item.model_dump(mode="json") for item in spend.attempts],
            # Only when both halves are numbers. A combined total that quietly
            # treats an unknown as zero is worse than no combined total.
            "combined_cost_usd": (
                round(float(pipeline_cost) + editor_totals["estimated_cost_usd"], 6)
                if isinstance(pipeline_cost, (int, float))
                else None
            ),
        }
    )


@router.post("/section-edit/{run_id}/apply", dependencies=[Depends(require_staff)])
def apply_edit(
    run_id: str,
    request: ApplyEditRequest,
    staff_id: str = Depends(staff_user_id),
) -> JSONResponse:
    """Write an accepted proposal into the draft, in one transaction.

    Everything that decides whether this edit may land happens inside that
    transaction, against the markdown and history as they actually are: the
    document revision, the section hash, the refusal invariant, and the write
    of both the article and its history. The route used to read, check, write
    the article and then write the history -- four steps with no lock, so two
    tabs editing different sections of the same draft each passed their own
    section's hash and the second write discarded the first edit.
    """
    proposal = request.proposal
    if proposal.run_id and proposal.run_id != run_id:
        # A proposal names the run it was written for. Applying it to another
        # one would land prose written against a different article's evidence
        # on whatever section happens to share its id.
        raise HTTPException(
            status_code=400,
            detail="This proposal was written for a different run.",
        )
    output = _finished_run(run_id)
    artifact = _safe_dict(_safe_dict(output["artifact"]).get("pipeline_v3"))
    form_id = _safe_str(_safe_dict(artifact.get("brief")).get("form_id"))

    # Whether the review attached to this proposal is a review *of this
    # proposal*. It was generated on the server, travelled to a browser as
    # JSON, and came back in a request body -- so the object being trusted is
    # one the client had every opportunity to rewrite, and a verdict that says
    # a candidate is grounded says it about the candidate it read.
    try:
        packet = frozen_packet(run_id)
    except PacketNotStored:
        # An older run with no stored packet cannot have its edits reviewed at
        # all. That is a decision for a person, which is what an unverified
        # review already becomes below.
        packet = {}
    unverified = binding_failure(
        proposal.review,
        run_id=run_id,
        section_id=proposal.section_id,
        candidate=proposal.revised,
        packet=packet,
    )
    review_status = (
        proposal.review.status
        if proposal.review is not None and not unverified
        else "unchecked"
    )
    findings = (
        [
            claim["claim"]
            for claim in proposal.review.unsupported_claims
            if claim.get("claim")
        ]
        if proposal.review is not None and not unverified
        else []
    )
    # Only for an edit that could actually land. A refusal and a no-op are
    # rejected below on their own terms, and reporting one of those as "the
    # checker did not pass it" would explain the wrong thing.
    reviewable = proposal.changed and not proposal.could_not_do
    if reviewable and review_status != SUPPORTED and not request.accept_findings:
        # Advisory, not a gate on the article: the existing draft is untouched
        # and still saveable. What is refused is landing prose a checker did
        # not pass without a person saying they read that and want it anyway.
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "The checker did not pass this edit. Read the findings, "
                    "then apply again with `accept_findings` if you want it "
                    "anyway."
                ),
                "review_status": review_status,
                "binding_failure": unverified,
                "unsupported_claims": (
                    proposal.review.unsupported_claims
                    if proposal.review is not None and not unverified
                    else []
                ),
                "assessment": (
                    proposal.review.assessment
                    if proposal.review is not None and not unverified
                    else ""
                ),
            },
        )

    def edit(markdown: str, history: EditHistory) -> tuple[str, EditHistory]:
        result = apply_proposal(
            content=markdown,
            proposal=proposal,
            history=history,
            editor=staff_id or "",
            now=_now_iso(),
            reason=request.reason,
            # So a correction that only ever happens on one kind of piece
            # cannot later be read as a rule about all of them (improvement
            # 05).
            form_id=form_id,
            review_status=review_status,
            # Only when a person actually overrode something. An empty list on
            # a passed edit and an empty list on an accepted one would be the
            # same row.
            accepted_despite=findings if review_status != SUPPORTED else [],
        )
        if not result.applied:
            # The reason, not a guess at it. Staleness was the only refusal
            # this route knew about, so a proposal refused for saying it could
            # not make the change was reported as a draft that had moved --
            # which sends an editor to re-read a section nothing has touched.
            reason = result.rejected[0]["reason"] if result.rejected else ""
            raise EditRefused(
                _APPLY_REFUSALS.get(reason)
                or (
                    "That section has changed since this edit was proposed. "
                    "Read it again and ask for the change from where it is now."
                )
            )
        return result.markdown, result.history

    try:
        committed = commit_article_edit(
            run_id=run_id,
            expected_revision=(
                proposal.base_revision if proposal.base_revision >= 0 else None
            ),
            edit=edit,
            edit_id=proposal.edit_id,
        )
    except ArticleMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RevisionConflict as exc:
        raise HTTPException(
            status_code=409,
            detail=(
                "The article has changed since this edit was proposed -- "
                "another edit landed, or the run was re-finalised. Re-read it "
                "and ask again from where it is now."
            ),
        ) from exc
    except EditRefused as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return JSONResponse(
        {
            "markdown": committed.markdown,
            "edits": len(committed.history.edits),
            "revision": committed.revision,
            "review_status": review_status,
            # So a repeated click is reported as the edit it already is,
            # rather than as a second one.
            "already_applied": committed.already_applied,
        }
    )


@router.post("/section-edit/{run_id}/undo", dependencies=[Depends(require_staff)])
def undo_edit(
    run_id: str, request: UndoEditRequest | None = None
) -> JSONResponse:
    """Put the draft back to what it was before the last applied edit.

    Guarded by the same revision check as an apply, because it is the same
    kind of write. Pressed on a screen showing revision 10 while a colleague
    saved revision 11, an unguarded undo restores the markdown from before
    *this tab's* last edit and erases theirs on the way past.

    The restore is a new revision, not a return to an old one. Nothing is
    rewound; the article moves forward to prose it held before.
    """
    base_revision = request.base_revision if request else -1

    def edit(_markdown: str, history: EditHistory) -> tuple[str, EditHistory]:
        undone = undo_last(history)
        if undone is None:
            # Not an error. Pressing undo on an unedited draft is a question
            # with a plain answer.
            raise EditRefused("")
        return undone

    try:
        committed = commit_article_edit(
            run_id=run_id,
            expected_revision=base_revision if base_revision >= 0 else None,
            edit=edit,
        )
    except ArticleMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RevisionConflict as exc:
        raise HTTPException(
            status_code=409,
            detail=(
                "The article has changed since this screen read it. Re-read "
                "it before undoing, so an undo does not take back somebody "
                "else's edit."
            ),
        ) from exc
    except EditRefused:
        state = read_article(run_id)
        return JSONResponse(
            {
                "markdown": state.markdown,
                "edits": 0,
                "undone": False,
                "revision": state.revision,
            }
        )

    return JSONResponse(
        {
            "markdown": committed.markdown,
            "edits": len(committed.history.edits),
            "undone": True,
            "revision": committed.revision,
        }
    )


@router.get("/edit-patterns", dependencies=[Depends(require_staff)])
def read_edit_patterns() -> JSONResponse:
    """What the accepted edits keep saying, across every article.

    Not hung off a run. A pattern is about the writer across articles, and
    attaching it to whichever run happened to be open when it was noticed would
    lose it.

    Reads and counts; changes nothing. The Questurian Voice file is edited by a
    person, and silently learning a new instruction is the failure this feature
    is one wrong turn away from.
    """
    histories: dict[str, Any] = {}
    for row in get_all_runs(feature=FEATURE_NAME):
        run_id = _safe_str(row.get("run_id"))
        stored = _safe_dict(
            _safe_dict(read_stage_result(run_id, SECTION_EDIT_STAGE)).get("data")
        )
        if stored.get("edits"):
            histories[run_id] = stored

    reviewed = review(histories)
    decisions = [
        PatternDecision(**_safe_dict(item))
        for item in _safe_dict(
            _safe_dict(
                read_stage_result(EDIT_PATTERN_RUN, EDIT_PATTERN_STAGE)
            ).get("data")
        ).get("decisions")
        or []
    ]
    reviewed["outstanding"] = outstanding(reviewed, decisions)
    reviewed["decided"] = [
        {"pattern_id": item.pattern_id, "verdict": item.verdict, "note": item.note}
        for item in decisions
    ]
    return JSONResponse(reviewed)


@router.post("/edit-patterns/decide", dependencies=[Depends(require_staff)])
def decide_edit_pattern(
    request: PatternDecisionRequest,
    staff_id: str = Depends(staff_user_id),
) -> JSONResponse:
    """Record that a person answered a pattern, so it stops being offered.

    `adopted` means they changed the voice file themselves. Nothing here writes
    to it: this route records a decision and never a rule.
    """
    stored = _safe_dict(
        _safe_dict(read_stage_result(EDIT_PATTERN_RUN, EDIT_PATTERN_STAGE)).get("data")
    )
    kept = [
        item
        for item in stored.get("decisions") or []
        if _safe_dict(item).get("pattern_id") != request.pattern_id
    ]
    decisions = [
        *kept,
        {
            "pattern_id": request.pattern_id,
            "verdict": request.verdict,
            "decided_at": _now_iso(),
            "decided_by": staff_id or "",
            "note": request.note,
        },
    ]
    RunRecorder().record_stage(
        EDIT_PATTERN_RUN, EDIT_PATTERN_STAGE, {"decisions": decisions}
    )
    return JSONResponse({"decisions": decisions})


@router.get("/drafts/{run_id}", response_class=HTMLResponse)
def drafts_page(run_id: str) -> HTMLResponse:
    """Every draft this run produced, as a page an operator can read.

    HTML rather than JSON because the answer is prose being compared to other
    prose: which version shipped, how long each one was, and what the audit
    said about it. The same page the `scripts/p2b-drafts.py` CLI writes, from
    the same renderer.

    Read-only, and it reads rows `/debug/{run_id}` already returns, so it adds
    no exposure beyond that endpoint.
    """
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    report = build_drafts_report(
        run_id=run_id,
        status=status,
        stages=read_all_stage_results(run_id),
        markdown=(output or {}).get("markdown", ""),
    )
    if not report["drafts"]:
        raise HTTPException(
            status_code=404,
            detail="This run has no drafts yet; it may still be composing.",
        )
    return HTMLResponse(render_drafts_page(report))


@router.get("/debug/{run_id}")
def debug_run(run_id: str) -> JSONResponse:
    """Debug endpoint for Prompt2Blog run metadata/stages."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    stages = {}
    for stage_name in [
        "pipeline_input",
        "stage_input_validate",
        "stage_input_cleanup",
        "stage_synthesize_sources",
        "stage_classify_article_type",
        "stage_guideline_fetch",
        "stage_coverage_check",
        "stage_supplement",
        "stage_compose",
        "stage_quality_audit",
        "stage_repair",
        "stage_editorial_augmentation",
        "stage_title",
        "stage_finalize",
        "pipeline_input_v3",
        "stage_v3_outline",
        "stage_v3_compose",
        "stage_v3_groundedness",
        "stage_v3_quality_audit",
        "stage_v3_repair",
        "stage_v3_quality_settle",
        "stage_v3_title",
        "stage_v3_finalize",
        "pipeline_v3",
        # Not `resume_snapshot`: it holds a whole graph state, and this
        # endpoint returns every row it names in one response.
        "pipeline_resume_v3",
        "pipeline_failure",
        "langgraph_trace",
    ]:
        stage_data = read_stage_result(run_id, stage_name)
        if stage_data:
            stages[stage_name] = stage_data

    return JSONResponse(
        {
            "run_id": run_id,
            "status": status,
            "stages": stages,
            "output": read_output(run_id),
        }
    )
