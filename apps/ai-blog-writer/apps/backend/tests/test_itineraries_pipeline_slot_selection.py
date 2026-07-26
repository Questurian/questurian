"""Per-slot selection-stage tests."""

from tests.itineraries_pipeline_test_support import (
    candidate,
    itinerary_request,
    run_selection,
    selection_state,
    shell_selection,
    slot,
)

from app.features.itineraries_pipeline.retrieval_stage import resolve_day_shells
from app.features.itineraries_pipeline.schemas import ScoredCandidate
from app.features.itineraries_pipeline.selection_stage import (
    candidate_pool_for_slot,
)


def test_select_emits_one_step_per_shell_slot(monkeypatch):
    request = itinerary_request(
        1,
        [
            shell_selection(
                0,
                "shell",
                [
                    slot("lunch", "lunch", ["dining"], []),
                    slot("walk", "afternoon", ["attractions"], []),
                ],
            )
        ],
    )
    state = selection_state(
        request,
        accommodations=[candidate(9, category="accommodations")],
    )
    state["candidates_by_cat"]["attractions"] = []

    output = run_selection(
        state,
        monkeypatch,
        lambda _slot, candidates: [
            ScoredCandidate(candidate=entry, fit_score=90) for entry in candidates
        ],
    )

    slot_steps = [step for step in output["steps"] if step.name == "slot"]
    assert [step.slot_id for step in slot_steps] == ["lunch", "walk"]
    assert slot_steps[0].status == "ok"
    assert slot_steps[0].details["winner"]["id"] == 1
    assert slot_steps[0].prompt == "p"
    assert slot_steps[1].status == "failed"
    assert output["slot_issues"][0].slot_id == "walk"


def test_pool_for_slot_excludes_already_filled_places():
    request = itinerary_request(
        1,
        [
            shell_selection(
                0,
                "food_focused_full_day",
                [
                    slot(
                        "dessert_drinks",
                        "evening",
                        ["dining", "nightlife"],
                        ["dessert"],
                    )
                ],
            )
        ],
    )
    dessert_slot = resolve_day_shells(request)[0].slots[-1]

    pool = candidate_pool_for_slot(
        dessert_slot,
        {
            "dining": [
                candidate(1, "dining"),
                candidate(2, "dining"),
            ],
            "nightlife": [candidate(3, "nightlife")],
        },
        {("dining", 1)},
    )

    assert [(entry.category, entry.id) for entry in pool] == [
        ("dining", 2),
        ("nightlife", 3),
    ]
