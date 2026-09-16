"""Choosing a day's places inside the app, on the subscription.

Nothing here reaches a provider: the transport is a callable and the tests hand
it a double. What is tested is the part this feature owns — which schema is
sent, what is stamped rather than asked for, what happens when the call fails,
and the thing that matters most: that an answer arriving this way is held to
exactly the same checks as one arriving by clipboard.
"""

from __future__ import annotations

import json

from app.features.itinerary_pipeline import research
from app.features.itinerary_pipeline.selection_contract import SELECTION_CONTRACT_VERSION

import pytest

from tests.itinerary_pipeline_support import (
    itinerary_client,
    setup_payload,
    valid_selection as valid_packet,
)

# The helpers that drive a day as far as a built prompt, reused rather than
# rebuilt: these tests are about what researching adds to a day that already
# has one, and reaching that takes an interview and an extraction.
from tests.test_itinerary_workflow import BASE, accepted_export, create, day, key, save


@pytest.fixture
def client(isolated_db, monkeypatch):
    with itinerary_client(monkeypatch) as test_client:
        yield test_client


def _answer(view, **overrides):
    """A researched day, as the transport would hand it back.

    The identity fields are deliberately absent: this module stamps them, and
    a double that supplied them would be testing a promise nobody made.
    """

    class _Export:
        export_id = view["export"]["export_id"]
        input_hash = view["export"]["input_hash"]
        slot_ids = [slot["id"] for slot in view["slots"]]

    packet = valid_packet(_Export())
    packet["workspaceId"] = view["workspace_id"]
    packet.update(overrides)
    for field in ("contractVersion", "workspaceId", "dayId", "exportId", "inputHash"):
        packet.pop(field, None)
    return packet


def transport(payload, *, seen=None):
    """A stand-in for the CLI, recording what it was asked."""

    def call(*, prompt, schema, model_name, timeout_seconds, system_prompt=None):
        if seen is not None:
            seen.append(
                {
                    "prompt": prompt,
                    "schema": schema,
                    "model_name": model_name,
                    "timeout_seconds": timeout_seconds,
                    "system_prompt": system_prompt,
                }
            )
        return payload

    return call


# ----------------------------------------------------------- what is sent --


def test_the_identity_fields_are_stamped_rather_than_asked_for(client):
    """A pasted packet has to echo the export it answers, because the operator
    could paste anything. A call this app made is by construction the answer to
    the export it was made for -- so those five are filled in from what we hold,
    which is five fewer things a model can get wrong and no weaker."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    seen: list[dict] = []
    payload = {"structured_output": _answer(view), "num_turns": 9}

    _run(client, workspace_id, payload, seen=seen)

    sent_schema = seen[0]["schema"]
    for field in ("contractVersion", "workspaceId", "dayId", "exportId", "inputHash"):
        assert field not in sent_schema["properties"]
        assert field not in sent_schema["required"]

    saved = day(client, workspace_id)["research"]
    stamped = json.loads(saved["raw"])
    assert stamped["contractVersion"] == SELECTION_CONTRACT_VERSION
    assert stamped["exportId"] == view["export"]["export_id"]
    assert stamped["inputHash"] == view["export"]["input_hash"]
    assert stamped["dayId"] == "day-1"


def test_a_run_nobody_heard_back_from_is_reported_as_exactly_that(client):
    """Not "it failed" -- the app knows the call went out and does NOT know
    whether the provider answered or billed. Saying otherwise would be
    inventing a fact. Seen for real: a dev-server reload during a run kills the
    background task and leaves the row saying "running" with nothing behind it.
    """
    import app.features.itinerary_pipeline.store as store_module

    workspace_id = create(client)
    accepted_export(client, workspace_id)
    # Dispatch, then never finish -- exactly what a killed process leaves.
    _dispatch(client, workspace_id, lambda **_: {"structured_output": {}}, key())

    found = day(client, workspace_id)["research"]
    assert found["state"] in {"running", "failed"}

    # Backdate it past the call's own ceiling and it reads as never heard from.
    run = store_module.latest_research_run(workspace_id, "day-1")
    with __import__("app.core.database", fromlist=["x"]).transaction() as conn:
        conn.execute(
            "UPDATE itinerary_research_runs SET state = 'running', "
            "started_at = '2020-01-01T00:00:00+00:00' WHERE attempt_key = ?",
            (run["attempt_key"],),
        )
    stalled = day(client, workspace_id)["research"]
    assert stalled["state"] == "running"
    assert stalled["stalled"] is True


def test_the_meta_schema_ref_is_stripped(client):
    """The CLI validates the schema itself before using it, and it cannot
    resolve the 2020-12 meta-schema by URL -- it refuses the whole call with
    "no schema with key or ref". Measured on 2026-09-16; it cost a live run."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    seen: list[dict] = []
    _run(client, workspace_id, {"structured_output": _answer(view)}, seen=seen)
    assert "$schema" not in seen[0]["schema"]
    # The compact schema never carries it, in the call or in the copy.
    assert "$schema" not in view["export"]["prompt_text"]


