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
from .shapes import SHAPES, SHAPES_BY_KEY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/listicle-pipeline", tags=["listicle-pipeline"])


class StartRequest(BaseModel):
    seed: str = Field(min_length=1, max_length=400)


class AngleSelection(BaseModel):
    """One line of the answer, as the screen knows it.

    Sent beside the text rather than instead of it. The transcript keeps what
    the operator wrote, because that is what the interview agreed to; this is
    what the screen knows and the text cannot carry -- which menu entry the
    line came from, whether it was changed, whether they wrote it themselves.
    """

    text: str = Field(min_length=1, max_length=600)
    angle_id: str = Field(default="", max_length=64)
    shape_key: str = Field(default="", max_length=64)
    group: str = Field(default="", max_length=64)
    role: str = Field(default="", max_length=32)
    edited: bool = False
    custom: bool = False


class AnswerRequest(BaseModel):
    run_id: str = Field(min_length=1)
    answer: str = Field(min_length=1, max_length=4000)
    # Empty for every question but the angle one, which is answered by
    # choosing.
    selections: list[AngleSelection] = Field(default_factory=list, max_length=60)


class AngleEdit(BaseModel):
    angle_id: str = Field(default="", max_length=64)
    text: str = Field(min_length=1, max_length=600)
    shape_key: str = Field(default="", max_length=64)
    group: str = Field(default="", max_length=64)
    role: str = Field(default="", max_length=32)
    edited: bool = False
    custom: bool = False


class ReviseOrderRequest(BaseModel):
    """A correction to the agreement, which becomes a new revision.

    Every field optional: correcting the count is by far the most common
    correction and should not require restating the angles.

    `standard` and `exclusions` are here because either can have been assembled
    from more than one answer, and an assembled value has to be arguable. An
    empty string is a real correction -- it means there is no bar, or nothing
    is barred -- so absent and empty are not the same thing.
    """

    target_count: int | None = Field(default=None, ge=1, le=200)
    angles: list[AngleEdit] | None = None
    standard: str | None = Field(default=None, max_length=2000)
    exclusions: str | None = Field(default=None, max_length=2000)
    # The revision the browser was looking at. A correction typed against a
    # version that has since moved is refused with the current one rather than
    # applied over whatever happened in between.
    expected_revision: int | None = Field(default=None, ge=1)


class SearchRequest(BaseModel):
    """Which searches to run, and whether stored work may be reused.

    `angle_ids` empty means the whole order. `reuse` false is the deliberate
    full refresh: the operator wants new research and knows it costs.
    """

    angle_ids: list[str] = Field(default_factory=list, max_length=40)
    reuse: bool = True


def _search_call(prompt: str) -> tuple[str, list[str], int | None, list[str]]:
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
    # Four elements, not three. The fourth is the publications behind the
    # answer: every URL above is a Google redirect that names nothing, so
    # without this the run cannot say whether a search told to work in the
    # local language actually reached local press. Callers that send three are
    # still read correctly -- see `search._search_once`.
    return (
        result.text,
        list(result.source_urls),
        result.total_tokens,
        list(getattr(result, "source_titles", []) or []),
    )


