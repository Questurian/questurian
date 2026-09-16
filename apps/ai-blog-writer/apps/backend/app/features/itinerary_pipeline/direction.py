"""Turning an agreed conversation into the object research actually runs from.

A consensus is a paragraph. It is what the operator agreed to and it is the
right thing to agree to -- but a paragraph cannot be checked against the slot
list, cannot be hashed into an export, and cannot be diffed when the day
changes. So a second, dedicated call reads the whole conversation and writes
the same agreement as a structured object.

Two rules keep that honest:

**The candidate is shown before it is accepted.** Extraction is a model call
and model calls are wrong sometimes. The operator accepts the object they were
shown, by revision number -- never "whatever the newest extraction happens to
be", because a second extraction landing between the render and the click would
be accepted without having been read.

**A failed extraction leaves the conversation alone.** The interview is the
expensive part and it is intact; the retry is another extraction, not another
interview.
"""

from __future__ import annotations

import logging
from typing import Any

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.support import _safe_dict, _safe_str, _safe_str_list
from .contracts import (
    AgreementTurn,
    DayDirection,
    DaySnapshotModel,
    DirectionChangePolicy,
    DirectionContinuity,
    DirectionGeography,
    DirectionRhythm,
    SlotDirection,
)

logger = logging.getLogger(__name__)

DIRECTION_JOB = "itinerary.day_direction"

# Deliberately generous. This is one structured object over a whole
# conversation, and a direction that truncates mid-slot is a direction the
# operator would accept without the last two stops in it.
DIRECTION_MAX_TOKENS = 8_192


def _string_list(name: str, description: str, maximum: int = 20) -> dict[str, Any]:
    return {
        "type": "array",
        "description": description,
        "maxItems": maximum,
        "items": {"type": "string"},
    }


DIRECTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "promise": {
            "type": "string",
            "description": "One sentence: what this day promises a reader.",
        },
        "trip_role": {
            "type": "string",
            "description": "What this day contributes to the trip as a whole.",
        },
        "anchors": _string_list(
            "anchors",
            "The experiences that drive selection. Empty list is valid and means "
            "no single anchor.",
            10,
        ),
        "geography": {
            "type": "object",
            "properties": {
                "required_area": {"type": "string"},
                "starting_point": {"type": "string"},
                "progression": {"type": "string"},
                "transfer_tolerance": {"type": "string"},
                "avoid_today": _string_list("avoid_today", "Areas this day stays out of."),
            },
            "required": [
                "required_area",
                "starting_point",
                "progression",
                "transfer_tolerance",
                "avoid_today",
            ],
        },
        "rhythm": {
            "type": "object",
            "properties": {
                "effort": {"type": "string"},
                "meal_balance": {"type": "string"},
                "rest_policy": {"type": "string"},
                "rest_minutes_minimum": {
                    "type": "integer",
                    "description": "Minimum unallocated recovery in minutes. 0 if none agreed.",
                },
                "optionality": {"type": "string"},
            },
            "required": [
                "effort",
                "meal_balance",
                "rest_policy",
                "rest_minutes_minimum",
                "optionality",
            ],
        },
        "constraints": _string_list(
            "constraints",
            "Hard constraints for the WHOLE day agreed in the conversation, one per "
            "entry. A requirement of one stop belongs in that stop instead.",
            30,
        ),
        "slot_directions": {
            "type": "array",
            "description": "One entry per approved stop, in the approved order.",
            "maxItems": 40,
            "items": {
                "type": "object",
                "properties": {
                    "slot_id": {
                        "type": "string",
                        "description": "The exact id from the approved layout.",
                    },
                    "role": {"type": "string"},
                    "must_have": _string_list("must_have", "Required criteria.", 12),
                    "nice_to_have": _string_list("nice_to_have", "Preferences.", 12),
                    "exclusions": _string_list("exclusions", "What this stop must not be.", 12),
                },
                "required": ["slot_id", "role", "must_have", "nice_to_have", "exclusions"],
            },
        },
        "continuity": {
            "type": "object",
            "properties": {
                "covered_elsewhere": _string_list(
                    "covered_elsewhere", "What other days already cover.", 30
                ),
                "reserved_for_later": _string_list(
                    "reserved_for_later", "What later days have tentatively reserved.", 30
                ),
                "deliberate_overlaps": _string_list(
                    "deliberate_overlaps", "Overlaps that were explained and kept.", 20
                ),
            },
            "required": [
                "covered_elsewhere",
                "reserved_for_later",
                "deliberate_overlaps",
            ],
        },
        "change_policy": {
            "type": "object",
            "properties": {
                "must_remain": {"type": "string"},
                "may_be_proposed": {"type": "string"},
                "optional_slots_may_be_omitted": {"type": "boolean"},
            },
            "required": [
                "must_remain",
                "may_be_proposed",
                "optional_slots_may_be_omitted",
            ],
        },
        "fails_if": _string_list("fails_if", "What would make this day wrong.", 20),
        "research_checklist": _string_list(
            "research_checklist",
            "Only the unanswered facts a decision depends on. Not a restatement "
            "of a requirement already written elsewhere.",
            30,
        ),
    },
    "required": [
        "promise",
        "trip_role",
        "anchors",
        "geography",
        "rhythm",
        "constraints",
        "slot_directions",
        "continuity",
        "change_policy",
        "fails_if",
        "research_checklist",
    ],
}


