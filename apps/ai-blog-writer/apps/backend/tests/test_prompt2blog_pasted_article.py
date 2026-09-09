"""An article this app never briefed, taken in and given somewhere to live.

`test_prompt2blog_pasted_draft` covers the other paste: an article written from
this app's own frozen prompt, filed back against the run that briefed it. This
is the case with no run at all behind it -- work written somewhere else
entirely, which no grill here ever asked about.

Those articles had no way in. Saved Articles lists runs, the Payload staging
editor opens `?runId=`, and every article read is keyed to one, so the only
route to publishing an article written elsewhere was retyping it into the
editor by hand.

The properties that matter are the same two as the other paste, plus one more.
It must not pretend -- no model, no cost, and no fingerprints invented for an
assignment that never existed. It must not destroy -- each paste is its own
run, never an overwrite of somebody else's. And the one thing this run cannot
do, the detector, is a stated consequence of having no brief rather than a
silent failure.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.features.prompt2blog.api import intake as intake_api
from app.features.prompt2blog.generation_v5 import (
    NothingToPaste,
    SOURCE_PASTED,
    finished_draft,
    generation_state,
)
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.intake_v4 import (
    IntakeServices,
    intake_state,
    paste_article,
    recent_runs,
)
from app.features.prompt2blog.run_recorder import RunRecorder
from app.features.prompt2blog.storage import get_all_completed_articles

PASTED = """# The Miraflores clifftop walk, end to end

The path runs six kilometres from Larcomar to the Barranco bridge.

Most people walk the middle third and miss the best of it.
"""

NO_HEADLINE = """The path runs six kilometres from Larcomar to the Barranco bridge.

Most people walk the middle third and miss the best of it.
"""

WITH_NOTE = """# The Miraflores clifftop walk, end to end

The path runs six kilometres.

## Research note

- https://munimiraflores.gob.pe, checked 8 September 2026
"""


def _services() -> IntakeServices:
    """No model is reachable from here, because none should be asked anything.

    Every LLM on these services raises. A paste that ever called a model would
    fail this file rather than quietly cost money.
    """

    def refuse(*_args, **_kwargs):
        raise AssertionError("Pasting an article must not call a model.")

    return IntakeServices(
        dependencies=GrillDependencies(llm=refuse, research=refuse),
        recorder=RunRecorder(),
    )


def _json_body(response) -> dict[str, Any]:
    return json.loads(response.body)


# --- what a pasted article is -------------------------------------------------


def test_a_pasted_article_gets_a_run_of_its_own(isolated_db):
    run_id = paste_article(PASTED, _services(), written_by="Claude, in the browser")

    draft = finished_draft(run_id)
    assert draft["headline"] == "The Miraflores clifftop walk, end to end"
    assert "six kilometres" in draft["article_markdown"]


def test_it_reaches_saved_articles(isolated_db):
    """The whole point. Saved Articles reads completed runs, so it needs one."""
    run_id = paste_article(PASTED, _services())

    saved = [row for row in get_all_completed_articles() if row["run_id"] == run_id]
    assert len(saved) == 1
    assert saved[0]["title"] == "The Miraflores clifftop walk, end to end"
    assert "six kilometres" in saved[0]["markdown"]


def test_the_headline_is_what_the_run_is_called(isolated_db):
    """A pasted run has no seed, and a list of bare uuids is unusable."""
    run_id = paste_article(PASTED, _services())

    listed = [row for row in recent_runs() if row["run_id"] == run_id]
    assert listed[0]["seed"] == "The Miraflores clifftop walk, end to end"


def test_a_research_note_is_split_off_if_there_is_one(isolated_db):
    """Same parser as a written reply, so the same shape comes out."""
    run_id = paste_article(WITH_NOTE, _services())

    draft = finished_draft(run_id)
    assert "munimiraflores" in draft["research_note"]
    assert "Research note" not in draft["article_markdown"]


def test_an_article_without_a_headline_is_still_an_article(isolated_db):
    """The common shape of something written elsewhere. It is named at staging."""
    run_id = paste_article(NO_HEADLINE, _services())

    draft = finished_draft(run_id)
    assert draft["headline"] == ""
    assert "six kilometres" in draft["article_markdown"]
    assert draft["parse_issue"]


# --- what it refuses to pretend -----------------------------------------------


def test_it_claims_no_model_and_no_cost(isolated_db):
    run_id = paste_article(PASTED, _services(), written_by="Claude, in the browser")

    generation = generation_state(run_id)
    assert generation["source"] == SOURCE_PASTED
    # The operator's word, kept as their word.
    assert generation["written_by"] == "Claude, in the browser"
    # Nothing this app measured, because it measured nothing.
    assert generation["served_model"] is None
    assert generation["requested_model"] is None
    assert generation["cost_usd"] is None
    assert generation["turns"] is None
    assert generation["elapsed_seconds"] is None


def test_it_invents_no_assignment_to_have_been_written_from(isolated_db):
    """Empty fingerprints are the honest record: there was no brief."""
    run_id = paste_article(PASTED, _services())

    artifact = _json_body(intake_api.read_draft(run_id, _staff={"id": 1}))
    assert artifact["headline"]

    state = intake_state(run_id)
    assert state["step"] == "draft"
    assert not state["brief"]
    assert not state["writer_prompt"]


def test_the_run_says_out_loud_that_nothing_was_spent(isolated_db):
    run_id = paste_article(PASTED, _services())

    state = intake_state(run_id)
    assert state["generation"]["source"] == SOURCE_PASTED
    assert state["generation"]["cost_usd"] is None


# --- what it refuses outright -------------------------------------------------


def test_empty_text_is_refused(isolated_db):
    with pytest.raises(NothingToPaste):
        paste_article("   \n  ", _services())


def test_a_research_note_with_no_article_is_refused(isolated_db):
    with pytest.raises(NothingToPaste):
        paste_article("## Research note\n\n- https://example.pe\n", _services())


def test_a_refused_paste_leaves_no_run_behind(isolated_db):
    """A run created and then abandoned would sit in the list forever."""
    before = {row["run_id"] for row in recent_runs()}

    with pytest.raises(NothingToPaste):
        paste_article("   ", _services())

    assert {row["run_id"] for row in recent_runs()} == before


# --- it never overwrites ------------------------------------------------------


def test_two_pastes_are_two_articles(isolated_db):
    first = paste_article(PASTED, _services())
    second = paste_article(WITH_NOTE, _services())

    assert first != second
    assert finished_draft(first)["research_note"] == ""
    assert "munimiraflores" in finished_draft(second)["research_note"]


# --- through the route --------------------------------------------------------


@pytest.fixture
def routed(monkeypatch):
    """The route's own services, with every model unreachable."""
    monkeypatch.setattr(intake_api, "_services", lambda run_id=None: _services())


def test_the_route_answers_with_the_run_it_made(isolated_db, routed):
    response = intake_api.paste_an_article(
        intake_api.PastedArticleRequest(
            markdown=PASTED, written_by="Claude, in the browser"
        ),
        staff_user={"id": 1},
    )

    assert response.status_code == 201
    body = _json_body(response)
    # The page navigates on these two: the run to stage, and what to call it.
    assert body["run_id"]
    assert body["generation"]["headline"] == "The Miraflores clifftop walk, end to end"


def test_the_route_refuses_text_with_no_article_in_it(isolated_db, routed):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as raised:
        intake_api.paste_an_article(
            intake_api.PastedArticleRequest(markdown="## Research note\n\n- a link"),
            staff_user={"id": 1},
        )

    assert raised.value.status_code == 400
    assert "no article" in str(raised.value.detail).lower()
