"""What a pasted day has to survive, layer by layer.

Each test names one thing that can be wrong with a packet and asserts the one
outcome the plan asks for -- because "it was rejected" is not enough: the
reason decides whether the operator re-pastes, re-copies the prompt, or goes
back to the interview.

The fixture packet below is deliberately valid. Every test edits one thing.

These packets are v1, and the exports they answer are built in the v1 format.
That is the point: new exports ask for the compact v2 answer, but a v1 prompt
somebody already copied must still import exactly as it did. The compact
format has its own suite, `test_itinerary_compact.py`.
"""

from __future__ import annotations

import copy
import json

import pytest

from app.features.itinerary_pipeline.contracts import (
    RESEARCH_WIRE_VERSION,
    RESULT_CONTRACT_VERSION,
    SetupSnapshot,
)
from app.features.itinerary_pipeline.prompt_export import build_export
from app.features.itinerary_pipeline.validation import (
    MAX_PASTE_BYTES,
    PasteRejected,
    normalize_paste,
    parse_paste,
    validate_paste,
)

from tests.itinerary_pipeline_support import direction_for, setup


WORKSPACE = "ws_test"
CONTEXT = "context-key-1"


def _export(snapshot: SetupSnapshot | None = None, day_id: str = "day-1"):
    snapshot = snapshot or setup()
    return build_export(
        workspace_id=WORKSPACE,
        workspace_revision=1,
        setup=snapshot,
        day_id=day_id,
        direction=direction_for(day_id),
        direction_revision=1,
        context_key=CONTEXT,
        results={},
        directions={},
        export_id="exp_test",
        compact=False,
    )


def _leg(start: str, end: str, minutes: tuple[int, int] = (10, 15)) -> dict:
    return {
        "from": start,
        "to": end,
        "mode": "walk",
        "minutesMin": minutes[0],
        "minutesMax": minutes[1],
        "basis": "planning_estimate",
        "sourceIds": [],
        "note": "",
    }


def _source(source_id: str) -> dict:
    return {
        "id": source_id,
        "url": f"https://example.com/{source_id}",
        "title": "A page",
        "publisher": "Example",
        "sourceType": "official",
        "accessedAt": "2026-09-15",
        "publishedOrUpdatedAt": None,
    }


def _stop(slot_id: str, start: int, *, category: str = "dining") -> dict:
    return {
        "slotId": slot_id,
        "status": "selected",
        "name": f"Place for {slot_id}",
        "category": category,
        "addressOrMeetingPoint": "Some street 1, Miraflores",
        "area": "Miraflores",
        "mapsUrl": "https://maps.example.com/x",
        "startMinutes": start,
        "durationMinutes": 45,
        "whyHere": "It fits the route.",
        "readerCopy": "Some reader copy about this place.",
        "whatToDo": ["Eat"],
        "practicalNotes": ["Open daily"],
        "claimIds": [f"c-{slot_id}"],
        "selectionReason": "Because the evidence says so.",
        "unresolvedReason": None,
    }


def valid_packet(export) -> dict:
    slots = export.slot_ids
    categories = {
        "day1-coffee": "dining",
        "day1-scenic": "attractions",
        "day1-lunch": "dining",
        "day1-leisure": "attractions",
        "day1-dinner": "dining",
        "day1-evening": "nightlife",
    }
    starts = [540, 660, 780, 930, 1140, 1260]
    stops = [
        _stop(slot_id, start, category=categories[slot_id])
        for slot_id, start in zip(slots, starts)
    ]
    return {
        "contractVersion": RESULT_CONTRACT_VERSION,
        "workspaceId": WORKSPACE,
        "dayId": "day-1",
        "exportId": export.export_id,
        "inputHash": export.input_hash,
        "research": {
            "performedAt": "2026-09-15",
            "browsingUsed": True,
            "limitations": ["No routing tool was run."],
        },
        "status": "ready_for_editor_review",
        "title": "An easy Miraflores day",
        "dayIntro": "A gentle first day.",
        "tripRole": "The opener.",
        "scheduleLabel": "Illustrative; check opening days.",
        "stops": stops,
        "transfers": [
            {
                "from": "base_start",
                "to": slots[0],
                "mode": "unspecified",
                "minutesMin": None,
                "minutesMax": None,
                "basis": "unknown",
                "sourceIds": [],
                "note": "The hotel is unknown.",
            },
            *(_leg(a, b) for a, b in zip(slots, slots[1:])),
        ],
        "restWindows": [
            {
                "afterSlotId": slots[3],
                "beforeSlotId": slots[4],
                "minutes": 120,
                "locationPolicy": "stay_nearby",
                "description": "Unallocated recovery.",
            }
        ],
        "sources": [_source(f"s-{slot_id}") for slot_id in slots],
        "claims": [
            {
                "id": f"c-{slot_id}",
                "text": "This place exists and posts these hours.",
                "sourceIds": [f"s-{slot_id}"],
                "appliesTo": slot_id,
            }
            for slot_id in slots
        ],
        "feasibility": [
            {
                "topic": "Opening-day compatibility",
                "status": "supported",
                "detail": "Every venue posts daily hours.",
                "sourceIds": [f"s-{slots[0]}"],
            }
        ],
        "proposedChanges": [],
        "tripMemory": {
            "usedPlaces": ["Place for day1-lunch"],
            "coveredExperiences": ["A clifftop view"],
            "reservedForLater": ["The historic centre"],
            "nextDayImplications": ["A relaxed start is fine."],
        },
        "editorNotes": [],
    }