def test_the_schema_names_every_pick_field_and_asks_for_no_prose(client):
    """The request is demanding and acceptance is forgiving, on purpose: a
    merely optional key is a key a model skips. And there is no article in it."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    seen: list[dict] = []
    _run(client, workspace_id, {"structured_output": _answer(view)}, seen=seen)

    asked = seen[0]["schema"]["properties"]["picks"]["items"]["required"]
    for field in ("slotId", "status", "name", "reason", "note", "sources"):
        assert field in asked, f"the schema has to ask for {field}"
    top = seen[0]["schema"]["required"]
    for field in ("overview", "tripFit", "stay", "picks", "journeys", "questions"):
        assert field in top
    for gone in ("readerCopy", "dayIntro", "evidence", "issues", "restWindows"):
        assert gone not in json.dumps(seen[0]["schema"])


def test_the_embedded_schema_is_not_sent_twice(client):
    """It is enforced by the transport here. Sending it again as prose is
    thousands of tokens asking for something already guaranteed."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    seen: list[dict] = []
    _run(client, workspace_id, {"structured_output": _answer(view)}, seen=seen)

    prompt = seen[0]["prompt"]
    assert '"picks"' not in prompt
    # The day itself is still all there.
    for slot in view["slots"]:
        assert slot["id"] in prompt
    assert "Choose the places" in prompt


def test_it_runs_on_the_job_s_model_not_a_named_one(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    seen: list[dict] = []
    _run(client, workspace_id, {"structured_output": _answer(view)}, seen=seen)
    # Whatever the registry says; the point is that a call site did not choose.
    assert seen[0]["model_name"]
    assert seen[0]["model_name"].startswith("claude-")


# -------------------------------------------------------- what comes back --


def test_the_model_recorded_is_the_one_that_did_the_work(client):
    """The transport names it, because `modelUsage` is a map whose first entry
    is routinely a small helper. Reading a key off the payload by hand is how
    this repo once recorded every Claude call as haiku."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    _run(
        client,
        workspace_id,
        {"structured_output": _answer(view), "resolved_model": "claude-sonnet-5"},
    )
    assert day(client, workspace_id)["research"]["model"] == "claude-sonnet-5"


def test_a_researched_answer_is_checked_exactly_like_a_pasted_one(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    _run(client, workspace_id, {"structured_output": _answer(view), "num_turns": 12})

    found = day(client, workspace_id)
    assert found["research"]["state"] == "done"
    assert found["research"]["turns"] == 12
    assert found["research"]["for_current_export"]

    # Nothing is saved by running. The answer goes through preview.
    assert found["proposal"] is None

    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": found["research"]["raw"]},
    ).json()
    assert preview["valid"], preview["report"]["issues"]


def test_a_researched_answer_that_fails_the_checks_still_fails_them(client):
    """One validator. An answer that arrives by API gets no easier ride."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    broken = _answer(view)
    del broken["picks"][1]
    _run(client, workspace_id, {"structured_output": broken})

    found = day(client, workspace_id)
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": found["research"]["raw"]},
    ).json()
    assert not preview["valid"]
    assert any(
        "has no pick" in issue["message"]
        for issue in preview["report"]["issues"]
    )


def test_a_reply_with_no_schema_payload_is_a_failure_not_an_empty_day(client):
    """The CLI validates before filling `structured_output`, so an empty one
    means the reply never satisfied the shape. Saving that as a day would be
    saving nothing and calling it something."""
    workspace_id = create(client)
    accepted_export(client, workspace_id)
    _run(client, workspace_id, {"structured_output": None, "result": "I couldn't."})

    found = day(client, workspace_id)["research"]
    assert found["state"] == "failed"
    assert "could not read" in found["detail"]
    assert found["raw"] == ""


