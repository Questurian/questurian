"""An article written somewhere else, filed against the run that briefed it.

The frozen prompt is a copy-paste artifact by design, so the operator can take
it to any model. This is the way back in. Once the article is on the run, the
detector, Saved Articles and staging all work on it unchanged, because every
one of those reads the draft rather than the call that produced it.

The properties that matter are about honesty and about not losing work: a
pasted draft must never claim a model this app did not call, and must never
overwrite an article the run already paid for.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import MARKER_KEYS
from app.features.prompt2blog.generation_v5 import (
    NothingToPaste,
    SOURCE_PASTED,
    SOURCE_WRITTEN,
    finished_draft,
    generation_state,
    latest_draft,
    run_attempt,
)
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.intake_v4 import (
    IntakeServices,
    NothingToWriteFrom,
    answer_intake,
    approve_brief,
    begin_intake,
    generate_prompt,
    intake_state,
    paste_draft,
    reopen_intake,
    start_generation,
)
from app.features.prompt2blog.review_v5 import review_state
from app.features.prompt2blog.run_recorder import RunRecorder
from app.features.prompt2blog.storage import get_all_completed_articles

SEED = "Central, Maido and Kjolle: how far ahead you have to book"
FIRSTHAND = "No visit behind this. Researched throughout."

PASTED = """# Central, Maido and Kjolle: how far ahead you have to book

Maido opens its calendar two months ahead, on the first of the month.

Central and Kjolle advertise four months and currently load eight weeks.

## Research note

- https://maido.pe, checked 7 September 2026
"""

WRITTEN = """# A different headline entirely

The article the pipeline wrote.

## Research note

