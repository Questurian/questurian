"""The JSON Schema the external model is handed, generated per export.

The dry run's schema had six literal slot ids and `minItems: 6` written into
it. That was right for one fixture and cannot be a production contract: this
feature has days of three stops and days of nine, days with free time and
travel in them, and days whose ids were minted in a browser ten minutes ago.

So the schema is built from the export's own slot list. The ids are an enum,
the row count is exactly the number of exported stops, and the categories a
stop may carry are the ones its approved layout allows. A model that returns a
seventh row, or a row for a slot that is not in this day, is refused by the
schema before anything has to reason about it.

This schema is used two ways, and that is why it is generated rather than
written out. It is embedded in the copyable prompt as text, and it is handed to
the Claude CLI as `--json-schema`, where the CLI validates the reply against it
before this app ever sees it.

**What this asks for and what the app accepts are deliberately different**, and
that asymmetry is the whole design. This schema is a REQUEST, and a request can
be demanding: it names every key, because the CLI enforces them and a key that
is merely optional is a key a model skips. The first live run proved it — with
`readerCopy` optional, sixty turns of real research came back with every
address, every source and no prose at all.

So every field is required and the VALUES are permissive: null, empty string,
empty array. An unresolved stop writes `"readerCopy": ""` and has still had to
think about it, which is exactly the difference between a field that is asked
for and a field that is hoped for.

Acceptance is the other half, and it lives in `contracts.py`, where almost
nothing is required. A person pasting by hand is not a transport with a
validator attached, and refusing their day because it lacks a key the app does
not need would be strictness that protects nothing. What a row must actually
carry depends on its kind and its status — "a selected place or experience
needs an address or a meeting point" — and `validation.py` asks that afterwards,
in words an operator can act on, on both paths.
"""

from __future__ import annotations

from typing import Any

from .contracts import RESULT_CONTRACT_VERSION, SlotSnapshotModel

_TRANSFER_MODES = [
    "walk",
    "public_transport",
    "taxi",
    "car",
    "train",
    "bus",
    "unspecified",
]


def _strings(description: str) -> dict[str, Any]:
    return {"type": "array", "description": description, "items": {"type": "string"}}


