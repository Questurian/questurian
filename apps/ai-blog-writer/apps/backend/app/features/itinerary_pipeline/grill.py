"""The day interview: the shared engine, pointed at one day of one trip.

The loop, the single retry, the pushback, the accepted-draft rule and the stop
condition all come from `prompt2blog.grill_v4` untouched. Two things make this
one an itinerary interview: the checklist it has to settle, and what it is
told before each turn.

The third thing is what it is NOT allowed to do. This interview reaches no
search. The facts it works from are a setup the operator filled in, and every
venue fact belongs to the external research step that happens after agreement.
A grill that looked places up here would produce recommendations that sound
researched and are not, and the operator would agree to them.

That is enforced in the engine rather than in the prompt: `seed_research_enabled`
and `mid_turn_lookup_enabled` are both false, so a model that asks for a lookup
anyway has the request dropped instead of obeyed.

The day's context is bound into the prompt builder as a closure rather than
carried on the state. It is a thousand lines of trip, layout and other-day
summary, it is re-derived from the workspace on every turn, and storing a copy
of it inside the interview would mean a resumed interview describing a trip
that had since been edited.
"""

from __future__ import annotations

import logging

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.grill_v4 import (
    GrillDependencies,
    answer_grill,
    reopen_grill,
    start_grill,
)
from .contracts import ITINERARY_MARKER_KEYS
from .grill_prompt import build_itinerary_turn_prompt

logger = logging.getLogger(__name__)

ITINERARY_GRILL_JOB = "itinerary.grill"


def _no_research(_query: str) -> tuple[str, list[str], int | None]:
    """The research callable, wired to nothing.

    Present because the engine's contract has the field, and it must never be
    reached: both capability switches are off. If it ever is called, that is a
    bug in the engine, and this log line is how it gets found.
    """
    logger.warning(
        "Itinerary grill reached its research callable; this should not happen"
    )
    return "", [], None


def dependencies(llm, brief: str) -> GrillDependencies:
    return GrillDependencies(
        llm=llm,
        research=_no_research,
        job_id=ITINERARY_GRILL_JOB,
        model_name=None,
        build_prompt=lambda state: build_itinerary_turn_prompt(state, brief),
        seed_research_enabled=False,
        mid_turn_lookup_enabled=False,
    )


def start(*, run_id: str, seed: str, brief: str, llm) -> GrillState:
    """Open the interview for one day.

    `seed` is the one line that names the day. Everything else the interview
    knows arrives through `brief`, which is rebuilt per turn -- the seed is
    replayed verbatim into every later prompt, and a whole trip pasted into it
    would be bought again on every turn for the life of the interview.
    """
    return start_grill(
        run_id=run_id,
        seed=seed,
        dependencies=dependencies(llm, brief),
        marker_keys=ITINERARY_MARKER_KEYS,
    )


def answer(state: GrillState, text: str, *, brief: str, llm) -> GrillState:
    return answer_grill(state, text, dependencies(llm, brief))


def reopen(state: GrillState, *, brief: str, llm) -> GrillState:
    return reopen_grill(state, dependencies(llm, brief))
