"""The answer a day's selection returns: places, reasons, and nothing to write.

The article-shaped versions asked one call to research a day, prove every
choice and write it for readers. This asks it to choose (ADR 0045):

- one pick per approved stop, with one short reason and, at most, one
  practical note that changes whether it works (a closing day, a booking)
- the pages it relied on, kept quietly with the pick
- a two or three sentence overview of how the day fits together, and one
  sentence on how it fits the trip
- the stay it recommends, when the operator asked for a recommendation
- journey estimates between consecutive stops, labelled as estimates
- questions, only where a firm requirement cannot be met as stated

The same asymmetry as before holds: the REQUEST names every key, because a key
that is merely optional is a key a model skips, and the values are permissive.
ACCEPTANCE is the models below, where almost everything has a default and what
a row must carry is a question `validation.py` answers in words.

The schema is generated per export from this day's own slot ids and
categories, without `$ref`.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field

from .contracts import ItineraryModel, SlotSnapshotModel

SELECTION_CONTRACT_VERSION = "itinerary-day-selection-v1"

TRANSFER_MODES = ["walk", "public_transport", "taxi", "car", "train", "bus", "unspecified"]

# Journey ends beyond the day's own stops: where the day starts and where the
# traveller sleeps that night. They may be the same place, or not.
STAY_ENDPOINTS = ["stay_start", "stay_end"]

# Identity fields a pasted answer has to echo. An in-app call has them stamped.
IDENTITY_FIELDS = ("contractVersion", "workspaceId", "dayId", "exportId", "inputHash")


class SelectionModel(ItineraryModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class SelectionSource(SelectionModel):
    url: str = ""
    title: str = ""


class SelectionPick(SelectionModel):
    slot_id: str = Field(alias="slotId", min_length=1, max_length=120)
    status: Literal["selected", "unresolved", "omitted_optional"] = "unresolved"
    name: str | None = None
    category: str | None = None
    area: str | None = None
    address: str | None = None
    # Why this place, in a sentence. For an unresolved stop: why it is open.
    reason: str = ""
    note: str = ""
    sources: list[SelectionSource] = Field(default_factory=list, max_length=12)
    # Filled in by the app, never asked of the model.
    maps_url: str | None = Field(default=None, alias="mapsUrl")
    chosen_by: Literal["ai", "editor"] = Field(default="ai", alias="chosenBy")


class SelectionStay(SelectionModel):
    stay_id: str = Field(default="", alias="stayId", max_length=120)
    name: str = ""
    area: str = ""
    reason: str = ""
    sources: list[SelectionSource] = Field(default_factory=list, max_length=6)
    maps_url: str | None = Field(default=None, alias="mapsUrl")


class SelectionJourney(SelectionModel):
    from_ref: str = Field(alias="from", min_length=1, max_length=120)
    to_ref: str = Field(alias="to", min_length=1, max_length=120)
    mode: Literal[
        "walk", "public_transport", "taxi", "car", "train", "bus", "unspecified"
    ] = "unspecified"
    # An estimate, always. Null when unknown -- or when a swap moved one end.
    minutes: int | None = Field(default=None, ge=0, le=1440)
    note: str = ""


class SelectionQuestion(SelectionModel):
    slot_id: str | None = Field(default=None, alias="slotId", max_length=120)
    question: str = ""
    options: list[str] = Field(default_factory=list, max_length=6)


class DaySelection(SelectionModel):
    """One day's proposal, as the app saves it."""

    contract_version: Literal["itinerary-day-selection-v1"] = Field(
        default=SELECTION_CONTRACT_VERSION, alias="contractVersion"
    )
    workspace_id: str = Field(alias="workspaceId", min_length=1, max_length=64)
    day_id: str = Field(alias="dayId", min_length=1, max_length=120)
    export_id: str = Field(alias="exportId", min_length=1, max_length=64)
    input_hash: str = Field(alias="inputHash", min_length=1, max_length=128)
    overview: str = ""
    trip_fit: str = Field(default="", alias="tripFit")
    stay: SelectionStay | None = None
    picks: list[SelectionPick] = Field(default_factory=list, max_length=60)
    journeys: list[SelectionJourney] = Field(default_factory=list, max_length=80)
    questions: list[SelectionQuestion] = Field(default_factory=list, max_length=20)


