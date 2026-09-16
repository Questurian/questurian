"""One day from handed-over setup to a saved proposal, through the real routes.

Nothing here reaches a provider: the two routes that would are patched with
the scripted doubles. Everything else -- the store, the revisions, the
validator, the export -- is the real thing, because the failures this feature
has to survive are failures of ordering and identity rather than of prose.
"""

from __future__ import annotations

import json
import uuid

import pytest
from app.features.itinerary_pipeline.contracts import ITINERARY_MARKER_KEYS

from tests.itinerary_pipeline_support import (
    itinerary_client,
    setup_payload,
    stay,
    valid_selection,
)


@pytest.fixture
def client(isolated_db, monkeypatch):
    """The real app with the spending routes wired to doubles.

    One line here and the substance in the support module, so a second test
    file can take the same fixture without importing a name it never uses --
    which is the shape every linter flags and nobody can silence.
    """
    with itinerary_client(monkeypatch) as test_client:
        yield test_client


BASE = "/api/itinerary-pipeline"


def key() -> str:
    return uuid.uuid4().hex


def create(client, **kwargs):
    response = client.post(f"{BASE}/workspaces", json={"setup": setup_payload(**kwargs)})
    assert response.status_code == 200, response.text
    return response.json()["workspace_id"]


def day(client, workspace_id, day_id="day-1"):
    response = client.get(f"{BASE}/workspaces/{workspace_id}/days/{day_id}")
    assert response.status_code == 200, response.text
    return response.json()


def interview_to_agreement(client, workspace_id, day_id="day-1"):
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/{day_id}/grill/start",
        json={"attempt_key": key()},
    ).json()
    while view["grill"]["status"] == "asking":
        view = client.post(
            f"{BASE}/workspaces/{workspace_id}/days/{day_id}/grill/answer",
            json={"attempt_key": key(), "answer": "That sounds right."},
        ).json()
    return view


def accepted_export(client, workspace_id, day_id="day-1"):
    interview_to_agreement(client, workspace_id, day_id)
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/{day_id}/direction/prepare",
        json={"attempt_key": key()},
    ).json()
    revision = view["candidate_direction"]["revision"]
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/{day_id}/direction/accept",
        json={"revision": revision},
    )
    response = client.post(f"{BASE}/workspaces/{workspace_id}/days/{day_id}/exports")
    assert response.status_code == 200, response.text
    return response.json()


# ------------------------------------------------------------- the handoff --


def test_the_handoff_is_idempotent_on_the_draft(client):
    """A double-tapped Start and a reload two minutes later are one intent.
    Two workspaces holding two halves of one trip is the failure."""
    first = create(client)
    second = create(client)
    assert first == second


def test_a_workspace_resumes_after_a_reload(client):
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    # A fresh read, as a reloaded tab would do.
    view = day(client, workspace_id)
    assert view["grill"]["status"] == "agreed"
    assert view["state"] == "agreed"


def test_reading_a_workspace_that_is_not_there_is_a_404(client):
    assert client.get(f"{BASE}/workspaces/nope").status_code == 404


# --------------------------------------------------------------- the gates --


def test_an_unapproved_layout_cannot_start_an_interview(client):
    workspace_id = create(client, approved=False)
    response = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/start",
        json={"attempt_key": key()},
    )
    assert response.status_code == 409
    assert "not approved" in response.json()["detail"]
    assert day(client, workspace_id)["state"] == "layout_needs_review"


def test_a_layout_edited_after_approval_stops_being_approved(client):
    """The server measures this with its own signature over its own data, so a
    change from any tab through any route is caught the same way."""
    workspace_id = create(client)
    assert day(client, workspace_id)["layout_approved"]

    payload = setup_payload()
    payload["days"][0]["slots"][2]["label"] = "A completely different lunch"
    response = client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": 1},
    )
    assert response.status_code == 200, response.text
    assert not day(client, workspace_id)["layout_approved"]


def test_saving_an_unchanged_setup_moves_no_revision(client):
    """Retyping a value to its existing text must not invalidate an export."""
    workspace_id = create(client)
    before = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": setup_payload(), "expected_revision": before},
    )
    after = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    assert after == before


