"""The HTTP surface for the four intake stages.

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
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from app.core.staff_auth import require_staff, staff_user_id

from ..config import P2B_V4_RESEARCH_STRUCTURE_MODEL
from ..brief_v4 import BriefIncomplete, BriefUnusable
from ..dependencies import PipelineDependencies
from ..grill_v4 import (
    GRILL_RESEARCH_MAX_TOKENS,
    GRILL_RESEARCH_MODEL,
    GrillDependencies,
    GrillUnusableResponse,
)
from ..intake_v4 import (
    IntakeServices,
    answer_intake,
    apply_cut,
    approve_brief,
    begin_intake,
    do_research,
    finished_article,
    intake_state,
    plan_research,
    reopen_intake,
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intake")


class SeedRequest(BaseModel):
    seed: str = Field(min_length=1)


class AnswerRequest(BaseModel):
    answer: str = Field(min_length=1)


class CutRequest(BaseModel):
    struck_ids: list[str] = Field(default_factory=list)
    added_questions: list[str] = Field(default_factory=list)


def _ground(prompt: str) -> tuple[str, list[str], int | None]:
    """Look something up on the one path in this app that reaches the web.

    Search stays off Claude on purpose: its WebSearch denial is a deliberate
    security boundary, and research is the most token-hungry step there is --
    spending Claude's budget reading web pages risks running out during the
    writing, which is the part that actually needs it.
    """
    from utils import invoke_google_grounded_text

    result = invoke_google_grounded_text(
        f"Brief a travel editor on this in a few dense paragraphs. "
        f"Facts, reputation, neighbourhoods, what it is known for.\n\n{prompt}",
        model_name=GRILL_RESEARCH_MODEL,
        max_tokens=GRILL_RESEARCH_MAX_TOKENS,
    )
    if result is None:
        return "", [], None
    return result.text, list(result.source_urls), result.total_tokens


def _gather(prompt: str, model_name: str) -> tuple[str, list[str], int | None]:
    """One grounded pass, for research rather than for the grill."""
    from utils import invoke_google_grounded_text

    result = invoke_google_grounded_text(
        prompt, model_name=model_name, max_tokens=GATHER_MAX_TOKENS
    )
    if result is None:
        return "", [], None
    return result.text, list(result.source_urls), result.total_tokens


def _services() -> IntakeServices:
    pipeline = PipelineDependencies()
    return IntakeServices(
        dependencies=GrillDependencies(llm=pipeline.llm, research=_ground),
        recorder=pipeline.recorder,
        research=ResearchDependencies(
            gather=_gather,
            structure_llm=pipeline.llm,
            structure_model=P2B_V4_RESEARCH_STRUCTURE_MODEL,
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
    except RunTokenCeilingReached as error:
        # Not a server fault and not a retry: the run is over its ceiling and
        # says what it spent.
        raise HTTPException(status_code=409, detail=error.status.as_record()) from error
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
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/seed", status_code=201)
async def open_intake(
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


@router.get("/{run_id}")
async def read_intake(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Where this run stands. What a reloaded page asks for."""
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/answer")
async def answer_question(
    run_id: str, request: AnswerRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    _handle(answer_intake, run_id, request.answer, _services())
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/reopen")
async def reopen(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Go back into the grill. The single exit from every dead end."""
    _handle(reopen_intake, run_id, _services())
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/brief")
async def build_the_brief(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Turn an agreed grill into the brief the run answers to."""
    _handle(approve_brief, run_id, _services())
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/work-order")
async def plan_the_research(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    _handle(plan_research, run_id, _services())
    return JSONResponse(intake_state(run_id))


@router.post("/{run_id}/work-order/cut")
async def cut_the_work_order(
    run_id: str, request: CutRequest, _staff=Depends(require_staff)
) -> JSONResponse:
    """Apply the operator's cut, and hand back what it cost.

    The warnings ride on the response as well as the run, because they are for
    the person who just made the decision -- said once, not enforced.
    """
    outcome = _handle(
        apply_cut,
        run_id,
        _services(),
        struck_ids=request.struck_ids,
        added_questions=request.added_questions,
    )
    return JSONResponse({**intake_state(run_id), "cut_warnings": outcome.warnings})


@router.post("/{run_id}/research")
async def do_the_research(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """Both research passes, then the one gate that blocks.

    A run that cannot be written still answers 200: this is a product state,
    not an error. The page reads `research.coverage` to see whether it may go
    on, and what is missing if not.
    """
    _handle(do_research, run_id, _services())
    return JSONResponse(intake_state(run_id))


@router.get("/{run_id}/article")
async def read_article(run_id: str, _staff=Depends(require_staff)) -> JSONResponse:
    """What the run wrote, for reading.

    Separate from the state the page polls: that runs every few seconds while
    the graph works, and this is the whole article.
    """
    return JSONResponse(_handle(finished_article, run_id))


@router.get("/{run_id}/writing-request")
async def read_writing_request(
    run_id: str, _staff=Depends(require_staff)
) -> JSONResponse:
    """What the graph would run, assembled from what intake settled.

    Refuses when research said no -- the same gate, enforced at the hand-off
    rather than re-decided here.
    """
    request = _handle(writing_request, run_id)
    return JSONResponse(request.model_dump(mode="json"))


@router.post("/{run_id}/write", status_code=202)
async def start_writing(
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
    request = _handle(writing_request, run_id)
    credential = _prompt2blog_credential_for_run()
    runtime = prepare_v3_runtime_request(request)

    # The run already exists -- it was opened by the seed -- so this records
    # what the graph is about to run rather than queueing a new one. That is
    # the whole point of starting a run at the seed: one article, one record,
    # one receipt covering intake and writing together.
    recorder = PipelineDependencies().recorder
    artifact = v3_run_input_artifact(runtime)
    artifact["claude_account_label"] = credential.label if credential else None
    recorder.record_stage(run_id, RUN_INPUT_STAGE, artifact)

    background_tasks.add_task(
        _run_pipeline_v4_background, run_id, runtime, credential
    )
    return JSONResponse(
        {**intake_state(run_id), "writing": "queued"}, status_code=202
    )