- https://example.pe
"""

AGREED = {
    "done": True,
    "consensus": "A booking strategy.",
    "location": "Lima, Peru",
    "markers_covered": list(MARKER_KEYS),
}

BRIEF_PAYLOAD = {
    "form_id": "destination-guide",
    "topic_module_ids": [],
    "primary_reader": "traveller with fixed dates",
    "reader_tags": [],
    "reader_question": "Can I still get a table?",
    "outcome": "book tonight",
    "spine": "one countdown clock",
    "must_name": ["Central"],
    "fails_if": "reads like general advice",
    "material": [{"kind": "firsthand", "quoted_answer": FIRSTHAND}],
}

OTHER_BRIEF = {**BRIEF_PAYLOAD, "spine": "something else entirely"}


class ScriptedLLM:
    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = list(responses)

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        return self.responses.pop(0), "{}"


def _question(**overrides) -> dict[str, Any]:
    payload = {
        "question_id": "q1",
        "topic": "what this should do",
        "ask": "Guide, or argument?",
        "recommendation": "My recommendation: a guide.",
    }
    payload.update(overrides)
    return payload


def _services(extra: list[dict[str, Any]] | None = None) -> IntakeServices:
    return IntakeServices(
        dependencies=GrillDependencies(
            llm=ScriptedLLM(
                [{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD]
                + (extra or [])
            ),
            research=lambda _seed: ("Lima has restaurants.", ["https://x.pe"], 900),
        ),
        recorder=RunRecorder(),
    )


def _to_prompt(services: IntakeServices) -> str:
    run_id = begin_intake(SEED, services).run_id
    answer_intake(run_id, FIRSTHAND, services)
    approve_brief(run_id, services)
    generate_prompt(run_id, services)
    return run_id


def _writer(text: str):
    def call(*, prompt: str, model_name: str | None = None):
        return {
            "text": text,
            "modelName": "claude-opus-5-20260101",
            "effort": "high",
            "costUsd": 1.72,
            "usage": {"outputTokens": 3_100},
            "elapsedSeconds": 390.0,
            "turns": 44,
            "toolDenials": [],
        }

    return call


# --- what a pasted draft is ---------------------------------------------------


def test_a_pasted_article_becomes_the_run_draft(isolated_db):
    services = _services()
    run_id = _to_prompt(services)

    paste_draft(run_id, PASTED, services, written_by="some other model")

    draft = finished_draft(run_id)
    assert draft["headline"].startswith("Central, Maido and Kjolle")
    assert "two months ahead" in draft["article_markdown"]
    assert "maido.pe" in draft["research_note"]
    assert "Research note" not in draft["article_markdown"]


def test_it_reaches_saved_articles_and_staging(isolated_db):
    """The whole point: everything downstream reads the draft, not the call."""
    services = _services()
    run_id = _to_prompt(services)

    paste_draft(run_id, PASTED, services, written_by="some other model")

    saved = [row for row in get_all_completed_articles() if row["run_id"] == run_id]
    assert len(saved) == 1


def test_the_detector_can_read_it(isolated_db):
    """A pasted draft is reviewable exactly like a written one."""
    services = _services()
    run_id = _to_prompt(services)

    paste_draft(run_id, PASTED, services)

    assert latest_draft(run_id) is not None
    # Nothing has reviewed it yet, and asking does not start anything.
    assert review_state(run_id, latest_draft(run_id)["content_hash"]) is None


# --- it must not pretend ------------------------------------------------------


def test_it_claims_no_model_and_no_cost(isolated_db):
    """The v4 receipts named Opus while Flash wrote the article.

    This app made no call here, so it reports none. `written_by` is the
    operator's word and is labelled as theirs.
    """
    services = _services()
    run_id = _to_prompt(services)

    paste_draft(run_id, PASTED, services, written_by="a browser, some other model")

    state = intake_state(run_id)["generation"]
    assert state["source"] == SOURCE_PASTED
    assert state["written_by"] == "a browser, some other model"
    assert state["served_model"] is None
    assert state["requested_model"] is None
    assert state["cost_usd"] is None
    assert state["turns"] is None
    assert state["elapsed_seconds"] is None


def test_a_written_draft_still_says_it_was_written(isolated_db):
    services = _services()
    run_id = _to_prompt(services)
    attempt_id, prompt = start_generation(run_id, services)
    run_attempt(run_id, attempt_id, prompt, _writer(WRITTEN), services.recorder)

    state = intake_state(run_id)["generation"]
    assert state["source"] == SOURCE_WRITTEN
    assert state["written_by"] is None
    assert state["served_model"] == "claude-opus-5-20260101"


# --- it must not destroy anything --------------------------------------------


def test_pasting_never_overwrites_an_article_the_run_already_has(isolated_db):
    """A retry that ate the previous draft is the failure this storage exists
    to prevent, and pasting is another kind of retry."""
    services = _services()
    run_id = _to_prompt(services)
    attempt_id, prompt = start_generation(run_id, services)
    run_attempt(run_id, attempt_id, prompt, _writer(WRITTEN), services.recorder)

    paste_draft(run_id, PASTED, services)

    state = intake_state(run_id)["generation"]
    assert state["attempts"] == 2
    # The newest wins on screen, and the older one is still on the run.
    assert finished_draft(run_id)["headline"].startswith("Central, Maido")


# --- what it refuses ----------------------------------------------------------


def test_text_with_no_article_in_it_is_refused(isolated_db):
    services = _services()
    run_id = _to_prompt(services)

    with pytest.raises(NothingToPaste):
        paste_draft(run_id, "## Research note\n\n- https://example.pe\n", services)


def test_pasting_needs_a_current_prompt(isolated_db):
    """Filed against the assignment this run is holding, or not at all."""
    services = _services()
    run_id = begin_intake(SEED, services).run_id
    answer_intake(run_id, FIRSTHAND, services)
    approve_brief(run_id, services)

    with pytest.raises(NothingToWriteFrom):
        paste_draft(run_id, PASTED, services)


def test_a_draft_filed_against_a_replaced_brief_is_refused(isolated_db):
    """The prompt the operator carried to another model described that brief.

    If the brief has changed since, the article they bring back matches no
    assignment on the run, and filing it would put a receipt on the run saying
    otherwise.
    """
    services = _services(
        [{"done": False, "question": _question(question_id="q2")}, AGREED, OTHER_BRIEF]
    )
    run_id = _to_prompt(services)
    reopen_intake(run_id, services)
    answer_intake(run_id, "something else", services)
    approve_brief(run_id, services)

    with pytest.raises(NothingToWriteFrom):
        paste_draft(run_id, PASTED, services)


def test_a_missing_headline_is_kept_and_named(isolated_db):
    """An article without an H1 is still an article; staging names it."""
    services = _services()
    run_id = _to_prompt(services)

    paste_draft(run_id, "Just the body of a piece somebody wrote.", services)

    draft = finished_draft(run_id)
    assert draft["article_markdown"].startswith("Just the body")
    assert draft["parse_issue"]
    assert generation_state(run_id)["has_draft"] is True