def test_a_setup_written_against_a_stale_revision_is_refused(client):
    workspace_id = create(client)
    payload = setup_payload()
    payload["days"][0]["label"] = "Renamed"
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": 1},
    )
    payload["days"][0]["label"] = "Renamed by the other tab"
    response = client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": 1},
    )
    assert response.status_code == 409
    assert response.headers["X-Itinerary-Revision"] == "2"


# ------------------------------------------------------------- the spending --


def test_the_same_attempt_key_does_not_buy_a_second_turn(client):
    workspace_id = create(client)
    shared = key()
    first = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/start",
        json={"attempt_key": shared},
    )
    assert first.status_code == 200
    calls = len(client.grill_llm.prompts)
    second = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/start",
        json={"attempt_key": shared},
    )
    assert second.status_code == 409
    assert len(client.grill_llm.prompts) == calls


def test_the_interview_reaches_agreement_on_every_topic(client):
    workspace_id = create(client)
    view = interview_to_agreement(client, workspace_id)
    assert view["grill"]["status"] == "agreed"
    assert view["grill"]["markers_missing"] == []
    assert view["state"] == "agreed"


def test_a_second_interview_on_the_same_day_is_refused(client):
    workspace_id = create(client)
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/start",
        json={"attempt_key": key()},
    )
    response = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/start",
        json={"attempt_key": key()},
    )
    assert response.status_code == 400


# -------------------------------------------------------------- the summary --


def test_a_summary_is_a_candidate_until_it_is_accepted(client):
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/prepare",
        json={"attempt_key": key()},
    ).json()
    assert view["state"] == "direction_review"
    assert view["candidate_direction"]["status"] == "candidate"
    assert view["accepted_direction"] is None

    revision = view["candidate_direction"]["revision"]
    accepted = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/accept",
        json={"revision": revision},
    ).json()
    assert accepted["accepted_direction"]["status"] == "accepted"
    assert accepted["state"] == "direction_accepted"


def test_accepting_a_direction_does_not_age_the_conversation(client):
    """The direction is written FROM the conversation, so it cannot be a reason
    the conversation is out of date. A false alarm here is worse than no alarm:
    it teaches the operator to ignore the real one."""
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/prepare",
        json={"attempt_key": key()},
    ).json()
    assert not view["grill_context_changed"]

    accepted = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/accept",
        json={"revision": view["candidate_direction"]["revision"]},
    ).json()
    assert not accepted["grill_context_changed"]

    # Building the prompt does not age it either.
    exported = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/exports"
    ).json()
    assert not exported["grill_context_changed"]


def test_editing_the_day_does_age_the_conversation(client):
    """The alarm still fires for the thing it is for."""
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    payload = setup_payload()
    payload["days"][0]["preparationNotes"] = "They land at 11am, so the morning is short."
    revision = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": revision},
    )
    assert day(client, workspace_id)["grill_context_changed"]


def test_the_summary_covers_every_approved_stop_and_is_short(client):
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/prepare",
        json={"attempt_key": key()},
    ).json()
    summary = view["candidate_direction"]["direction"]
    assert summary["contract_version"] == "itinerary-day-summary-v1"
    assert [entry["slot_id"] for entry in summary["slots"]] == [
        slot["id"] for slot in view["slots"]
    ]
    # Requirements and preferences are kept apart; nothing else is asked for.
    assert summary["requirements"] == ["No cliff stairs"]
    # A "setup" must with no must in the setup is kept, as a preference.
    assert summary["preferences"] == ["Step-free everywhere", "Walkable"]
    for gone in ("fails_if", "research_checklist", "change_policy", "rhythm"):
        assert gone not in summary


def test_the_extraction_is_told_an_accepted_suggestion_is_only_a_preference(client):
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/prepare",
        json={"attempt_key": key()},
    )
    prompt = client.direction_llm_prompts[-1]
    assert "is never the source of" in prompt
    assert "write nothing about" in prompt
    assert "Answer to Q1:" in prompt