def valid_wire_packet(export) -> dict:
    """The same valid day, written as the compact v2 answer."""
    categories = {
        "day1-coffee": "dining",
        "day1-scenic": "attractions",
        "day1-lunch": "dining",
        "day1-leisure": "attractions",
        "day1-dinner": "dining",
        "day1-evening": "nightlife",
    }
    slots = export.slot_ids
    starts = [540, 660, 780, 930, 1140, 1260]
    wire_leg = lambda a, b: {  # noqa: E731
        key: value for key, value in _leg(a, b).items() if key != "sourceIds"
    } | {"evidence": []}
    return {
        "contractVersion": RESEARCH_WIRE_VERSION,
        "workspaceId": WORKSPACE,
        "dayId": "day-1",
        "exportId": export.export_id,
        "inputHash": export.input_hash,
        "title": "An easy Miraflores day",
        "dayIntro": "A gentle first day.",
        "stops": [
            {
                "slotId": slot_id,
                "status": "selected",
                "name": f"Place for {slot_id}",
                "category": categories.get(slot_id, "dining"),
                "addressOrMeetingPoint": "Some street 1, Miraflores",
                "area": "Miraflores",
                "startMinutes": start,
                "durationMinutes": 45,
                "readerCopy": "Some reader copy about this place.",
                "practicalNotes": ["Open daily"],
                "evidence": [
                    {
                        "fact": "This place exists and posts these hours.",
                        "url": f"https://example.com/s-{slot_id}",
                        "title": "A page",
                    }
                ],
                "unresolvedReason": None,
            }
            for slot_id, start in zip(slots, starts)
        ],
        # The fixture trip names its hotel, so the day's two ends are journeys too.
        "transfers": [
            wire_leg("base_start", slots[0]),
            *(wire_leg(a, b) for a, b in zip(slots, slots[1:])),
            wire_leg(slots[-1], "base_end"),
        ],
        "restWindows": [
            {
                "afterSlotId": slots[3],
                "beforeSlotId": slots[4],
                "minutes": 120,
                "locationPolicy": "stay_nearby",
                "description": "Unallocated recovery.",
            }
        ],
        "issues": [],
        "nextDayNotes": [],
    }


def run(packet, *, export=None, snapshot=None, day_id="day-1", context=CONTEXT):
    snapshot = snapshot or setup()
    export = export or _export(snapshot, day_id)
    raw = packet if isinstance(packet, str) else json.dumps(packet)
    return validate_paste(
        raw,
        export=export,
        day=snapshot.day(day_id),
        workspace_id=WORKSPACE,
        day_id=day_id,
        current_context_key=context,
    )


def errors(report) -> list[str]:
    return [issue.message for issue in report.issues if issue.severity == "error"]


# ------------------------------------------------------------- the happy day --


def test_a_complete_day_validates_and_reads_as_complete():
    export = _export()
    result, report, content_hash = run(valid_packet(export), export=export)
    assert report.valid, errors(report)
    assert result is not None
    assert result.title == "An easy Miraflores day"
    assert report.completeness.complete
    assert report.completeness.selected == 6
    assert content_hash


