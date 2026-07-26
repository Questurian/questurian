"""Day Shell request validation and resolution tests."""

import pytest

from tests.itineraries_pipeline_test_support import (
    itinerary_request,
    shell_selection,
    slot,
)

from app.features.itineraries_pipeline.retrieval_stage import (
    categories_for_shells,
    resolve_day_shells,
)
from app.features.itineraries_pipeline.schemas import DayShellSelection


def test_resolve_day_shells_uses_one_shell_per_day_verbatim():
    request = itinerary_request(
        2,
        [
            shell_selection(
                0,
                "nightlife_full_day",
                [
                    slot("late_start_lunch", "lunch", ["dining"], ["lunch"]),
                    slot(
                        "entertainment",
                        "nightlife",
                        ["nightlife"],
                        ["music"],
                    ),
                ],
            ),
            shell_selection(
                1,
                "custom_day_shell_1",
                [slot("morning_coffee", "morning", ["dining"], ["coffee"])],
                shell_name="Coffee culture night",
                shell_description="Operator-built layout",
            ),
        ],
    )

    shells = resolve_day_shells(request)

    assert [shell.id for shell in shells] == [
        "nightlife_full_day",
        "custom_day_shell_1",
    ]
    assert [entry.id for entry in shells[0].slots] == [
        "late_start_lunch",
        "entertainment",
    ]
    assert shells[1].name == "Coffee culture night"
    assert shells[1].description == "Operator-built layout"
    assert [entry.id for entry in shells[1].slots] == ["morning_coffee"]


def test_resolve_day_shells_falls_back_to_id_for_missing_name():
    request = itinerary_request(
        1,
        [
            shell_selection(
                0,
                "custom_day_shell_2",
                [slot("dinner", "dinner", ["dining"], ["dinner"])],
            )
        ],
    )

    shells = resolve_day_shells(request)

    assert shells[0].name == "custom_day_shell_2"
    assert shells[0].description == ""


def test_request_rejects_selection_without_slots():
    with pytest.raises(ValueError):
        DayShellSelection(
            day_index=0,
            shell_id="nightlife_full_day",
            slots=[],
        )
    with pytest.raises(ValueError):
        DayShellSelection(day_index=0, shell_id="nightlife_full_day")


def test_request_rejects_uncovered_or_duplicate_days():
    slots = [slot("dinner", "dinner", ["dining"], ["dinner"])]
    with pytest.raises(ValueError, match="missing day_index"):
        itinerary_request(
            2,
            [shell_selection(0, "custom_day_shell_1", slots)],
        )
    with pytest.raises(ValueError, match="duplicate day_index"):
        itinerary_request(
            1,
            [
                shell_selection(0, "custom_day_shell_1", slots),
                shell_selection(0, "custom_day_shell_2", slots),
            ],
        )


def test_categories_derive_from_shell_slots_not_intent():
    request = itinerary_request(
        1,
        [
            shell_selection(
                0,
                "nightlife_full_day",
                [
                    slot("late_start_lunch", "lunch", ["dining"], ["lunch"]),
                    slot(
                        "recovery_walk",
                        "afternoon",
                        ["attractions"],
                        ["walk"],
                    ),
                    slot(
                        "entertainment",
                        "nightlife",
                        ["nightlife"],
                        ["music"],
                    ),
                ],
            )
        ],
    )

    shells = resolve_day_shells(request)

    assert categories_for_shells(shells) == [
        "dining",
        "attractions",
        "nightlife",
    ]
