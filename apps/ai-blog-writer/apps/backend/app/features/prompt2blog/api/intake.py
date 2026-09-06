"""The HTTP surface for the four intake stages.

Every handler below is `def`, never `async def`, and that is load bearing.

FastAPI runs an `async def` handler on the event loop and a `def` handler in a
threadpool. Every route here does blocking work -- ten sequential web searches,
a model call that runs for minutes, SQLite reads -- so declaring them `async`
handed the event loop to one request and froze the entire server for as long as
it took.

The symptoms did not look like one bug. The Claude status pill hung on
"checking", links did nothing, and the page forgot which run it was on, because
its resume read timed out and the code took silence to mean the run was gone.
All three were requests queued behind a research pass that had the loop.

If a handler here ever needs `await`, it needs its blocking work moved off the
loop first.

One route per move the operator can make: type a seed, answer a question, go
back into the grill, approve the brief, plan the research, cut the plan, run
the research. Each
one is a turn -- it loads what the run knows, advances it, writes it back -- so
a page that is reloaded, or reopened tomorrow, asks `GET /intake/{run_id}` and
carries on.

Every route is staff-guarded because every one of them spends money.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from app.core.staff_auth import require_staff, staff_user_id

from ..intake_lock import exclusive_run
from ..brief_v4 import BriefIncomplete, BriefUnusable
from ..dependencies import PipelineDependencies, dependencies_for_run
from ..grill_v4 import (
    GRILL_RESEARCH_MAX_TOKENS,
    GrillDependencies,
    GrillUnusableResponse,
)
from ..gate_v4 import GateAnswerRefused
from ..intake_v4 import (
    IntakeServices,
    blocking_questions,
    review_selection,
    review_venues,
    answer_intake,
    apply_cut,
    approve_brief,
    begin_intake,
    do_research,
    finished_article,
    polish_prompt,
    punch_list,
    intake_state,
    plan_research,
    reask_question,
    recent_runs,
    reopen_intake,
    settle_gate,
    settle_selection,
    settle_venue,
    writing_request,
)
from ..intake_v3 import RUN_INPUT_STAGE, prepare_v3_runtime_request, v3_run_input_artifact
from ..research_v4 import GATHER_MAX_TOKENS, ResearchDependencies, ResearchUnusable
from ..work_order_v4 import WorkOrderUnusable
from .runs import (
    _prompt2blog_credential_for_run,
    _run_pipeline_v3_background as _run_pipeline_v4_background,
)
from ..run_budget import RunTokenCeilingReached
from ..selection_v4 import SelectionRefused
from ..work_order_v4 import PlanTooLargeToFinish

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intake")


class SeedRequest(BaseModel):
    seed: str = Field(min_length=1)


class AnswerRequest(BaseModel):
    answer: str = Field(min_length=1)


class CutRequest(BaseModel):
    struck_ids: list[str] = Field(default_factory=list)
    added_questions: list[str] = Field(default_factory=list)


def _grounded_call(
    prompt: str,
    *,
    job_id: str,
    model_name: str | None = None,
    max_tokens: int,
    usage_recorder: Any | None,
    correlation_id: str | None = None,
) -> tuple[str, list[str], int | None]:
    """A grounded search, counted.

    Grounded search is raw REST: it never passes through the LangChain
    adapters the token ledger watches, so every search a run made was
    invisible to it. Measured on two real runs, that was 27,207 tokens over
    eight searches (b78a9fe8) and 31,992 over seven (76b36468), and the
    receipt for both reported zero. The per-run ceiling reads that same total,
    so it was guarding a number with the most token-hungry step missing.

    A response that carried no usage block is recorded as a call with no
    measurement rather than a call that cost nothing: `record` files a `None`
    usage as unmetered, and both real runs had exactly one search like that.
    """
    from app.shared.model_calls import grounded_text

    if correlation_id is None:
        correlation_id = getattr(getattr(usage_recorder, "__self__", None), "run_id", None)

    # Reported here for the first time. These two searches are the most
    # token-hungry step in a run and neither has ever reached the dashboard,
    # because reporting was wired per call site and these sites were missed.
    result = grounded_text(
        job_id, prompt, model=model_name, max_tokens=max_tokens, endpoint="grounded",
        correlation_id=correlation_id
    )
    if result is None:
        # The call failed rather than returned nothing. There is no successful
        # call to record.
        return "", [], None
    if usage_recorder is not None:
        counts = {
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "total_tokens": result.total_tokens,
        }
        measured = {key: value for key, value in counts.items() if value is not None}
        if measured:
            measured["output_token_details"] = {"reasoning": getattr(result, "reasoning_tokens", 0) or 0}
            measured["cached_input_tokens"] = getattr(result, "cached_input_tokens", 0) or 0
        try:
            usage_recorder(
                str(result.model_name or model_name),
                measured or None,
            )
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Grounded search usage record failed: %s", exc)
    return result.text, list(result.source_urls), result.total_tokens


def _services(run_id: str | None = None) -> IntakeServices:
    """The intake's dependencies, continuing `run_id`'s ledger where there is one.

    Built per request. Without the restore each request's tracker held only
    its own calls, and writing the ledger under one stage name then replaced
    the run's accounting with that request's slice -- see
    `dependencies_for_run`.
    """
    pipeline = (
        dependencies_for_run(run_id) if run_id else PipelineDependencies()
    )
    record_usage = getattr(
        getattr(pipeline.llm, "usage_tracker", None), "record", None
    )

    def _ground(prompt: str) -> tuple[str, list[str], int | None]:
        """Look something up on the one path in this app that reaches the web.

        Search stays off Claude on purpose: its WebSearch denial is a
        deliberate security boundary, and research is the most token-hungry
        step there is -- spending Claude's budget reading web pages risks
        running out during the writing, which is the part that actually needs
        it.
        """
        return _grounded_call(
            f"Brief a travel editor on this in a few dense paragraphs. "
            f"Facts, reputation, neighbourhoods, what it is known for.\n\n{prompt}",
            job_id="p2b.grill_research",
            max_tokens=GRILL_RESEARCH_MAX_TOKENS,
            usage_recorder=record_usage,
            correlation_id=run_id,
        )

    def _gather(prompt: str, model_name: str | None = None) -> tuple[str, list[str], int | None]:
        """One grounded pass, for research rather than for the grill."""
        return _grounded_call(
            prompt,
            job_id="p2b.research_gather",
            max_tokens=GATHER_MAX_TOKENS,
            usage_recorder=record_usage,
            correlation_id=run_id,
        )

    return IntakeServices(
        dependencies=GrillDependencies(llm=pipeline.llm, research=_ground),
        recorder=pipeline.recorder,
        research=ResearchDependencies(
            gather=_gather,
            structure_llm=pipeline.llm,
            # The gateway answers for `p2b.research_structure`; the stage no
            # longer carries a model of its own.
            structure_model=None,
        ),
    )


def _handle(action, *args, **kwargs) -> Any:
    """Turn the intake's own failures into answers a page can act on."""
    try:
        return action(*args, **kwargs)
    except BriefIncomplete as error:
        logger.error("Brief incomplete: %s | %s", error.missing, error.raw[:2000])
        raise HTTPException(
            status_code=502,
            detail={
                "error": "brief_incomplete",
                "message": (
                    "The brief came back missing "
                    + ", ".join(error.missing)
                    + ". Nothing you said caused this — try approving again, or "
                    "go back to the grill and say more about it."
                ),
                "raw": error.raw[:2000],
            },
        ) from error
    except BriefUnusable as error:
        # 502 and a sentence, not a Pydantic traceback. This arrived as
        # "1 validation error for ArticleBrief ... must_name entry values must
        # be unique", mid-flow, after the grill had been paid for.
        logger.error("Brief did not fit its contract: %s | %s", error.reason, error.raw[:2000])
        raise HTTPException(
            status_code=502,
            detail={
                "error": "brief_unusable",
                "message": (
                    "The brief came back in a shape the system cannot use "
                    "and did not settle on a second try. Nothing you said "
                    "caused this — try approving again."
                ),
                "raw": error.reason,
            },
        ) from error
    except ResearchUnusable as error:
        logger.error("Dossier did not fit its contract: %s | %s", error.reason, error.raw[:2000])
        raise HTTPException(
            status_code=502,
            detail={
                "error": "research_unusable",
                "message": (
                    "The research came back in a shape the system cannot use. "
                    "Nothing you said caused this — try researching again."
                ),
                "raw": error.reason,
            },
        ) from error
    except WorkOrderUnusable as error:
        logger.error(
            "Work order did not fit its contract: %s | %s", error.reason, error.raw[:2000]
        )
        raise HTTPException(
            status_code=502,
            detail={
                "error": "work_order_unusable",
                "message": (
                    "The research plan came back in a shape the system cannot "
                    "use. Nothing you said caused this — try planning again."
                ),
                "raw": error.reason,
            },
        ) from error
    except GrillUnusableResponse as error:
        # 502, not 400: nothing the operator typed caused this, and the reply
        # travels with it. The first real run died here and left no trace at
        # all, which made the one failure that most needed explaining the one
        # with no evidence.
        logger.error("Grill returned an unusable response: %s", error.raw[:2000])
        raise HTTPException(
            status_code=502,
            detail={
                "error": "grill_unusable_response",
                "message": (
                    "The interviewer did not come back with a question. This is "
                    "not something you did. Try again."
                ),
                "raw": error.raw[:2000],
            },
        ) from error
    except SelectionRefused as error:
        # The operator asked the picker for something it cannot mean. Their
        # move, their sentence back, and nothing was changed.
        raise HTTPException(
            status_code=400,
            detail={"error": "selection_refused", "message": str(error)},
        ) from error
    except RunTokenCeilingReached as error:
        # Not a server fault and not a retry: the run is over its ceiling and
        # says what it spent.
        raise HTTPException(status_code=409, detail=error.status.as_record()) from error
    except PlanTooLargeToFinish as error:
        # The same 409 shape, and for the same reason: not a fault, not a
        # retry. The difference is that this one is answerable -- the plan is
        # still on the screen and the cut is one click away.
        raise HTTPException(
            status_code=409,
            detail={
                "error": "plan_too_large_to_finish",
                "message": error.projection.note,
                "budget_projection": asdict(error.projection),
            },
        ) from error
    except ValidationError as error:
        # Anything a stage builds and the contracts refuse. Pydantic's own
        # message is addressed to a developer and it subclasses ValueError, so
        # without this it fell through to the 400 below and reached the
        # operator verbatim -- "List should have at least 1 item after
        # validation, not 0", mid-flow, twice in one evening.
        logger.error("Intake payload failed its contract: %s", error)
        raise HTTPException(
            status_code=502,
            detail={
                "error": "contract_violation",
                "message": (
                    "Something came back in a shape the system cannot use. "
                    "Nothing you said caused this — try that step again."
                ),
                "raw": "; ".join(
                    f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}"
                    for item in error.errors()
                )[:2000],
            },
        ) from error
    except GateAnswerRefused as error:
        # The operator asked for something the dossier will not take -- an
        # empty answer, or a question research already settled.
        raise HTTPException(status_code=400, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/seed", status_code=201)
def open_intake(
    request: SeedRequest, staff_user=Depends(require_staff)
) -> JSONResponse:
    """One typed line becomes a run and its first question."""
    state = _handle(
        begin_intake,
        request.seed,
        _services(),
        owner_staff_id=staff_user_id(staff_user),
    )
    return JSONResponse(intake_state(state.run_id), status_code=201)


@router.get("/runs")
def list_runs(limit: int = 15, _staff=Depends(require_staff)) -> JSONResponse:
    """The runs the operator can go back to.

    Declared above `/{run_id}` because FastAPI matches in declaration order and
    a path parameter would otherwise swallow the literal "runs" and try to read
    a run by that name.
    """
    return JSONResponse({"runs": recent_runs(limit)})


@router.get("/{run_id}")
def read_intake(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Where this run stands. What a reloaded page asks for."""
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/answer")
@exclusive_run
def answer_question(
    run_id: str, request: AnswerRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    _handle(answer_intake, run_id, request.answer, _services(run_id))
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/reopen")
@exclusive_run
def reopen(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Go back into the grill. The single exit from every dead end."""
    _handle(reopen_intake, run_id, _services(run_id))
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/brief")
@exclusive_run
def build_the_brief(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Turn an agreed grill into the brief the run answers to."""
    _handle(approve_brief, run_id, _services(run_id))
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/work-order")
@exclusive_run
def plan_the_research(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    _handle(plan_research, run_id, _services(run_id))
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/work-order/cut")
@exclusive_run
def cut_the_work_order(
    run_id: str, request: CutRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    """Apply the operator's cut, and hand back what it cost.

    The warnings ride on the response as well as the run, because they are for
    the person who just made the decision -- said once, not enforced.
    """
    outcome = _handle(
        apply_cut,
        run_id,
        _services(run_id),
        struck_ids=request.struck_ids,
        added_questions=request.added_questions,
    )
    return JSONResponse({**intake_state(run_id), "cut_warnings": outcome.warnings})


@router.post("/{run_id}/research")
@exclusive_run
def do_the_research(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Both research passes, then the one gate that blocks.

    A run that cannot be written still answers 200: this is a product state,
    not an error. The page reads `research.coverage` to see whether it may go
    on, and what is missing if not.
    """
    _handle(do_research, run_id, _services(run_id))
    return JSONResponse(intake_state(run_id))


class GateAnswerRequest(BaseModel):
    requirement_id: str = Field(min_length=1)
    # Exactly one of these. An answer is what the operator found; the note is
    # what they looked for and could not find anywhere.
    answer: str | None = None
    source_url: str | None = None
    unpublished_note: str | None = None
    # What research found instead, when the thing the question asked about is
    # not there. Different from the note above: that one says the figure exists
    # and nobody prints it.
    nonexistent_note: str | None = None
    # Drop the question. Permitted for a load-bearing one, and answered once
    # with what the article can no longer claim (ADR 0030).
    omit: bool = False


class ReaskRequest(BaseModel):
    requirement_id: str = Field(min_length=1)
    question: str = Field(min_length=1)


@router.post("/{run_id}/gate/reask")
@exclusive_run
def reask_the_question(
    run_id: str, request: ReaskRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    """Rewrite one question and buy one search.

    The only move at the gate that spends money, which is why it is its own
    route rather than a fourth branch of the settle one: the other three are
    the operator recording a decision, and this one re-runs research.
    """
    _handle(
        reask_question,
        run_id,
        _services(run_id),
        requirement_id=request.requirement_id,
        question=request.question,
    )
    return JSONResponse(intake_state(run_id))


@router.get("/{run_id}/gate")
def read_gate(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """The questions holding this run up, with what research did find."""
    return JSONResponse({"blocking": _handle(blocking_questions, run_id)})


@router.post("/{run_id}/gate")
@exclusive_run
def settle_the_gate(
    run_id: str, request: GateAnswerRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    """Settle one blocking question without re-buying the research.

    No model call: this is the operator's decision, recorded. The coverage
    verdict is re-derived afterwards by the function that blocked, so the page
    reads the same answer it would have got from a fresh research pass.
    """
    chosen = [
        request.answer is not None,
        request.unpublished_note is not None,
        request.nonexistent_note is not None,
        request.omit,
    ]
    if sum(chosen) != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Say one of four things: what the answer is, that nobody "
                "publishes it, that the thing is not there, or that the "
                "question should be dropped."
            ),
        )
    _handle(
        settle_gate,
        run_id,
        _services(run_id),
        requirement_id=request.requirement_id,
        answer=request.answer,
        source_url=request.source_url,
        unpublished_note=request.unpublished_note,
        nonexistent_note=request.nonexistent_note,
        omit=request.omit,
    )
    return JSONResponse(intake_state(run_id))


class VenueMarkRequest(BaseModel):
    claim_id: str = Field(min_length=1)
    # Three moves, and marking it fine is still simply not calling this.
    # `drop` takes the claim out of the dossier; `dismiss` takes the question
    # off the list and leaves the dossier alone; a note says what was seen.
    drop: bool = False
    dismiss: bool = False
    note: str | None = None


class SelectionRequest(BaseModel):
    """One move. Moving the line and marking one fact are separate decisions:
    an override is about that fact and outlives the line moving past it."""

    keep_count: int | None = None
    rescue: str | None = None
    drop: str | None = None
    clear: str | None = None


@router.get("/{run_id}/selection")
def read_selection(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """The facts this article would be written from, ranked, with the line."""
    return JSONResponse(_handle(review_selection, run_id))


@router.post("/{run_id}/selection")
@exclusive_run
def settle_the_selection(
    run_id: str, request: SelectionRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    """Move the line, or mark one fact. No model call: the operator decides."""
    return JSONResponse(
        _handle(
            settle_selection,
            run_id,
            _services(run_id),
            keep_count=request.keep_count,
            rescue=request.rescue,
            drop=request.drop,
            clear=request.clear,
        )
    )


@router.get("/{run_id}/venues")
def read_venues(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """The places this run would send a reader.

    Only claims naming somewhere bookable or visitable, so the list is short
    enough to actually look at.
    """
    return JSONResponse({"venues": _handle(review_venues, run_id)})


@router.post("/{run_id}/venues")
@exclusive_run
def mark_venue(
    run_id: str, request: VenueMarkRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    """Record what the operator saw when they looked."""
    chosen = [request.drop, request.dismiss, request.note is not None]
    if sum(1 for move in chosen if move) != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Pick one: drop it, dismiss it as not worth checking, "
                "or say what you saw."
            ),
        )
    _handle(
        settle_venue,
        run_id,
        _services(run_id),
        claim_id=request.claim_id,
        drop=request.drop,
        dismiss=request.dismiss,
        note=request.note,
    )
    return JSONResponse(intake_state(run_id))


@router.get("/{run_id}/article")
def read_article(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """What the run wrote, for reading.

    Separate from the state the page polls: that runs every few seconds while
    the graph works, and this is the whole article.
    """
    return JSONResponse(_handle(finished_article, run_id))


@router.get("/{run_id}/punch-list")
def read_punch_list(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """The short list of edits a person should make by hand.

    One model call the first time it is asked for, then read from the run.
    Nothing downstream of `finalize` changes the article, so the answer cannot
    go stale, and paying for it twice would be paying for the same paragraph.
    """
    return JSONResponse(_handle(punch_list, run_id, _services(run_id)))


@router.get("/{run_id}/polish-prompt")
def read_polish_prompt(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """One prompt to carry to a flagship model, with the article in it."""
    return JSONResponse(_handle(polish_prompt, run_id))


@router.get("/{run_id}/writing-request")
def read_writing_request(
    run_id: str, _staff=Depends(require_staff)
) -> JSONResponse:
    """What the graph would run, assembled from what intake settled.

    Refuses when research said no -- the same gate, enforced at the hand-off
    rather than re-decided here.
    """
    handoff = _handle(writing_request, run_id)
    return JSONResponse(handoff.request.model_dump(mode="json"))


@router.post("/{run_id}/write", status_code=202)
@exclusive_run
def start_writing(
    run_id: str,
    background_tasks: BackgroundTasks,
    _staff=Depends(require_staff),
) -> JSONResponse:
    """Hand a settled run to the graph.

    The same run id all the way through: the article is written onto the run
    the seed opened, so the receipt covers intake and writing together rather
    than splitting one article across two records.

    Refuses when research said no. That is the same gate decided once, not a
    second opinion.
    """
    handoff = _handle(writing_request, run_id)
    credential = _prompt2blog_credential_for_run()
    # One coherent snapshot: the brief, the dossier and the selection were read
    # together above, and the packet built from them is frozen into the runtime
    # request here. A resume reads that frozen packet rather than rebuilding
    # one from a selection the operator may have edited since.
    runtime = _handle(
        prepare_v3_runtime_request, handoff.request, handoff.selection
    )

    # The run already exists -- it was opened by the seed -- so this records
    # what the graph is about to run rather than queueing a new one. That is
    # the whole point of starting a run at the seed: one article, one record,
    # one receipt covering intake and writing together.
    # Continuing the run's ledger, not a fresh one. `record_stage` writes the
    # whole ledger at the end of every call, so a recorder built on an empty
    # tracker does not merely fail to add -- it ERASES what intake spent.
    #
    # Measured on run 062c0b86 (2026-09-01): the intake stages had recorded
    # 105,098 tokens, this line wrote the `pipeline_input_v3` row at 19:29:14,
    # and the run's finished receipt reported 161,897 -- the writing graph
    # alone. The ceiling reads that same total.
    recorder = dependencies_for_run(run_id).recorder
    artifact = v3_run_input_artifact(runtime)
    artifact["claude_account_label"] = credential.label if credential else None
    recorder.record_stage(run_id, RUN_INPUT_STAGE, artifact)

    background_tasks.add_task(
        _run_pipeline_v4_background, run_id, runtime, credential
    )
    return JSONResponse(
        {**intake_state(run_id), "writing": "queued"}, status_code=202
    )