def _review_call(job_id: str, prompt: str, tool_name: str, schema: dict) -> Any:
    """One schema-shaped judgement about text already written down.

    JSON rather than a forced tool call, and that is not a style preference.
    The forced-tool version was built first and failed against real data on two
    of four attempts with `finish_reason: MALFORMED_FUNCTION_CALL` -- Gemini
    emitting `print(default_api.record_barred_places(...))` as source text
    instead of calling the tool. The JSON inside was complete and correct every
    time; only the transport was wrong. `candidates_token_count: 0` in the
    failures rules out a length problem, so raising the cap does not fix it.

    `tool_name` is still taken so the two callers read the same, and because a
    provider that does enforce tools can use it later without changing them.

    Not grounded: neither question needs the web. The angle check reads the
    order, and the candidate check reads evidence the searches already brought
    back -- which is the whole reason it costs one call instead of forty.
    """
    from ..prompt2blog.llm import _invoke_json_llm

    from .cut_review import REVIEW_MAX_TOKENS

    parsed, _raw = _invoke_json_llm(
        prompt=prompt,
        max_tokens=REVIEW_MAX_TOKENS,
        # A judgement, not a composition. Nothing here should vary run to run
        # more than the question already makes it.
        temperature=0.0,
        model_name=None,
        schema=schema,
        job_id=job_id,
    )
    return parsed or {}


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
                {
                    "text": o.text,
                    "recommended": o.recommended,
                    # From the catalogue whenever the shape is known, never
                    # from the model. A live run sent the shape's LABEL on one
                    # turn and its KEY on the next, and since the screen groups
                    # by this field, every option landed in a group of one and
                    # the "these two overlap" warning could never fire.
                    "group": (
                        SHAPES_BY_KEY[o.shape].theme
                        if o.shape in SHAPES_BY_KEY
                        else o.group
                    ),
                    # The catalogue entry this was written from, and the job it
                    # is for. Sent so the picker can hand them back with the
                    # answer -- an edited line that loses its shape key is a
                    # line the order has to guess about.
                    "shape": o.shape,
                    "role": o.role,
                }
                for o in state.pending.options
            ],
        },
    }


def _handle(action, *args, **kwargs):
    """Run one interview action and render the interview.

    Interview actions only. A search is not an interview turn and its result is
    not a `GrillState`, and passing one through here is what made every
    successful search raise on the way out: `_view` read `.run_id` off a dict
    and the operator was told the search had failed when it had worked and been
    stored. `_report` is the search side of the same boundary.
    """
    try:
        return _view(action(*args, **kwargs))
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
    return _handle(
        service.answer,
        req.run_id,
        req.answer,
        _base_dependencies(),
        [selection.model_dump() for selection in req.selections],
        # Runs only on the turn that agrees, which is already a paid call.
        # Every later read of the order is a GET and stays free.
        _review_call,
    )


@router.post("/grill/reopen")
def reopen_listicle_grill(run_id: str, _staff=Depends(require_staff)):
    return _handle(service.reopen, run_id, _base_dependencies())


@router.get("/grill/{run_id}")
def get_listicle_grill(run_id: str, _staff=Depends(require_staff)):
    state = service.get(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail="No such interview")
    return _view(state)


def _report(action, *args, **kwargs) -> dict[str, Any]:
    """Run one search action and return its own payload.

    Separate from `_handle` on purpose, and this separation is the whole fix
    for the first of the six confirmed faults. A search result is not an
    interview and must not be rendered as one; the error handling is shared
    because a missing run and an unagreed order mean the same thing on either
    side of the boundary.
    """
    from .runner import LeaseLost
    from .store import RevisionConflict

    try:
        return action(*args, **kwargs)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RevisionConflict as error:
        # 409 with the revision that actually won, so the screen can re-read
        # rather than guess which version it is now arguing with.
        raise HTTPException(
            status_code=409,
            detail=str(error),
            headers={"X-Listicle-Revision": str(error.current_revision)},
        ) from error
    except LeaseLost as error:
        # 409, not 500. Nothing broke: another batch took the run, and the
        # right answer is to look at what that batch is doing rather than to
        # retry into a race.
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/order/{run_id}")
def get_listicle_order(run_id: str, _staff=Depends(require_staff)):
    """The agreement in the form the searches actually run from.

    Read by the screen so the operator sees the count that will be used rather
    than the count a sentence appeared to say. The two disagreed on the only
    real run there has been.
    """
    found = service.order(run_id)
    if found is None:
        raise HTTPException(
            status_code=404,
            detail="This interview has not agreed a search order yet.",
        )
    return _order_view(found)


