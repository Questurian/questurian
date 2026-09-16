"""One day from handed-over setup to saved result, through the real routes.

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

from tests.itinerary_pipeline_support import itinerary_client, setup_payload
from tests.test_itinerary_import import valid_wire_packet as valid_packet


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


def test_the_interview_reaches_agreement_and_eight_markers(client):
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


# ------------------------------------------------------------ the direction --


def test_a_direction_is_a_candidate_until_it_is_accepted(client):
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


def test_the_direction_covers_every_approved_stop(client):
    workspace_id = create(client)
    interview_to_agreement(client, workspace_id)
    view = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/direction/prepare",
        json={"attempt_key": key()},
    ).json()
    written = [
        entry["slot_id"]
        for entry in view["candidate_direction"]["direction"]["slot_directions"]
    ]
    assert written == [slot["id"] for slot in view["slots"]]


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
    # Nine turns of interview and one extraction. Building the prompt itself
    # added nothing.
    assert spent_on_export == len(ITINERARY_MARKER_KEYS) + 1


def test_the_export_carries_the_canonical_voice_rules_and_a_version(client):
    """Read from the same files every other writer here reads, not copied into
    this feature — a second copy drifts and nobody notices until two pieces
    stop sounding alike."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    prompt = view["export"]["prompt_text"]
    assert view["export"]["voice_version"]
    assert "The Questurian voice" in prompt
    assert "Writing conventions" in prompt
    # The Prompt2Blog house rules are not this request's; the one rule of
    # theirs that matters here is said once in the instructions instead.
    assert "house rules" not in prompt.lower()
    assert "no source names in the prose" in prompt
    # Voice files are sent without their option-picker header.
    assert "default: true" not in prompt


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


def test_exporting_without_an_accepted_direction_is_refused(client):
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

    packet = valid_packet(_Export())
    packet["workspaceId"] = export_view["workspace_id"]
    packet.update(overrides)
    return packet


def test_a_valid_paste_previews_and_then_saves(client):
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
    assert saved["state"] == "saved_complete"
    assert saved["result"]["result"]["title"] == "An easy Miraflores day"


def test_saving_twice_with_one_key_does_not_create_two_results(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    shared = key()
    body = {
        "raw": json.dumps(packet),
        "content_hash": preview["content_hash"],
        "import_key": shared,
    }
    first = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply", json=body
    ).json()
    second = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply", json=body
    ).json()
    assert first["created"] is True
    assert second["created"] is False
    assert len(second["result_history"]) == 1


def test_editing_the_paste_after_previewing_invalidates_the_save(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    packet["title"] = "A title typed after the preview"
    response = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    assert response.status_code == 409
    assert "changed since it was previewed" in response.json()["detail"]


def test_an_invalid_paste_cannot_be_saved_and_offers_a_repair_prompt(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    del packet["stops"][1]

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
    assert day(client, workspace_id)["result"] is None


def test_an_answer_to_an_older_prompt_is_told_what_changed(client):
    """A day can legitimately have two prompts out: copy one, change the day,
    copy another. An answer to the first is stale, and it deserves to be told
    that the day moved rather than that it answered the wrong prompt."""
    workspace_id = create(client)
    first = accepted_export(client, workspace_id)
    answer_to_first = _packet(first)

    # The day changes, and a second prompt is built for it.
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
    messages = [
        issue["message"]
        for issue in preview["report"]["issues"]
        if issue["severity"] == "error"
    ]
    assert any("has changed since that prompt was copied" in m for m in messages), messages
    # Not "you answered a different prompt" — it answered the prompt it says it
    # did, and that prompt is simply no longer current.
    assert not any("different copy of the prompt" in m for m in messages)


def test_a_paste_for_the_wrong_day_leaves_the_saved_day_alone(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    wrong = _packet(view, dayId="day-2", title="Someone else's day")
    later = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(wrong)},
    ).json()
    assert not later["valid"]
    assert day(client, workspace_id)["result"]["result"]["title"] == (
        "An easy Miraflores day"
    )


def test_an_incomplete_result_saves_visibly_as_needing_work(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    packet["stops"][2].update(
        {
            "status": "unresolved",
            "name": None,
            "addressOrMeetingPoint": None,
            "startMinutes": None,
            "durationMinutes": None,
            "readerCopy": "",
            "claimIds": [],
            "unresolvedReason": "Nothing on the route could be confirmed.",
        }
    )
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    assert preview["valid"]
    saved = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    ).json()
    assert saved["state"] == "saved_needs_work"
    assert saved["result"]["report"]["completeness"]["required_unresolved"] == [
        "Special lunch"
    ]


def test_a_replacement_result_keeps_the_earlier_one_in_history(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    for title in ("First attempt", "Second attempt"):
        packet = _packet(view, title=title)
        preview = client.post(
            f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
            json={"raw": json.dumps(packet)},
        ).json()
        client.post(
            f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
            json={
                "raw": json.dumps(packet),
                "content_hash": preview["content_hash"],
                "import_key": key(),
            },
        )
    view = day(client, workspace_id)
    assert [row["title"] for row in view["result_history"]] == [
        "First attempt",
        "Second attempt",
    ]
    assert view["result"]["result"]["title"] == "Second attempt"


# ---------------------------------------------------------------- continuity --


def test_day_two_is_told_what_day_one_actually_used(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    before = len(client.grill_llm.prompts)
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-2/grill/start",
        json={"attempt_key": key()},
    )
    prompt = client.grill_llm.prompts[before]
    assert "SAVED RESULT (COMPLETE FOR PLANNING)" in prompt
    assert "An easy Miraflores day" in prompt
    assert "Place for day1-lunch" in prompt


def test_changing_day_one_flags_day_two_rather_than_rewriting_it(client):
    """No silent regeneration and no cascade of paid calls. The old work stays
    readable; it simply stops being current."""
    workspace_id = create(client)
    day_one = accepted_export(client, workspace_id)
    packet = _packet(day_one)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    day_two = accepted_export(client, workspace_id, "day-2")
    assert not day_two["export"]["stale"]

    # Now day one is researched again with a different lunch.
    replacement = _packet(day_one, title="A different day one")
    replacement["stops"][2]["name"] = "A completely different lunch"
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(replacement)},
    ).json()
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(replacement),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    after = day(client, workspace_id, "day-2")
    assert after["export"]["stale"], "day two's export should need review"
    assert after["accepted_direction"] is not None, "its old work is still readable"


# ------------------------------------------------------------------- review --


def test_an_operator_review_is_stored_beside_the_result_not_inside_it(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    packet = _packet(view)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": json.dumps(packet)},
    ).json()
    client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/apply",
        json={
            "raw": json.dumps(packet),
            "content_hash": preview["content_hash"],
            "import_key": key(),
        },
    )
    reviewed = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/review",
        json={"notes": "Checked the lunch hours myself.", "evidence_reviewed": True},
    ).json()
    assert reviewed["review"]["evidence_reviewed"] is True
    assert reviewed["review"]["notes"] == "Checked the lunch hours myself."
    # And the claims are exactly as they were returned.
    assert reviewed["result"]["result"]["claims"][0]["text"] == (
        "This place exists and posts these hours."
    )