def build_prompt(state: GrillState, brief: str, day: DaySnapshotModel) -> str:
    slot_lines = "\n".join(
        f"  - {slot.id} — {slot.label or slot.kind} ({slot.kind}"
        + (", OPTIONAL" if slot.optional else "")
        + ")"
        for slot in day.slots
    )
    transcript_blocks = []
    for index, turn in enumerate(state.turns, start=1):
        transcript_blocks.append(
            f"Q{index}. {turn.question.ask}\n"
            f"Suggested answer: {turn.question.recommendation}\n"
            + (f"Pushback: {turn.question.pushback}\n" if turn.question.pushback else "")
            + f"Their answer: {turn.answer}\n"
            + (
                "They accepted the suggestion unchanged — this is the interviewer's "
                "wording, not theirs.\n"
                if turn.accepted_as_drafted
                else "They wrote this themselves.\n"
            )
        )
    transcript = "\n".join(transcript_blocks) or "Nothing was asked."

    return f"""You are writing down an agreement that has already been reached. You are
not deciding anything and you are not improving anything. Everything below was
settled in a conversation between an editor and a travel writer; your job is to
put it into a structured object without losing it and without adding to it.

THE DAY AND ITS CONTEXT:
{brief}

THE APPROVED STOPS. `slot_directions` must contain exactly these ids, once
each, in this order:
{slot_lines}

THE CONVERSATION:
{transcript}

WHAT THEY AGREED, PLAYED BACK AND ACCEPTED:
{state.consensus}

Rules, in order of how badly each one bites:

1. ADD NO FACTS. Nobody looked anything up. There are no venue names, no
   opening hours, no distances and no prices anywhere in this agreement, and
   there must be none in what you write. Anything factual belongs in
   `research_checklist` as a question.

2. EVERY APPROVED STOP GETS AN ENTRY, including the free-time and travel ones.
   A free-time stop's requirements are about duration and purpose, not about
   finding a venue. A travel stop's are about endpoints, mode and how long the
   transfer may take. Never write "find a place" for either.

3. USE THEIR WORDS WHERE THEY USED THEM. Where the conversation settled
   something in a particular phrase, keep the phrase. Where it settled
   something implicitly, write the plainest version of it.

4. LEAVE UNKNOWNS UNKNOWN. If dietary or access needs were never specified,
   say so as unspecified; do not write "none". An empty list is a real answer
   and is better than a guess.

5. SAY EACH THING ONCE, WHERE IT BELONGS. A rule for the whole day goes in
   `constraints`. A rule for one stop goes in that stop's `must_have` or
   `exclusions`, and not in `constraints` as well. Where the day happens and
   how it moves goes in `geography`. `change_policy` says what may change, not
   the requirements again, and `fails_if` names failures that are not already
   the opposite of a listed requirement. The research step reads every line,
   and a requirement written four times is researched four times.

6. NEVER DROP AN AGREED MEANING TO SAVE SPACE. Saying something once is not
   leaving it out. If an accepted requirement fits nowhere else, keep it in
   `constraints`.

7. DO NOT HARDEN PREFERENCES. Write a number or an absolute ("every", "never",
   "at most") only when the conversation used it or the operator accepted it.
   Count rides separately from walks: "one transfer" is one ride.

8. `research_checklist` holds only the unanswered facts a decision depends on:
   whether a place is open on the days that matter, whether a walk is really
   walkable, whether a place is the right branch. It does not repeat a
   requirement as a question.
"""