def test_the_same_packet_hashes_the_same_twice():
    """The Save is pinned to this hash. If serialising the same object twice
    produced two hashes, every preview would invalidate itself."""
    export = _export()
    packet = valid_packet(export)
    _one, _report, first = run(packet, export=export)
    _two, _report2, second = run(copy.deepcopy(packet), export=export)
    assert first == second


# ------------------------------------------------------------ 1 · transport --


def test_a_fenced_block_is_unwrapped_and_says_so():
    export = _export()
    fenced = "```json\n" + json.dumps(valid_packet(export)) + "\n```"
    result, report, _hash = run(fenced, export=export)
    assert report.valid, errors(report)
    assert any("code fence" in note for note in report.normalizations)


def test_a_byte_order_mark_is_removed_and_says_so():
    export = _export()
    text, notes = normalize_paste("﻿" + json.dumps(valid_packet(export)))
    assert text.startswith("{")
    assert any("byte-order mark" in note for note in notes)


def test_prose_around_the_json_is_not_mined_for_an_object():
    """No guessing an object out of a reply that is half explanation. A day
    reconstructed by a regex is a day nobody read."""
    export = _export()
    raw = "Sure! Here is the day:\n" + json.dumps(valid_packet(export))
    _result, report, _hash = run(raw, export=export)
    assert not report.valid
    assert any("not valid JSON" in message for message in errors(report))


def test_truncated_json_is_reported_rather_than_repaired():
    export = _export()
    raw = json.dumps(valid_packet(export))[:2000]
    _result, report, _hash = run(raw, export=export)
    assert not report.valid
    assert any("not valid JSON" in message for message in errors(report))


def test_a_duplicate_key_is_refused_rather_than_last_write_wins():
    raw = '{"contractVersion": "a", "contractVersion": "b"}'
    with pytest.raises(PasteRejected) as caught:
        parse_paste(raw)
    assert "twice" in str(caught.value)


def test_an_oversized_paste_is_refused_before_it_is_parsed():
    with pytest.raises(PasteRejected) as caught:
        normalize_paste("x" * (MAX_PASTE_BYTES + 1))
    assert "megabyte" in str(caught.value)


def test_an_empty_paste_says_so():
    with pytest.raises(PasteRejected):
        normalize_paste("   \n  ")


# --------------------------------------------------------------- 2 · schema --


def test_a_wrong_contract_version_says_which_one_to_answer():
    export = _export()
    packet = valid_packet(export)
    packet["contractVersion"] = "itinerary-finished-day-dry-run-v1"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any(RESULT_CONTRACT_VERSION in message for message in errors(report))


def test_a_wrong_field_type_names_the_stop_not_the_array_index():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][2]["durationMinutes"] = "about an hour"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    paths = [issue.path for issue in report.issues if issue.severity == "error"]
    assert any("Special lunch" in path for path in paths), paths


def test_an_unexpected_field_is_dropped_and_named_rather_than_refused():
    """This used to refuse the whole packet. What that actually caught was a
    model volunteering one helpful extra key in a twelve-kilobyte object, and
    it cost the operator the entire day's research. `contractVersion` is what
    catches a packet built against a different contract."""
    export = _export()
    packet = valid_packet(export)
    packet["stops"][0]["vibe"] = "cosy"
    packet["confidence"] = "high"
    result, report, _hash = run(packet, export=export)

    assert report.valid, errors(report)
    assert result is not None
    said = [issue.message for issue in report.issues if "left out" in issue.message]
    assert said, "a dropped field has to be mentioned"
    assert "confidence" in said[0]
    assert "stops.vibe" in said[0]


def test_a_thin_packet_is_read_and_judged_on_what_it_means():
    """Only identity and the stop list are required by the shape. Everything
    else a row must carry depends on its kind and its status, and that is a
    question with a readable answer rather than a "field required"."""
    export = _export()
    packet = valid_packet(export)
    for stop in packet["stops"]:
        # The bare minimum a row can be: it says which slot and how it went.
        for key in list(stop):
            if key not in {"slotId", "status"}:
                del stop[key]
    for stop in packet["stops"]:
        stop["status"] = "unresolved"
    del packet["transfers"]
    del packet["restWindows"]
    del packet["feasibility"]
    del packet["tripMemory"]
    del packet["status"]

    result, report, _hash = run(packet, export=export)
    # It parses. Every stop is unresolved and says nothing about why, and THAT
    # is what it is told about.
    assert result is not None
    assert result.status == "needs_decision"
    assert any("has to say why" in message for message in errors(report))
    assert not any("field required" in message.lower() for message in errors(report))