@router.post("/order/{run_id}")
def revise_listicle_order(
    run_id: str, req: ReviseOrderRequest, _staff=Depends(require_staff)
):
    """Correct the agreement. The correction becomes a new revision."""
    revised = _report(
        service.revise_order,
        run_id,
        target_count=req.target_count,
        angles=None if req.angles is None else [a.model_dump() for a in req.angles],
        standard=req.standard,
        exclusions=req.exclusions,
        expected_revision=req.expected_revision,
        # Changing the angles or the cut is when the two can start disagreeing,
        # so the question is asked again on the correction that caused it.
        review=_review_call,
    )
    return _order_view(revised)


@router.post("/search/{run_id}")
def run_listicle_search(
    run_id: str,
    req: SearchRequest | None = None,
    _staff=Depends(require_staff),
):
    """Run the agreed search order, or the part of it that was asked for.

    Minutes of work and real tokens, so it is a POST the operator asks for and
    never something a screen does on its own when it loads.
    """
    body = req or SearchRequest()
    return _report(
        service.search,
        run_id,
        _search_call,
        only=body.angle_ids or None,
        reuse=body.reuse,
        # One call over the finished pool, on the batch that paid for it.
        review=_review_call,
    )


@router.get("/search/{run_id}")
def get_listicle_search(run_id: str, _staff=Depends(require_staff)):
    """What this run knows, without running anything.

    A read, never a search. It reports progress as well as results, so a page
    reopened while a batch is still going shows what has finished rather than
    offering to start the batch again.
    """
    found = service.progress(run_id)
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
                "key": shape.key,
                "label": shape.label,
                "core": shape.core,
                "instruction": shape.instruction,
                "theme": shape.theme,
                # Which shapes tend to return the same places. A note the
                # screen explains, never a rule it enforces -- award-listed and
                # expensive are the same places in some cities and not others,
                # and the operator is the one who knows which.
                "overlaps_with": list(shape.overlaps_with),
                "applies_to": list(shape.applies_to),
                "role": shape.role,
            }
            for shape in SHAPES
        ]
    }


def _order_view(order) -> dict[str, Any]:
    """The order as the screen reads it."""
    from .runner import prior_contribution
    from .spec import planned_capacity, summary_of

    capacity = planned_capacity(order)
    # What each of these searches bought last time, before this time is paid
    # for. Empty on the first run about a subject, which is most of them.
    history = prior_contribution(order)
    return {
        "run_id": order.run_id,
        "revision": order.revision,
        "kind": order.kind,
        "place": order.place,
        "target_count": order.target_count,
        "standard": order.standard,
        "exclusions": order.exclusions,
        # Where the number came from, and whether anyone should look at it
        # again. A count read out of an ambiguous answer is still used -- the
        # run is not stuck -- and it is never presented as settled.
        "count_source": order.count_source,
        "count_ambiguous": order.count_ambiguous,
        "count_note": order.count_note,
        # Every marker the interview answered twice, and what was done about
        # it. The screen shows these next to the value they are about, because
        # a combined cut is the safe reading rather than the certain one.
        "answer_notes": list(order.answer_notes),
        # Approved searches that look like they will return places the same
        # order bars. Said before the money is spent; nothing is removed.
        # `conflicts_checked` false means nobody looked, which is not the same
        # as looked and found nothing.
        "conflicts_checked": order.conflicts_checked,
        "angle_conflicts": [
            {
                "angle_id": conflict.angle_id,
                "angle_text": conflict.angle_text,
                "why": conflict.why,
            }
            for conflict in order.angle_conflicts
        ],
        "capacity": capacity,
        "capacity_warning": (
            f"These {len(order.angles)} searches ask for {capacity} places in "
            f"total, which may not fill a list of {order.target_count}."
            if capacity < order.target_count
            else ""
        ),
        "summary": summary_of(order),
        "angles": [
            {
                "angle_id": angle.angle_id,
                "text": angle.text,
                "shape_key": angle.shape_key,
                "group": angle.group,
                "role": angle.role,
                "wanted": angle.wanted,
                "edited": angle.edited,
                "custom": angle.custom,
                # Said before the search runs, and never acted on: no angle is
                # dropped or reordered because of it. Two runs is a fact about
                # two runs.
                "last_time": history.get(angle.angle_id, ""),
            }
            for angle in order.angles
        ],
    }
