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

An interview begun on the older eight topics is moved onto the current four
when the operator acts on it -- answers or reopens -- and saved with that
action. Viewing it changes nothing, so an agreed interview and whatever was
built from it stay exactly as they were until somebody reopens it.
"""

from __future__ import annotations

import logging

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.grill_v4 import (
    GrillDependencies,
    advance_grill,
    answer_grill,
    reopen_grill,
    start_grill,
)
from .contracts import ITINERARY_MARKER_KEYS, LEGACY_TOPICS_SETTLING
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


def on_current_topics(
    state: GrillState, *, pending_answered: bool = False
) -> GrillState:
    """The same interview, judged against the current four topics.

    Only the bookkeeping moves. Every question, suggestion, answer, question id
    and `asks_about` stays as it was said, which is what the summary's source
    check reads (ADR 0045).

    That is also why this cannot just rename `marker_keys`. The engine counts a
    topic as settled when an answered question named it, and old questions name
    old topics. Those names are simply not on the new list, so they count for
    nothing by themselves; what they settle is decided here, once, and written
    into `markers_covered`, where the engine keeps it.

    Conservative on purpose (`LEGACY_TOPICS_SETTLING`): a current topic is
    carried only when every old topic it needs was asked and answered. What the
    old interview claimed without asking is not carried either -- the next turn
    reads the setup and the whole conversation and may claim it again, which is
    the same judgement made against the question now being asked.

    `pending_answered` counts the question on screen as answered, for the call
    that is about to record the operator's answer to it.
    """
    if tuple(state.marker_keys) == ITINERARY_MARKER_KEYS:
        return state
    asked = [turn.question for turn in state.turns]
    if pending_answered and state.pending is not None:
        asked.append(state.pending)
    answered = {question.asks_about for question in asked if question.asks_about}
    carried = [
        key
        for key in ITINERARY_MARKER_KEYS
        if all(topic in answered for topic in LEGACY_TOPICS_SETTLING.get(key, ("",)))
    ]
    return state.model_copy(
        update={"marker_keys": ITINERARY_MARKER_KEYS, "markers_covered": carried}
    )


def answer(state: GrillState, text: str, *, brief: str, llm) -> GrillState:
    return answer_grill(
        on_current_topics(state, pending_answered=True),
        text,
        dependencies(llm, brief),
    )


def reopen(state: GrillState, *, brief: str, llm) -> GrillState:
    if tuple(state.marker_keys) == ITINERARY_MARKER_KEYS:
        return reopen_grill(state, dependencies(llm, brief))
    # The engine's reopen empties the covered list and lets answered questions
    # restore it. Old questions restore nothing on the new list, so the same
    # rule is applied through the mapping instead: what was answered stays
    # settled, the agreement does not.
    reopened = on_current_topics(state).model_copy(
        update={"status": "asking", "consensus": "", "pending": None}
    )
    return advance_grill(reopened, dependencies(llm, brief))