# ------------------------------------------------------------- 3 · identity --


def test_a_packet_for_another_day_cannot_be_imported_here():
    export = _export()
    packet = valid_packet(export)
    packet["dayId"] = "day-2"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("day-2" in message for message in errors(report))


def test_a_changed_input_hash_is_refused():
    export = _export()
    packet = valid_packet(export)
    packet["inputHash"] = "0" * 32
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("identity stamp" in message for message in errors(report))


def test_an_export_from_a_changed_day_cannot_apply():
    """The prompt was copied, then the layout changed. That research answers
    the old question and must not be able to claim it answers this one."""
    export = _export()
    packet = valid_packet(export)
    _result, report, _hash = run(packet, export=export, context="a-different-context")
    assert not report.valid
    assert any("changed since that prompt" in message for message in errors(report))


def test_identity_failures_do_not_also_report_whole_day_structure():
    """A packet for another day would otherwise produce pages of confident
    nonsense about stops it was never meant to have."""
    export = _export()
    packet = valid_packet(export)
    packet["dayId"] = "day-2"
    _result, report, _hash = run(packet, export=export)
    assert not any(issue.layer == "structure" for issue in report.issues)


# ------------------------------------------------------------ 4 · structure --


def test_a_missing_required_stop_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    del packet["stops"][2]
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("missing from the answer" in message for message in errors(report))


def test_a_duplicated_stop_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][3] = copy.deepcopy(packet["stops"][2])
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("appears 2 times" in message for message in errors(report))


def test_a_stop_that_is_not_on_this_day_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][1]["slotId"] = "day2-museum"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid


def test_a_reordered_day_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][0], packet["stops"][1] = packet["stops"][1], packet["stops"][0]
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("different order" in message for message in errors(report))


def test_a_category_outside_what_the_slot_allows_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][2]["category"] = "nightlife"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("not one of the categories" in message for message in errors(report))


def test_a_required_stop_cannot_be_omitted():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][2].update(
        {
            "status": "omitted_optional",
            "name": None,
            "readerCopy": "",
            "addressOrMeetingPoint": None,
            "claimIds": [],
        }
    )
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("cannot be omitted" in message for message in errors(report))


def test_the_optional_evening_may_be_omitted():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][5].update(
        {
            "status": "omitted_optional",
            "name": None,
            "category": None,
            "addressOrMeetingPoint": None,
            "area": None,
            "mapsUrl": None,
            "startMinutes": None,
            "durationMinutes": None,
            "readerCopy": "",
            "claimIds": [],
            "unresolvedReason": "Nothing nearby suited a quiet finish.",
        }
    )
    result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)
    assert report.completeness.omitted_optional == 1
    assert report.completeness.complete


def test_an_unresolved_stop_saves_as_needs_work_and_never_as_complete():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][2].update(
        {
            "status": "unresolved",
            "name": None,
            "addressOrMeetingPoint": None,
            "startMinutes": None,
            "durationMinutes": None,
            "readerCopy": "",
            "claimIds": [],
            "unresolvedReason": "Nothing on the route had hours that could be confirmed.",
        }
    )
    _result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)
    assert not report.completeness.complete
    assert report.completeness.required_unresolved == ["Special lunch"]


def test_unresolved_cannot_masquerade_as_selected():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][2]["status"] = "unresolved"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("names a place" in message for message in errors(report))


def test_a_selected_stop_with_no_reader_copy_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][1]["readerCopy"] = ""
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("needs reader copy" in message for message in errors(report))


def test_a_transfer_to_a_stop_that_is_not_on_this_day_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["transfers"][0]["to"] = "day2-museum"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid


# ------------------------------------------------------------- 5 · evidence --


def test_a_claim_citing_a_source_that_is_not_there_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["claims"][0]["sourceIds"] = ["s-does-not-exist"]
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("not in the source list" in message for message in errors(report))


def test_a_javascript_url_is_refused():
    export = _export()
    packet = valid_packet(export)
    packet["sources"][0]["url"] = "javascript:alert(1)"
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("not an http or https page" in message for message in errors(report))