def _turn_trace(state: GrillState) -> list[AgreementTurn]:
    """The decision trail, taken from the transcript rather than from the model.

    Asking the extraction to reproduce the conversation would be paying twice
    for text already stored, and would give it a chance to disagree with the
    record. `answer_origin` in particular is the engine's own bookkeeping and
    nothing downstream may be allowed to soften it.
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


def direction_from(payload: Any, state: GrillState, day: DaySnapshotModel) -> DayDirection:
    """Read the reply into the contract, checking it against the real slots.

    Slot references are the one thing that cannot be forgiving. A direction
    that names a slot the layout does not have, or misses one it does, would
    be exported as the requirements for a day that is not this day.
    """
    data = _safe_dict(payload)
    if not data:
        raise DirectionExtractionFailed("The extraction returned nothing usable.")

    geography = _safe_dict(data.get("geography"))
    rhythm = _safe_dict(data.get("rhythm"))
    continuity = _safe_dict(data.get("continuity"))
    change = _safe_dict(data.get("change_policy"))

    by_id = {slot.id: slot for slot in day.slots}
    raw_slots = data.get("slot_directions")
    written: dict[str, SlotDirection] = {}
    if isinstance(raw_slots, list):
        for entry in raw_slots:
            row = _safe_dict(entry)
            slot_id = _safe_str(row.get("slot_id"))
            if slot_id not in by_id or slot_id in written:
                # An id the layout does not have, or a second entry for one it
                # does. Dropped rather than raised: the rest of the extraction
                # is usually fine, and the gap is filled below with the slot's
                # own purpose, which is at least true.
                logger.warning(
                    "Direction extraction returned slot id %r, which is not one of "
                    "this day's stops",
                    slot_id,
                )
                continue
            written[slot_id] = SlotDirection(
                slot_id=slot_id,
                role=_safe_str(row.get("role")),
                must_have=_safe_str_list(row.get("must_have"))[:12],
                nice_to_have=_safe_str_list(row.get("nice_to_have"))[:12],
                exclusions=_safe_str_list(row.get("exclusions"))[:12],
            )

    slot_directions = [
        written.get(
            slot.id,
            SlotDirection(
                slot_id=slot.id,
                role=slot.purpose or slot.label,
                must_have=list(slot.cues),
                exclusions=list(slot.exclusions),
            ),
        )
        for slot in day.slots
    ]

    promise = _safe_str(data.get("promise"))
    if not promise:
        raise DirectionExtractionFailed(
            "The extraction did not say what the day promises."
        )

    minimum = rhythm.get("rest_minutes_minimum")
    return DayDirection(
        day_id=day.id,
        promise=promise,
        trip_role=_safe_str(data.get("trip_role")),
        anchors=_safe_str_list(data.get("anchors"))[:10],
        geography=DirectionGeography(
            required_area=_safe_str(geography.get("required_area")),
            starting_point=_safe_str(geography.get("starting_point")),
            progression=_safe_str(geography.get("progression")),
            transfer_tolerance=_safe_str(geography.get("transfer_tolerance")),
            avoid_today=_safe_str_list(geography.get("avoid_today"))[:20],
        ),
        rhythm=DirectionRhythm(
            effort=_safe_str(rhythm.get("effort")),
            meal_balance=_safe_str(rhythm.get("meal_balance")),
            rest_policy=_safe_str(rhythm.get("rest_policy")),
            rest_minutes_minimum=(
                int(minimum) if isinstance(minimum, (int, float)) and minimum >= 0 else None
            ),
            optionality=_safe_str(rhythm.get("optionality")),
        ),
        constraints=_safe_str_list(data.get("constraints"))[:30],
        slot_directions=slot_directions,
        continuity=DirectionContinuity(
            covered_elsewhere=_safe_str_list(continuity.get("covered_elsewhere"))[:30],
            reserved_for_later=_safe_str_list(continuity.get("reserved_for_later"))[:30],
            deliberate_overlaps=_safe_str_list(continuity.get("deliberate_overlaps"))[:20],
        ),
        change_policy=DirectionChangePolicy(
            must_remain=_safe_str(change.get("must_remain")),
            may_be_proposed=_safe_str(change.get("may_be_proposed")),
            optional_slots_may_be_omitted=bool(
                change.get("optional_slots_may_be_omitted", True)
            ),
        ),
        fails_if=_safe_str_list(data.get("fails_if"))[:20],
        research_checklist=_safe_str_list(data.get("research_checklist"))[:30],
        agreement_trace=_turn_trace(state),
    )


def extract(
    *, state: GrillState, brief: str, day: DaySnapshotModel, llm
) -> DayDirection:
    """One structured extraction over the whole agreement."""
    if state.status != "agreed":
        raise ValueError("This day's interview has not agreed anything yet.")
    parsed, raw = llm.invoke_json(
        job_id=DIRECTION_JOB,
        prompt=build_prompt(state, brief, day),
        model_name=None,
        schema=DIRECTION_SCHEMA,
        max_tokens=DIRECTION_MAX_TOKENS,
        # Writing down what was already decided. Nothing here should vary run
        # to run.
        temperature=0.0,
    )
    try:
        return direction_from(parsed, state, day)
    except DirectionExtractionFailed:
        logger.warning("Direction extraction was unusable: %s", (raw or "")[:500])
        raise