KNOWN_TOP_LEVEL = {
    *IDENTITY_FIELDS,
    "overview", "tripFit", "stay", "picks", "journeys", "questions",
}
KNOWN_PICK_FIELDS = {
    "slotId", "status", "name", "category", "area", "address", "reason", "note",
    "sources", "mapsUrl", "chosenBy",
}


def unknown_fields(payload: dict[str, Any]) -> list[str]:
    """Keys this contract has no place for. Reported, never refused."""
    found = {key for key in payload if key not in KNOWN_TOP_LEVEL}
    picks = payload.get("picks")
    if isinstance(picks, list):
        for pick in picks:
            if isinstance(pick, dict):
                found |= {f"picks.{key}" for key in pick if key not in KNOWN_PICK_FIELDS}
    return sorted(found)


# ------------------------------------------------------------ the schema --


def _text() -> dict[str, Any]:
    return {"type": "string"}


def _nullable(kind: str) -> dict[str, Any]:
    return {"type": [kind, "null"]}


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def _sources() -> dict[str, Any]:
    return {
        "type": "array",
        "description": "Pages you read that this rests on.",
        "items": _object({"url": _text(), "title": _text()}),
    }


def build_schema(
    *,
    workspace_id: str,
    day_id: str,
    export_id: str,
    input_hash: str,
    slots: list[SlotSnapshotModel],
    stay_wanted: bool,
) -> dict[str, Any]:
    """The schema for exactly this day, identity included.

    `stay` is an object only when this request asks for a stay to be
    recommended; otherwise it must be null, so a model cannot volunteer a
    hotel the operator already chose.
    """
    slot_ids = [slot.id for slot in slots]
    categories = sorted(
        {category for slot in slots for category in (slot.allowed_categories or [])}
    ) or ["dining", "attractions", "nightlife"]
    endpoints = [*slot_ids, *STAY_ENDPOINTS]

    pick = _object(
        {
            "slotId": {"type": "string", "enum": slot_ids},
            "status": {"type": "string", "enum": ["selected", "unresolved", "omitted_optional"]},
            "name": _nullable("string"),
            "category": {"type": ["string", "null"], "enum": [*categories, None]},
            "area": _nullable("string"),
            "address": _nullable("string"),
            "reason": {"type": "string", "description": "One sentence."},
            "note": {"type": "string", "description": "Empty unless it changes whether this works."},
            "sources": _sources(),
        }
    )
    stay = (
        _object(
            {
                "stayId": _text(),
                "name": _text(),
                "area": _text(),
                "reason": _text(),
                "sources": _sources(),
            }
        )
        if stay_wanted
        else {"type": "null"}
    )

    return _object(
        {
            "contractVersion": {"const": SELECTION_CONTRACT_VERSION},
            "workspaceId": {"const": workspace_id},
            "dayId": {"const": day_id},
            "exportId": {"const": export_id},
            "inputHash": {"const": input_hash},
            "overview": {"type": "string", "description": "Two or three sentences."},
            "tripFit": {"type": "string", "description": "One sentence."},
            "stay": stay,
            "picks": {
                "type": "array",
                "minItems": len(slot_ids),
                "maxItems": len(slot_ids),
                "description": "One per stop, in order.",
                "items": pick,
            },
            "journeys": {
                "type": "array",
                "description": "Estimates between consecutive stops.",
                "items": _object(
                    {
                        "from": {"type": "string", "enum": endpoints},
                        "to": {"type": "string", "enum": endpoints},
                        "mode": {"type": "string", "enum": TRANSFER_MODES},
                        "minutes": _nullable("integer"),
                        "note": _text(),
                    }
                ),
            },
            "questions": {
                "type": "array",
                "description": "Only conflicts with a firm requirement.",
                "items": _object(
                    {
                        "slotId": {"type": ["string", "null"], "enum": [*slot_ids, None]},
                        "question": _text(),
                        "options": {"type": "array", "items": _text()},
                    }
                ),
            },
        }
    )


def call_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """The schema without the identity, which an in-app call has stamped."""
    trimmed = {**schema, "properties": dict(schema.get("properties", {}))}
    for name in IDENTITY_FIELDS:
        trimmed["properties"].pop(name, None)
    trimmed["required"] = [
        name for name in schema.get("required", []) if name not in IDENTITY_FIELDS
    ]
    return trimmed
