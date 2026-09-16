"""Turning an agreed conversation into the short summary a selection runs from.

A consensus is a paragraph. It is what the operator agreed to and it is the
right thing to agree to -- but a paragraph cannot be checked against the slot
list, cannot be hashed into an export, and cannot be diffed when the day
changes. So a second, dedicated call reads the conversation and writes the
agreement down as a `DaySummary`.

It is short on purpose (ADR 0045). The first version wrote requirements,
failure conditions and a research checklist, and a suggestion the operator
merely accepted came out as a rule the research then spent its searches on.
Here the operator's own musts are `requirements`, and everything else --
including an accepted suggestion -- is a preference the selection may adjust.

Two rules keep it honest:

**The candidate is shown before it is accepted.** The operator accepts the
object they were shown, by revision number.

**A failed extraction leaves the conversation alone.** The retry is another
extraction, not another interview.
"""

from __future__ import annotations

import logging
from typing import Any

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.support import _safe_dict, _safe_str, _safe_str_list
from .contracts import (
    AgreementTurn,
    DaySnapshotModel,
    DaySummary,
    SlotSummary,
)

logger = logging.getLogger(__name__)

DIRECTION_JOB = "itinerary.day_direction"

DIRECTION_MAX_TOKENS = 4_096


def _strings(description: str, maximum: int) -> dict[str, Any]:
    return {
        "type": "array",
        "description": description,
        "maxItems": maximum,
        "items": {"type": "string"},
    }


SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "angle": {
            "type": "string",
            "description": "One sentence: what this day is for.",
        },
        "trip_fit": {
            "type": "string",
            "description": "One sentence: how it differs from the other days. Empty if one day.",
        },
        "area": {
            "type": "string",
            "description": "Where the day happens and roughly how it moves. One sentence.",
        },
        "requirements": _strings(
            "Firm musts for the whole day that the operator stated themselves "
            "or the setup states. Usually zero to three.",
            12,
        ),
        "preferences": _strings(
            "Everything else agreed for the whole day that the selection may adjust.",
            12,
        ),
        "avoid": _strings("What the day should stay away from, if agreed.", 12),
        "slots": {
            "type": "array",
            "description": "One entry per approved stop, in the approved order.",
            "maxItems": 40,
            "items": {
                "type": "object",
                "properties": {
                    "slot_id": {"type": "string"},
                    "role": {"type": "string", "description": "A short phrase."},
                    "requirements": _strings("Firm musts for this stop only.", 8),
                    "preferences": _strings("Adjustable wishes for this stop only.", 8),
                },
                "required": ["slot_id", "role", "requirements", "preferences"],
            },
        },
    },
    "required": ["angle", "trip_fit", "area", "requirements", "preferences", "avoid", "slots"],
}


def build_prompt(state: GrillState, brief: str, day: DaySnapshotModel) -> str:
    slot_lines = "\n".join(
        f"  - {slot.id} — {slot.label or slot.kind} ({slot.kind}"
        + (", optional" if slot.optional else "")
        + ")"
        for slot in day.slots
    )
    blocks = []
    for index, turn in enumerate(state.turns, start=1):
        origin = (
            "They accepted the suggestion unchanged: the wording is the interviewer's."
            if turn.accepted_as_drafted
            else "They wrote this answer themselves."
        )
        blocks.append(
            f"Q{index}. {turn.question.ask}\n"
            f"Suggested: {turn.question.recommendation}\n"
            f"Answer: {turn.answer}\n{origin}\n"
        )
    transcript = "\n".join(blocks) or "Nothing was asked."

    return f"""Write down, briefly, what an editor agreed about one day of a trip. You are
not deciding anything and not adding anything.

THE DAY AND ITS CONTEXT:
{brief}

THE APPROVED STOPS. `slots` has exactly these ids, once each, in this order:
{slot_lines}

THE CONVERSATION:
{transcript}

WHAT THEY AGREED:
{state.consensus}

Rules:

1. SHORT. One sentence each for angle, trip_fit and area. A stop's role is a
   short phrase. Leave a list empty when nothing was agreed for it. Do not
   restate the setup, the stop list or the window.

2. REQUIREMENT OR PREFERENCE. A requirement is a must the operator stated in
   their own words, or a must in the setup (must include, avoid, dietary or
   access needs that are filled in). Everything else is a preference -- and so
   is anything that came only from an accepted suggestion, unless the operator
   called it a must. Never turn a preference into a number or an absolute:
   "walkable" stays "walkable".

3. NO FACTS AND NO INVENTED NEEDS. No venue names, hours, distances or prices.
   Blank dietary or access needs stay blank: write nothing about them.

4. NO RESEARCH INSTRUCTIONS. No checklists, no failure conditions, no "verify
   that". The selection step already knows to check what affects a choice.

5. SAY EACH THING ONCE. A rule for one stop goes on that stop, not also on the
   day.
"""


