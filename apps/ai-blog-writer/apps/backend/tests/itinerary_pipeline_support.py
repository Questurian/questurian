"""A realistic itinerary setup, and the doubles that stand in for the model.

The fixture is a three-day Lima trip whose Day 1 uses the real Light Full Day
shape from the dry run: six stops, one of them optional, plus free-time and
travel variants on the other days. Everything a test needs to be specific
about -- a missing slot, a wrong category, a schedule that overlaps -- is a
small edit to what this builds, so the tests read as the case they are about
rather than as forty lines of setup.

Ids here are explicit and readable. Production ids come from `createId` in the
browser and look like `slot_m1x2y3abc`; a test failure that says
`day1-special_lunch` is one you can act on.
"""

from __future__ import annotations

import copy
from contextlib import contextmanager
from typing import Any

from app.features.itinerary_pipeline.contracts import (
    DayDirection,
    DirectionGeography,
    DirectionRhythm,
    SetupSnapshot,
    SlotDirection,
)


def _slot(
    slot_id: str,
    label: str,
    daypart: str,
    *,
    kind: str = "place",
    categories: list[str] | None = None,
    optional: bool = False,
    purpose: str = "",
    travel: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": slot_id,
        "sourceSlotId": slot_id.split("-", 1)[-1],
        "kind": kind,
        "label": label,
        "daypart": daypart,
        "optional": optional,
        "purpose": purpose or f"{label} for the day.",
        "allowedCategories": categories if categories is not None else ["dining"],
        "preferredCategories": [],
        "cues": [],
        "exclusions": [],
        "travel": travel,
    }


DAY_ONE_SLOTS = [
    _slot("day1-coffee", "Coffee / light breakfast", "morning", categories=["dining"]),
    _slot(
        "day1-scenic",
        "Scenic low-effort visit",
        "late_morning",
        categories=["attractions"],
    ),
    _slot("day1-lunch", "Special lunch", "lunch", categories=["dining"]),
    _slot(
        "day1-leisure",
        "Leisure exploration",
        "afternoon",
        categories=["attractions"],
    ),
    _slot("day1-dinner", "Dinner", "dinner", categories=["dining"]),
    _slot(
        "day1-evening",
        "Relaxed evening",
        "evening",
        categories=["nightlife"],
        optional=True,
    ),
]

DAY_TWO_SLOTS = [
    _slot("day2-museum", "Cultural anchor", "morning", categories=["attractions"]),
    _slot("day2-lunch", "Lunch", "lunch", categories=["dining"]),
    _slot("day2-rest", "Free time", "afternoon", kind="free_time", categories=[]),
    _slot("day2-dinner", "Dinner", "dinner", categories=["dining"]),
]

DAY_THREE_SLOTS = [
    _slot(
        "day3-transfer",
        "Transfer to the coast",
        "morning",
        kind="travel",
        categories=[],
        travel={
            "from": {"ref": "base", "text": ""},
            "to": {"ref": "getaway", "text": ""},
            "mode": "car",
        },
    ),
    _slot("day3-lunch", "Lunch", "lunch", categories=["dining"]),
]


def setup_payload(*, approved: bool = True) -> dict[str, Any]:
    def day(day_id: str, label: str, slots: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "id": day_id,
            "label": label,
            "sourceTemplateName": "Light Full Day",
            "availableTime": {
                "id": "custom",
                "customStart": "09:00",
                "customEnd": "21:00",
                "endsNextDay": False,
            },
            "slots": copy.deepcopy(slots),
            "setupNotes": "",
            "preparationNotes": "",
            # The browser's own signatures. The server records its OWN
            # signature at handoff and compares against that; these only say
            # that the review screen was passed.
            "tripRevision": "browser-trip-sig" if approved else "",
            "layoutRevision": f"browser-layout-{day_id}" if approved else "",
            "approvedAt": "2026-09-15T10:00:00Z" if approved else "",
        }

    return {
        "draftId": "draft_test_1",
        "trip": {
            "titleSeed": "Three days in Lima",
            "baseCity": "Lima, Peru",
            "scope": "city_only",
            "timing": {"mode": "evergreen", "startDate": "", "firstWeekday": ""},
            "preferredAreas": ["Miraflores"],
            "startingBase": "A hotel in Miraflores",
            "sharedPreferences": {
                "audience": "First-time visitors travelling as a couple",
                "budgetStyle": "mid_range",
                "budgetNote": "",
                "pace": "relaxed",
                "transport": ["walking", "taxi"],
                "transportNote": "",
                "walkingTolerance": "short",
                "dietaryNeeds": "",
                "accessNeeds": "",
                "mustInclude": "",
                "avoid": "",
            },
            "getaway": {"destination": "", "departureDay": None, "returnDay": None},
        },
        "days": [
            day("day-1", "Day 1", DAY_ONE_SLOTS),
            day("day-2", "Day 2", DAY_TWO_SLOTS),
            day("day-3", "Day 3", DAY_THREE_SLOTS),
        ],
    }


def setup(**kwargs: Any) -> SetupSnapshot:
    return SetupSnapshot.model_validate(setup_payload(**kwargs))