def test_the_agreement_trace_remembers_an_accepted_suggestion(client):
    """An accepted draft is not first-hand knowledge, and the export says so."""
    workspace_id = create(client)
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/start",
        json={"attempt_key": key()},
    ).json()
    # Answer the first question by sending the suggestion back untouched.
    suggested = view["grill"]["pending"]["recommendation"]
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/answer",
        json={"attempt_key": key(), "answer": suggested},
    ).json()
    while view["grill"]["status"] == "asking":
        view = client.post(
            f"{BASE}/workspaces/{workspace_id}/days/day-1/grill/answer",
            json={"attempt_key": key(), "answer": "In my own words."},
        ).json()
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/prepare",
        json={"attempt_key": key()},
    ).json()
    trace = view["candidate_direction"]["direction"]["agreement_trace"]
    assert trace[0]["answer_origin"] == "accepted_recommendation"
    assert trace[1]["answer_origin"] == "operator"


# --------------------------------------------------------------- the export --


def test_the_export_names_this_day_and_its_slots_and_costs_nothing(client):
    workspace_id = create(client)
    before = len(client.grill_llm.prompts)
    view = accepted_export(client, workspace_id)
    spent_on_export = len(client.grill_llm.prompts) - before
    prompt = view["export"]["prompt_text"]

    assert view["state"] == "prompt_ready"
    for slot in view["slots"]:
        assert slot["id"] in prompt
    assert view["export"]["input_hash"] in prompt
    assert "Day 1 of 3" in prompt
    # The interview turns, and nothing for building the prompt.
    assert spent_on_export == len(ITINERARY_MARKER_KEYS) + 1


def test_the_prompt_asks_for_places_not_an_article(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    prompt = view["export"]["prompt_text"]
    assert "# Choose the places for one day" in prompt
    assert "Firm requirements: No cliff stairs" in prompt
    assert "Preferences (adjust if needed): Step-free everywhere; Walkable" in prompt
    # No voice, no reader copy, no evidence graph.
    for gone in ("Questurian voice", "readerCopy", "dayIntro", "claimIds", "feasibility"):
        assert gone not in prompt
    size = view["export"]["size"]
    assert size["total"] < size["target"], size


def test_copying_twice_for_an_unchanged_day_reuses_one_export(client):
    """Otherwise the operator holds one prompt while the app expects an answer
    to another."""
    workspace_id = create(client)
    first = accepted_export(client, workspace_id)["export"]["export_id"]
    second = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/exports"
    ).json()["export"]["export_id"]
    assert first == second


def test_an_export_goes_stale_when_the_day_changes(client):
    workspace_id = create(client)
    accepted_export(client, workspace_id)
    payload = setup_payload()
    payload["days"][0]["setupNotes"] = "They land at 11am, so the morning is short."
    revision = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": revision},
    )
    view = day(client, workspace_id)
    assert view["export"]["stale"]
    assert view["state"] == "context_changed"


def test_exporting_without_an_accepted_summary_is_refused(client):
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    response = client.post(f"{BASE}/workspaces/{workspace_id}/days/day-1/exports")
    assert response.status_code == 400


# --------------------------------------------------------------- the import --


def _packet(export_view, **overrides):
    class _Export:
        export_id = export_view["export"]["export_id"]
        input_hash = export_view["export"]["input_hash"]
        slot_ids = [slot["id"] for slot in export_view["slots"]]

    packet = valid_selection(_Export(), dayId=export_view["day_id"])
    packet["workspaceId"] = export_view["workspace_id"]
    packet.update(overrides)
    return packet


def save(client, workspace_id, packet, day_id="day-1"):
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/{day_id}/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert preview["valid"], preview["report"]["issues"]
    response = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/{day_id}/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_a_valid_answer_previews_and_then_saves(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)

    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert preview["valid"], preview["report"]["issues"]
    assert preview["report"]["completeness"]["complete"]
    assert preview["repair_prompt"] is None

    saved = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    ).json()
    assert saved["created"] is True
    assert saved["state"] == "proposal_ready"
    proposal = saved["proposal"]["selection"]
    assert proposal["overview"] == "An easy Miraflores day."
    # The app adds a map search for a chosen place; it never takes one from the answer.
    assert proposal["picks"][0]["mapsUrl"].startswith("https://www.google.com/maps/search/")
    assert proposal["picks"][0]["chosenBy"] == "ai"


