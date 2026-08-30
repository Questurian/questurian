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

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.staff_auth import require_staff, staff_user_id

from ..config import P2B_V4_RESEARCH_STRUCTURE_MODEL
from ..dependencies import PipelineDependencies
from ..grill_v4 import (
    GRILL_RESEARCH_MAX_TOKENS,
    GRILL_RESEARCH_MODEL,
    GrillDependencies,
)
from ..intake_v4 import (
    IntakeServices,
    answer_intake,
    apply_cut,
    approve_brief,
    begin_intake,
    do_research,
    intake_state,
    plan_research,
    reopen_intake,
    writing_request,
)
from ..research_v4 import GATHER_MAX_TOKENS, ResearchDependencies
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
    except RunTokenCeilingReached as error:
        # Not a server fault and not a retry: the run is over its ceiling and
        # says what it spent.
        raise HTTPException(status_code=409, detail=error.status.as_record()) from error
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