def direction_for(day_id: str = "day-1", slots: list[str] | None = None) -> DayDirection:
    slot_ids = slots or [slot["id"] for slot in DAY_ONE_SLOTS]
    return DayDirection(
        day_id=day_id,
        promise="A relaxed Miraflores introduction built around lunch.",
        trip_role="First full day; the historic centre is saved for day 2.",
        anchors=["The lunch"],
        geography=DirectionGeography(
            required_area="Miraflores",
            starting_point="A Miraflores hotel, exact address unknown",
            progression="Coast in the morning, streets in the afternoon",
            transfer_tolerance="About fifteen minutes on foot per leg",
            avoid_today=["Barranco", "the historic centre"],
        ),
        rhythm=DirectionRhythm(
            effort="Low",
            meal_balance="One big lunch, a lighter dinner",
            rest_policy="An explicit unallocated gap in the late afternoon",
            rest_minutes_minimum=45,
            optionality="The evening stop may be dropped",
        ),
        constraints=["No cliff stairs", "No beach descent"],
        slot_directions=[
            SlotDirection(slot_id=slot_id, role="role", must_have=["something"])
            for slot_id in slot_ids
        ],
        fails_if=["The afternoon repeats the morning"],
        research_checklist=["Which of these is open every day of the week"],
    )


# ------------------------------------------------------------- the doubles --


class ScriptedGrill:
    """A model that answers one marker per turn and then agrees.

    It has to move forward: the engine refuses a question about a marker that
    is already settled, so a stub that asks the same thing forever is retried
    once and then accepted, which makes a turn count meaningless.
    """

    def __init__(self, markers: tuple[str, ...]) -> None:
        self.markers = markers
        self.turn = 0
        self.prompts: list[str] = []
        self.jobs: list[str] = []
        self.lookups_requested = 0

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        self.prompts.append(prompt)
        self.jobs.append(kwargs.get("job_id", ""))
        if self.turn >= len(self.markers):
            return (
                {
                    "done": True,
                    "ask": "",
                    "recommendation": "",
                    "consensus": "Here is the whole day, played back.",
                    "markers_covered": list(self.markers),
                    "asks_about": "",
                    "options": [],
                },
                "raw",
            )
        marker = self.markers[self.turn]
        covered = list(self.markers[: self.turn])
        self.turn += 1
        return (
            {
                "done": False,
                "ask": f"What about {marker}?",
                "recommendation": f"The sensible answer about {marker}.",
                "consensus": "",
                "markers_covered": covered,
                "asks_about": marker,
                "options": [],
            },
            "raw",
        )


class LookupHungryGrill(ScriptedGrill):
    """A model that asks to look something up on every single turn.

    The itinerary interview has no search behind it. This proves that saying so
    in the prompt is not what stops it.
    """

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        payload, raw = super().invoke_json(
            prompt=prompt, model_name=model_name, schema=schema, **kwargs
        )
        self.lookups_requested += 1
        payload["lookup"] = "what is good in Miraflores"
        return payload, raw


# --------------------------------------------------------- the whole app --


@contextmanager
def itinerary_client(monkeypatch):
    """The real app, with the routes that would spend wired to doubles.

    A context manager rather than a fixture so that more than one test module
    can use it by declaring a one-line fixture of its own. Importing a fixture
    by name works and leaves every linter reporting it as unused, which is a
    warning nobody can act on and everybody learns to ignore.

    Everything except the two model calls is real: the router, the store, the
    validator, the export. The failures this feature has to survive are
    failures of ordering and identity, and a double cannot exercise those.
    """
    from fastapi.testclient import TestClient

    from app.features.itinerary_pipeline import api
    from app.features.itinerary_pipeline.contracts import ITINERARY_MARKER_KEYS
    from app.main import app


    grill_llm = ScriptedGrill(ITINERARY_MARKER_KEYS)

    class DirectionLLM:
        """Writes the agreement down using the slot ids it was actually given."""

        def __init__(self) -> None:
            self.calls = 0

        def invoke_json(self, *, prompt, model_name, schema, **kwargs):
            self.calls += 1
            slot_ids = [
                line.split("—")[0].strip().split()[-1]
                for line in prompt.splitlines()
                if line.startswith("  - ") and "—" in line
            ]
            return (
                {
                    "promise": "A relaxed Miraflores introduction.",
                    "trip_role": "The opener.",
                    "anchors": ["The lunch"],
                    "geography": {
                        "required_area": "Miraflores",
                        "starting_point": "A Miraflores hotel",
                        "progression": "Coast then streets",
                        "transfer_tolerance": "Fifteen minutes on foot",
                        "avoid_today": ["Barranco"],
                    },
                    "rhythm": {
                        "effort": "Low",
                        "meal_balance": "One big lunch",
                        "rest_policy": "One explicit gap",
                        "rest_minutes_minimum": 45,
                        "optionality": "The evening may go",
                    },
                    "constraints": ["No cliff stairs"],
                    "slot_directions": [
                        {
                            "slot_id": slot_id,
                            "role": "role",
                            "must_have": ["something"],
                            "nice_to_have": [],
                            "exclusions": [],
                        }
                        for slot_id in slot_ids
                    ],
                    "continuity": {
                        "covered_elsewhere": [],
                        "reserved_for_later": ["The historic centre"],
                        "deliberate_overlaps": [],
                    },
                    "change_policy": {
                        "must_remain": "The six stops",
                        "may_be_proposed": "A swap, with the reason",
                        "optional_slots_may_be_omitted": True,
                    },
                    "fails_if": ["The afternoon repeats the morning"],
                    "research_checklist": ["Which of these open every day"],
                },
                "raw",
            )

    direction_llm = DirectionLLM()

    class Router:
        """One object standing in for both jobs, chosen by the job id."""

        def invoke_json(self, *, prompt, model_name, schema, **kwargs):
            if kwargs.get("job_id") == "itinerary.day_direction":
                return direction_llm.invoke_json(
                    prompt=prompt, model_name=model_name, schema=schema, **kwargs
                )
            return grill_llm.invoke_json(
                prompt=prompt, model_name=model_name, schema=schema, **kwargs
            )

    monkeypatch.setattr(api, "_llm", Router)
    with TestClient(app) as test_client:
        test_client.grill_llm = grill_llm
        test_client.direction_llm = direction_llm
        yield test_client
