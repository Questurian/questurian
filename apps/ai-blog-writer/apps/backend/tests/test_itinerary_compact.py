"""The compact research assignment and its answer (research reduction plan).

Four things are pinned here, and each was a finding of the audit of the
seven-stop Lima run (`fixtures/itinerary_lima_audit/`):

- **the brief** says each requirement once and fits a normal day in 18,000
  characters, without losing a single accepted requirement
- **the answer** is smaller, and one adapter turns it into the saved shape
  without inventing anything
- **the day** is only complete when its journeys exist and fit -- filled rows
  are not a plan
- **the run** records what it actually did, and says "unknown" when it cannot
  tell

Nothing here makes a model call.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from app.features.itinerary_pipeline import prompt_export, research
from app.features.itinerary_pipeline.contracts import (
    DayDirection,
    DayPromptExport,
    DirectionContinuity,
    DirectionGeography,
    DirectionRevision,
    DirectionRhythm,
    RESEARCH_WIRE_VERSION,
    RESULT_CONTRACT_VERSION,
    SetupSnapshot,
    SlotDirection,
)
from app.features.itinerary_pipeline.research_adapter import (
    AdapterContext,
    RunFacts,
    adapt,
    normalize_url,
)
from app.features.itinerary_pipeline.research_contract import WireAnswer
from app.features.itinerary_pipeline.validation import validate_paste

from tests.itinerary_pipeline_support import direction_for, setup, setup_payload
from tests.test_itinerary_import import (
    CONTEXT,
    WORKSPACE,
    _export,
    valid_packet,
    valid_wire_packet,
)

FIXTURES = Path(__file__).parent / "fixtures" / "itinerary_lima_audit"


def _json(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def compact_export(snapshot: SetupSnapshot | None = None, day_id: str = "day-1", **kwargs):
    snapshot = snapshot or setup()
    return prompt_export.build_export(
        workspace_id=WORKSPACE,
        workspace_revision=1,
        setup=snapshot,
        day_id=day_id,
        direction=kwargs.pop("direction", None) or direction_for(day_id),
        direction_revision=1,
        context_key=CONTEXT,
        results=kwargs.pop("results", {}),
        directions=kwargs.pop("directions", {}),
        export_id="exp_test",
        compact=True,
        **kwargs,
    )


def check(packet, *, export=None, snapshot=None, day_id="day-1", adapter=None, base_known=True):
    snapshot = snapshot or setup()
    export = export or compact_export(snapshot, day_id)
    raw = packet if isinstance(packet, str) else json.dumps(packet)
    return validate_paste(
        raw,
        export=export,
        day=snapshot.day(day_id),
        workspace_id=WORKSPACE,
        day_id=day_id,
        current_context_key=CONTEXT,
        adapter=adapter,
        base_known=base_known,
    )


def errors(report) -> list[str]:
    return [issue.message for issue in report.issues if issue.severity == "error"]


def warnings(report) -> list[str]:
    return [issue.message for issue in report.issues if issue.severity == "warning"]


# ------------------------------------------------------------ a normal day --


def _normal_setup(stops: int) -> SetupSnapshot:
    """A day of `stops` ordinary stops, with a direction of ordinary size."""
    payload = setup_payload()
    template = payload["days"][0]["slots"][0]
    slots = []
    for index in range(stops):
        slot = copy.deepcopy(template)
        slot["id"] = f"day1-stop{index + 1}"
        slot["label"] = f"Stop {index + 1}"
        slot["purpose"] = "A stop that belongs to the morning-to-evening progression."
        slot["cues"] = ["local", "walkable"]
        slots.append(slot)
    slots[-1]["optional"] = True
    payload["days"][0]["slots"] = slots
    return SetupSnapshot.model_validate(payload)


def _normal_direction(snapshot: SetupSnapshot) -> DayDirection:
    day = snapshot.day("day-1")
    return DayDirection(
        day_id="day-1",
        promise=(
            "A slow Miraflores day that moves from the clifftop in the morning to "
            "the neighbourhood's quieter streets, with one long lunch as its centre "
            "and nothing that needs a ride."
        ),
        trip_role="The trip's gentle opener; the historic centre waits for day two.",
        anchors=["The lunch is the anchor"],
        geography=DirectionGeography(
            required_area="Miraflores",
            starting_point="The hotel in Miraflores",
            progression="Coast in the morning, inland streets after lunch.",
            transfer_tolerance="Walking only; no rides.",
            avoid_today=["Barranco", "the historic centre"],
        ),
        rhythm=DirectionRhythm(
            effort="Low; short walks on flat streets.",
            meal_balance="One real lunch, a lighter dinner.",
            rest_policy="An unallocated hour after lunch, near the lunch stop.",
            rest_minutes_minimum=60,
            optionality="The last stop may be dropped.",
        ),
        constraints=[
            "No cliff stairs.",
            "No beach descent.",
            "Every stop reachable on foot from the one before it.",
            "Opening days stated for each stop.",
        ],
        slot_directions=[
            SlotDirection(
                slot_id=slot.id,
                role=f"{slot.label} — a calm stop that suits the time of day.",
                must_have=[
                    "Within a short walk of the previous stop",
                    f"Something specific to do at {slot.label.lower()}",
                ],
                nice_to_have=["Somewhere to sit"],
                exclusions=["A queue longer than twenty minutes"],
            )
            for slot in day.slots
        ],
        fails_if=[
            "The afternoon repeats the morning.",
            "Lunch is rushed.",
            "Every stop reachable on foot from the one before it.",
        ],
        research_checklist=[
            "Which stops open every day of the week?",
            "Is the lunch place a sit-down meal at noon?",
            "Are the clifftop paths flat?",
        ],
        continuity=DirectionContinuity(
            covered_elsewhere=["Day two covers the historic centre."],
            reserved_for_later=["The historic centre."],
        ),
    )


@pytest.mark.parametrize("stops", [3, 7, 9])
def test_a_normal_day_fits_the_envelope(stops):
    """System prompt + in-app prompt + compact schema, in characters. A
    duplication bug is what pushes a normal day over, and this is where it
    shows up first."""
    snapshot = _normal_setup(stops)
    export = compact_export(snapshot, direction=_normal_direction(snapshot))
    size = export.size_report
    assert size["total"] <= prompt_export.PROMPT_BUDGET_CHARS, size
    assert not size["over_budget"]
    sent = research.sent_sizes(export)
    assert sent["total"] == size["total"]


def test_no_accepted_requirement_is_lost():
    snapshot = _normal_setup(7)
    direction = _normal_direction(snapshot)
    prompt = compact_export(snapshot, direction=direction).call_prompt
    for line in (
        *direction.constraints,
        *direction.research_checklist,
        direction.promise,
        direction.geography.progression,
        direction.rhythm.rest_policy,
        *direction.geography.avoid_today,
    ):
        assert line in prompt, line
    for entry in direction.slot_directions:
        for item in (*entry.must_have, *entry.nice_to_have):
            assert item in prompt, item


def test_an_exact_repeat_is_said_once_and_nothing_else_is_merged():
    snapshot = _normal_setup(3)
    direction = _normal_direction(snapshot)
    prompt = compact_export(snapshot, direction=direction).call_prompt
    # Written in both `constraints` and `fails_if`; printed once.
    assert prompt.count("Every stop reachable on foot from the one before it") == 1
    # The same words at every stop are one requirement, said once, for all.
    assert prompt.count("Within a short walk of the previous stop") == 1
    assert "Every stop must: Within a short walk of the previous stop" in prompt
    assert "No stop may be: A queue longer than twenty minutes" in prompt
    # Similar is not identical: nothing fuzzy is removed.
    assert "The afternoon repeats the morning." in prompt


def test_a_line_shared_by_some_stops_stays_with_each_of_them():
    """Removing the second copy would quietly narrow the rule to the first
    stop. The audited Lima agreement has exactly this: lunch and dinner both
    exclude a menu that only suits a reader with no restrictions."""
    lima = _lima()
    prompt = compact_export(
        lima["setup"], lima["day_id"], direction=lima["direction"]
    ).call_prompt
    line = "A menu that only works for a reader with no dietary restrictions"
    assert prompt.count(line) == 2
    lunch = prompt.index("· Signature lunch ·")
    dinner = prompt.index("· Destination dinner ·")
    assert lunch < prompt.index(line) < dinner < prompt.rindex(line)


def test_the_interview_is_not_replayed():
    lima = _lima()
    export = compact_export(
        lima["setup"],
        lima["day_id"],
        direction=lima["direction"],
        directions={lima["day_id"]: lima["direction"]},
    )
    for turn in lima["direction"].agreement_trace:
        assert turn.answer not in export.prompt_text
        assert turn.decision not in export.prompt_text


def test_the_schema_is_sent_once_and_the_call_prompt_carries_none():
    export = compact_export()
    # Only the stops array carries a row count, so this appears once per schema.
    marker = '"minItems"'
    assert export.prompt_text.count(marker) == 1
    assert marker not in export.call_prompt
    assert json.loads(export.sections["schema"])["properties"].keys() >= {"stops", "issues"}


def test_the_call_prompt_does_not_ask_for_the_identity_it_stamps():
    """The old in-app prompt kept the identity section while saying not to
    return it. The compact one never shows it; the copy shows it once."""
    export = compact_export()
    assert export.input_hash not in export.call_prompt
    assert "fills in the identity" in export.call_prompt
    assert export.prompt_text.count(export.input_hash) == 2  # envelope + schema const
    schema = research.schema_for_call(export)
    assert "inputHash" not in schema["properties"]
    assert "$schema" not in schema


def test_the_voice_is_loaded_once_and_the_house_rules_are_not():
    prompt = compact_export().call_prompt
    assert prompt.count("# The Questurian voice") == 1
    assert prompt.count("# Writing conventions") == 1
    assert "house-rules" not in prompt


def test_unknown_needs_are_stated_as_unknown_not_expanded():
    prompt = compact_export().call_prompt
    assert "Dietary and access needs: not specified" in prompt
    assert "never claim a stop suits every need" in prompt


def test_free_time_and_travel_keep_their_meaning():
    snapshot = setup()
    travel = compact_export(snapshot, "day-3", direction=direction_for("day-3", ["day3-transfer", "day3-lunch"]))
    assert "Travel: Lima, Peru to Getaway destination — undecided, by car" in travel.call_prompt
    free = compact_export(snapshot, "day-2", direction=direction_for("day-2", ["day2-museum", "day2-lunch", "day2-rest", "day2-dinner"]))
    assert "day2-rest · Free time · free time" in free.call_prompt


def test_other_days_are_continuity_not_descriptions():
    snapshot = setup()
    long_promise = "A day two promise " + "that goes on " * 40
    other = direction_for("day-2", ["day2-museum", "day2-lunch", "day2-rest", "day2-dinner"])
    other = other.model_copy(update={"promise": long_promise})
    prompt = compact_export(snapshot, directions={"day-2": other}).call_prompt
    assert long_promise not in prompt
    assert "Agreed: A day two promise" in prompt


def test_the_research_allowance_scales_with_venues_only():
    snapshot = setup()
    assert prompt_export.research_budget(snapshot.day("day-1")) == {
        "venues": 6,
        "searches": 16,
        "fetches": 11,
    }
    # Free time is not a venue search.
    assert prompt_export.research_budget(snapshot.day("day-2"))["venues"] == 3
    assert "About 16 searches and 11 page reads" in compact_export().call_prompt


def test_unknown_lodging_plans_no_hotel_legs():
    payload = setup_payload()
    payload["trip"]["startingBase"] = ""
    prompt = compact_export(SetupSnapshot.model_validate(payload)).call_prompt
    assert "Lodging is unknown: no `base_start` or `base_end` journeys" in prompt


# ------------------------------------------------------------ the identity --


def test_the_identity_covers_the_format_and_the_policy_but_not_the_wording(monkeypatch):
    compact = compact_export()
    legacy = _export()
    assert compact.input_hash != legacy.input_hash
    assert compact.schema_version == RESEARCH_WIRE_VERSION
    assert legacy.schema_version == RESULT_CONTRACT_VERSION

    monkeypatch.setattr(prompt_export, "PROMPT_POLICY_REVISION", "a-later-policy")
    assert compact_export().input_hash != compact.input_hash
    monkeypatch.undo()

    original = prompt_export.instructions_section
    monkeypatch.setattr(
        prompt_export,
        "instructions_section",
        lambda **kwargs: original(**kwargs) + "\nA reworded line.",
    )
    reworded = compact_export()
    assert reworded.input_hash == compact.input_hash
    assert reworded.call_prompt != compact.call_prompt


def test_the_rollback_switch_restores_the_original_export(monkeypatch):
    monkeypatch.setenv(prompt_export.WIRE_SETTING, "v1")
    rolled_back = prompt_export.build_export(
        workspace_id=WORKSPACE,
        workspace_revision=1,
        setup=setup(),
        day_id="day-1",
        direction=direction_for(),
        direction_revision=1,
        context_key=CONTEXT,
        results={},
        directions={},
        export_id="exp_test",
    )
    assert rolled_back.schema_version == RESULT_CONTRACT_VERSION
    assert rolled_back.input_hash == _export().input_hash
    assert "## Required output JSON Schema" in rolled_back.prompt_text


# ---------------------------------------------------------- the audited day --


def _lima():
    revision = DirectionRevision.model_validate(_json("direction_revision.json"))
    snapshot = SetupSnapshot.model_validate(_json("setup.json"))
    return {
        "setup": snapshot,
        "direction": revision.direction,
        "day_id": revision.direction.day_id,
        "baseline": _json("baseline.json"),
        "export_v1": DayPromptExport.model_validate(_json("export_v1.json")),
    }


def test_the_audited_export_is_the_baseline():
    lima = _lima()
    assert len(lima["export_v1"].prompt_text) == lima["baseline"]["export_characters"]
    # And the audited call sent the legacy cut of it.
    assert len(research.build_prompt(lima["export_v1"])) == lima["baseline"]["sent_prompt_characters"]


def test_the_audited_agreement_shrinks_without_losing_a_requirement_and_says_it_is_large():
    """The same accepted direction, said once. It is still over the envelope,
    because the agreement itself is large -- and the export says so, names the
    part that is large, and cuts nothing."""
    lima = _lima()
    direction = lima["direction"]
    export = compact_export(
        lima["setup"],
        lima["day_id"],
        direction=direction,
        directions={lima["day_id"]: direction},
    )
    legacy_sent = research.sent_sizes(lima["export_v1"])["total"]
    assert export.size_report["total"] < 0.55 * lima["baseline"]["export_characters"]
    assert export.size_report["total"] < 0.75 * legacy_sent
    assert export.size_report["over_budget"] is True
    assert export.size_report["largest_section"] == "brief"
    for line in direction.constraints:
        assert " ".join(line.split()) in export.call_prompt, line
    for entry in direction.slot_directions:
        for item in entry.must_have:
            assert " ".join(item.split()) in export.call_prompt, item
    assert export.research_budget == {"venues": 7, "searches": 18, "fetches": 12}


def test_the_audited_answer_is_still_importable_and_not_complete():
    """Already-issued v1 answers keep importing against their own export.
    The audited day came back with every row selected; that never made it a
    finished day."""
    lima = _lima()
    raw = json.dumps(_json("response_v1.json"))
    result, report, _ = validate_paste(
        raw,
        export=lima["export_v1"],
        day=lima["setup"].day(lima["day_id"]),
        workspace_id=lima["export_v1"].workspace_id,
        day_id=lima["day_id"],
        current_context_key="",
    )
    assert report.valid, errors(report)
    assert report.completeness.selected == 7
    assert report.completeness.complete is False


# -------------------------------------------------------------- the adapter --


def test_a_valid_compact_answer_reads_as_a_complete_day():
    export = compact_export()
    result, report, content_hash = check(valid_wire_packet(export), export=export)
    assert report.valid, errors(report)
    assert report.completeness.complete, report.completeness
    assert result.wire_version == RESEARCH_WIRE_VERSION
    assert result.contract_version == RESULT_CONTRACT_VERSION
    assert [claim.id for claim in result.claims][:2] == ["c1", "c2"]
    assert result.stops[0].claim_ids == ["c1"]
    assert result.stops[0].why_here == ""
    assert result.stops[0].what_to_do == []
    assert result.stops[0].maps_url.startswith("https://www.google.com/maps/search/")
    # The model gave no verdict on itself, so nothing says it did.
    assert not any("The model called this ready" in w for w in warnings(report))
    assert content_hash


def test_adapting_twice_gives_the_same_day():
    export = compact_export()
    packet = valid_wire_packet(export)
    first = check(packet, export=export)
    second = check(copy.deepcopy(packet), export=export)
    assert first[2] == second[2]


def test_one_page_is_one_source_and_one_fact_per_place_stays_per_place():
    export = compact_export()
    packet = valid_wire_packet(export)
    shared = {"fact": "Open daily 9 to 5.", "url": "https://Example.com/hours/", "title": "Hours"}
    packet["stops"][0]["evidence"] = [dict(shared)]
    packet["stops"][1]["evidence"] = [dict(shared, url="https://example.com/hours")]
    result, report, _ = check(packet, export=export)
    assert report.valid, errors(report)
    urls = [source.url for source in result.sources]
    assert len([u for u in urls if u.lower().rstrip("/") == "https://example.com/hours"]) == 1
    about = [claim for claim in result.claims if claim.text == "Open daily 9 to 5."]
    assert {claim.applies_to for claim in about} == {"day1-coffee", "day1-scenic"}


def test_a_query_string_names_a_different_page():
    assert normalize_url("https://x.com/menu?branch=miraflores") != normalize_url(
        "https://x.com/menu?branch=surquillo"
    )
    assert normalize_url("https://X.com/menu/#top") == normalize_url("https://x.com/menu")
    assert normalize_url("javascript:alert(1)") is None
    assert normalize_url("not a url") is None


def test_a_malformed_page_is_named_and_not_kept_as_a_source():
    export = compact_export()
    packet = valid_wire_packet(export)
    packet["stops"][2]["evidence"] = [
        {"fact": "Serves lunch from noon.", "url": "menu.pdf", "title": "Menu"}
    ]
    result, report, _ = check(packet, export=export)
    assert report.valid, errors(report)
    claim = next(claim for claim in result.claims if claim.text == "Serves lunch from noon.")
    assert claim.source_ids == []
    assert any("menu.pdf" in message for message in warnings(report))


def test_an_unknown_field_is_named_and_an_unknown_version_is_refused():
    export = compact_export()
    packet = valid_wire_packet(export)
    packet["confidence"] = 0.9
    packet["stops"][0]["whyHere"] = "old habits"
    _, report, _ = check(packet, export=export)
    assert report.valid
    assert any("confidence" in message and "stops.whyHere" in message for message in warnings(report))

    packet["contractVersion"] = "itinerary-day-research-v9"
    result, report, _ = check(packet, export=export)
    assert result is None
    assert any(RESEARCH_WIRE_VERSION in message for message in errors(report))


def test_an_answer_in_the_wrong_format_for_its_prompt_is_refused():
    export = compact_export()
    legacy_shaped = valid_packet(export)  # v1 body, compact export's identity
    _, report, _ = check(legacy_shaped, export=export)
    assert any("asked for" in message for message in errors(report))

    legacy_export = _export()
    compact_shaped = valid_wire_packet(legacy_export)
    _, report, _ = check(compact_shaped, export=legacy_export)
    assert any("asked for" in message for message in errors(report))


@pytest.mark.parametrize(
    "edit, expected",
    [
        (lambda p: p["stops"].pop(1), "missing"),
        (lambda p: p["stops"].append(copy.deepcopy(p["stops"][0])), "appears 2 times"),
        (lambda p: p["stops"].reverse(), "different order"),
    ],
)
def test_the_rows_must_be_this_day_s_rows(edit, expected):
    export = compact_export()
    packet = valid_wire_packet(export)
    edit(packet)
    _, report, _ = check(packet, export=export)
    assert not report.valid
    assert any(expected in message for message in errors(report))


def test_an_unresolved_row_is_a_real_answer_and_an_incomplete_day():
    export = compact_export()
    packet = valid_wire_packet(export)
    packet["stops"][2].update(
        status="unresolved",
        name=None,
        addressOrMeetingPoint=None,
        area=None,
        startMinutes=None,
        durationMinutes=None,
        readerCopy="",
        evidence=[],
        unresolvedReason="No sit-down lunch within the walking limit opens daily.",
    )
    result, report, _ = check(packet, export=export)
    assert report.valid, errors(report)
    assert result.stops[2].maps_url is None
    assert not report.completeness.complete
    assert report.completeness.required_unresolved == ["Special lunch"]
    assert result.status == "needs_decision"


def test_the_optional_stop_can_go_and_the_route_closes_over_it():
    export = compact_export()
    packet = valid_wire_packet(export)
    last = packet["stops"][-1]
    last.update(status="omitted_optional", name=None, addressOrMeetingPoint=None,
                startMinutes=None, durationMinutes=None, readerCopy="", evidence=[],
                unresolvedReason="Too late for a relaxed day.")
    # The leg to it and from it go; dinner now ends the day.
    packet["transfers"] = [
        t for t in packet["transfers"] if "day1-evening" not in (t["from"], t["to"])
    ] + [
        {"from": "day1-dinner", "to": "base_end", "mode": "taxi", "minutesMin": 10,
         "minutesMax": 20, "basis": "planning_estimate", "note": "", "evidence": []}
    ]
    _, report, _ = check(packet, export=export)
    assert report.valid, errors(report)
    assert report.completeness.complete, report.completeness


def test_a_blocking_issue_keeps_the_day_open_and_a_caveat_does_not():
    export = compact_export()
    packet = valid_wire_packet(export)
    packet["issues"] = [
        {"slotId": "day1-dinner", "blocking": False, "text": "Busy on Fridays.", "proposedChange": None},
    ]
    result, report, _ = check(packet, export=export)
    assert report.completeness.complete
    assert result.editor_notes == ["Dinner: Busy on Fridays."]
    assert result.feasibility == []

    packet["issues"].append(
        {
            "slotId": "day1-dinner",
            "blocking": True,
            "text": "It closes at 19:00 on Sundays and the day arrives at 19:00.",
            "proposedChange": "Move dinner earlier or pick a place open late on Sundays.",
        }
    )
    result, report, _ = check(packet, export=export)
    assert report.valid
    assert not report.completeness.complete
    assert report.completeness.outstanding_checks == [
        "Dinner: It closes at 19:00 on Sundays and the day arrives at 19:00."
    ]
    assert result.proposed_changes[0].slot_id == "day1-dinner"
    assert result.status == "needs_decision"


def test_the_saved_day_takes_its_continuity_from_the_agreement():
    snapshot = setup()
    export = compact_export(snapshot)
    context = AdapterContext(
        day=snapshot.day("day-1"),
        trip_role="The opener.",
        schedule_label="09:00–21:00",
        reserved_for_later=["The historic centre."],
    )
    packet = valid_wire_packet(export)
    packet["nextDayNotes"] = ["Day two starts late.", "  "]
    result, _, _ = check(packet, export=export, adapter=context)
    assert result.trip_role == "The opener."
    assert result.schedule_label == "09:00–21:00"
    assert result.trip_memory.used_places[0] == "Place for day1-coffee"
    assert result.trip_memory.reserved_for_later == ["The historic centre."]
    assert result.trip_memory.next_day_implications == ["Day two starts late."]


def test_browsing_is_read_off_the_run_and_unknown_otherwise():
    snapshot = setup()
    export = compact_export(snapshot)
    packet = valid_wire_packet(export)

    _, pasted, _ = check(packet, export=export)
    assert any("cannot tell whether any page was actually read" in w for w in warnings(pasted))

    ran = AdapterContext(day=snapshot.day("day-1"), run=RunFacts(performed_at="2026-09-16", browsed=True))
    result, report, _ = check(packet, export=export, adapter=ran)
    assert result.research.browsing_used is True
    assert result.research.browsing_basis == "tool_calls"
    assert result.research.performed_at == "2026-09-16"
    assert not any("page was actually read" in w for w in warnings(report))

    idle = AdapterContext(day=snapshot.day("day-1"), run=RunFacts(browsed=False))
    _, report, _ = check(packet, export=export, adapter=idle)
    assert any("made no web searches" in w for w in warnings(report))


def test_the_adapter_is_pure():
    snapshot = setup()
    export = compact_export(snapshot)
    answer = WireAnswer.model_validate(valid_wire_packet(export))
    before = answer.model_dump()
    context = AdapterContext(day=snapshot.day("day-1"))
    assert adapt(answer, context) == adapt(answer, context)
    assert answer.model_dump() == before


# ------------------------------------------------------------ the journeys --


def _route_packet(export):
    return valid_wire_packet(export)


def test_a_missing_journey_means_the_day_is_not_planned():
    export = compact_export()
    packet = _route_packet(export)
    packet["transfers"] = [
        t for t in packet["transfers"] if (t["from"], t["to"]) != ("day1-lunch", "day1-leisure")
    ]
    _, report, _ = check(packet, export=export)
    assert report.valid
    assert report.completeness.missing_legs == ["Special lunch → Leisure exploration"]
    assert not report.completeness.complete


def test_a_journey_with_no_known_time_is_missing_too():
    export = compact_export()
    packet = _route_packet(export)
    packet["transfers"][2].update(basis="unknown", minutesMin=None, minutesMax=None)
    _, report, _ = check(packet, export=export)
    assert report.completeness.missing_legs == ["Scenic low-effort visit → Special lunch (time unknown)"]


def test_a_journey_that_does_not_fit_is_a_conflict():
    export = compact_export()
    packet = _route_packet(export)
    # Coffee ends 09:45; the scenic stop starts 11:00. A 90-minute ride does not fit.
    packet["transfers"][1].update(mode="taxi", minutesMin=60, minutesMax=90)
    _, report, _ = check(packet, export=export)
    assert report.valid
    assert report.completeness.schedule_conflicts == ["Coffee / light breakfast → Scenic low-effort visit"]
    assert any("15 min short" in w for w in warnings(report))
    assert not report.completeness.complete


def test_a_rest_has_to_fit_after_the_journey():
    export = compact_export()
    packet = _route_packet(export)
    packet["restWindows"][0]["minutes"] = 160  # 165-minute gap, 15-minute walk
    _, report, _ = check(packet, export=export)
    assert report.completeness.schedule_conflicts == ["Leisure exploration → Dinner"]


def test_a_long_unexplained_gap_is_said_and_does_not_block():
    export = compact_export()
    packet = _route_packet(export)
    packet["restWindows"] = []
    _, report, _ = check(packet, export=export)
    assert any("150 min between Leisure exploration and Dinner" in w for w in warnings(report))
    assert report.completeness.complete


def test_the_ends_of_the_day_are_journeys_only_when_the_lodging_is_known():
    export = compact_export()
    packet = _route_packet(export)
    packet["transfers"] = [t for t in packet["transfers"] if "base_start" != t["from"]]
    _, known, _ = check(packet, export=export, base_known=True)
    assert known.completeness.missing_legs == ["base → Coffee / light breakfast"]
    _, unknown, _ = check(packet, export=export, base_known=False)
    assert unknown.completeness.missing_legs == []


def test_a_return_to_base_needs_both_legs_and_room_for_them():
    export = compact_export()
    packet = _route_packet(export)
    packet["restWindows"][0]["locationPolicy"] = "return_to_base"
    packet["restWindows"][0]["minutes"] = 90
    _, report, _ = check(packet, export=export, base_known=False)
    assert report.completeness.missing_legs == [
        "Leisure exploration → base (lodging unknown)",
        "base → Dinner (lodging unknown)",
    ]

    leg = {"mode": "taxi", "minutesMin": 10, "minutesMax": 15, "basis": "planning_estimate", "note": "", "evidence": []}
    packet["transfers"] += [
        dict(leg, **{"from": "day1-leisure", "to": "base"}),
        dict(leg, **{"from": "base", "to": "day1-dinner"}),
    ]
    _, report, _ = check(packet, export=export, base_known=True)
    assert report.completeness.missing_legs == []
    assert report.completeness.schedule_conflicts == []
    assert report.completeness.complete


def test_a_travel_row_is_the_journey_and_is_not_counted_twice():
    payload = setup_payload()
    payload["days"][2]["slots"].insert(
        0,
        payload["days"][0]["slots"][0] | {"id": "day3-coffee", "label": "Coffee"},
    )
    snapshot = SetupSnapshot.model_validate(payload)
    export = compact_export(
        snapshot,
        "day-3",
        direction=direction_for("day-3", ["day3-coffee", "day3-transfer", "day3-lunch"]),
    )
    stop = lambda slot_id, start, duration, **extra: {  # noqa: E731
        "slotId": slot_id, "status": "selected", "name": extra.get("name"),
        "category": extra.get("category"), "addressOrMeetingPoint": extra.get("address"),
        "area": None, "startMinutes": start, "durationMinutes": duration,
        "readerCopy": "Copy.", "practicalNotes": [],
        "evidence": extra.get("evidence", []), "unresolvedReason": None,
    }
    evidence = [{"fact": "It exists.", "url": "https://example.com/a", "title": "A"}]
    packet = {
        "contractVersion": RESEARCH_WIRE_VERSION,
        "workspaceId": WORKSPACE,
        "dayId": "day-3",
        "exportId": export.export_id,
        "inputHash": export.input_hash,
        "title": "To the coast",
        "dayIntro": "Intro.",
        "stops": [
            stop("day3-coffee", 480, 30, name="Café", category="dining", address="A 1", evidence=evidence),
            # Coffee ends 08:30, the drive takes 08:30–10:30, lunch at 12:00.
            stop("day3-transfer", 510, 120),
            stop("day3-lunch", 720, 60, name="Lunch place", category="dining", address="B 2", evidence=evidence),
        ],
        "transfers": [
            {"from": "day3-coffee", "to": "day3-lunch", "mode": "car", "minutesMin": 110,
             "minutesMax": 120, "basis": "planning_estimate", "note": "", "evidence": []},
        ],
        "restWindows": [],
        "issues": [],
        "nextDayNotes": [],
    }
    _, report, _ = check(packet, export=export, snapshot=snapshot, day_id="day-3", base_known=False)
    assert report.valid, errors(report)
    assert report.completeness.schedule_conflicts == []
    assert report.completeness.missing_legs == []
    assert report.completeness.complete


def test_times_after_midnight_still_add_up():
    export = compact_export()
    packet = _route_packet(export)
    packet["stops"][5]["startMinutes"] = 1450  # 00:10 the next morning
    packet["transfers"][-2].update(minutesMax=30)
    _, report, _ = check(packet, export=export)
    assert report.completeness.schedule_conflicts == []


# ------------------------------------------------------------ the lifecycle --


@pytest.fixture
def client(isolated_db, monkeypatch):
    from tests.itinerary_pipeline_support import itinerary_client

    with itinerary_client(monkeypatch) as test_client:
        yield test_client


def _transcript(tmp_path: Path, session: str, searches: int, fetches: int) -> Path:
    folder = tmp_path / "claude" / "projects" / "-tmp-abw-claude-writer"
    folder.mkdir(parents=True)
    lines = []
    for index in range(searches):
        block = {"type": "tool_use", "name": "WebSearch", "id": f"s{index}"}
        # Streamed transcripts repeat a message; the id is what counts.
        lines += [{"message": {"content": [block]}}] * 2
    for index in range(fetches):
        lines.append({"message": {"content": [{"type": "tool_use", "name": "WebFetch", "id": f"f{index}"}]}})
    path = folder / f"{session}.jsonl"
    path.write_text("\n".join(json.dumps(line) for line in lines), encoding="utf-8")
    return path


def _in_app(client, workspace_id, view, *, session="sess-1", seen=None):
    from tests.test_itinerary_research import _answer, _run

    answer = _answer(view)
    return _run(
        client,
        workspace_id,
        {
            "structured_output": answer,
            "num_turns": 30,
            "session_id": session,
            "duration_ms": 420_000,
            "usage": {"output_tokens": 5100},
            "total_cost_usd": 1.2,
        },
        seen=seen,
    )


def test_an_in_app_run_records_what_it_sent_and_what_it_did(client, tmp_path, monkeypatch):
    from tests.test_itinerary_workflow import accepted_export, create, day

    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "claude"))
    _transcript(tmp_path, "sess-1", searches=12, fetches=7)
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    assert view["export"]["compact"] is True
    assert view["export"]["size"]["total"] <= prompt_export.PROMPT_BUDGET_CHARS
    seen: list[dict] = []
    _in_app(client, workspace_id, view, seen=seen)

    # The call site's own system prompt, not the article writer's.
    assert seen[0]["system_prompt"] == prompt_export.SYSTEM_PROMPT

    found = day(client, workspace_id)["research"]
    assert found["state"] == "done"
    assert found["searches"] == 12
    assert found["fetches"] == 7
    assert found["duration_ms"] == 420_000
    assert found["output_tokens"] == 5100
    assert found["sent_characters"] == view["export"]["size"]["total"]
    assert found["budget"] == view["export"]["budget"]
    assert found["wire_version"] == RESEARCH_WIRE_VERSION
    # The transcript was copied into the app's own folder, not left pointing
    # at someone's home directory.
    kept = Path(isolated_path(client)) / "itinerary-research-audit"
    assert len(list(kept.glob("*.jsonl"))) == 1


def isolated_path(client) -> str:
    import app.core.database as database

    return str(database.DATA_DIR)


def test_the_run_s_own_answer_inherits_its_telemetry_and_an_edited_one_does_not(client, tmp_path, monkeypatch):
    from tests.test_itinerary_workflow import BASE, accepted_export, create, day, key

    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "claude"))
    _transcript(tmp_path, "sess-1", searches=3, fetches=2)
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    _in_app(client, workspace_id, view)
    raw = day(client, workspace_id)["research"]["raw"]

    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview", json={"raw": raw}
    ).json()
    assert preview["valid"], preview["report"]["issues"]
    assert preview["from_research_run"] is True
    assert preview["result"]["research"]["browsingBasis"] == "tool_calls"
    assert preview["result"]["research"]["browsingUsed"] is True
    assert preview["result"]["research"]["performedAt"]

    edited = json.loads(raw)
    edited["title"] = "A title the operator typed"
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(edited)},
    ).json()
    assert preview["from_research_run"] is False
    assert preview["result"]["research"]["browsingBasis"] == "unknown"

    saved = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={"raw": raw, "content_hash": client.post(
            f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview", json={"raw": raw}
        ).json()["content_hash"], "import_key": key()},
    )
    assert saved.status_code == 200, saved.text
    after = day(client, workspace_id)
    assert after["research"]["saved_as_revision"] == 1
    # What arrived is kept beside what the app built from it.
    assert after["result"]["returned_raw"] == raw
    assert after["result"]["result"]["wireVersion"] == RESEARCH_WIRE_VERSION
    # Saving is not reviewing.
    assert after["review"]["evidence_reviewed"] is False


def test_missing_telemetry_is_unknown_not_zero(client, tmp_path, monkeypatch):
    from tests.test_itinerary_workflow import accepted_export, create, day

    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "nowhere"))
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    _in_app(client, workspace_id, view, session="sess-not-on-disk")
    found = day(client, workspace_id)["research"]
    assert found["state"] == "done"
    assert found["searches"] is None
    assert found["fetches"] is None


def test_a_failed_run_is_not_retried(client):
    from tests.test_itinerary_research import _dispatch
    from tests.test_itinerary_workflow import accepted_export, create, day

    calls: list[int] = []

    def call(**_kwargs):
        calls.append(1)
        raise research.ResearchUnavailable("Claude did not answer in time.", kind="provider_unavailable")

    workspace_id = create(client)
    accepted_export(client, workspace_id)
    assert _dispatch(client, workspace_id, call).status_code == 202
    found = day(client, workspace_id)["research"]
    assert found["state"] == "failed"
    assert found["fault"] == "provider_unavailable"
    assert calls == [1]


def test_an_older_format_prompt_still_imports_but_is_not_run(client, monkeypatch):
    """Issued before the switch: its pasted answers still import against it,
    and the app asks for a rebuild before it will run research on it."""
    from tests.test_itinerary_research import _dispatch, transport
    from tests.test_itinerary_workflow import BASE, accepted_export, create, day, key

    monkeypatch.setenv(prompt_export.WIRE_SETTING, "v1")
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    assert view["export"]["legacy"] is True
    monkeypatch.delenv(prompt_export.WIRE_SETTING)

    after = day(client, workspace_id)
    assert after["export"]["legacy"] is True
    assert after["export"]["runnable"] is False
    refused = _dispatch(client, workspace_id, transport({}), key())
    assert refused.status_code == 409
    assert "older, larger research format" in refused.json()["detail"]

    class _Export:
        export_id = view["export"]["export_id"]
        input_hash = view["export"]["input_hash"]
        slot_ids = [slot["id"] for slot in view["slots"]]

    packet = valid_packet(_Export())
    packet["workspaceId"] = workspace_id
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert preview["valid"], preview["report"]["issues"]
    assert preview["result"]["wireVersion"] == ""

    rebuilt = client.post(f"{BASE}/workspaces/{workspace_id}/days/day-1/exports").json()
    assert rebuilt["export"]["compact"] is True
    assert rebuilt["export"]["export_id"] != view["export"]["export_id"]


# ------------------------------------------------ the schema against itself --

_KEYWORDS = {
    "type", "enum", "const", "required", "properties", "items",
    "additionalProperties", "minItems", "maxItems", "minimum", "maximum",
    "description",
}
_TYPES = {
    "object": dict, "array": list, "string": str, "boolean": bool,
    "integer": int, "null": type(None),
}


def _conforms(value, schema, path="$") -> list[str]:
    """The subset of JSON Schema the compact schema uses, checked by hand.

    Deliberately small: no dependency is added for this, and a keyword the
    generator starts using without this knowing it fails loudly below.
    """
    problems = [f"{path}: unknown keyword {k}" for k in schema if k not in _KEYWORDS]
    if "const" in schema and value != schema["const"]:
        problems.append(f"{path}: not the constant")
    if "enum" in schema and value not in schema["enum"]:
        problems.append(f"{path}: {value!r} not in enum")
    if "type" in schema:
        kinds = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        ok = any(
            isinstance(value, _TYPES[kind])
            and not (kind == "integer" and isinstance(value, bool))
            for kind in kinds
        )
        if not ok:
            return problems + [f"{path}: {type(value).__name__} is not {kinds}"]
    if isinstance(value, dict) and "properties" in schema:
        for key in schema.get("required", []):
            if key not in value:
                problems.append(f"{path}: missing {key}")
        if schema.get("additionalProperties") is False:
            problems += [f"{path}: extra {k}" for k in value if k not in schema["properties"]]
        for key, sub in schema["properties"].items():
            if key in value:
                problems += _conforms(value[key], sub, f"{path}.{key}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", 10**9):
            problems.append(f"{path}: {len(value)} items")
        for index, item in enumerate(value):
            problems += _conforms(item, schema.get("items", {}), f"{path}[{index}]")
    if isinstance(value, int) and not isinstance(value, bool):
        if value < schema.get("minimum", -(10**9)) or value > schema.get("maximum", 10**9):
            problems.append(f"{path}: {value} out of range")
    return problems


def test_the_schema_is_well_formed_and_a_real_answer_satisfies_it():
    export = compact_export()
    packet = valid_wire_packet(export)
    assert _conforms(packet, export.response_schema) == []
    # Every object asks for every key it names: the request is demanding.
    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)
    walk(export.response_schema)
    # And the in-app answer, which has no identity, satisfies the call schema.
    unstamped = {k: v for k, v in packet.items() if k not in {"contractVersion", "workspaceId", "dayId", "exportId", "inputHash"}}
    assert _conforms(unstamped, research.schema_for_call(export)) == []
    assert _conforms({**unstamped, "stops": unstamped["stops"][:-1]}, research.schema_for_call(export))


def test_the_audited_answer_does_not_satisfy_the_compact_schema():
    """A v1 answer is a different format, and the schema says so."""
    lima = _lima()
    export = compact_export(lima["setup"], lima["day_id"], direction=lima["direction"])
    assert _conforms(_json("response_v1.json"), export.response_schema)
