"""HTTP for the listicle interview.

Handlers are `def`, not `async def`, for the same reason prompt2blog's are:
every one of them blocks on a model call or a web search, and running that on
the event loop freezes the whole server for the length of it.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.staff_auth import require_staff
from app.shared.api_usage import observe_external_call

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.dependencies import DefaultPrompt2BlogLLM
from ..prompt2blog.grill_v4 import GrillDependencies, GrillUnusableResponse
from . import service
from .shapes import SHAPES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/listicle-pipeline", tags=["listicle-pipeline"])


class StartRequest(BaseModel):
    seed: str = Field(min_length=1, max_length=400)


class AnswerRequest(BaseModel):
    run_id: str = Field(min_length=1)
    answer: str = Field(min_length=1, max_length=4000)


def _search_call(prompt: str) -> tuple[str, list[str], int | None]:
    """The web, asked exactly what the search runner wrote.

    Deliberately NOT the grill's `research`: that one wraps whatever it is
    given in "brief a travel editor on this in a few dense paragraphs", which
    is right for a lookup and ruinous for a search -- it would ask for prose
    about the angle instead of the list of places the angle exists to find.

    Longer timeout and a bigger output than a lookup, because this reply is a
    dozen named places with evidence for each. The default 60 seconds cut one
    of seven searches off the first real run.
    """
    from app.shared.model_calls import grounded_text

    from .search import SEARCH_MAX_TOKENS, SEARCH_TIMEOUT_SECONDS

    # The hand-rolled observation this replaced was correct, and that was the
    # problem: it had to be written out here, and the two Prompt2Blog searches
    # that nobody wrote it for reported nothing at all.
    result = grounded_text(
        "listicle.search",
        prompt,
        max_tokens=SEARCH_MAX_TOKENS,
        timeout_seconds=SEARCH_TIMEOUT_SECONDS,
        endpoint="generateContent:googleSearch",
    )
    if result is None:
        # A helper that returns None swallowed its own failure. Raised here so
        # the runner's retry can see it; a silent empty string would be
        # recorded as "nothing published for this angle", which is a different
        # and much more misleading finding.
        raise RuntimeError("The grounded search returned nothing.")
    return result.text, list(result.source_urls), result.total_tokens


def _base_dependencies() -> GrillDependencies:
    """The live model and the one path in this app that reaches the web."""
    from ..prompt2blog.api.intake import _grounded_call
    from ..prompt2blog.grill_v4 import GRILL_RESEARCH_MAX_TOKENS

    def research(prompt: str) -> tuple[str, list[str], int | None]:
        # Reported separately from the search: a lookup during the interview
        # and a search that fills the list are different spends against the
        # same model, and a dashboard that cannot tell them apart cannot say
        # which half of a run is expensive.
        return _grounded_call(
            "Brief a travel editor on this in a few dense paragraphs. How many "
            "places of this kind the city plausibly has, which "
            "neighbourhoods matter, and what it is known for.\n\n" + prompt,
            job_id="listicle.grill_lookup",
            max_tokens=GRILL_RESEARCH_MAX_TOKENS,
            usage_recorder=None,
        )

    return GrillDependencies(
        llm=DefaultPrompt2BlogLLM(),
        research=research,
        # The grill runs on this pipeline's engine but is its own job, so it
        # stops reporting itself as `prompt2blog` -- which it has been doing
        # since it borrowed that code.
        job_id="listicle.grill",
        model_name=None,
    )


def _view(state: GrillState) -> dict[str, Any]:
    """What the screen needs, and nothing it does not.

    The research digest is deliberately not sent: it is thousands of words the
    operator never reads, and the screen renders a conversation.
    """
    return {
        "run_id": state.run_id,
        "seed": state.seed,
        "status": state.status,
        "consensus": state.consensus,
        "markers_covered": list(state.markers_covered),
        "markers_missing": [
            key for key in state.marker_keys if key not in state.markers_covered
        ],
        "lookups": list(state.lookups),
        "turns": [
            {
                "question_id": t.question.question_id,
                "ask": t.question.ask,
                "pushback": t.question.pushback,
                "answer": t.answer,
                "accepted_as_drafted": t.accepted_as_drafted,
            }
            for t in state.turns
        ],
        "pending": None
        if state.pending is None
        else {
            "question_id": state.pending.question_id,
            "ask": state.pending.ask,
            "recommendation": state.pending.recommendation,
            "pushback": state.pending.pushback,
            # Non-empty only for a question answered by choosing. The screen
            # switches to a tick list when this arrives and back to a text box
            # when it does not, so this single field is what decides the input
            # control.
            "options": [
                {"text": o.text, "recommended": o.recommended, "group": o.group}
                for o in state.pending.options
            ],
        },
    }


def _handle(action, *args):
    try:
        return _view(action(*args))
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except GrillUnusableResponse as error:
        logger.warning("Listicle grill returned nothing usable: %s", error.raw[:400])
        raise HTTPException(
            status_code=502,
            detail="The interview could not decide what to ask next. Try again.",
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/grill/start")
def start_listicle_grill(req: StartRequest, _staff=Depends(require_staff)):
    return _handle(service.start, req.seed, _base_dependencies())


@router.post("/grill/answer")
def answer_listicle_grill(req: AnswerRequest, _staff=Depends(require_staff)):
    return _handle(service.answer, req.run_id, req.answer, _base_dependencies())


@router.post("/grill/reopen")
def reopen_listicle_grill(run_id: str, _staff=Depends(require_staff)):
    return _handle(service.reopen, run_id, _base_dependencies())


@router.get("/grill/{run_id}")
def get_listicle_grill(run_id: str, _staff=Depends(require_staff)):
    state = service.get(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail="No such interview")
    return _view(state)


@router.post("/search/{run_id}")
def run_listicle_search(run_id: str, _staff=Depends(require_staff)):
    """Run the agreed search order.

    Minutes of work and real tokens, so it is a POST the operator asks for and
    never something a screen does on its own when it loads.
    """
    return _handle(service.search, run_id, _search_call)


@router.get("/search/{run_id}")
def get_listicle_search(run_id: str, _staff=Depends(require_staff)):
    """What a previous run of the search order found, if it has been run."""
    found = service.results(run_id)
    if found is None:
        raise HTTPException(
            status_code=404, detail="This search order has not been run yet."
        )
    return found


@router.get("/shapes")
def list_shapes(_staff=Depends(require_staff)):
    """The shape catalogue, for a screen that wants to offer more angles.

    Shapes rather than finished angles: the wording of an angle belongs to the
    topic and is written per interview, so there is no list of searches to
    hand out -- only the patterns they are written from.
    """
    return {
        "shapes": [
            {
                "key": s.key,
                "label": s.label,
                "instruction": s.instruction,
                "collides_with": s.collides_with,
            }
            for s in SHAPES
        ]
    }