def test_a_selected_place_citing_nothing_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][0]["claimIds"] = []
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("cites nothing" in message for message in errors(report))


def test_duplicate_source_ids_block_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["sources"][1]["id"] = packet["sources"][0]["id"]
    _result, report, _hash = run(packet, export=export)
    assert not report.valid


def test_an_unresolved_stop_needs_no_evidence():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][5].update(
        {
            "status": "unresolved",
            "name": None,
            "category": None,
            "addressOrMeetingPoint": None,
            "startMinutes": None,
            "durationMinutes": None,
            "readerCopy": "",
            "claimIds": [],
            "unresolvedReason": "Nothing fit.",
        }
    )
    _result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)


# ------------------------------------------------------------- 6 · schedule --


def test_a_stop_that_runs_into_the_next_one_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][0]["durationMinutes"] = 300  # 09:00 + 5h lands after 11:00
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("They overlap" in message for message in errors(report))


def test_times_that_run_backwards_block_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][1]["startMinutes"] = 500  # before the 09:00 opener
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("run backwards" in message for message in errors(report))


def test_a_transfer_whose_minimum_exceeds_its_maximum_blocks_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["transfers"][0].update({"minutesMin": 30, "minutesMax": 10})
    _result, report, _hash = run(packet, export=export)
    assert not report.valid


def test_two_rests_in_the_same_gap_block_the_save():
    export = _export()
    packet = valid_packet(export)
    packet["restWindows"].append(copy.deepcopy(packet["restWindows"][0]))
    _result, report, _hash = run(packet, export=export)
    assert not report.valid
    assert any("same gap" in message for message in errors(report))


def test_an_unknown_start_time_prevents_complete_without_blocking_the_save():
    """Null is a real answer and it is not a zero. A day with an unknown time
    is saveable and is not complete."""
    export = _export()
    packet = valid_packet(export)
    packet["stops"][4]["startMinutes"] = None
    _result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)
    assert not report.completeness.complete
    assert report.completeness.missing_timing == ["Dinner"]


def test_a_stop_after_the_days_window_is_a_warning_not_a_block():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][5]["startMinutes"] = 1350  # 22:30, after a 21:00 close
    _result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)
    assert any("after the day's window" in issue.message for issue in report.issues)


def test_overnight_work_is_expressed_as_minutes_past_midnight():
    export = _export()
    packet = valid_packet(export)
    snapshot = setup()
    day = snapshot.day("day-1")
    day.available_time.custom_end = "01:00"
    day.available_time.ends_next_day = True
    packet["stops"][5]["startMinutes"] = 1470  # 00:30 the next morning
    packet["stops"][5]["durationMinutes"] = 30  # finishing exactly at the 01:00 close
    _result, report, _hash = run(packet, export=export, snapshot=snapshot)
    assert report.valid, errors(report)
    assert not any("window" in issue.message for issue in report.issues)


# --------------------------------------------------------------- 7 · review --


def test_a_model_that_says_it_browsed_does_not_make_the_evidence_checked():
    export = _export()
    result, report, _hash = run(valid_packet(export), export=export)
    assert report.valid
    said_ready = [
        issue.message
        for issue in report.issues
        if "its own judgement about its own work" in issue.message
    ]
    assert said_ready, "the model's own status must be shown as its own"


def test_browsing_false_is_a_visible_warning():
    export = _export()
    packet = valid_packet(export)
    packet["research"]["browsingUsed"] = False
    _result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)
    assert any("did not browse" in issue.message for issue in report.issues)


def test_a_place_used_twice_in_one_day_is_a_warning():
    export = _export()
    packet = valid_packet(export)
    packet["stops"][4]["name"] = packet["stops"][2]["name"]
    _result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)
    assert any("used twice in this day" in issue.message for issue in report.issues)


def test_a_proposed_change_is_shown_and_never_applied():
    export = _export()
    packet = valid_packet(export)
    packet["proposedChanges"] = [
        {
            "slotId": "day1-evening",
            "proposal": "Swap this for a second dinner course",
            "reason": "Nothing quiet is open.",
        }
    ]
    result, report, _hash = run(packet, export=export)
    assert report.valid, errors(report)
    assert any("Proposed change" in issue.message for issue in report.issues)
    # The layout the operator approved is untouched by anything in the packet.
    assert [stop.slot_id for stop in result.stops] == export.slot_ids


