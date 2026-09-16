"""The compact answer a research call returns (`itinerary-day-research-v2`).

The v1 answer asked the model to write the day four times: reader copy, a
`whyHere`, a `selectionReason` and a `whatToDo` list, then a claim graph with
ids it had to invent and cross-reference by hand, then a feasibility essay per
topic, then the same doubts again as limitations, editor notes and proposed
changes. The audited seven-stop day came back at about 41,000 characters and a
large share of it restated itself.

This asks for the day once:

- the article: a title, an introduction and one paragraph per stop
- per stop, the facts it was chosen, timed and described on, each with the
  one page that supports it -- attached to the stop, so there are no ids
- the journeys between the stops, and the rests
- one record per distinct concern, marked blocking or not
- anything the next day genuinely has to know

Everything else the saved day carries is derived by `research_adapter.py`.

The same asymmetry as v1 holds (see `day_schema.py`): the REQUEST names every
key, because a key that is merely optional is a key a model skips, and the
values are permissive. ACCEPTANCE is the pydantic models below, where almost
everything has a default and what a row must carry is a semantic question
`validation.py` answers in words.

The schema is generated per export, because the slot ids and the categories a
stop may carry are this day's own. It is written without `$ref`: the installed
CLI's handling of local references was never measured, and inlining the one
repeated item costs a few hundred characters.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field

from .contracts import (
    ItineraryModel,
    RESEARCH_WIRE_VERSION,
    SlotSnapshotModel,
)

TRANSFER_MODES = ["walk", "public_transport", "taxi", "car", "train", "bus", "unspecified"]

# Travel endpoints beyond the day's own stops. `base` is a return in the middle
# of the day; the other two are its ends. The hotel is usually unknown, and a
# model with no word for "where they are staying" invents one.
BASE_ENDPOINTS = ["base_start", "base", "base_end"]

# Identity fields a pasted answer has to echo. An in-app call has them stamped.
IDENTITY_FIELDS = ("contractVersion", "workspaceId", "dayId", "exportId", "inputHash")


# ------------------------------------------------------------ the models --


class WireModel(ItineraryModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class WireEvidence(WireModel):
    """One fact, and the page it came from. No id: it belongs to its row."""

    fact: str = ""
    url: str = ""
    title: str = ""


class WireStop(WireModel):
    slot_id: str = Field(alias="slotId", min_length=1, max_length=120)
    status: Literal["selected", "unresolved", "omitted_optional"] = "unresolved"
    name: str | None = None
    category: str | None = None
    address_or_meeting_point: str | None = Field(default=None, alias="addressOrMeetingPoint")
    area: str | None = None
    start_minutes: int | None = Field(default=None, alias="startMinutes", ge=0, le=2880)
    duration_minutes: int | None = Field(default=None, alias="durationMinutes", ge=0, le=1440)
    reader_copy: str = Field(default="", alias="readerCopy")
    practical_notes: list[str] = Field(default_factory=list, alias="practicalNotes", max_length=20)
    evidence: list[WireEvidence] = Field(default_factory=list, max_length=30)
    unresolved_reason: str | None = Field(default=None, alias="unresolvedReason")


class WireTransfer(WireModel):
    from_ref: str = Field(alias="from", min_length=1, max_length=120)
    to_ref: str = Field(alias="to", min_length=1, max_length=120)
    mode: Literal[
        "walk", "public_transport", "taxi", "car", "train", "bus", "unspecified"
    ] = "unspecified"
    minutes_min: int | None = Field(default=None, alias="minutesMin", ge=0, le=1440)
    minutes_max: int | None = Field(default=None, alias="minutesMax", ge=0, le=1440)
    basis: Literal["sourced", "planning_estimate", "unknown"] = "unknown"
    note: str = ""
    evidence: list[WireEvidence] = Field(default_factory=list, max_length=10)


class WireRest(WireModel):
    after_slot_id: str = Field(alias="afterSlotId", min_length=1, max_length=120)
    before_slot_id: str = Field(alias="beforeSlotId", min_length=1, max_length=120)
    minutes: int = Field(default=0, ge=0, le=1440)
    location_policy: Literal["stay_nearby", "named_location", "return_to_base", "unknown"] = (
        Field(default="unknown", alias="locationPolicy")
    )
    description: str = ""


class WireIssue(WireModel):
    slot_id: str | None = Field(default=None, alias="slotId", max_length=120)
    blocking: bool = False
    text: str = ""
    proposed_change: str | None = Field(default=None, alias="proposedChange")


class WireAnswer(WireModel):
    """A compact answer, after its identity has been checked or stamped."""

    contract_version: Literal["itinerary-day-research-v2"] = Field(
        default=RESEARCH_WIRE_VERSION, alias="contractVersion"
    )
    workspace_id: str = Field(alias="workspaceId", min_length=1, max_length=64)
    day_id: str = Field(alias="dayId", min_length=1, max_length=120)
    export_id: str = Field(alias="exportId", min_length=1, max_length=64)
    input_hash: str = Field(alias="inputHash", min_length=1, max_length=128)
    title: str = ""
    day_intro: str = Field(default="", alias="dayIntro")
    stops: list[WireStop] = Field(default_factory=list, max_length=60)
    transfers: list[WireTransfer] = Field(default_factory=list, max_length=80)
    rest_windows: list[WireRest] = Field(default_factory=list, alias="restWindows", max_length=20)
    issues: list[WireIssue] = Field(default_factory=list, max_length=60)
    next_day_notes: list[str] = Field(default_factory=list, alias="nextDayNotes", max_length=20)


KNOWN_TOP_LEVEL = {
    *IDENTITY_FIELDS,
    "title", "dayIntro", "stops", "transfers", "restWindows", "issues", "nextDayNotes",
}
KNOWN_STOP_FIELDS = {
    "slotId", "status", "name", "category", "addressOrMeetingPoint", "area",
    "startMinutes", "durationMinutes", "readerCopy", "practicalNotes", "evidence",
    "unresolvedReason",
}


def unknown_wire_fields(payload: dict[str, Any]) -> list[str]:
    """Keys the compact contract has no place for. Reported, never refused."""
    found = {key for key in payload if key not in KNOWN_TOP_LEVEL}
    stops = payload.get("stops")
    if isinstance(stops, list):
        for stop in stops:
            if isinstance(stop, dict):
                found |= {f"stops.{key}" for key in stop if key not in KNOWN_STOP_FIELDS}
    return sorted(found)


# ------------------------------------------------------------ the schema --


def _text(description: str = "") -> dict[str, Any]:
    return {"type": "string", **({"description": description} if description else {})}


def _nullable(kind: str, description: str = "") -> dict[str, Any]:
    return {"type": [kind, "null"], **({"description": description} if description else {})}


def _strings(description: str = "") -> dict[str, Any]:
    return {
        "type": "array",
        "items": {"type": "string"},
        **({"description": description} if description else {}),
    }


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def _evidence(description: str) -> dict[str, Any]:
    return {
        "type": "array",
        "description": description,
        "items": _object(
            {
                "fact": _text(),
                "url": _text("A page you read."),
                "title": _text(),
            }
        ),
    }


def build_wire_schema(
    *,
    workspace_id: str,
    day_id: str,
    export_id: str,
    input_hash: str,
    slots: list[SlotSnapshotModel],
) -> dict[str, Any]:
    """The compact schema for exactly this day, identity included.

    `research.schema_for_call` removes the identity for an in-app call, which
    has it stamped instead.
    """
    slot_ids = [slot.id for slot in slots]
    categories = sorted(
        {category for slot in slots for category in (slot.allowed_categories or [])}
    ) or ["dining", "attractions", "nightlife"]
    endpoints = [*slot_ids, *BASE_ENDPOINTS]

    stop = _object(
        {
            "slotId": {"type": "string", "enum": slot_ids},
            "status": {"type": "string", "enum": ["selected", "unresolved", "omitted_optional"]},
            "name": _nullable("string"),
            "category": {"type": ["string", "null"], "enum": [*categories, None]},
            "addressOrMeetingPoint": _nullable("string"),
            "area": _nullable("string"),
            "startMinutes": {
                "type": ["integer", "null"],
                "minimum": 0,
                "maximum": 2880,
                "description": "Minutes after midnight; over 1440 is next day.",
            },
            "durationMinutes": {"type": ["integer", "null"], "minimum": 0, "maximum": 1440},
            "readerCopy": _text("Reader paragraph; empty unless selected."),
            "practicalNotes": _strings("Hours, booking, cost, access: sourced conditions."),
            "evidence": _evidence("Facts this stop was chosen, timed or described on."),
            "unresolvedReason": _nullable("string"),
        }
    )

    return _object(
        {
            "contractVersion": {"const": RESEARCH_WIRE_VERSION},
            "workspaceId": {"const": workspace_id},
            "dayId": {"const": day_id},
            "exportId": {"const": export_id},
            "inputHash": {"const": input_hash},
            "title": _text(),
            "dayIntro": _text(),
            "stops": {
                "type": "array",
                "minItems": len(slot_ids),
                "maxItems": len(slot_ids),
                "description": "One row per approved stop, in order.",
                "items": stop,
            },
            "transfers": {
                "type": "array",
                "description": "Journeys between consecutive selected stops.",
                "items": _object(
                    {
                        "from": {"type": "string", "enum": endpoints},
                        "to": {"type": "string", "enum": endpoints},
                        "mode": {"type": "string", "enum": TRANSFER_MODES},
                        "minutesMin": {"type": ["integer", "null"], "minimum": 0},
                        "minutesMax": {"type": ["integer", "null"], "minimum": 0},
                        "basis": {
                            "type": "string",
                            "enum": ["sourced", "planning_estimate", "unknown"],
                        },
                        "note": _text(),
                        "evidence": _evidence("Only for a sourced time."),
                    }
                ),
            },
            "restWindows": {
                "type": "array",
                "items": _object(
                    {
                        "afterSlotId": {"type": "string", "enum": slot_ids},
                        "beforeSlotId": {"type": "string", "enum": slot_ids},
                        "minutes": {"type": "integer", "minimum": 0},
                        "locationPolicy": {
                            "type": "string",
                            "enum": ["stay_nearby", "named_location", "return_to_base", "unknown"],
                        },
                        "description": _text(),
                    }
                ),
            },
            "issues": {
                "type": "array",
                "description": "One record per distinct concern.",
                "items": _object(
                    {
                        "slotId": {"type": ["string", "null"], "enum": [*slot_ids, None]},
                        "blocking": {"type": "boolean"},
                        "text": _text(),
                        "proposedChange": _nullable("string"),
                    }
                ),
            },
            "nextDayNotes": _strings("New consequences for later days only."),
        }
    )