def _turn_trace(state: GrillState) -> list[AgreementTurn]:
    """The decision trail, taken from the transcript rather than from the model.

    `answer_origin` is the engine's own bookkeeping and nothing downstream may
    be allowed to soften it.
    """
    return [
        AgreementTurn(
            decision=turn.question.ask[:600],
            recommendation=turn.question.recommendation[:4000],
            answer=turn.answer[:4000],
            answer_origin=(
                "accepted_recommendation" if turn.accepted_as_drafted else "operator"
            ),
        )
        for turn in state.turns
    ]


class DirectionExtractionFailed(RuntimeError):
    """The extraction did not produce something the day can be run from."""


def _clipped(items: list[str], limit: int, length: int = 300) -> list[str]:
    return [item[:length] for item in items[:limit]]


def summary_from(payload: Any, state: GrillState, day: DaySnapshotModel) -> DaySummary:
    """Read the reply into the contract, checking it against the real slots.

    A slot id the layout does not have, or a second entry for one it does, is
    dropped; a missing stop is filled from its own layout purpose, which is at
    least true.
    """
    data = _safe_dict(payload)
    if not data:
        raise DirectionExtractionFailed("The extraction returned nothing usable.")
    angle = _safe_str(data.get("angle"))
    if not angle:
        raise DirectionExtractionFailed("The extraction did not say what the day is for.")

    by_id = {slot.id: slot for slot in day.slots}
    written: dict[str, SlotSummary] = {}
    raw_slots = data.get("slots")
    if isinstance(raw_slots, list):
        for entry in raw_slots:
            row = _safe_dict(entry)
            slot_id = _safe_str(row.get("slot_id"))
            if slot_id not in by_id or slot_id in written:
                logger.warning("Summary extraction named slot %r, which is not on this day", slot_id)
                continue
            written[slot_id] = SlotSummary(
                slot_id=slot_id,
                role=_safe_str(row.get("role"))[:300],
                requirements=_clipped(_safe_str_list(row.get("requirements")), 8),
                preferences=_clipped(_safe_str_list(row.get("preferences")), 8),
            )

    return DaySummary(
        day_id=day.id,
        angle=angle[:600],
        trip_fit=_safe_str(data.get("trip_fit"))[:600],
        area=_safe_str(data.get("area"))[:600],
        requirements=_clipped(_safe_str_list(data.get("requirements")), 12),
        preferences=_clipped(_safe_str_list(data.get("preferences")), 12),
        avoid=_clipped(_safe_str_list(data.get("avoid")), 12),
        slots=[
            written.get(slot.id, SlotSummary(slot_id=slot.id, role=(slot.purpose or slot.label)[:300]))
            for slot in day.slots
        ],
        agreement_trace=_turn_trace(state),
    )


def extract(
    *, state: GrillState, brief: str, day: DaySnapshotModel, llm
) -> DaySummary:
    """One structured extraction over the whole agreement."""
    if state.status != "agreed":
        raise ValueError("This day's interview has not agreed anything yet.")
    parsed, raw = llm.invoke_json(
        job_id=DIRECTION_JOB,
        prompt=build_prompt(state, brief, day),
        model_name=None,
        schema=SUMMARY_SCHEMA,
        max_tokens=DIRECTION_MAX_TOKENS,
        # Writing down what was already decided. Nothing here should vary run
        # to run.
        temperature=0.0,
    )
    try:
        return summary_from(parsed, state, day)
    except DirectionExtractionFailed:
        logger.warning("Summary extraction was unusable: %s", (raw or "")[:500])
        raise