def build_response_schema(
    *,
    workspace_id: str,
    day_id: str,
    export_id: str,
    input_hash: str,
    slots: list[SlotSnapshotModel],
) -> dict[str, Any]:
    slot_ids = [slot.id for slot in slots]
    categories = sorted(
        {
            category
            for slot in slots
            for category in (slot.allowed_categories or [])
        }
    ) or ["dining", "attractions", "nightlife"]
    # Transfer endpoints are slot ids plus the two ends of the day. `base` is
    # named rather than described because the hotel is usually unknown, and a
    # model with no word for "the place they are staying" invents one.
    endpoints = [*slot_ids, "base_start", "base_end"]

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": False,
        "required": [
            "contractVersion",
            "workspaceId",
            "dayId",
            "exportId",
            "inputHash",
            "research",
            "status",
            "title",
            "dayIntro",
            "tripRole",
            "scheduleLabel",
            "stops",
            "transfers",
            "restWindows",
            "sources",
            "claims",
            "feasibility",
            "proposedChanges",
            "tripMemory",
            "editorNotes",
        ],
        "properties": {
            "contractVersion": {"const": RESULT_CONTRACT_VERSION},
            "workspaceId": {"const": workspace_id},
            "dayId": {"const": day_id},
            "exportId": {"const": export_id},
            "inputHash": {
                "const": input_hash,
                "description": "Echo this back exactly. It is how the app knows which "
                "request this answers.",
            },
            "research": {
                "type": "object",
                "additionalProperties": False,
                "required": ["performedAt", "browsingUsed", "limitations"],
                "properties": {
                    "performedAt": {
                        "type": ["string", "null"],
                        "description": "ISO date you did the research, or null.",
                    },
                    "browsingUsed": {"type": "boolean"},
                    "limitations": _strings(
                        "Everything you could not check. Be specific and complete; "
                        "this is read by a person before the day is used."
                    ),
                },
            },
            "status": {
                "type": "string",
                "enum": [
                    "ready_for_editor_review",
                    "needs_decision",
                    "insufficient_evidence",
                ],
                "description": "Your own judgement. The app records it as yours and "
                "derives its own state from the packet.",
            },
            "title": {"type": "string"},
            "dayIntro": {"type": "string"},
            "tripRole": {"type": "string"},
            "scheduleLabel": {"type": "string"},
            "stops": {
                "type": "array",
                "minItems": len(slot_ids),
                "maxItems": len(slot_ids),
                "description": "Exactly one row per approved stop, in the approved order.",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    # Every key, because a key that is merely optional is a
                    # key a model skips -- measured. An unresolved row fills
                    # them with null and empty, which is an answer.
                    "required": [
                        "slotId",
                        "status",
                        "name",
                        "category",
                        "addressOrMeetingPoint",
                        "area",
                        "mapsUrl",
                        "startMinutes",
                        "durationMinutes",
                        "whyHere",
                        "readerCopy",
                        "whatToDo",
                        "practicalNotes",
                        "claimIds",
                        "selectionReason",
                        "unresolvedReason",
                    ],
                    "properties": {
                        "slotId": {"type": "string", "enum": slot_ids},
                        "status": {
                            "type": "string",
                            "enum": ["selected", "unresolved", "omitted_optional"],
                        },
                        "name": {"type": ["string", "null"]},
                        "category": {
                            "type": ["string", "null"],
                            "enum": [*categories, None],
                        },
                        "addressOrMeetingPoint": {"type": ["string", "null"]},
                        "area": {"type": ["string", "null"]},
                        "mapsUrl": {"type": ["string", "null"]},
                        "startMinutes": {
                            "type": ["integer", "null"],
                            "minimum": 0,
                            "maximum": 2880,
                            "description": "Minutes after midnight on the day itself. "
                            "09:30 is 570. A stop that runs past midnight uses a value "
                            "over 1440 (00:30 the next morning is 1470). Null when you "
                            "genuinely cannot say.",
                        },
                        "durationMinutes": {
                            "type": ["integer", "null"],
                            "minimum": 0,
                            "maximum": 1440,
                        },
                        "whyHere": {"type": "string"},
                        "readerCopy": {"type": "string"},
                        "whatToDo": _strings("Concrete things to do at this stop."),
                        "practicalNotes": _strings(
                            "Real-world caveats a reader needs: hours, booking, cost."
                        ),
                        "claimIds": _strings(
                            "Ids from `claims` supporting every fact in this row."
                        ),
                        "selectionReason": {"type": "string"},
                        "unresolvedReason": {"type": ["string", "null"]},
                    },
                },
            },
            "transfers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "from",
                        "to",
                        "mode",
                        "minutesMin",
                        "minutesMax",
                        "basis",
                        "sourceIds",
                        "note",
                    ],
                    "properties": {
                        "from": {"type": "string", "enum": endpoints},
                        "to": {"type": "string", "enum": endpoints},
                        "mode": {"type": "string", "enum": _TRANSFER_MODES},
                        "minutesMin": {"type": ["integer", "null"], "minimum": 0},
                        "minutesMax": {"type": ["integer", "null"], "minimum": 0},
                        "basis": {
                            "type": "string",
                            "enum": ["sourced", "planning_estimate", "unknown"],
                        },
                        "sourceIds": _strings("Sources behind a `sourced` time."),
                        "note": {"type": "string"},
                    },
                },
            },
            "restWindows": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "afterSlotId",
                        "beforeSlotId",
                        "minutes",
                        "locationPolicy",
                        "description",
                    ],
                    "properties": {
                        "afterSlotId": {"type": "string", "enum": slot_ids},
                        "beforeSlotId": {"type": "string", "enum": slot_ids},
                        "minutes": {"type": "integer", "minimum": 0},
                        "locationPolicy": {
                            "type": "string",
                            "enum": [
                                "stay_nearby",
                                "named_location",
                                "return_to_base",
                                "unknown",
                            ],
                            "description": "Where the rest happens. `return_to_base` "
                            "means two extra legs, and they must appear in transfers.",
                        },
                        "description": {"type": "string"},
                    },
                },
            },
            "sources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "id",
                        "url",
                        "title",
                        "publisher",
                        "sourceType",
                        "accessedAt",
                        "publishedOrUpdatedAt",
                    ],
                    "properties": {
                        "id": {"type": "string"},
                        "url": {
                            "type": "string",
                            "description": "A real http(s) page you actually read.",
                        },
                        "title": {"type": "string"},
                        "publisher": {"type": "string"},
                        "sourceType": {
                            "type": "string",
                            "enum": ["official", "map", "secondary"],
                        },
                        "accessedAt": {"type": ["string", "null"]},
                        "publishedOrUpdatedAt": {"type": ["string", "null"]},
                    },
                },
            },
            "claims": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "text", "sourceIds", "appliesTo"],
                    "properties": {
                        "id": {"type": "string"},
                        "text": {"type": "string"},
                        "sourceIds": _strings("Ids from `sources`."),
                        "appliesTo": {
                            "type": "string",
                            "description": "The slot id this claim is about, or "
                            "empty for a day-level claim.",
                        },
                    },
                },
            },
            "feasibility": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["topic", "status", "detail", "sourceIds"],
                    "properties": {
                        "topic": {"type": "string"},
                        "status": {
                            "type": "string",
                            "enum": [
                                "supported",
                                "conditional",
                                "unresolved",
                                "not_applicable",
                            ],
                        },
                        "detail": {"type": "string"},
                        "sourceIds": _strings("Sources behind this judgement."),
                    },
                },
            },
            "proposedChanges": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["slotId", "proposal", "reason"],
                    "properties": {
                        "slotId": {"type": "string"},
                        "proposal": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
            },
            "tripMemory": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "usedPlaces",
                    "coveredExperiences",
                    "reservedForLater",
                    "nextDayImplications",
                ],
                "properties": {
                    "usedPlaces": _strings("Named places this day actually uses."),
                    "coveredExperiences": _strings("Experiences this day covers."),
                    "reservedForLater": _strings("What you are leaving for later days."),
                    "nextDayImplications": _strings(
                        "What the next day has to take into account."
                    ),
                },
            },
            "editorNotes": _strings(
                "For the editor, never for the reader: planning choices, open "
                "questions, anything you want a person to decide."
            ),
        },
    }