def test_saving_twice_with_one_key_does_not_create_two_results(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    body = {
        "raw": json.dumps(packet),
        "content_hash": preview["content_hash"],
        "import_key": key(),
    }
    first = client.post(f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply", json=body).json()
    second = client.post(f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply", json=body).json()
    assert first["created"] is True
    assert second["created"] is False
    assert len(second["history"]) == 1


def test_editing_the_answer_after_checking_invalidates_the_save(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    packet["overview"] = "Typed after the check."
    response = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    assert response.status_code == 409
    assert "changed since it was checked" in response.json()["detail"]


def test_an_invalid_answer_cannot_be_saved_and_offers_a_repair_prompt(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    del packet["picks"][1]

    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert not preview["valid"]
    assert preview["repair_prompt"]
    assert view["export"]["input_hash"] in preview["repair_prompt"]

    response = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"] or "x" * 12,
            "import_key": key(),
        },
    )
    assert response.status_code == 400
    assert day(client, workspace_id)["proposal"] is None


def test_an_answer_in_the_old_article_format_is_refused_by_name(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view, contractVersion="itinerary-day-research-v2")
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert not preview["valid"]
    assert "older article format" in preview["report"]["issues"][0]["message"]


def test_an_answer_to_an_older_prompt_is_told_what_changed(client):
    workspace_id = create(client)
    first = accepted_export(client, workspace_id)
    answer_to_first = _packet(first)

    payload = setup_payload()
    payload["days"][0]["preparationNotes"] = "They land at 11am."
    revision = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": revision},
    )
    second = client.post(f"{BASE}/workspaces/{workspace_id}/days/day-1/exports").json()
    assert second["export"]["export_id"] != first["export"]["export_id"]

    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(answer_to_first)},
    ).json()
    assert not preview["valid"]
    messages = [i["message"] for i in preview["report"]["issues"] if i["severity"] == "error"]
    assert any("has changed since that prompt was built" in m for m in messages), messages
    assert not any("different copy of the prompt" in m for m in messages)


def test_an_answer_for_the_wrong_day_leaves_the_saved_day_alone(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    save(client, workspace_id, _packet(view))
    wrong = _packet(view, dayId="day-2", overview="Someone else's day")
    later = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(wrong)},
    ).json()
    assert not later["valid"]
    assert day(client, workspace_id)["proposal"]["selection"]["overview"] == "An easy Miraflores day."