def test_a_transport_failure_carries_its_own_classification(client):
    """An exhausted subscription and a provider that fell over need different
    next steps, and a screen can only offer them if they arrive apart."""
    workspace_id = create(client)
    accepted_export(client, workspace_id)

    def call(**_kwargs):
        raise research.ResearchUnavailable("out of usage", kind="quota_exhausted")

    _dispatch(client, workspace_id, call)
    found = day(client, workspace_id)["research"]
    assert found["state"] == "failed"
    assert found["fault"] == "quota_exhausted"
    assert found["detail"] == "out of usage"


def test_a_crash_inside_the_background_task_does_not_leave_it_running(client):
    """"Researching" forever is the one state an operator cannot get out of."""
    workspace_id = create(client)
    accepted_export(client, workspace_id)

    def call(**_kwargs):
        raise RuntimeError("something nobody predicted")

    _dispatch(client, workspace_id, call)
    found = day(client, workspace_id)["research"]
    assert found["state"] == "failed"
    assert "failed" in found["detail"]


# ------------------------------------------------------------- the guards --


def test_the_same_key_does_not_buy_a_second_run(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    shared = key()
    calls: list[dict] = []
    payload = {"structured_output": _answer(view)}

    first = _dispatch(client, workspace_id, transport(payload, seen=calls), shared)
    assert first.status_code == 202
    second = _dispatch(client, workspace_id, transport(payload, seen=calls), shared)
    assert second.status_code == 409
    assert len(calls) == 1


def test_a_day_with_no_prompt_cannot_be_researched(client):
    workspace_id = create(client)
    response = _dispatch(client, workspace_id, transport({}))
    assert response.status_code == 400
    assert "no prompt yet" in response.json()["detail"]


def test_a_stale_prompt_cannot_be_researched(client):
    """Otherwise the answer describes a day that has moved on, and the import
    would refuse it after the research had already been paid for."""
    workspace_id = create(client)
    accepted_export(client, workspace_id)
    payload = setup_payload()
    payload["days"][0]["preparationNotes"] = "They land at 11am."
    revision = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": revision},
    )
    response = _dispatch(client, workspace_id, transport({}))
    assert response.status_code == 409
    assert "changed since its prompt was built" in response.json()["detail"]


def test_an_answer_to_an_old_prompt_is_kept_but_not_offered(client):
    """It cost something, so it is not erased. It is not put in front of the
    operator as the thing to import either."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    _run(client, workspace_id, {"structured_output": _answer(view)})
    assert day(client, workspace_id)["research"]["raw"]

    payload = setup_payload()
    payload["days"][0]["preparationNotes"] = "Now the morning is short."
    revision = client.get(f"{BASE}/workspaces/{workspace_id}").json()["revision"]
    client.patch(
        f"{BASE}/workspaces/{workspace_id}/setup",
        json={"setup": payload, "expected_revision": revision},
    )
    client.post(f"{BASE}/workspaces/{workspace_id}/days/day-1/exports")

    found = day(client, workspace_id)["research"]
    assert found["state"] == "done"
    assert not found["for_current_export"]
    assert found["raw"] == ""


# ---------------------------------------------------------------- revisions --


def _revise(client, workspace_id, call, body):
    import app.features.itinerary_pipeline.api as module

    original = module.research.default_transport
    module.research.default_transport = lambda: call
    try:
        return client.post(
            f"{BASE}/workspaces/{workspace_id}/days/day-1/revisions",
            json={"attempt_key": key(), **body},
        )
    finally:
        module.research.default_transport = original


def test_a_revision_asks_for_the_change_and_keeps_the_rest(client):
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    saved = save(client, workspace_id, {**_answer(view), **{
        "contractVersion": SELECTION_CONTRACT_VERSION,
        "workspaceId": workspace_id,
        "dayId": "day-1",
        "exportId": view["export"]["export_id"],
        "inputHash": view["export"]["input_hash"],
    }})
    seen: list[dict] = []
    response = _revise(
        client,
        workspace_id,
        transport({"structured_output": _answer(view)}, seen=seen),
        {
            "base_revision": saved["proposal"]["revision"],
            "change": "Somewhere quieter, please.",
            "slot_id": "day1-lunch",
        },
    )
    assert response.status_code == 202, response.text
    prompt = seen[0]["prompt"]
    assert "## The current proposal (version 1)" in prompt
    assert "- day1-coffee: Place for day1-coffee" in prompt
    assert "Stop: Special lunch\nSomewhere quieter, please." in prompt
    assert "Keep every other choice exactly as it is" in prompt

    after = day(client, workspace_id)
    assert after["export"]["revision"] == {
        "base_revision": 1,
        "change": "Somewhere quieter, please.",
        "slot_id": "day1-lunch",
    }
    # The saved proposal is untouched until the new answer is saved.
    assert after["proposal"]["revision"] == 1
    # The answer is checked against the revision request and can be saved.
    preview = client.post(
        f"{BASE}/workspaces/{workspace_id}/days/day-1/imports/preview",
        json={"raw": after["research"]["raw"]},
    ).json()
    assert preview["valid"], preview["report"]["issues"]
    assert preview["changes"] == ["The same places; only the wording differs."]


def test_a_revision_needs_a_saved_proposal_and_a_change(client):
    workspace_id = create(client)
    accepted_export(client, workspace_id)
    missing = _revise(client, workspace_id, transport({}), {"base_revision": 1, "change": "x"})
    assert missing.status_code == 404


def test_an_older_agreement_cannot_be_built_from(client):
    """A day agreed under the long format has to have its summary written
    again before a prompt is built. Nothing is regenerated silently."""
    from app.features.itinerary_pipeline import service, store
    from app.features.itinerary_pipeline.contracts import DirectionRevision
    from tests.itinerary_pipeline_support import direction_for

    workspace_id = create(client)
    store.save_direction(
        workspace_id,
        "day-1",
        DirectionRevision(revision=1, status="candidate", direction=direction_for()),
    )
    store.accept_direction(workspace_id, "day-1", 1)
    assert day(client, workspace_id)["state"] == "direction_outdated"
    response = client.post(f"{BASE}/workspaces/{workspace_id}/days/day-1/exports")
    assert response.status_code == 409
    assert "older, longer format" in response.json()["detail"]
    assert service.current_export(workspace_id, "day-1") is None


# ------------------------------------------------------------------ plumbing --


def _dispatch(client, workspace_id, call, attempt_key: str | None = None):
    """Post the research route with a transport of this test's choosing."""
    import app.features.itinerary_pipeline.api as module

    original = module.research.default_transport
    module.research.default_transport = lambda: call
    try:
        return client.post(
            f"{BASE}/workspaces/{workspace_id}/days/day-1/research",
            json={"attempt_key": attempt_key or key()},
        )
    finally:
        module.research.default_transport = original