# ------------------------------------------------------- free time & travel --


def test_a_free_time_day_needs_no_venue():
    snapshot = setup()
    export = _export(snapshot, "day-2")
    slots = export.slot_ids
    packet = {
        "contractVersion": RESULT_CONTRACT_VERSION,
        "workspaceId": WORKSPACE,
        "dayId": "day-2",
        "exportId": export.export_id,
        "inputHash": export.input_hash,
        "research": {"performedAt": None, "browsingUsed": True, "limitations": []},
        "status": "ready_for_editor_review",
        "title": "A slower second day",
        "dayIntro": "Intro.",
        "tripRole": "The middle.",
        "scheduleLabel": "Illustrative.",
        "stops": [
            _stop(slots[0], 600, category="attractions"),
            _stop(slots[1], 780, category="dining"),
            {
                "slotId": slots[2],
                "status": "selected",
                "name": None,
                "category": None,
                "addressOrMeetingPoint": None,
                "area": None,
                "mapsUrl": None,
                "startMinutes": 900,
                "durationMinutes": 120,
                "whyHere": "A deliberate gap.",
                "readerCopy": "Take the middle of the afternoon off.",
                "whatToDo": [],
                "practicalNotes": [],
                "claimIds": [],
                "selectionReason": "The direction asked for unallocated time.",
                "unresolvedReason": None,
            },
            _stop(slots[3], 1140, category="dining"),
        ],
        # Journeys connect the venues; the free-time row in between is not a
        # venue and needs no leg of its own.
        "transfers": [_leg(slots[0], slots[1]), _leg(slots[1], slots[3])],
        "restWindows": [],
        "sources": [_source(f"s-{slots[0]}"), _source(f"s-{slots[1]}"), _source(f"s-{slots[3]}")],
        "claims": [
            {
                "id": f"c-{slot_id}",
                "text": "It exists.",
                "sourceIds": [f"s-{slot_id}"],
                "appliesTo": slot_id,
            }
            for slot_id in (slots[0], slots[1], slots[3])
        ],
        "feasibility": [],
        "proposedChanges": [],
        "tripMemory": {
            "usedPlaces": [],
            "coveredExperiences": [],
            "reservedForLater": [],
            "nextDayImplications": [],
        },
        "editorNotes": [],
    }
    _result, report, _hash = run(
        packet, export=export, snapshot=snapshot, day_id="day-2"
    )
    assert report.valid, errors(report)
    assert report.completeness.complete


def test_a_venue_in_a_free_time_slot_is_a_warning():
    """Free time is a window, not a place to be found. Worth saying and not
    worth blocking: the operator may have asked for exactly that."""
    snapshot = setup()
    export = _export(snapshot, "day-2")
    slots = export.slot_ids
    packet = {
        "contractVersion": RESULT_CONTRACT_VERSION,
        "workspaceId": WORKSPACE,
        "dayId": "day-2",
        "exportId": export.export_id,
        "inputHash": export.input_hash,
        "research": {"performedAt": None, "browsingUsed": True, "limitations": []},
        "status": "needs_decision",
        "title": "t",
        "dayIntro": "i",
        "tripRole": "r",
        "scheduleLabel": "s",
        "stops": [
            _stop(slots[0], 600, category="attractions"),
            _stop(slots[1], 780, category="dining"),
            _stop(slots[2], 900, category="dining"),
            _stop(slots[3], 1140, category="dining"),
        ],
        "transfers": [],
        "restWindows": [],
        "sources": [_source(f"s-{slot_id}") for slot_id in slots],
        "claims": [
            {
                "id": f"c-{slot_id}",
                "text": "It exists.",
                "sourceIds": [f"s-{slot_id}"],
                "appliesTo": slot_id,
            }
            for slot_id in slots
        ],
        "feasibility": [],
        "proposedChanges": [],
        "tripMemory": {
            "usedPlaces": [],
            "coveredExperiences": [],
            "reservedForLater": [],
            "nextDayImplications": [],
        },
        "editorNotes": [],
    }
    _result, report, _hash = run(packet, export=export, snapshot=snapshot, day_id="day-2")
    assert report.valid, errors(report)
    assert any("came back with a venue" in issue.message for issue in report.issues)