def test_an_unmet_requirement_saves_as_a_proposal_with_a_question(client):
    """The rest of the day is kept, the stop is named, and nothing pretends it is filled."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    packet["picks"][2].update(
        {
            "status": "unresolved",
            "name": None,
            "address": None,
            "area": None,
            "sources": [],
            "reason": "No lunch nearby is step-free.",
        }
    )
    packet["questions"] = [
        {
            "slotId": "day1-lunch",
            "question": "No step-free lunch fits the route. Which should give?",
            "options": ["Allow one step at the door", "Move lunch to Barranco"],
        }
    ]
    saved = save(client, workspace_id, packet)
    assert saved["state"] == "proposal_open"
    completeness = saved["proposal"]["report"]["completeness"]
    assert completeness["required_unresolved"] == ["Special lunch"]
    assert completeness["outstanding_checks"] == [
        "No step-free lunch fits the route. Which should give?"
    ]


def test_an_open_stop_must_say_why(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    packet["picks"][2].update({"status": "unresolved", "name": None, "reason": ""})
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert not preview["valid"]
    assert any("does not say why" in i["message"] for i in preview["report"]["issues"])


def test_a_replacement_keeps_the_earlier_one_in_history(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    for overview in ("First attempt.", "Second attempt."):
        save(client, workspace_id, _packet(view, overview=overview))
    view = day(client, workspace_id)
    assert [row["headline"] for row in view["history"]] == ["First attempt.", "Second attempt."]
    assert view["proposal"]["selection"]["overview"] == "Second attempt."


# ---------------------------------------------------------------- continuity --


def test_day_two_is_told_what_day_one_actually_uses(client):
    workspace_id = create(client)
    save(client, workspace_id, _packet(accepted_export(client, workspace_id)))
    before = len(client.grill_llm.prompts)
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-2/grill/start",
        json={"attempt_key": key()},
    )
    prompt = client.grill_llm.prompts[before]
    assert "places already chosen" in prompt
    assert "Place for day1-lunch" in prompt


def test_a_repeated_place_across_days_is_a_warning_not_a_block(client):
    workspace_id = create(client)
    save(client, workspace_id, _packet(accepted_export(client, workspace_id)))
    day_two = accepted_export(client, workspace_id, "day-2")
    packet = _packet(day_two)
    packet["picks"][1]["name"] = "Place for day1-lunch"
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-2/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert preview["valid"]
    assert any("also used on Day 1" in i["message"] for i in preview["report"]["issues"])


def test_changing_day_one_flags_day_two_rather_than_rewriting_it(client):
    workspace_id = create(client)
    day_one = accepted_export(client, workspace_id)
    save(client, workspace_id, _packet(day_one))
    day_two = accepted_export(client, workspace_id, "day-2")
    save(client, workspace_id, _packet(day_two), "day-2")
    assert not day(client, workspace_id, "day-2")["proposal"]["stale"]

    # Rewording day one changes nothing for day two.
    save(client, workspace_id, _packet(day_one, overview="Reworded."))
    assert not day(client, workspace_id, "day-2")["proposal"]["stale"]

    # A different place does.
    replacement = _packet(day_one)
    replacement["picks"][2]["name"] = "A completely different lunch"
    save(client, workspace_id, replacement)
    after = day(client, workspace_id, "day-2")
    assert after["proposal"]["stale"]
    assert after["proposal"]["changes"] == ["Day 1 now uses different places."]
    assert after["state"] == "proposal_ready", "the proposal is kept, not discarded"


# ------------------------------------------------------------------ stays --


def test_a_stay_reaches_the_prompt_and_its_change_touches_only_its_days(client):
    stays = [stay("stay-1", first=1, last=1), stay("stay-2", first=2, last=2, name="Hotel B")]
    workspace_id = create(client, stays=stays)
    view = accepted_export(client, workspace_id)
    prompt = view["export"]["prompt_text"]
    assert "Stay: starts and ends at Casa Miraflores, Miraflores." in prompt
    save(client, workspace_id, _packet(view))

    three_before = accepted_export(client, workspace_id, "day-3")["export"]["prompt_text"]
    assert "Starts from: Hotel B, Miraflores." in three_before
    assert "Ends with departure" in three_before

    # Night 2's hotel changes: day 2 ends and day 3 starts there. Day 1 is untouched.
    payload = setup_payload(stays=[stays[0], stay("stay-2", first=2, last=2, name="Hotel C")])
    revision = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": revision},
    )
    one = day(client, workspace_id, "day-1")
    three = day(client, workspace_id, "day-3")
    assert one["layout_approved"], "a hotel change reopens no layout"
    assert not one["proposal"]["stale"]
    assert three["export"]["stale"]
    assert three["export"]["changes"][0].startswith("The stay changed")


def test_the_last_day_ends_in_a_departure(client):
    workspace_id = create(client, stays=[stay(first=1, last=2)])
    view = accepted_export(client, workspace_id, "day-3")
    assert "Ends with departure: no hotel night after this day." in view["export"]["prompt_text"]
    assert view["stay"]["final_day"]


def test_a_recommended_stay_is_chosen_once_and_reused(client):
    wanted = stay("stay-r", first=1, last=2, mode="recommend", note="boutique, walkable")
    workspace_id = create(client, stays=[wanted])
    view = accepted_export(client, workspace_id)
    prompt = view["export"]["prompt_text"]
    assert "a stay you recommend (boutique, walkable) [stay id stay-r]" in prompt
    assert '"stay":{"type":"object"' in prompt.replace(" ", "")

    # An answer that forgets the stay is still saveable, and says so.
    forgetful = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(forgetful)},
    ).json()
    assert preview["valid"]
    assert any("recommend a stay" in i["message"] for i in preview["report"]["issues"])

    chosen = _packet(
        view,
        stay={"stayId": "stay-r", "name": "Hotel Picked", "area": "Miraflores", "reason": "Quiet.", "sources": []},
    )
    save(client, workspace_id, chosen)
    day_two = accepted_export(client, workspace_id, "day-2")
    assert "Stay: starts and ends at Hotel Picked, Miraflores." in day_two["export"]["prompt_text"]
    assert '"stay":{"type":"null"}' in day_two["export"]["prompt_text"].replace(" ", "")


# ------------------------------------------------------------------- swap --


def test_swapping_a_place_by_hand_is_free_and_keeps_the_rest(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    saved = save(client, workspace_id, _packet(view))
    calls = len(client.grill_llm.prompts)
    swapped = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/swap",
        json={
            "slot_id": "day1-lunch",
            "name": "My favourite cevicheria",
            "area": "Surquillo",
            "reason": "I have eaten there.",
            "expected_revision": saved["proposal"]["revision"],
            "swap_key": key(),
        },
    )
    assert swapped.status_code == 200, swapped.text
    after = swapped.json()
    assert len(client.grill_llm.prompts) == calls
    picks = {pick["slotId"]: pick for pick in after["proposal"]["selection"]["picks"]}
    assert picks["day1-lunch"]["name"] == "My favourite cevicheria"
    assert picks["day1-lunch"]["chosenBy"] == "editor"
    assert picks["day1-coffee"]["name"] == "Place for day1-coffee"
    journeys = after["proposal"]["selection"]["journeys"]
    touching = [leg for leg in journeys if "day1-lunch" in (leg["from"], leg["to"])]
    assert touching and all(leg["minutes"] is None for leg in touching)
    assert after["proposal"]["origin"] == "editor_swap"
    assert after["proposal"]["revision"] == 2


def test_a_swap_against_an_old_version_is_refused(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    save(client, workspace_id, _packet(view))
    save(client, workspace_id, _packet(view, overview="Newer."))
    response = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/swap",
        json={
            "slot_id": "day1-lunch",
            "name": "Somewhere",
            "expected_revision": 1,
            "swap_key": key(),
        },
    )
    assert response.status_code == 409


def test_a_swap_settles_the_question_about_that_stop(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    packet["picks"][2].update({"status": "unresolved", "name": None, "reason": "Nothing fits."})
    packet["questions"] = [{"slotId": "day1-lunch", "question": "Which should give?", "options": []}]
    saved = save(client, workspace_id, packet)
    after = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/swap",
        json={
            "slot_id": "day1-lunch",
            "name": "Chosen by me",
            "expected_revision": saved["proposal"]["revision"],
            "swap_key": key(),
        },
    ).json()
    assert after["proposal"]["selection"]["questions"] == []
    assert after["state"] == "proposal_ready"


# --------------------------------------------------------------- the handoff --


def test_the_handoff_carries_places_and_context_and_starts_nothing(client):
    workspace_id = create(client, stays=[stay(first=1, last=2)])
    save(client, workspace_id, _packet(accepted_export(client, workspace_id)))
    calls = len(client.grill_llm.prompts)
    packet = client.get(f"{BASE}/workspaces/{workspace_id}/handoff").json()
    assert len(client.grill_llm.prompts) == calls
    assert packet["kind"] == "itinerary-selection-handoff-v1"
    first = packet["days"][0]
    assert first["overview"] == "An easy Miraflores day."
    assert first["stops"][2]["name"] == "Place for day1-lunch"
    assert first["stops"][2]["reason"] == "It suits day1-lunch."
    assert first["stay"]["start"]["name"] == "Casa Miraflores"
    assert packet["days"][1]["stops"] == []


def test_the_workspace_shows_the_whole_trip(client):
    workspace_id = create(client)
    save(client, workspace_id, _packet(accepted_export(client, workspace_id)))
    trip = client.get(f"{BASE}/workspaces/{workspace_id}").json()
    first = trip["days"][0]
    assert first["overview"] == "An easy Miraflores day."
    assert first["picks"][0] == {
        "label": "Coffee / light breakfast",
        "name": "Place for day1-coffee",
        "status": "selected",
    }