def _run(client, workspace_id, payload, *, seen=None):
    response = _dispatch(client, workspace_id, transport(payload, seen=seen))
    assert response.status_code == 202, response.text
    return response


# ------------------------------------------------------- how long it may take --


def _export_with(stops: int) -> research.DayPromptExport:
    return research.DayPromptExport(
        export_id="e1",
        workspace_id="w1",
        day_id="day-1",
        direction_revision=1,
        workspace_revision=1,
        input_hash="0" * 16,
        slot_ids=[f"slot-{index}" for index in range(stops)],
    )


def test_a_bigger_day_is_given_longer():
    """The regression that produced this. One constant for every day size was
    measured on a three-stop day and then assumed to cover the largest day this
    feature builds. On 2026-09-16 a seven-stop day was killed at exactly 1200s
    with the call still working, and twenty minutes of finished searching was
    thrown away with it -- `subprocess.run` buffers its output and discards it.
    """
    three = research.timeout_for(_export_with(3))
    seven = research.timeout_for(_export_with(7))

    # The two runs of a three-stop day that did finish took 11m57s and 14m12s,
    # so the limit this size is given has to clear both with room.
    assert three > 14 * 60
    # And a day with more than twice the stops gets more than the old constant,
    # which is the whole point.
    assert seven > 1200.0
    assert seven > three


def test_no_day_is_given_longer_than_the_transport_allows():
    """Past the CLI's own ceiling this app's limit would be a fiction: the
    subprocess stops on its own and we would still be waiting on it."""
    from app.features.claude_connection import cli_writer

    assert research.RESEARCH_CEILING_SECONDS == cli_writer.RESEARCH_TIMEOUT_SECONDS
    assert research.timeout_for(_export_with(40)) == research.RESEARCH_CEILING_SECONDS


def test_the_transport_is_handed_this_day_s_own_limit(client):
    """Not a module constant read at the far end -- the number the call is
    bounded by is computed from the day being researched."""
    workspace_id = create(client)
    view = accepted_export(client, workspace_id)
    seen: list[dict] = []

    _run(client, workspace_id, {"structured_output": _answer(view), "num_turns": 9}, seen=seen)

    stops = len(view["slots"])
    assert seen[0]["timeout_seconds"] == research.timeout_for(_export_with(stops))
