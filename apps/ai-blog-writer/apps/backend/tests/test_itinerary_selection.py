"""The proposal contract, its checks, the stays and the saved Lima day.

Pure functions only: no app, no database. The routes are tested in
`test_itinerary_workflow.py`; this is the arithmetic and the wording those
routes rest on.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.features.itinerary_pipeline import hotels
from app.features.itinerary_pipeline.context import (
    compact_trip_lines,
    context_key,
    stay_context,
    stay_lines,
    stay_wanted,
)
from app.features.itinerary_pipeline.contracts import (
    DayResult,
    DirectionRevision,
    DaySummary,
    SetupSnapshot,
    SlotSummary,
    StoredResult,
    ValidationReport,
)
from app.features.itinerary_pipeline.prompt_export import build_export
from app.features.itinerary_pipeline.selection_contract import (
    SELECTION_CONTRACT_VERSION,
    DaySelection,
)
from app.features.itinerary_pipeline.validation import validate_answer

from tests.itinerary_pipeline_support import (
    DAY_ONE_SLOTS,
    setup_payload,
    stay,
    summary_for,
    valid_selection,
)

LIMA = Path(__file__).parent / "fixtures" / "itinerary_lima_audit"


def _setup(**kwargs) -> SetupSnapshot:
    return SetupSnapshot.model_validate(setup_payload(**kwargs))


def _export(setup: SetupSnapshot, day_id: str = "day-1", **kwargs):
    day = setup.day(day_id)
    return build_export(
        workspace_id="ws",
        workspace_revision=1,
        setup=setup,
        day_id=day_id,
        summary=summary_for(day_id, [slot.id for slot in day.slots]),
        direction_revision=1,
        context_key="key",
        results={},
        directions={},
        **kwargs,
    )


def _check(setup: SetupSnapshot, packet: dict, day_id: str = "day-1", **kwargs):
    export = _export(setup, day_id)
    packet = {**packet, "exportId": export.export_id, "inputHash": export.input_hash}
    return validate_answer(
        json.dumps(packet),
        export=export,
        day=setup.day(day_id),
        workspace_id="ws",
        day_id=day_id,
        current_context_key="key",
        **kwargs,
    )


class _Ids:
    export_id = "e"
    input_hash = "h" * 16
    slot_ids = [slot["id"] for slot in DAY_ONE_SLOTS]


# ------------------------------------------------------------------- stays --


def test_a_day_starts_from_last_night_and_ends_at_tonight():
    setup = _setup(
        stays=[stay("a", first=1, last=1, name="A"), stay("b", first=2, last=2, name="B")]
    )
    one = stay_context(setup, "day-1", {})
    two = stay_context(setup, "day-2", {})
    three = stay_context(setup, "day-3", {})
    assert (one["start"]["name"], one["end"]["name"]) == ("A", "A")
    assert (two["start"]["name"], two["end"]["name"]) == ("A", "B")
    assert (three["start"]["name"], three["end"]) == ("B", None)
    assert three["final_day"]
    assert stay_lines(two) == ["Starts from: A, Miraflores.", "Sleeps at: B, Miraflores."]
    assert stay_lines(three)[-1] == "Ends with departure: no hotel night after this day."


def test_a_missing_night_that_is_not_the_last_is_said_plainly():
    setup = _setup(stays=[stay(first=1, last=1)])
    assert stay_lines(stay_context(setup, "day-2", {})) == [
        "Starts from: Casa Miraflores, Miraflores.",
        "Sleeps at: not set.",
    ]


def test_no_stay_falls_back_to_the_starting_base_text():
    setup = _setup()
    assert stay_lines(stay_context(setup, "day-1", {}), fallback="A hotel in Miraflores") == [
        "Stay: A hotel in Miraflores. Plan the day's first and last journeys from it."
    ]
    assert stay_lines(stay_context(setup, "day-1", {})) == [
        "Stay: not set. Do not plan journeys to or from a hotel."
    ]


def test_a_recommended_stay_is_wanted_until_some_other_day_chose_it():
    setup = _setup(stays=[stay("r", first=1, last=2, mode="recommend")])
    assert stay_wanted(stay_context(setup, "day-1", {})) == "r"

    chosen = _stored(
        valid_selection(
            _Ids(),
            stay={"stayId": "r", "name": "Picked", "area": "Barranco", "reason": "", "sources": []},
        )
    )
    context = stay_context(setup, "day-2", {"day-1": chosen})
    assert stay_wanted(context) == ""
    assert context["start"]["name"] == "Picked"
    # A day's own saved choice does not count as already made for its own prompt.
    assert stay_wanted(stay_context(setup, "day-1", {"day-1": chosen})) == "r"


def test_the_approval_fingerprint_ignores_the_stays():
    from app.features.itinerary_pipeline.approval import layout_signature

    plain = _setup()
    with_stays = _setup(stays=[stay()])
    assert layout_signature(plain, plain.days[0]) == layout_signature(
        with_stays, with_stays.days[0]
    )


def test_a_hotel_change_ages_only_the_days_it_touches():
    before = _setup(stays=[stay("a", first=1, last=1), stay("b", first=2, last=2, name="B")])
    after = _setup(stays=[stay("a", first=1, last=1), stay("b", first=2, last=2, name="C")])

    def key(setup, day_id):
        return context_key(setup, day_id, {}, None, include_stay=True)

    assert key(before, "day-1") == key(after, "day-1")
    assert key(before, "day-2") != key(after, "day-2")
    assert key(before, "day-3") != key(after, "day-3")
    # The interview's key never includes the stay.
    assert context_key(before, "day-2", {}) == context_key(after, "day-2", {})


# ------------------------------------------------------------------ hotels --


def test_hotels_are_matched_on_the_city_inside_the_location_path():
    rows = [
        {"id": 1, "name": "Casa", "location": "Peru > Lima > Miraflores", "type": "boutique"},
        {"id": 2, "name": "Elsewhere", "location": "Peru > Cusco > Centro", "type": "hotel"},
        {"id": 3, "name": "Bare", "location": "Peru > Lima", "type": "hotel"},
    ]
    found = hotels.hotels_for("Lima, Peru", fetch=lambda: rows)
    assert found["available"]
    assert [hotel["name"] for hotel in found["hotels"]] == ["Bare", "Casa"]
    assert found["hotels"][1]["area"] == "Miraflores"


def test_no_city_lists_nothing_and_a_dead_location_manager_says_so():
    assert hotels.hotels_for("", fetch=lambda: 1 / 0)["hotels"] == []

    def down():
        raise hotels.HotelsUnavailable("connection refused")

    found = hotels.hotels_for("Lima", fetch=down)
    assert found == {"available": False, "error": "connection refused", "hotels": []}


# ------------------------------------------------------------------ prompt --


def test_blank_needs_are_not_turned_into_requirements():
    lines = compact_trip_lines(_setup().trip)
    assert "Dietary and access needs: not specified. Do not invent any, and do not claim a place suits them." in lines
    prompt = _export(_setup()).prompt_text
    assert "survive any" not in prompt
    assert "step-free" not in prompt


def test_an_evergreen_trip_does_not_demand_every_day_opening():
    prompt = _export(_setup()).prompt_text
    assert "a place need not open every day" in prompt
    payload = setup_payload()
    payload["trip"]["timing"] = {"mode": "specific_dates", "startDate": "2026-10-01", "firstWeekday": ""}
    dated = _export(SetupSnapshot.model_validate(payload)).prompt_text
    assert "a place must be open on this day's date" in dated
    assert "2026-10-01" in dated


def test_the_revision_is_part_of_the_request_identity():
    setup = _setup()
    base = _stored(valid_selection(_Ids()))
    plain = _export(setup)
    one = _export(setup, base=base, change_request="Quieter lunch", change_slot_id="day1-lunch")
    two = _export(setup, base=base, change_request="Cheaper lunch", change_slot_id="day1-lunch")
    assert len({plain.input_hash, one.input_hash, two.input_hash}) == 3
    assert "## What the editor wants changed" in one.prompt_text


def test_the_saved_lima_day_fits_the_size_target():
    """The comparison the plan names: the same day's article-shaped prompt was
    24,802 characters to copy (49,412 before the first compression)."""
    setup = SetupSnapshot.model_validate(json.loads((LIMA / "setup.json").read_text()))
    day = setup.days[0]
    summary = DaySummary(
        day_id=day.id,
        angle="A food education day, from everyday breakfast to an ambitious dinner.",
        trip_fit="Day one teaches the food; day two is active.",
        area="Miraflores through lunch, then Barranco.",
        preferences=["Low effort", "Two real meals and two small tastes"],
        slots=[SlotSummary(slot_id=slot.id, role=slot.purpose) for slot in day.slots],
    )
    export = build_export(
        workspace_id="ws",
        workspace_revision=1,
        setup=setup,
        day_id=day.id,
        summary=summary,
        direction_revision=1,
        context_key="key",
        results={},
        directions={},
    )
    assert len(day.slots) == 7
    assert export.size_report["total"] < 10_000, export.size_report
    assert len(export.prompt_text) < 24_802 / 2


# ------------------------------------------------------------------ checks --


def test_a_complete_answer_passes_and_is_complete():
    setup = _setup()
    selection, report, content_hash = _check(setup, valid_selection(_Ids()))
    assert report.valid, report.issues
    assert report.completeness.complete
    assert content_hash
    assert isinstance(selection, DaySelection)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda p: p["picks"][0].update(status="omitted_optional"), "cannot be left out"),
        (lambda p: p["picks"][0].update(name=None), "needs a name"),
        (lambda p: p["picks"][0].update(category="nightlife"), "not a category this stop allows"),
        (lambda p: p["picks"].reverse(), "different order"),
        (lambda p: p["picks"].append(dict(p["picks"][0])), "appears 2 times"),
        (lambda p: p["journeys"].append({"from": "x", "to": "day1-lunch", "mode": "walk", "minutes": 1, "note": ""}), 'goes from "x"'),
        (lambda p: p["questions"].append({"slotId": "nope", "question": "?", "options": []}), 'about "nope"'),
    ],
)
def test_what_a_proposal_may_not_do(change, message):
    packet = valid_selection(_Ids())
    change(packet)
    _selection, report, _hash = _check(_setup(), packet)
    assert not report.valid
    assert any(message in issue.message for issue in report.errors), report.issues


def test_the_optional_stop_may_be_left_out():
    packet = valid_selection(_Ids())
    packet["picks"][-1].update(status="omitted_optional", name=None)
    _selection, report, _hash = _check(_setup(), packet)
    assert report.valid
    assert report.completeness.complete
    assert report.completeness.omitted_optional == 1


def test_harmless_extras_are_named_and_dropped():
    packet = valid_selection(_Ids())
    packet["confidence"] = "high"
    packet["picks"][0]["mapsUrl"] = "javascript:alert(1)"
    packet["picks"][0]["chosenBy"] = "editor"
    packet["picks"][1]["sources"] = [{"url": "not a page", "title": ""}]
    selection, report, _hash = _check(_setup(), packet)
    assert report.valid
    warnings = " ".join(issue.message for issue in report.warnings)
    assert "confidence" in warnings
    assert "not a web address" in warnings
    assert selection.picks[0].maps_url.startswith("https://www.google.com/maps/search/")
    assert selection.picks[0].chosen_by == "ai"
    assert selection.picks[1].sources == []


def test_a_retired_answer_is_refused_by_name():
    packet = json.loads((LIMA / "response_v1.json").read_text())
    packet["contractVersion"] = "itinerary-day-result-v1"
    _selection, report, _hash = _check(_setup(), packet)
    assert not report.valid
    assert "older article format" in report.errors[0].message


# -------------------------------------------------------- previous versions --


def _stored(selection_payload: dict) -> StoredResult:
    return StoredResult(
        result_revision=1,
        selection=DaySelection.model_validate(
            {**selection_payload, "contractVersion": SELECTION_CONTRACT_VERSION}
        ),
        report=ValidationReport(valid=True),
    )


def test_the_saved_lima_article_day_is_still_readable():
    """Old saved work stays viewable as a previous version."""
    response = json.loads((LIMA / "response_v1.json").read_text())
    result = DayResult.model_validate(
        {
            **response,
            "contractVersion": "itinerary-day-result-v1",
            "workspaceId": "151c14dbac1f",
            "dayId": "day_mu28ruv3jg5pczu",
            "exportId": "2531a216451b",
            "inputHash": "x" * 16,
        }
    )
    stored = StoredResult.model_validate(
        json.loads(
            StoredResult(result_revision=1, result=result, report=ValidationReport(valid=True)).model_dump_json()
        )
    )
    assert not stored.is_selection
    assert stored.headline() == result.title
    assert len(stored.chosen_names()) == 7


def test_the_saved_lima_agreement_is_read_as_the_older_shape():
    revision = DirectionRevision.model_validate(
        json.loads((LIMA / "direction_revision.json").read_text())
    )
    assert not revision.is_summary
    assert revision.direction.promise
    summary = DirectionRevision(revision=2, direction=summary_for())
    assert DirectionRevision.model_validate(json.loads(summary.model_dump_json())).is_summary


def test_a_stored_proposal_round_trips():
    stored = _stored(valid_selection(_Ids()))
    again = StoredResult.model_validate(json.loads(stored.model_dump_json()))
    assert again.is_selection
    assert again.chosen_names()[0] == "Place for day1-coffee"
    assert again.headline() == "An easy Miraflores day."
